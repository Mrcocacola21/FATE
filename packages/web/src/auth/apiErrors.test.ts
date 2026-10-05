import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApiClient, parseApiError, validationFields } from "../api/client";
import { authErrorMessage } from "./errorMessage";
import { translate } from "../i18n";

test("canonical errors preserve HTTP status, code, fallback message and safe details", async () => {
  const details = { fields: [{ path: "email", message: "Invalid value." }] };
  const client = createApiClient("http://localhost", async () => Response.json({
    error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details },
  }, { status: 400 }));
  await assert.rejects(client.request("/api/auth/register", value => value), (error: unknown) => {
    assert(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.equal(error.message, "Request validation failed.");
    assert.deepEqual(error.details, details);
    assert.deepEqual(validationFields(error), details.fields);
    return true;
  });
  assert.equal(parseApiError({ error: { code: "ACCOUNT_BLOCKED", message: "Account access is blocked" } }, 403).code, "ACCOUNT_BLOCKED");
});

test("HTML, empty, malformed and legacy error responses have a safe typed fallback", async () => {
  for (const body of ["<html>private-proxy-sentinel</html>", "", "{", '{"message":"private-proxy-sentinel"}', '{"error":"private-proxy-sentinel"}', '{"error":{"code":"lowercase","message":"private-proxy-sentinel"}}']) {
    const client = createApiClient("http://localhost", async () => new Response(body, { status: 500 }));
    await assert.rejects(client.request("/rooms", value => value), (error: unknown) => {
      assert(error instanceof ApiError);
      assert.equal(error.status, 500);
      assert.equal(error.code, "SERVER_ERROR");
      assert.doesNotMatch(error.message, /private-proxy-sentinel/);
      assert.equal(error.details, undefined);
      return true;
    });
  }
});

test("validation fields ignore malformed metadata and auth UI uses stable codes", () => {
  assert.deepEqual(validationFields(new ApiError("VALIDATION_ERROR", 400, "Invalid", {
    fields: [null, { path: 1 }, { path: "username", message: "Invalid value." }],
  })), [{ path: "username", message: "Invalid value." }]);
  assert.deepEqual(validationFields(new ApiError("FORBIDDEN", 403)), []);
  for (const [code, key] of [["INVALID_CREDENTIALS", "invalidCredentials"], ["VALIDATION_ERROR", "invalidRequest"], ["ACCOUNT_BLOCKED", "accountBlocked"]])
    assert.equal(authErrorMessage(new ApiError(code, 400, "Changed backend wording"), translate), translate(`auth.errors.${key}`));
});

test("204 responses use the same decoder and malformed success remains INVALID_RESPONSE", async () => {
  const client = createApiClient("http://localhost", async () => new Response(null, { status: 204 }));
  assert.equal(await client.request("/api/auth/logout", value => value), undefined);
  await assert.rejects(client.request("/api/auth/logout", () => { throw new Error("decoder-sentinel"); }),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_RESPONSE" && error.status === 204);
});
