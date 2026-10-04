import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "./testDatabase";
import { AdminRepository } from "../repositories/adminRepository";
import { AuditLogReader } from "../services/auditLogService";
import { MatchRecoveryRepository } from "../repositories/matchRecoveryRepository";
import { MatchRecoveryService } from "../services/matchRecoveryService";
import type { MatchLifecycle } from "../persistence/matchLifecycle";
import { auditListSchema } from "../admin/schemas";
import Fastify from "fastify";
import { adminRoutes } from "../routes/adminRoutes";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const matchIds = [randomUUID(), randomUUID()];
  const [admin, mod, user] = ids;
  try {
    for (const [i, id] of ids.entries())
      await db.user.create({
        data: {
          id,
          email: `${id}@example.test`,
          role: i === 0 ? "ADMIN" : i === 1 ? "MODERATOR" : "USER",
          profile: { create: { username: `audit-${id.slice(0, 12)}` } },
        },
      });
    const repo = new AdminRepository(db);
    const session = await db.authSession.create({
      data: {
        userId: user,
        refreshTokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const actionCount = await db.matchAction.count();
    await repo.setBlocked(admin, user, true, "Lobby abuse");
    await repo.setBlocked(admin, user, true, "Retry");
    const blocked = await db.auditLog.findMany({
      where: { targetUserId: user, eventType: "USER_BLOCKED" },
    });
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].actorUserId, admin);
    assert.equal(blocked[0].actorRole, "ADMIN");
    assert.equal(blocked[0].reason, "Lobby abuse");
    assert((await db.user.findUniqueOrThrow({ where: { id: user } })).blockedAt);
    assert((await db.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
    await repo.setBlocked(admin, user, false);
    await repo.setBlocked(admin, user, false);
    assert.equal(
      await db.auditLog.count({ where: { targetUserId: user, eventType: "USER_UNBLOCKED" } }),
      1,
    );
    await repo.setBlocked(mod, user, true);
    await repo.setBlocked(mod, user, false);
    await repo.changeRole(admin, mod, "USER");
    assert.equal(
      (
        await db.auditLog.findFirstOrThrow({
          where: { actorUserId: mod, eventType: "USER_BLOCKED" },
        })
      ).actorRole,
      "MODERATOR",
    );
    await repo.changeRole(admin, user, "MODERATOR");
    await repo.changeRole(admin, user, "MODERATOR");
    const role = await db.auditLog.findMany({
      where: { targetUserId: user, eventType: "USER_ROLE_CHANGED" },
    });
    assert.equal(role.length, 1);
    assert.deepEqual(role[0].metadata, { previousRole: "USER", newRole: "MODERATOR" });
    assert.equal(await db.matchAction.count(), actionCount);
    // Real transaction rollback: intercepted audit INSERT fails after the SQL mutation.
    const failing = db.$extends({
      query: {
        auditLog: {
          create: async () => {
            throw new Error("TEST_AUDIT_FAILURE");
          },
        },
      },
    });
    const failedRepo = new AdminRepository(failing as unknown as PrismaClient);
    await assert.rejects(failedRepo.setBlocked(admin, user, true), /TEST_AUDIT_FAILURE/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user } })).blockedAt, null);
    await assert.rejects(failedRepo.changeRole(admin, user, "USER"), /TEST_AUDIT_FAILURE/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user } })).role, "MODERATOR");
    await repo.setBlocked(admin, user, true);
    await assert.rejects(failedRepo.setBlocked(admin, user, false), /TEST_AUDIT_FAILURE/);
    assert((await db.user.findUniqueOrThrow({ where: { id: user } })).blockedAt);
    for (const id of matchIds)
      await db.match.create({ data: { id, roomId: `audit-${id}`, gameMode: "standard", seed: 1 } });
    await assert.rejects(
      new MatchRecoveryRepository(failing as unknown as PrismaClient).interrupt(
        matchIds[0],
        "SERVER_RESTART_UNRECOVERABLE:ACTION_LOG_GAP",
      ),
      /TEST_AUDIT_FAILURE/,
    );
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: matchIds[0] } })).status,
      "WAITING",
    );
    const recovery = new MatchRecoveryRepository(db);
    await new MatchRecoveryService(recovery).recover({} as MatchLifecycle, {
      info() {},
      error() {},
    });
    await recovery.interrupt(matchIds[0], "SERVER_RESTART_UNRECOVERABLE:ACTION_LOG_GAP");
    const interrupted = await db.auditLog.findMany({ where: { matchId: matchIds[0] } });
    assert.equal(interrupted.length, 1);
    assert.equal(interrupted[0].actorType, "SYSTEM");
    assert.equal(interrupted[0].actorUserId, null);
    assert.deepEqual(interrupted[0].metadata, {
      previousStatus: "WAITING",
      newStatus: "CANCELLED",
      recoveryReason: "WAITING_LOBBY_NOT_DURABLE",
      lastDurableRevision: 0,
    });
    const reader = new AuditLogReader(db);
    const read = (q: object) => reader.list(auditListSchema.parse(q));
    const all = await read({ limit: "200" });
    const pages = await Promise.all(
      Array.from({ length: Math.ceil(all.items.length / 2) }, (_, i) =>
        read({ page: String(i + 1), limit: "2" }),
      ),
    );
    assert.deepEqual(
      pages.flatMap((p) => p.items.map((r) => r.id)),
      all.items.map((r) => r.id),
    );
    for (const filter of [
      { eventType: "USER_BLOCKED" },
      { actorUserId: admin },
      { targetUserId: user },
      { matchId: matchIds[0] },
      { actorType: "SYSTEM" },
    ]) {
      const result = await read(filter);
      assert(result.items.length);
      for (const [key, value] of Object.entries(filter))
        assert(result.items.every((r) => r[key as "eventType"] === value));
    }
    const date = all.items[0].createdAt;
    assert((await read({ dateFrom: date, dateTo: date })).items.every((r) => r.createdAt === date));
    assert.equal((await read({ dateTo: "2000-01-01T00:00:00Z" })).items.length, 0);
    const serialized = JSON.stringify(all);
    for (const field of [
      "password",
      "passwordHash",
      "accessToken",
      "refreshToken",
      "resumeToken",
      "Authorization",
      "cookie",
      "DATABASE_URL",
      "rngState",
      "actionPayload",
      "GameState",
      "@example.test",
    ])
      assert.equal(serialized.includes(field), false, field);
    await db.user.delete({ where: { id: mod } });
    assert.equal(
      (await db.auditLog.findFirstOrThrow({ where: { actorUserId: mod } })).actorUserId,
      mod,
    );
    assert.equal((await read({ actorUserId: mod })).items[0].actor, null);
    // Exercise the real HTTP read boundary against PostgreSQL, including stale JWT role checks.
    Object.assign(process.env, {
      JWT_ACCESS_SECRET: "audit-db-access-secret-01234567890123456789",
      JWT_REFRESH_SECRET: "audit-db-refresh-secret-01234567890123456789",
    });
    const tokens = new TokenService(readAuthConfig());
    const server = Fastify();
    await server.register(adminRoutes, {
      prefix: "/api/admin",
      revokeRuntime() {},
      auditReader: reader,
      loadAccount: (id) =>
        db.user.findUnique({ where: { id }, select: { id: true, role: true, blockedAt: true } }),
    });
    try {
      assert.equal((await server.inject({ url: "/api/admin/audit" })).statusCode, 401);
      const headers = { authorization: `Bearer ${tokens.signAccessToken(admin)}` };
      const response = await server.inject({
        url: `/api/admin/audit?targetUserId=${user}&limit=2`,
        headers,
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.json().items.length, 2);
      assert(
        response
          .json()
          .items.every((event: { targetUserId: string }) => event.targetUserId === user),
      );
      await db.user.update({ where: { id: admin }, data: { role: "MODERATOR" } });
      assert.equal((await server.inject({ url: "/api/admin/audit", headers })).statusCode, 403);
      await db.user.update({ where: { id: admin }, data: { role: "USER" } });
      assert.equal((await server.inject({ url: "/api/admin/audit", headers })).statusCode, 403);
    } finally {
      await server.close();
    }
    // Defence on read against a malformed payload inserted by a direct DB operator.
    await db.auditLog.create({
      data: {
        eventType: "USER_BLOCKED",
        actorType: "SYSTEM",
        targetUserId: user,
        metadata: { targetRole: "USER", accessToken: "UNEXPECTED_SECRET", state: { hidden: true } },
      },
    });
    const guarded = await read({ targetUserId: user });
    assert.equal(guarded.items[0].metadata, null);
    assert.equal(JSON.stringify(guarded).includes("UNEXPECTED_SECRET"), false);
    console.log(
      "Audit DB integration passed: transitions/retries, role snapshots, session revocation, four rollback paths, recovery, separation, filters/pagination, safe DTO, deletion survival",
    );
  } finally {
    // Explicit fixture cleanup belongs only to this guarded test, never to application APIs.
    await db.auditLog.deleteMany({
      where: { OR: [{ targetUserId: { in: ids } }, { matchId: { in: matchIds } }] },
    });
    await db.match.deleteMany({ where: { id: { in: matchIds } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
