import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { authClient, authStore } from "../auth/authStore";
import { ApiError } from "../api/client";
import { adminApi, getAdminAccessRevision, isAdminAccessLost } from "./api";
import { summary, userDetail, safeJson, page, user } from "./decoders";
import { fixtureSummary, fixtureUser, fixturePage } from "./fixtures";
import { readQuery } from "./query";
import { canChangeRole, canModerate } from "./policy";

const originalAuth = authStore.getState(),
  originalRequest = authClient.request;
beforeEach(() =>
  authStore.setState(
    {
      ...originalAuth,
      status: "authenticated",
      initialized: true,
      user: {
        id: "api-staff",
        role: "ADMIN",
        email: "staff@example.test",
        username: "staff",
        displayName: null,
        avatarUrl: null,
        createdAt: fixtureUser.createdAt,
      },
    },
    true,
  ),
);
afterEach(() => {
  authClient.request = originalRequest;
  authStore.setState(originalAuth, true);
});
test("DTO validation strips unrelated fields and rejects incomplete contracts", () => {
  assert.deepEqual(summary(fixtureSummary), fixtureSummary);
  assert.throws(() => summary({ users: {} }), ApiError);
  assert.deepEqual(userDetail({ user: fixtureUser }), fixtureUser);
  assert.throws(
    () => userDetail({ user: { ...fixtureUser, ratings: [{ rating: 1800 }] } }),
    ApiError,
  );
  const decoded = page(user)(fixturePage([{ ...fixtureUser, passwordHash: "private" }]));
  assert.equal("passwordHash" in decoded.items[0], false);
  assert.throws(() => user({ ...fixtureUser, role: "ROOT" }), ApiError);
});
test("action JSON is text-safe and credential fields are removed recursively", () => {
  assert.deepEqual(
    safeJson({
      type: "ability",
      payload: {
        description: "<img onerror=alert(1)>",
        password: "private",
        nested: [{ accessToken: "private", x: 2 }],
      },
    }),
    { type: "ability", payload: { description: "<img onerror=alert(1)>", nested: [{ x: 2 }] } },
  );
});
test("query parsing bounds pagination and maps URL aliases to actual API fields", () => {
  assert.deepEqual(
    readQuery(new URLSearchParams("page=0&limit=10000&role=ROOT&status=blocked"), "users"),
    {
      page: 1,
      limit: 20,
      order: "desc",
      search: undefined,
      role: undefined,
      status: "BLOCKED",
      sort: "createdAt",
    },
  );
  const q = readQuery(
    new URLSearchParams("mode=DRAFT&type=RATED&participant=user-id&createdFrom=2026-10-01"),
    "matches",
  );
  assert.equal(q.gameMode, "draft");
  assert.equal(q.matchType, "RATED");
  assert.equal(q.participantUserId, "user-id");
  assert.equal(q.createdFrom, "2026-10-01T00:00:00.000Z");
});
test("permission controls match backend hierarchy and self protection", () => {
  const actor = authStore.getState().user!;
  assert.equal(canModerate(actor, fixtureUser), true);
  assert.equal(canModerate(actor, { ...fixtureUser, role: "ADMIN" }), false);
  assert.equal(
    canModerate({ ...actor, role: "MODERATOR" }, { ...fixtureUser, role: "MODERATOR" }),
    false,
  );
  assert.equal(canChangeRole(actor, { ...fixtureUser, id: actor.id }), false);
  assert.equal(canChangeRole(actor, { ...fixtureUser, blocked: true }), false);
});
test("API serializes backend query names, mutations and no-store requests", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  authClient.request = async (path, decode, options) => {
    calls.push({ path, options });
    return decode(path.includes("/block") ? { user: fixtureUser } : fixturePage([fixtureUser]));
  };
  await adminApi.users({ page: 2, status: "BLOCKED", search: "max & polina" });
  await adminApi.block(fixtureUser.id, "Reason");
  assert.match(calls[0].path, /search=max\+%26\+polina/);
  assert.equal(calls[0].options?.cache, "no-store");
  assert.equal(calls[1].options?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].options?.body)), { reason: "Reason" });
});
test("target-policy 403 does not revoke staff access; FORBIDDEN does", async () => {
  const revision = getAdminAccessRevision();
  authClient.request = async () => {
    throw new ApiError("INSUFFICIENT_TARGET_ROLE", 403);
  };
  await assert.rejects(adminApi.block(fixtureUser.id, ""));
  assert.equal(getAdminAccessRevision(), revision);
  authClient.request = async () => {
    throw new ApiError("FORBIDDEN", 403);
  };
  await assert.rejects(adminApi.summary());
  assert.equal(isAdminAccessLost(), true);
  assert.equal(getAdminAccessRevision(), revision + 1);
});
test("blocked current staff follows auth sign-out and clears user data", async () => {
  authClient.request = async () => {
    throw new ApiError("ACCOUNT_BLOCKED", 403);
  };
  await assert.rejects(adminApi.summary());
  assert.equal(authStore.getState().status, "unauthenticated");
  assert.equal(authStore.getState().user, null);
});
