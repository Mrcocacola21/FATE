import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { buildServer } from "../index";

async function run() {
  const server = await buildServer({ documentationOnly: true, matchRecovery: false });
  try {
    await server.ready();
    const spec = server.swagger();
    await SwaggerParser.validate(structuredClone(spec));
    const operationIds = Object.values(spec.paths ?? {}).flatMap((path) =>
      Object.values(path ?? {}).flatMap((operation) =>
        operation && typeof operation === "object" && "operationId" in operation
          ? [operation.operationId]
          : [],
      ),
    );
    if (new Set(operationIds).size !== operationIds.length)
      throw new Error("Duplicate operationId");
    if (!process.argv.includes("--validate-only")) {
      const target = resolve(process.argv[2] ?? "../../docs/generated/openapi.json");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify(spec, null, 2) + "\n");
      console.log(`Generated OpenAPI: ${target}`);
    }
    console.log(
      `Valid OpenAPI ${"openapi" in spec ? spec.openapi : spec.swagger}: ${operationIds.length} operations.`,
    );
  } finally {
    await server.close();
  }
}
void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "OpenAPI generation failed");
  process.exitCode = 1;
});
