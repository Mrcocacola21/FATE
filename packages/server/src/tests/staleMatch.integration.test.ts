import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { mock } from "node:test";
import { buildServer } from "../index";
import { MatchService } from "../services/matchService";
import { MatchRepository } from "../repositories/matchRepository";
import { configureTestDatabase } from "./testDatabase";
import { testIdentityService, testAccessToken } from "./matchTestSupport";
import { getGameRoom, storeTestHooks } from "../store";
import { createReplayFixture } from "./replayTestSupport";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { createMatchmakingService } from "../matchmaking/runtime";
import { reconnectGraceMs } from "../matches/reconnectPolicy";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const userId = randomUUID(), matchId = randomUUID(), roomId = randomUUID();
  const token = testAccessToken("P1", "stale-player", userId);
  const logger = { info() {}, error() {} };
  const persistence = new MatchService(new MatchRepository(db));
  const lifecycle = new MatchLifecycle(logger, persistence);
  const queue = createMatchmakingService(lifecycle, logger);
  const extraUser = randomUUID();
  const matchIds = [matchId];
  const server = await buildServer({
    matchPersistence: persistence,
    connectionIdentity: testIdentityService(),
    matchRecovery: false,
  });
  try {
    await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
    await db.user.create({ data: { id: extraUser, email: `${extraUser}@example.test` } });
    // Real persisted legacy match: no recoverable setup, no runtime room, days old.
    await db.match.create({ data: {
      id: matchId, roomId, seed: 1, gameMode: "classic", isRated: true,
      status: "IN_PROGRESS", startedAt: new Date(Date.now() - 5 * 86400000),
      participants: { create: { userId, seat: "P1", displayNameSnapshot: "Player" } },
    } });
    const missing = await server.inject({ url: `/rooms/${roomId}` });
    assert.equal(missing.statusCode, 404);
    const created = await server.inject({ method: "POST", url: "/rooms",
      headers: { authorization: `Bearer ${token}` }, payload: {} });
    assert.equal(created.statusCode, 201, created.body);
    const old = await db.match.findUniqueOrThrow({ where: { id: matchId } });
    assert.equal(old.status, "CANCELLED", "orphan must be terminally reconciled before creating a lobby");
    assert.equal(old.winnerUserId, null);
    assert.equal(old.loserUserId, null);
    assert.equal(old.ratingProcessedAt, null);
    assert.equal(await db.matchParticipant.count({ where: { matchId } }), 1);
    assert.equal(await db.ratingHistory.count({ where: { matchId } }), 0);
    const headers = { authorization: `Bearer ${token}` };
    for (let i = 0; i < 2; i++) {
      const active = await server.inject({ url: "/api/matches/active", headers });
      assert.deepEqual(active.json(), { match: null });
    }
    assert.equal(await db.auditLog.count({ where: { matchId } }), 1, "reconciliation is idempotent");
    const identity = { userId, username: "stale-player", displayName: null };
    queue.connect(identity, "test-connection", () => {});
    assert.equal((await queue.join(identity, "classic")).status, "QUEUED", "reconciled user can enter Rated queue");
    queue.cancel(userId);

    // Missing runtime alone is insufficient: restore a five-day-old valid durable match.
    const fixture = createReplayFixture("classic");
    const validId = randomUUID(), validRoom = randomUUID(); matchIds.push(validId);
    await db.match.create({ data: { id: validId, roomId: validRoom, seed: fixture.match.seed,
      gameMode: "classic", isRated: true, status: "IN_PROGRESS",
      startedAt: new Date(Date.now() - 5 * 86400000),
      initialConfig: fixture.match.initialConfig as Prisma.InputJsonObject,
      participants: { create: [userId, extraUser].map((id, i) => ({
        userId: id, seat: i ? "P2" : "P1", displayNameSnapshot: `Player ${i}`,
      })) } } });
    await db.matchAction.createMany({ data: fixture.actions.filter(row => row.revision <= 37).map(row => ({
      matchId: validId, revision: row.revision, actorSeat: row.actorSeat,
      actionType: row.actionType, actionPayload: row.actionPayload as Prisma.InputJsonObject,
    })) });
    const checkpoint = fixture.history.get(20)!;
    await db.matchSnapshot.create({ data: { matchId: validId, revision: 20, formatVersion: 1,
      state: checkpoint.state as Prisma.InputJsonObject, rngState: checkpoint.rngState as Prisma.InputJsonObject } });
    mock.timers.enable({ apis: ["setTimeout"] });
    const active = await server.inject({ url: "/api/matches/active", headers });
    assert.deepEqual(active.json(), { match: { id: validId, roomId: validRoom, seat: "P1", rejoinable: true } });
    assert.equal(getGameRoom(validRoom)!.revision, 37);
    assert.equal((await server.inject({ method: "POST", url: "/rooms", headers, payload: {} })).statusCode, 409);
    await assert.rejects(queue.join(identity, "classic"), (error: unknown) =>
      error instanceof Error && error.message.includes("active match"));
    // Neither restored participant returns: a fresh configured grace expires neutrally.
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(validRoom), () => undefined);
    mock.timers.reset();
    assert.equal((await db.match.findUniqueOrThrow({ where: { id: validId } })).status, "CANCELLED");
    assert.equal(getGameRoom(validRoom), undefined);
    assert.equal(await db.matchAction.count({ where: { matchId: validId } }), 37);
    assert.equal(await db.matchSnapshot.count({ where: { matchId: validId } }), 1);
    assert.equal(await db.ratingHistory.count({ where: { matchId: validId } }), 0);
    assert.equal((await server.inject({ method: "POST", url: "/rooms", headers, payload: {} })).statusCode, 201);
    assert.equal((await queue.join(identity, "classic")).status, "QUEUED");
    console.log("PostgreSQL zombie reconciliation, runtime recovery, live blockers, recovered grace, history/rating preservation and queue unlock passed");
  } finally {
    mock.timers.reset();
    await queue.close(); await lifecycle.close();
    await server.close();
    storeTestHooks.reset();
    await db.auditLog.deleteMany({ where: { matchId: { in: matchIds } } });
    await db.match.deleteMany({ where: { OR: [{ id: { in: matchIds } }, { createdById: userId }] } });
    await db.user.deleteMany({ where: { id: { in: [userId, extraUser] } } });
    await db.$disconnect();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });

