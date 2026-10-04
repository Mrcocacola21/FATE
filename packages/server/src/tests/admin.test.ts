import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import { adminRoutes } from "../routes/adminRoutes";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { AuthError } from "../auth/authErrors";
import type { AccountAccess } from "../auth/accountAccess";
import type { AdminService } from "../services/adminService";
import { assertCanChangeRole, assertCanModerate } from "../admin/policy";
import { actionListSchema, blockSchema, matchListSchema, userListSchema } from "../admin/schemas";
import { toAdminAction } from "../admin/dto";
import { registerSchema } from "../auth/schemas";
import { AdminRepository } from "../repositories/adminRepository";
import type { PrismaClient } from "@prisma/client";
import { MatchmakingService } from "../services/matchmakingService";
import { MultiplayerIdentityError } from "../auth/connectionIdentity";

test("policy matrix, self protection and strict privilege inputs", () => {
  const roles = ["USER", "MODERATOR", "ADMIN"] as const;
  for (const actorRole of roles)
    for (const targetRole of roles) {
      const actor: AccountAccess = { id: randomUUID(), role: actorRole, blockedAt: null };
      const target: AccountAccess = { id: randomUUID(), role: targetRole, blockedAt: null };
      const allowed =
        (targetRole === "USER" && actorRole !== "USER") ||
        (targetRole === "MODERATOR" && actorRole === "ADMIN");
      for (const blocking of [false, true]) {
        if (allowed) assert.doesNotThrow(() => assertCanModerate(actor, target, blocking));
        else assert.throws(() => assertCanModerate(actor, target, blocking), AuthError);
      }
      if (actorRole === "ADMIN") assert.doesNotThrow(() => assertCanChangeRole(actor, target.id));
      else assert.throws(() => assertCanChangeRole(actor, target.id), AuthError);
      if (actorRole !== "USER")
        assert.throws(() => assertCanModerate(actor, actor, true), { code: "CANNOT_BLOCK_SELF" });
    }
  const admin: AccountAccess = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  assert.throws(() => assertCanChangeRole(admin, admin.id), { code: "CANNOT_CHANGE_OWN_ROLE" });
  for (const extra of [{ role: "ADMIN" }, { isAdmin: true }, { isModerator: true }])
    assert.equal(
      registerSchema.safeParse({
        email: "test@example.test",
        username: "Player",
        password: "password",
        ...extra,
      }).success,
      false,
    );
  assert.deepEqual(blockSchema.parse({ reason: "  test  " }), { reason: "test" });
  assert.equal(blockSchema.safeParse({ reason: "a".repeat(501) }).success, false);
  assert.equal(userListSchema.safeParse({ limit: "101" }).success, false);
  assert.equal(userListSchema.safeParse({ sort: "passwordHash" }).success, false);
  assert.equal(actionListSchema.safeParse({ limit: "201" }).success, false);
  assert.equal(
    matchListSchema.safeParse({
      createdFrom: "2026-10-04T00:00:00Z",
      createdTo: "2026-10-03T00:00:00Z",
    }).success,
    false,
  );
});

test("HTTP RBAC uses persisted role/status with the same original JWT on every route", async () => {
  Object.assign(process.env, {
    JWT_ACCESS_SECRET: "admin-unit-access-secret-01234567890123456789",
    JWT_REFRESH_SECRET: "admin-unit-refresh-secret-01234567890123456789",
  });
  const account: AccountAccess = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  const token = new TokenService(readAuthConfig()).signAccessToken(account.id);
  let calls = 0;
  const read = async () => {
    calls++;
    return { items: [] };
  };
  const service = {
    listUsers: read,
    getUser: read,
    listMatches: read,
    getMatch: read,
    listActions: read,
    summary: read,
    setBlocked: read,
    changeRole: read,
  } as unknown as AdminService;
  const server = Fastify();
  await server.register(adminRoutes, {
    prefix: "/api/admin",
    service,
    revokeRuntime: () => undefined,
    loadAccount: async () => account,
  });
  const id = randomUUID();
  const routes = [
    "/users",
    `/users/${id}`,
    "/matches",
    `/matches/${id}`,
    `/matches/${id}/actions`,
    "/summary",
  ];
  try {
    for (const route of routes) {
      const url = `/api/admin${route}`;
      assert.equal((await server.inject({ url })).statusCode, 401);
      account.role = "USER";
      const response = await server.inject({ url, headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, "FORBIDDEN");
      account.role = "MODERATOR";
      assert.equal(
        (await server.inject({ url, headers: { authorization: `Bearer ${token}` } })).statusCode,
        200,
      );
    }
    assert.equal(calls, routes.length);
    const roleUrl = `/api/admin/users/${id}/role`;
    for (const role of ["USER", "MODERATOR", "ADMIN"] as const) {
      account.role = role;
      assert.equal(
        (
          await server.inject({
            method: "PATCH",
            url: roleUrl,
            payload: { role: "ADMIN" },
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        role === "ADMIN" ? 200 : 403,
      );
    }
    account.blockedAt = new Date();
    const blocked = await server.inject({
      url: "/api/admin/users",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().error.code, "ACCOUNT_BLOCKED");
  } finally {
    await server.close();
  }
});

test("action DTO validates persisted actions, excludes replay setup and nested credential material", () => {
  const row = {
    matchId: randomUUID(),
    revision: 1,
    actorUserId: randomUUID(),
    actorSeat: "P1" as const,
    actionType: "endTurn",
    actionPayload: { type: "endTurn" },
    createdAt: new Date(),
  };
  assert.equal(toAdminAction(row).payloadValid, true);
  assert.equal(
    toAdminAction({ ...row, actionPayload: { ...row.actionPayload, refreshToken: "secret" } })
      .actionPayload,
    null,
  );
  const ability = {
    ...row,
    actionType: "useAbility",
    actionPayload: {
      type: "useAbility",
      unitId: "unit-a",
      abilityId: "example",
      payload: { targetId: "unit-b", resumeToken: "secret" },
    },
  };
  assert.equal(toAdminAction(ability).payloadValid, true);
  assert.equal(JSON.stringify(toAdminAction(ability)).includes("secret"), false);
});

test("last active admin is protected inside the locked transaction", async () => {
  let locked = false;
  let updated = false;
  const actor = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  const target = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  const tx = {
    $executeRaw: async () => {
      locked = true;
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === actor.id ? actor : target,
      count: async () => {
        assert(locked);
        return 1;
      },
      update: async () => {
        updated = true;
      },
    },
  };
  const repo = new AdminRepository({
    $transaction: async (work: (client: typeof tx) => unknown) => work(tx),
  } as unknown as PrismaClient);
  await assert.rejects(repo.changeRole(actor.id, target.id, "USER"), {
    code: "LAST_ADMIN_PROTECTED",
  });
  assert.equal(updated, false);
});

test("blocking a pending matchmaking join and queued player prevents pairing", async () => {
  let blocked = false;
  let release!: () => void;
  let created = 0;
  const queue = new MatchmakingService({
    assertAccountActive: async () => {
      if (blocked) throw new MultiplayerIdentityError("ACCOUNT_BLOCKED", "Blocked");
    },
    loadPlayer: async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { rating: 1500, ratingDeviation: 350 };
    },
    hasPersistentActiveMatch: async () => false,
    hasRuntimeMatch: () => false,
    createPair: async () => {
      created++;
      return { matchId: randomUUID(), roomId: randomUUID() };
    },
    resultIsUsable: () => true,
    logger: { info: () => undefined, error: () => undefined },
  });
  const identity = { userId: randomUUID(), username: "player", displayName: null };
  queue.connect(identity, "socket", () => undefined);
  const joining = queue.join(identity, "standard");
  await new Promise<void>((resolve) => setImmediate(resolve));
  blocked = true;
  queue.invalidateAccount(identity.userId);
  release();
  await assert.rejects(joining);
  await queue.tick();
  assert.equal(queue.getStatus(identity.userId).status, "NOT_QUEUED");
  assert.equal(created, 0);
  await queue.close();
});
