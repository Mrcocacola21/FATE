import { z } from "zod";
import { zodToJsonSchema, ignoreOverride, type Options } from "zod-to-json-schema";
import generated from "./generated/responses.json";
import { apiErrorSchema, validationErrorSchema } from "../errors/schemas";
import { ValidationError } from "../validation/parseRequest";
import type { ApiResponses } from "./responseTypes";

export type JsonSchema = Record<string, unknown>;
const dateFields = new Set([
  "createdAt",
  "updatedAt",
  "startedAt",
  "finishedAt",
  "blockedAt",
  "lastActivity",
  "joinedAt",
]);
// Bound the adapter's generic target once; recursively instantiating all Zod types
// at each call can exceed the TypeScript compiler's instantiation limit.
const convertZod = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options: Partial<Options<"openApi3">>,
) => JsonSchema;

/** Convert the generated draft-07 subset to OpenAPI 3.0 without changing the DTO. */
export function openApiSchema(input: unknown, field?: string): JsonSchema {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const schema: JsonSchema = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema" || key === "definitions") continue;
    if (key === "$ref" && typeof value === "string") {
      const name = decodeURIComponent(value.replace("#/definitions/", ""));
      schema.$ref = `#/components/schemas/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    } else if (key === "const") schema.enum = [value];
    else if (
      ["properties", "patternProperties"].includes(key) &&
      value &&
      typeof value === "object"
    ) {
      // OpenAPI 3.0 has no patternProperties. TS Record<string, T> uses additionalProperties.
      if (key === "patternProperties")
        throw new Error("Unsupported patternProperties in response DTO");
      schema[key] = Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, openApiSchema(item, name)]),
      );
    } else if (["items", "additionalProperties", "not"].includes(key) && typeof value === "object")
      schema[key] = openApiSchema(value);
    else if (["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(value))
      schema[key] = value.map((item) => openApiSchema(item, field));
    else schema[key] = value;
  }
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const types = schema.type.filter((type) => type !== "null");
    if (types.length !== 1) throw new Error("Unsupported multi-type response DTO");
    schema.type = types[0];
    schema.nullable = true;
  } else if (schema.type === "null") {
    // OpenAPI 3.0 cannot spell type:null. This branch accepts exactly null,
    // including in anyOf with a $ref (nullable siblings of $ref are ignored).
    schema.type = "string";
    schema.nullable = true;
    schema.enum = [null];
  }
  if (schema.nullable && Array.isArray(schema.enum) && !schema.enum.includes(null))
    schema.enum.push(null);
  if (field && dateFields.has(field) && schema.type === "string") schema.format = "date-time";
  return schema;
}

export function requestSchema(schema: z.ZodTypeAny): JsonSchema {
  return convertZod(schema, {
    target: "openApi3",
    $refStrategy: "none",
    effectStrategy: "input",
    pipeStrategy: "input",
    override: (definition) => {
      // Query numbers retain the canonical output bounds, while input remains
      // decimal URL serialization. Do not intersect a string with a number.
      if ("typeName" in definition && definition.typeName === z.ZodFirstPartyTypeKind.ZodPipeline) {
        const pipeline = definition as z.ZodPipelineDef<z.ZodTypeAny, z.ZodTypeAny>;
        if (pipeline.out instanceof z.ZodNumber)
          return convertZod(pipeline.out, { target: "openApi3", $refStrategy: "none" });
      }
      if ("typeName" in definition && definition.typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
        const defaults = definition as z.ZodDefaultDef;
        const inner = defaults.innerType;
        if (inner instanceof z.ZodPipeline && inner._def.out instanceof z.ZodNumber) {
          return {
            ...convertZod(inner._def.out, { target: "openApi3", $refStrategy: "none" }),
            default: Number(defaults.defaultValue()),
          };
        }
      }
      return ignoreOverride;
    },
  });
}

export const responseComponents: Record<string, JsonSchema> = {
  ...Object.fromEntries(
    Object.entries(generated.definitions).map(([name, schema]) => [name, openApiSchema(schema)]),
  ),
  ApiError: requestSchema(apiErrorSchema),
  ValidationError: {
    ...requestSchema(validationErrorSchema),
    example: new ValidationError(
      new z.ZodError([{ code: "custom", path: ["limit"], message: "Invalid limit" }]),
    ).toResponse(),
  },
};

export const responseRef = (name: keyof ApiResponses | "ApiError" | "ValidationError") => ({
  $ref: `#/components/schemas/${name}`,
});

/** Raw draft-07 schemas for response drift tests, with no production serializer changes. */
export const rawResponseSchemas = generated;
