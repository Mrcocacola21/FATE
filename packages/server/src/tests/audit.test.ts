import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import type { Prisma } from "@prisma/client";
import { AuditLogService } from "../services/auditLogService";
import { AuditActorType, AuditEventType } from "../audit/events";
import { auditListSchema } from "../admin/schemas";
import { adminRoutes } from "../routes/adminRoutes";
import { TokenService } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import type { AccountAccess } from "../auth/accountAccess";

test("audit writer validates bounded event-specific data and rejects secrets/state/client time", async () => {
  const rows: unknown[] = [];
  const tx = {
    auditLog: { create: async (input: unknown) => rows.push(input) },
  } as unknown as Prisma.TransactionClient;
  const event = {
    eventType: AuditEventType.USER_BLOCKED,
    actor: { type: AuditActorType.USER, userId: randomUUID(), role: "MODERATOR" as const },
    targetUserId: randomUUID(),
    reason: "  Lobby abuse  ",
    metadata: { targetRole: "USER" as const },
  };
  const service = new AuditLogService();
  await service.record(tx, event);
  assert.deepEqual(rows[0], {
    data: {
      eventType: "USER_BLOCKED",
      actorType: "USER",
      actorUserId: event.actor.userId,
      actorRole: "MODERATOR",
      targetUserId: event.targetUserId,
      matchId: null,
      reason: "Lobby abuse",
      metadata: { targetRole: "USER" },
    },
  });
  for (const field of [
    "password",
    "passwordHash",
    "accessToken",
    "refreshToken",
    "resumeToken",
    "Authorization",
    "cookie",
    "DATABASE_URL",
    "state",
    "rngState",
    "actions",
  ])
    await assert.rejects(
      service.record(tx, { ...event, metadata: { ...event.metadata, [field]: "secret" } }),
    );
  await assert.rejects(service.record(tx, { ...event, reason: "x".repeat(501) }));
  await assert.rejects(service.record(tx, { ...event, createdAt: new Date() } as typeof event));
  assert.equal(rows.length, 1);
});

test("audit filters reject unknown enums, malformed IDs, unbounded pages and inverted dates", () => {
  assert.deepEqual(auditListSchema.parse({}), { page: 1, limit: 50 });
  for (const query of [
    { limit: "201" },
    { page: "0" },
    { eventType: "MOVE" },
    { actorUserId: "x" },
    { dateFrom: "bad" },
    { dateFrom: "2026-10-04T00:00:00Z", dateTo: "2026-10-03T00:00:00Z" },
    { createdAt: "x" },
  ])
    assert.equal(auditListSchema.safeParse(query).success, false);
});

test("audit API is ADMIN-only, rechecks persisted roles, and has no mutation endpoints", async () => {
  Object.assign(process.env, {
    JWT_ACCESS_SECRET: "audit-unit-access-secret-01234567890123456789",
    JWT_REFRESH_SECRET: "audit-unit-refresh-secret-01234567890123456789",
  });
  const account: AccountAccess = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  const token = new TokenService(readAuthConfig()).signAccessToken(account.id);
  let reads = 0;
  const server = Fastify();
  await server.register(adminRoutes, {
    prefix: "/api/admin",
    revokeRuntime: () => {},
    loadAccount: async () => account,
    auditReader: {
      list: async (query) => {
        reads++;
        return { items: [], pagination: { ...query, total: 0, totalPages: 0 } };
      },
    },
  });
  try {
    assert.equal((await server.inject({ url: "/api/admin/audit" })).statusCode, 401);
    for (const role of ["USER", "MODERATOR", "ADMIN"] as const) {
      account.role = role;
      assert.equal(
        (
          await server.inject({
            url: "/api/admin/audit",
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        role === "ADMIN" ? 200 : 403,
      );
    }
    assert.equal(reads, 1);
    for (const method of ["POST", "PATCH", "DELETE"] as const)
      assert.equal(
        (
          await server.inject({
            method,
            url: method === "POST" ? "/api/admin/audit" : `/api/admin/audit/${randomUUID()}`,
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
        404,
      );
    assert.equal(
      (
        await server.inject({
          url: "/api/admin/audit?limit=201",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
      400,
    );
  } finally {
    await server.close();
  }
});
