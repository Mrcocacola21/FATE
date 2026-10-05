import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { PrismaClient, Prisma } from "@prisma/client";
import { SeededRNG, makeSpectatorView, makePlayerView, type GameAction } from "rules";
import { configureTestDatabase } from "./testDatabase";
import { createReplayFixture } from "./replayTestSupport";
import { testTokens } from "./matchTestSupport";
import { buildServer } from "../index";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchRecoveryRepository } from "../repositories/matchRecoveryRepository";
import { UserRepository } from "../repositories/userRepository";
import { RatingRepository } from "../repositories/ratingRepository";
import { MatchService } from "../services/matchService";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { ReplayService } from "../services/replayService";
import { RatingService } from "../services/ratingService";
import { MatchRecoveryService } from "../services/matchRecoveryService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { ConnectionIdentityService } from "../auth/connectionIdentity";
import { deserializeReplayAction } from "../replay/deserializeAction";
import { restoreReplaySetup } from "../replay/actionSetup";
import { normalizeSnapshotState } from "../persistence/matchSnapshot";
import { getGameRoom, storeTestHooks, type GameRoom } from "../store";
import { wsTestHooks, type ServerMessage } from "../ws";

const logger = { info() {}, error() {} };
async function until<T>(read: () => T | undefined | false): Promise<T> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Restart test timed out");
}

async function run() {
  const url = configureTestDatabase();
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({ datasources: { db: { url } } });
  const matches = new MatchRepository(db), actions = new MatchActionRepository(db);
  const snapshots = new MatchSnapshotService(new MatchSnapshotRepository(db), { interval: 20 });
  const ratings = new RatingService(new RatingRepository(db), logger);
  const persistence = new MatchService(matches, logger, actions, snapshots, ratings);
  const replay = new ReplayService(matches, actions, snapshots);
  const repository = new MatchRecoveryRepository(db);
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  const matchIds: string[] = [];
  const clients: WebSocket[] = [];
  const servers: FastifyInstance[] = [];
  const lifecycles: MatchLifecycle[] = [];
  const identities = userIds.map((userId, index) => ({ userId, username: `recovery-${userId}`, displayName: `Player ${index}` }));
  const identity = new ConnectionIdentityService(testTokens, new UserRepository(db));
  async function freshServer() {
    let live!: MatchLifecycle;
    const recovery = new MatchRecoveryService(repository, replay, ratings);
    const server = await buildServer({ matchPersistence: persistence, connectionIdentity: identity,
      matchRecovery: { recover: async (lifecycle, log) => { live = lifecycle; lifecycles.push(live); return recovery.recover(lifecycle, log); } },
      interruptedRoom: id => repository.isInterruptedRoom(id), ratings,
    });
    servers.push(server);
    await server.listen({ host: "127.0.0.1", port: 0 });
    assert.equal((await server.inject({ url: "/ready" })).statusCode, 200);
    return { server, live, recovery };
  }
  async function connect(server: FastifyInstance) {
    const port = (server.server.address() as { port: number }).port;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    clients.push(socket);
    const messages: ServerMessage[] = [];
    socket.on("message", data => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    return { socket, messages, send: (message: object) => { messages.length = 0; socket.send(JSON.stringify(message)); },
      wait: (type: ServerMessage["type"]) => until(() => messages.find(m => m.type === type)) };
  }
  async function dropRuntime(server?: FastifyInstance) {
    for (const socket of clients.splice(0)) socket.terminate();
    if (server) await server.close();
    storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
  }
  async function applyFixture(lifecycle: MatchLifecycle, room: GameRoom, f: ReturnType<typeof createReplayFixture>, through: number) {
    for (const row of f.actions.filter(row => row.revision > room.revision && row.revision <= through)) {
      const { action, setup } = deserializeReplayAction(row);
      assert(!action.type.startsWith("draft") && action.type !== "setGameMode");
      if (setup) room.state = restoreReplaySetup(room.state, setup);
      const command = await lifecycle.applyAction(room, action as GameAction, row.actorSeat ?? undefined);
      assert(command.ok, `${row.revision} ${action.type} was rejected`);
      assert.equal(room.revision, row.revision);
      // Keep the real bounded persistence drain meaningful under CI/Windows load;
      // this test verifies durable gameplay, rather than an artificial 600-action burst.
      if (row.revision % 20 === 0)
        assert(await lifecycle.drainActions(room.matchId!), `journal drain at ${row.revision}`);
    }
    assert(await lifecycle.drainActions(room.matchId!));
  }
  try {
    for (const [index, id] of userIds.entries()) await db.user.create({ data: {
      id, email: `recovery-${id}@example.test`, profile: { create: { username: identities[index].username, displayName: identities[index].displayName } },
    } });
    // Runtime A uses the normal live lifecycle and ordered journal to revision 37.
    for (const rated of [false, true]) {
      const f = createReplayFixture("classic", true);
      const a = new MatchLifecycle(logger, persistence, snapshots); lifecycles.push(a);
      let room: GameRoom;
      if (rated) {
        const pair = await a.createMatchedRoom({ roomId: randomUUID(), retryAt: 0,
          players: { P1: { identity: identities[0], joinedAt: Date.now(), rating: 1500, ratingDeviation: 350, gameMode: "classic", state: "MATCHING" },
            P2: { identity: identities[1], joinedAt: Date.now(), rating: 1500, ratingDeviation: 350, gameMode: "classic", state: "MATCHING" } } });
        room = getGameRoom(pair.roomId)!;
        // The fixture's exact seed is a durable creation input in this test.
        room.seed = f.match.seed; room.rng = new SeededRNG(f.match.seed);
        room.state = { ...room.state, arenaId: "fixture-arena" };
        const created = await db.match.findUniqueOrThrow({ where: { id: pair.matchId } });
        await db.match.update({ where: { id: pair.matchId }, data: { seed: f.match.seed,
          initialConfig: { ...(created.initialConfig as Prisma.JsonObject), arenaId: "fixture-arena" } as Prisma.InputJsonObject } });
      } else room = await a.createRoom({ seed: f.match.seed, arenaId: "fixture-arena", gameMode: "classic", hostSeat: "P2", hostConnId: "old-P2" }, undefined, userIds[1]);
      matchIds.push(room.matchId!);
      room.seatIdentities = { P1: identities[0], P2: identities[1] };
      room.seats = { P1: "old-P1", P2: "old-P2" };
      room.state = { ...room.state, seats: { P1: true, P2: true } };
      // Fixture setup carries the original host and armies as normal accepted lobby inputs.
      await a.syncParticipant(room, "P1"); await a.syncParticipant(room, "P2");
      await applyFixture(a, room, f, 37);
      const matchId = room.matchId!, roomId = room.id;
      assert.deepEqual(normalizeSnapshotState(room.state), f.history.get(37)!.state);
      assert.equal(await db.matchAction.count({ where: { matchId } }), 37);
      assert.equal(await db.matchSnapshot.count({ where: { matchId } }), 1);
      await a.close(); await dropRuntime();
      // Runtime B has no connIds, sockets, token registry, or queue from A.
      let b = await freshServer();
      room = getGameRoom(roomId)!;
      assert.equal(room.matchId, matchId); assert.equal(room.revision, 37);
      assert.equal(room.matchType, rated ? "RATED" : "CASUAL");
      assert.equal(room.origin, rated ? "MATCHMAKING" : "MANUAL");
      assert.deepEqual(normalizeSnapshotState(room.state), f.history.get(37)!.state);
      assert.deepEqual((room.rng as SeededRNG).exportState(), (await replay.reconstructAtRevision(matchId, 37)).rngState);
      assert.equal((await b.recovery.recover(b.live, logger)).skipped, 1);
      const intruder = await connect(b.server);
      intruder.send({ type: "joinRoom", mode: "join", roomId, role: "P1", accessToken: testTokens.signAccessToken(userIds[2]), name: "Player 0" });
      assert.equal((await intruder.wait("error") as { code: string }).code, "SEAT_OWNED_BY_ANOTHER_USER");
      const guest = await connect(b.server);
      guest.send({ type: "joinRoom", mode: "join", roomId, role: "P1", name: "Player 0" });
      assert.equal((await guest.wait("error") as { code: string }).code, rated ? "RATED_MATCH_REQUIRES_AUTHENTICATION" : "AUTH_REQUIRED");
      const spectators = await connect(b.server);
      spectators.send({ type: "joinRoom", mode: "join", roomId, role: "spectator" });
      const projected = await spectators.wait("roomState");
      assert(projected.type === "roomState");
      assert.deepEqual(projected.view, JSON.parse(JSON.stringify(makeSpectatorView(room.state))));
      // A recovered seat reservation never overrides the current account block.
      await db.user.update({ where: { id: userIds[0] }, data: { blockedAt: new Date() } });
      const blocked = await connect(b.server);
      blocked.send({
        type: "joinRoom",
        mode: "join",
        roomId,
        role: "P1",
        accessToken: testTokens.signAccessToken(userIds[0]),
        resumeToken: "dead-process-token",
      });
      assert.equal(((await blocked.wait("error")) as { code: string }).code, "ACCOUNT_BLOCKED");
      assert.equal(room.revision, 37);
      assert.equal(room.seatIdentities.P1?.userId, userIds[0]);
      await db.user.update({ where: { id: userIds[0] }, data: { blockedAt: null } });
      const players = await Promise.all([connect(b.server), connect(b.server)]);
      for (const [i, player] of players.entries()) {
        const seat = i === 0 ? "P1" : "P2";
        player.send({ type: "joinRoom", mode: "join", roomId, role: seat,
          accessToken: testTokens.signAccessToken(userIds[i]), resumeToken: "dead-process-token", figureSet: { archer: "invalid" } });
        const ack = await player.wait("joinAck"); assert(ack.type === "joinAck"); assert.equal(ack.seat, seat);
        assert.notEqual(ack.resumeToken, "dead-process-token");
        const projectedPlayer = await player.wait("roomState");
        assert(projectedPlayer.type === "roomState");
        assert.deepEqual(projectedPlayer.view, JSON.parse(JSON.stringify(makePlayerView(room.state, seat))));
      }
      assert.deepEqual(normalizeSnapshotState(room.state), f.history.get(37)!.state);
      // Same-user tab replacement follows existing reservation ownership policy.
      const tab = await connect(b.server);
      tab.send({ type: "joinRoom", mode: "join", roomId, role: "P1", accessToken: testTokens.signAccessToken(userIds[0]) });
      await tab.wait("joinAck");
      assert.equal((await players[0].wait("error") as { code: string }).code, "SEAT_CONNECTION_REPLACED");
      const next = f.actions.find(row => row.revision === 38)!;
      const acting = next.actorSeat === "P1" ? tab : players[1];
      acting.send({ type: "action", action: deserializeReplayAction(next).action });
      const accepted = await acting.wait("actionResult"); assert(accepted.type === "actionResult" && accepted.ok);
      assert(await b.live.drainActions(matchId));
      assert.equal(room.revision, 38);
      assert.equal(await db.matchAction.count({ where: { matchId, revision: 38 } }), 1);
      assert.equal(await db.auditLog.count({ where: { matchId } }), 0);
      await applyFixture(b.live, room, f, 54);
      assert(await db.matchSnapshot.findUnique({ where: { matchId_revision: { matchId, revision: 40 } } }));
      await dropRuntime(b.server);
      b = await freshServer(); room = getGameRoom(roomId)!;
      assert.equal(room.revision, 54);
      assert.deepEqual(normalizeSnapshotState(room.state), f.history.get(54)!.state);
      await applyFixture(b.live, room, f, 71);
      await dropRuntime(b.server);
      b = await freshServer(); room = getGameRoom(roomId)!;
      assert.equal(room.revision, 71);
      assert.deepEqual(normalizeSnapshotState(room.state), f.history.get(71)!.state);
      await applyFixture(b.live, room, f, f.match.finalRevision!);
      const result = await db.match.findUniqueOrThrow({ where: { id: matchId }, include: { participants: true } });
      assert.equal(result.status, "FINISHED"); assert.equal(result.finalRevision, f.match.finalRevision);
      assert.equal(await db.auditLog.count({ where: { matchId } }), 0);
      assert(result.participants.every(p => p.outcome));
      assert.equal(await db.matchAction.count({ where: { matchId } }), f.match.finalRevision);
      assert.equal(await db.ratingHistory.count({ where: { matchId } }), rated ? 2 : 0);
      assert.equal((await replay.validateFinalDeterminism(matchId)).deterministic, true);
      await dropRuntime(b.server);
      const historyCount = await db.ratingHistory.count({ where: { matchId } });
      b = await freshServer();
      assert.equal(getGameRoom(roomId), undefined);
      assert.equal(await db.ratingHistory.count({ where: { matchId } }), historyCount);
      assert.equal((await b.server.inject({ url: "/api/matchmaking/queue", headers: { authorization: `Bearer ${testTokens.signAccessToken(userIds[0])}` } })).json().status, "NOT_QUEUED");
      await dropRuntime(b.server);
    }
    // DB-backed corrupted/legacy matches are isolated, keep history, and return controlled UX.
    const f = createReplayFixture();
    const badId = randomUUID(), roomId = randomUUID(); matchIds.push(badId);
    await db.match.create({ data: { id: badId, roomId, status: "IN_PROGRESS", gameMode: "classic", seed: f.match.seed,
      initialConfig: f.match.initialConfig as Prisma.InputJsonObject,
      participants: { create: identities.slice(0, 2).map((p, i) => ({ userId: p.userId, seat: i ? "P2" : "P1", displayNameSnapshot: p.username })) } } });
    await db.matchAction.createMany({ data: f.actions.filter(r => r.revision <= 37 && r.revision !== 23).map(r => ({
      matchId: badId, revision: r.revision, actorSeat: r.actorSeat, actionType: r.actionType,
      actionPayload: r.actionPayload as Prisma.InputJsonObject,
    })) });
    await db.matchSnapshot.create({ data: { matchId: badId, revision: 20, formatVersion: 1,
      state: f.history.get(20)!.state as Prisma.InputJsonObject, rngState: f.history.get(20)!.rngState as Prisma.InputJsonObject } });
    const b = await freshServer();
    assert.equal((await db.match.findUniqueOrThrow({ where: { id: badId } })).status, "CANCELLED");
    assert.equal(await db.matchAction.count({ where: { matchId: badId } }), 36);
    assert.equal(await db.matchSnapshot.count({ where: { matchId: badId } }), 1);
    assert.equal(await db.ratingHistory.count({ where: { matchId: badId } }), 0);
    const audit = await db.auditLog.findMany({ where: { matchId: badId } });
    assert.equal(audit.length, 1);
    assert.equal(audit[0].eventType, "MATCH_INTERRUPTED");
    assert.equal(audit[0].actorType, "SYSTEM");
    assert.deepEqual(audit[0].metadata, { previousStatus: "IN_PROGRESS", newStatus: "CANCELLED", recoveryReason: "ACTION_LOG_GAP", lastDurableRevision: 37 });
    await repository.interrupt(badId, "SERVER_RESTART_UNRECOVERABLE:ACTION_LOG_GAP");
    assert.equal(await db.auditLog.count({ where: { matchId: badId } }), 1);
    assert.equal((await b.server.inject({ url: `/rooms/${roomId}` })).json().error.code, "MATCH_INTERRUPTED");
    const c = await connect(b.server);
    c.send({ type: "joinRoom", mode: "join", roomId, role: "spectator" });
    const rejection = await c.wait("joinRejected"); assert(rejection.type === "joinRejected");
    assert.equal(rejection.reason, "match_interrupted");
    assert.equal((await b.server.inject({ url: "/rooms" })).json().some((r: { id: string }) => r.id === roomId), false);
    await dropRuntime(b.server);
    // Crash after a terminal action commit but before final snapshot/result commit.
    // This is completion repair, not reopening a finished game for further play.
    for (const withCheckpoint of [false, true]) {
      const terminal = createReplayFixture("classic", true);
      const id = randomUUID(); matchIds.push(id);
      await db.match.create({ data: { id, roomId: randomUUID(), status: "IN_PROGRESS",
        gameMode: "classic", seed: terminal.match.seed, startedAt: terminal.match.startedAt,
        initialConfig: terminal.match.initialConfig as Prisma.InputJsonObject,
        participants: { create: identities.slice(0, 2).map((p, i) => ({ userId: p.userId, seat: i ? "P2" : "P1", displayNameSnapshot: p.username })) } } });
      await db.matchAction.createMany({ data: terminal.actions.map(r => ({ matchId: id, revision: r.revision,
        actorSeat: r.actorSeat, actionType: r.actionType, actionPayload: r.actionPayload as Prisma.InputJsonObject, createdAt: r.createdAt })) });
      if (withCheckpoint) {
        const checkpoint = terminal.history.get(terminal.match.finalRevision!)!;
        await db.matchSnapshot.create({ data: { matchId: id, revision: checkpoint.revision, formatVersion: 1,
          state: checkpoint.state as Prisma.InputJsonObject, rngState: checkpoint.rngState as Prisma.InputJsonObject } });
      }
      const repaired = await freshServer();
      const stored = await db.match.findUniqueOrThrow({ where: { id } });
      assert.equal(stored.status, "FINISHED"); assert.equal(stored.finalRevision, terminal.match.finalRevision);
      assert.equal(stored.finishedAt?.getTime(), terminal.actions.at(-1)!.createdAt.getTime());
      assert.equal(getGameRoom(stored.roomId!), undefined);
      assert.equal(await db.matchAction.count({ where: { matchId: id } }), terminal.match.finalRevision);
      assert.equal(await db.matchSnapshot.count({ where: { matchId: id } }), 1);
      assert.equal((await replay.validateFinalDeterminism(id)).deterministic, true);
      await dropRuntime(repaired.server);
    }
    // Finished/unprocessed repair uses the existing mode-specific idempotent processor.
    const draftId = randomUUID(); matchIds.push(draftId);
    await db.match.create({ data: { id: draftId, status: "FINISHED", isRated: true, gameMode: "draft", seed: 1,
      startedAt: new Date(Date.now() - 1000), finishedAt: new Date(), winnerSeat: "P1", loserSeat: "P2",
      winnerUserId: userIds[0], loserUserId: userIds[1], finishReason: "allEnemyUnitsDefeated", finalRevision: 1,
      participants: { create: identities.slice(0, 2).map((p, i) => ({ userId: p.userId, seat: i ? "P2" : "P1", displayNameSnapshot: p.username, outcome: i ? "LOSS" : "WIN" })) } } });
    const before = await db.rating.findMany({ where: { gameMode: { in: ["classic", "standard"] } }, orderBy: { userId: "asc" } });
    const repair = await freshServer();
    assert.equal(await db.ratingHistory.count({ where: { matchId: draftId, gameMode: "draft" } }), 2);
    assert.deepEqual(await db.rating.findMany({ where: { gameMode: { in: ["classic", "standard"] } }, orderBy: { userId: "asc" } }), before);
    assert.equal((await repair.recovery.recover(repair.live, logger)).ratingsRepaired, 0);
    await dropRuntime(repair.server);
    console.log("PostgreSQL restart recovery + WebSocket continuation + finalization + rating repair passed");
  } finally {
    for (const socket of clients) socket.terminate();
    for (const server of servers) await server.close();
    for (const lifecycle of lifecycles) await lifecycle.close();
    storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
    // Only test-owned identifiers in a guarded loopback test database.
    await db.auditLog.deleteMany({ where: { matchId: { in: matchIds } } });
    await db.ratingHistory.deleteMany({ where: { userId: { in: userIds } } });
    await db.match.deleteMany({ where: { id: { in: matchIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
