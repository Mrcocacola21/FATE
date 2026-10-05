import assert from "node:assert/strict";
import type { ErrorDetails } from "../errors/appError";

export function assertApiError(response: { statusCode: number; body: string; json(): unknown }, status: number, code: string) {
  assert.equal(response.statusCode, status, response.body);
  const body = response.json();
  assert(body && typeof body === "object" && "error" in body);
  const error = body.error;
  assert(error && typeof error === "object" && "code" in error && "message" in error);
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(error.code, code);
  assert.equal(typeof error.message, "string");
  assert.deepEqual(Object.keys(error).sort(), "details" in error ? ["code", "details", "message"] : ["code", "message"]);
  assert.match(String(error.code), /^[A-Z][A-Z0-9_]*$/);
  assert.doesNotMatch(response.body, /private-.*sentinel|SQLSTATE|PrismaClient|ZodError|"stack"|"passwordHash"/);
  return error as { code: string; message: string; details?: ErrorDetails };
}
