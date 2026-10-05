import assert from "node:assert/strict";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { ApiResponses } from "../openapi/responseTypes";
import { rawResponseSchemas, responseComponents, responseRef } from "../openapi/schemas";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ValidateFunction[]>();

/** Check both compiler-derived DTO schema and the published OpenAPI representation. */
export function assertDocumentedResponse(name: keyof ApiResponses, data: unknown): void {
  let pair = validators.get(name);
  if (!pair) {
    pair = [
      ajv.compile({
        ...rawResponseSchemas.responses[name],
        definitions: rawResponseSchemas.definitions,
      }),
      ajv.compile({ ...responseRef(name), components: { schemas: responseComponents } }),
    ];
    validators.set(name, pair);
  }
  for (const validate of pair) {
    const valid = validate(data);
    assert(
      valid,
      `${name}: ${ajv.errorsText(validate.errors)}; ${JSON.stringify(validate.errors?.map((e) => ({ path: e.instancePath, params: e.params })))}`,
    );
  }
}
