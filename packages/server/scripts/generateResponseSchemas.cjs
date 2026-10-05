// Compile public DTO types, without evaluating handlers or reading a database.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function generateResponseSchemas() {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(path.join(root, "src/openapi/responseTypes.ts"));
  const symbol = checker
    .getExportsOfModule(checker.getSymbolAtLocation(file))
    .find((s) => s.name === "ApiResponses");
  if (!symbol) throw new Error("Missing public API response type registry");
  const registry = checker.getDeclaredTypeOfSymbol(symbol);
  const roots = checker.getPropertiesOfType(registry).sort((a, b) => a.name.localeCompare(b.name));
  const definitions = {};
  const names = new Map();
  const usedNames = new Set();
  const typeOf = (property) =>
    checker.getTypeOfSymbolAtLocation(
      property,
      property.valueDeclaration ?? property.declarations?.[0] ?? file,
    );
  const ref = (name) => ({ $ref: `#/definitions/${name}` });
  const publicName = (type, fallback) => {
    const candidate = type.getSymbol()?.name;
    return candidate && !candidate.startsWith("__") && /^[A-Za-z][A-Za-z0-9]*$/.test(candidate)
      ? candidate
      : fallback;
  };
  for (const property of roots) {
    const type = typeOf(property);
    if (!names.has(type.id)) names.set(type.id, property.name);
    usedNames.add(property.name);
  }

  function schema(type, hint, expand = false) {
    const flags = type.flags;
    if (flags & ts.TypeFlags.Any)
      throw new Error(`Public DTO contains any at ${hint}; use an explicit JSON/unknown contract.`);
    if (flags & ts.TypeFlags.Unknown) return {};
    if (flags & ts.TypeFlags.Never) return { not: {} };
    if (flags & ts.TypeFlags.Null) return { type: "null" };
    if (flags & ts.TypeFlags.StringLiteral) return { type: "string", enum: [type.value] };
    if (flags & ts.TypeFlags.NumberLiteral) return { type: "number", enum: [type.value] };
    if (flags & ts.TypeFlags.BooleanLiteral)
      return { type: "boolean", enum: [type.intrinsicName === "true"] };
    if (flags & ts.TypeFlags.String) return { type: "string" };
    if (flags & ts.TypeFlags.Number) return { type: "number" };
    if (flags & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (type.isUnion()) {
      // Optional properties are omitted by JSON.stringify; null remains on the wire.
      const variants = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
      if (!variants.length) throw new Error(`Non-JSON DTO at ${hint}`);
      const parts = variants.map((t) => schema(t, hint));
      if (parts.every((p) => p.enum && p.type === parts[0].type))
        return { type: parts[0].type, enum: [...new Set(parts.flatMap((p) => p.enum))].sort() };
      if (parts.length === 1) return parts[0];
      return { anyOf: parts };
    }
    if (checker.isArrayType(type))
      return {
        type: "array",
        items: schema(checker.getIndexTypeOfType(type, ts.IndexKind.Number), `${hint}Item`),
      };
    // OpenAPI 3.0 cannot accurately express heterogeneous positional tuples.
    if (checker.isTupleType(type))
      throw new Error(`Tuple DTO at ${hint} requires an explicit wire adapter.`);
    if (!(flags & ts.TypeFlags.Object) && !type.isIntersection())
      throw new Error(`Unsupported DTO type ${checker.typeToString(type)} at ${hint}`);
    if (
      checker.getSignaturesOfType(type, ts.SignatureKind.Call).length ||
      checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length
    )
      throw new Error(`Callable DTO at ${hint} is not a JSON contract`);
    if (type.getSymbol()?.name === "Date")
      throw new Error(`Date DTO at ${hint} must be serialized to an ISO string`);
    let name = names.get(type.id);
    if (!name) {
      const base = publicName(type, hint);
      name = base;
      let suffix = 2;
      while (usedNames.has(name)) name = `${base}${suffix++}`;
      names.set(type.id, name);
      usedNames.add(name);
    }
    if (!expand && definitions[name]) return ref(name);
    definitions[name] = {}; // Register before recursing into dictionaries/self references.
    const properties = {};
    const required = [];
    for (const property of checker
      .getPropertiesOfType(type)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const value = typeOf(property);
      if (value.flags & ts.TypeFlags.Undefined) continue;
      const childHint = `${name}${property.name[0].toUpperCase()}${property.name.slice(1)}`;
      const item = schema(value, childHint);
      const description = ts.displayPartsToString(property.getDocumentationComment(checker));
      if (description) item.description = description;
      properties[property.name] = item;
      if (!(property.flags & ts.SymbolFlags.Optional)) required.push(property.name);
    }
    // Compiler index types cover declared dictionaries and mapped Record types.
    const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    const result = {
      type: "object",
      ...(Object.keys(properties).length ? { properties } : {}),
      additionalProperties: index ? schema(index, `${name}Value`) : false,
      ...(required.length ? { required } : {}),
    };
    definitions[name] = result;
    return expand ? result : ref(name);
  }

  const responses = {};
  for (const property of roots) {
    definitions[property.name] = schema(typeOf(property), property.name, true);
    responses[property.name] = ref(property.name);
  }
  const sorted = Object.fromEntries(
    Object.keys(definitions)
      .sort()
      .map((name) => [name, definitions[name]]),
  );
  return JSON.stringify({ responses, definitions: sorted }, null, 2) + "\n";
}

if (require.main === module) {
  const target = path.join(root, "src/openapi/generated/responses.json");
  const content = generateResponseSchemas();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content)
      throw new Error("Response schemas are stale. Run npm run -w server openapi:schemas.");
    console.log("Response schemas match current DTO types.");
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    console.log("Generated response schemas from public DTO types.");
  }
}
module.exports = { generateResponseSchemas };
