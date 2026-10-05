import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { requireTestDatabaseUrl } from "../testDatabase";
import { AppError, internalError } from "../../errors/appError";
import { parseInput, ValidationError } from "../../validation/parseRequest";
import { assertCanModerate, assertCanChangeRole } from "../../admin/policy";
import { getAllowedRatingRange, readMatchmakingConfig } from "../../matchmaking/config";
import type { AccountAccess } from "../../auth/accountAccess";
import { AuthError } from "../../auth/authErrors";

test("test DB guard rejects hosted/production targets before any database client exists", () => {
  for (const TEST_DATABASE_URL of [
    "postgresql://secret:secret@ep-test.neon.tech/fate_test",
    "postgresql://secret:secret@render.example/fate_test?schema=test",
    "postgresql://localhost/fate", "postgresql://localhost/contest",
    "postgresql://localhost/fate?schema=latest", "https://localhost/fate_test",
    "postgresql://localhost/%E0%A4%A", "not-a-url", "",
  ]) {
    assert.throws(() => requireTestDatabaseUrl({ TEST_DATABASE_URL }), error => {
      assert(error instanceof Error);
      assert(!error.message.includes("secret"));
      return true;
    });
  }
  assert.throws(() => requireTestDatabaseUrl({ NODE_ENV: "production", TEST_DATABASE_URL: "postgresql://localhost/fate_test" }));
  assert.throws(() => requireTestDatabaseUrl({}));
  for (const url of ["postgresql://localhost/fate_test", "postgresql://127.0.0.1/fate?schema=integration_test", "postgresql://[::1]/fate-test"])
    assert.equal(requireTestDatabaseUrl({ TEST_DATABASE_URL: url }), url);
});

test("matchmaking expansion changes exactly at the step and caps at the maximum", () => {
  const config = readMatchmakingConfig({});
  for (const [time, range] of [[-1, 100], [0, 100], [14999, 100], [15000, 150], [89999, 350], [90000, 400], [Number.MAX_SAFE_INTEGER, 400]])
    assert.equal(getAllowedRatingRange(time, config), range);
});

test("moderation role matrix, self restrictions and blocked actor remain pure policy", () => {
  const account = (id: string, role: AccountAccess["role"]): AccountAccess => ({ id, role, blockedAt: null });
  for (const actorRole of ["USER", "MODERATOR", "ADMIN"] as const) {
    for (const targetRole of ["USER", "MODERATOR", "ADMIN"] as const) {
      const actor = account("actor", actorRole), target = account("target", targetRole);
      const allowed = actorRole === "ADMIN" ? targetRole !== "ADMIN" : actorRole === "MODERATOR" && targetRole === "USER";
      if (allowed) assert.doesNotThrow(() => assertCanModerate(actor, target, true));
      else assert.throws(() => assertCanModerate(actor, target, true), AuthError);
    }
  }
  assert.throws(() => assertCanModerate(account("same", "ADMIN"), account("same", "USER"), true), /Cannot block/i);
  assert.throws(() => assertCanChangeRole(account("same", "ADMIN"), "same"), AuthError);
  assert.doesNotThrow(() => assertCanChangeRole(account("admin", "ADMIN"), "other"));
  assert.throws(() => assertCanChangeRole({ ...account("admin", "ADMIN"), blockedAt: new Date("2026-01-01") }, "other"), AuthError);
});

test("application errors and validation normalize safe messages without HTTP or input disclosure", () => {
  assert.deepEqual(new AppError("CONFLICT", 409, "Conflict").toResponse(), { error: { code: "CONFLICT", message: "Conflict" } });
  const fallback = internalError();
  assert.equal(fallback.statusCode, 500);
  assert.equal(fallback.toResponse().error.code, "INTERNAL_SERVER_ERROR");
  assert.throws(() => parseInput(z.object({ page: z.number().min(1) }).strict(), { page: -1, password: "secret-input" }), error => {
    assert(error instanceof ValidationError);
    assert.deepEqual(error.details, { fields: [
      { path: "page", message: "Value is below the allowed minimum." },
      { path: "password", message: "Unexpected field." },
    ] });
    assert(!JSON.stringify(error.toResponse()).includes("secret-input"));
    return true;
  });
});
