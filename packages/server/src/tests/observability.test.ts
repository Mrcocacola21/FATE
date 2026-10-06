import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { buildServer } from "../index";
import { createLogger } from "../observability/logger";
import { ApplicationMetrics, measureDatabase } from "../observability/metrics";
import { readObservabilityConfig } from "../config";
import { createDatabaseReadinessCheck } from "../db/readiness";
import { registerHealthRoutes } from "../routes/healthRoutes";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { logFate } from "../fateLogger";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { ReplayService } from "../services/replayService";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { MatchRecoveryService } from "../services/matchRecoveryService";
import { deserializeMatchSnapshot, normalizeSnapshotState } from "../persistence/matchSnapshot";
import { MemoryMatchPersistence, testTokens } from "./matchTestSupport";
import { createReplayFixture } from "./replayTestSupport";
import { getGameRoom, getGameRoomCount, storeTestHooks, deleteGameRoom } from "../store";
import { connectWs } from "./helpers/wsClient";
import { eventually } from "./helpers/eventually";

const quiet = { info() {}, error() {} };
function capture() {
  const lines: string[] = [];
  return { lines, stream: { write(line: string) { lines.push(line); } } };
}

test("configuration rejects invalid values without echoing them", () => {
  assert.deepEqual(readObservabilityConfig({}), { logLevel: "info", metricsEnabled: true });
  assert.equal(readObservabilityConfig({ METRICS_ENABLED: "false" }).metricsEnabled, false);
  for (const env of [{ LOG_LEVEL: "SECRET" }, { METRICS_ENABLED: "SECRET" }])
    assert.throws(() => readObservabilityConfig(env), error => error instanceof Error && !error.message.includes("SECRET"));
});

test("JSON logger redacts nested secrets, child bindings and private state; errors keep safe frames", () => {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "debug";
  try {
    const captured = capture();
    const logger = createLogger(captured.stream);
    const secrets = ["SUPER_SECRET_PASSWORD_123", "SUPER_SECRET_TOKEN_456", "SUPER_SECRET_COOKIE_789", "HIDDEN_STATE_987"];
    logger.child({ password: secrets[0], context: { resumeToken: secrets[1] } }).info({
      nested: { Password: secrets[0], accessToken: secrets[1], deeper: [{ Cookie: secrets[2] }] },
      req: { method: "POST", url: `/?token=${secrets[1]}`, headers: { Authorization: secrets[1], Cookie: secrets[2] }, body: secrets[0] },
      res: { statusCode: 200, headers: { "Set-Cookie": secrets[2] } },
      DATABASE_URL: secrets[1], DIRECT_URL: secrets[1], state: { hidden: secrets[3] },
      snapshot: secrets[3], payload: secrets[3], err: new Error(secrets.join(" ")),
    }, "safe event");
    logFate(logger, { tag: "fate:event", roomId: "room-fixture", eventType: "unitMoved",
      state: secrets[3], events: [secrets[3]], payload: secrets[3], socketId: "connection-fixture", name: secrets[0] });
    const output = captured.lines.join("");
    for (const secret of secrets) assert(!output.includes(secret), secret);
    const records = captured.lines.map(line => JSON.parse(line));
    assert.equal(records[0].level, 30);
    assert(records[0].err.stack.includes("observability.test.ts"));
    assert.equal(records[1].connectionId, "connection-fixture");
    assert(!("socketId" in records[1]));
  } finally { if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous; }
});

test("health ignores DB; readiness gates recovery, outage, timeout, restoration and shutdown", async () => {
  const server = Fastify();
  const metrics = new ApplicationMetrics();
  let ready = false, up = true, probes = 0;
  const check = createDatabaseReadinessCheck(async () => { probes++; if (!up) throw new Error("PRIVATE DB URL"); }, 30, metrics);
  registerHealthRoutes(server, check, () => ready);
  try {
    assert.equal((await server.inject("/health")).statusCode, 200);
    assert.equal((await server.inject("/ready")).statusCode, 503);
    assert.equal(probes, 0);
    ready = true;
    assert.equal((await server.inject("/ready")).statusCode, 200);
    up = false;
    assert.equal((await server.inject("/health")).statusCode, 200);
    const failed = await server.inject("/ready");
    assert.equal(failed.statusCode, 503);
    assert.deepEqual(failed.json(), { ok: false });
    up = true;
    assert.equal((await server.inject("/ready")).statusCode, 200);
    ready = false;
    assert.equal((await server.inject("/ready")).statusCode, 503);
    let queries = 0;
    const hanging = createDatabaseReadinessCheck(() => { queries++; return new Promise(() => {}); }, 20, metrics);
    assert.deepEqual(await Promise.all([hanging(), hanging(), hanging()]), [false, false, false]);
    assert.equal(queries, 1);
    assert.equal(await hanging(), false);
    assert.equal(queries, 1);
    assert((await metrics.registry.metrics()).includes('category="timeout"'));
  } finally { await server.close(); }
});

test("HTTP request IDs are normalized, user/match context is preserved, metrics are read-only, shutdown is immediate", async () => {
  const metrics = new ApplicationMetrics(), captured = capture();
  const previous = process.env.LOG_LEVEL; process.env.LOG_LEVEL = "info";
  let probes = 0;
  const server = await buildServer({ metrics, logStream: captured.stream, matchRecovery: false,
    matchPersistence: new MemoryMatchPersistence(), databaseReadiness: async () => { probes++; return true; } });
  const userId = randomUUID();
  server.get("/context/matches/:id", { preHandler: accessTokenPreHandler(() => testTokens,
    async () => ({ id: userId, role: "USER", blockedAt: null })) }, async request => {
    request.log.info({ event: "authenticated_fixture" }, "Authenticated fixture"); return { ok: true };
  });
  server.get("/failure", async () => { throw new Error("SUPER_SECRET_INTERNAL"); });
  try {
    const matchId = randomUUID();
    const response = await server.inject({ url: `/context/matches/${matchId}`, headers: {
      authorization: `Bearer ${testTokens.signAccessToken(userId)}`, cookie: "SUPER_SECRET_COOKIE_789", "x-request-id": "support-42" } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-request-id"], "support-42");
    for (const id of ["bad value", "x".repeat(65), "", "bad\tvalue"])
      assert.notEqual((await server.inject({ url: "/health", headers: { "x-request-id": id } })).headers["x-request-id"], id);
    const failure = await server.inject("/failure");
    assert.equal(failure.statusCode, 500);
    assert(!failure.body.includes("SUPER_SECRET"));
    assert.equal((await server.inject("/ready")).statusCode, 200);
    const before = probes;
    const scraped = await server.inject("/metrics");
    assert.equal(scraped.statusCode, 200);
    assert.match(String(scraped.headers["content-type"]), /text\/plain; version=0.0.4/);
    assert.equal(probes, before);
    for (const name of ["fate_active_rooms", "fate_active_websocket_connections", "fate_matches_finished_total", "fate_game_command_duration_seconds", "fate_replay_reconstruction_duration_seconds", "fate_db_operation_duration_seconds", "fate_db_errors_total", "fate_match_recovery_total"])
      assert(scraped.body.includes(name));
    server.beginShutdown();
    assert.equal((await server.inject("/ready")).statusCode, 503);
    assert.equal((await server.inject("/health")).statusCode, 200);
    assert.equal(probes, before);
    const records = captured.lines.map(line => JSON.parse(line));
    const context = records.find(record => record.event === "authenticated_fixture");
    assert.equal(context.userId, userId); assert.equal(context.requestId, "support-42");
    assert.equal(context.matchId, matchId);
    assert(!captured.lines.join("").includes("SUPER_SECRET"));
    assert(!captured.lines.join("").includes("reqId"));
  } finally { await server.close(); if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous; }
});

test("METRICS_ENABLED=false intentionally omits the endpoint", async () => {
  const previous = process.env.METRICS_ENABLED; process.env.METRICS_ENABLED = "false";
  const server = await buildServer({ documentationOnly: true });
  try { assert.equal((await server.inject("/metrics")).statusCode, 404); }
  finally { await server.close(); if (previous === undefined) delete process.env.METRICS_ENABLED; else process.env.METRICS_ENABLED = previous; }
});

test("HTTP remains live during recovery while normal traffic and readiness are gated", async () => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const server = await buildServer({ serveDuringRecovery: true,
    matchPersistence: new MemoryMatchPersistence(), databaseReadiness: async () => true,
    matchRecovery: { recover: async () => {
      await barrier;
      return { scanned: 0, recovered: 0, skipped: 0, interrupted: 0, finalized: 0,
        ratingsRepaired: 0, ratingFailures: 0, durationMs: 1 };
    } },
  });
  try {
    assert.equal((await server.inject("/health")).statusCode, 200);
    assert.equal((await server.inject("/ready")).statusCode, 503);
    assert.equal((await server.inject("/api/games")).statusCode, 503);
    release(); await server.waitForStartup();
    assert.equal((await server.inject("/ready")).statusCode, 200);
  } finally { release(); await server.close(); }
});

test("DB observations preserve results/errors, normalize categories and exclude expected unique conflicts", async () => {
  const metrics = new ApplicationMetrics();
  assert.equal(await measureDatabase(async () => 42, metrics), 42);
  for (const code of ["P1001", "P2024", "P2003", "P2034", "UNKNOWN", "P2002"]) {
    const error = Object.assign(new Error("PRIVATE SQL"), { code });
    await assert.rejects(measureDatabase(async () => { throw error; }, metrics), value => value === error);
  }
  const text = await metrics.registry.metrics();
  assert.match(text, /fate_db_operation_duration_seconds_count\{operation="query",result="success"\} 1/);
  assert.match(text, /fate_db_operation_duration_seconds_count\{operation="query",result="error"\} 6/);
  for (const category of ["connection", "timeout", "constraint", "transaction", "unknown"])
    assert(text.includes(`category="${category}"} 1`));
  assert(!text.includes("PRIVATE SQL"));
});

test("room collector follows registry ownership and lifecycle retries count once", async () => {
  storeTestHooks.reset();
  const metrics = new ApplicationMetrics(); metrics.setRoomCollector(getGameRoomCount);
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(quiet, memory, undefined, undefined, metrics);
  try {
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const room = await lifecycle.createRoom({ gameMode: "classic" });
      ids.push(room.id, room.matchId!);
    }
    const text = await metrics.registry.metrics();
    assert.match(text, /fate_active_rooms 12/); assert.match(text, /fate_matches_created_total 12/);
    for (const id of ids) assert(!text.includes(id));
    assert(!/(userId|matchId|roomId|connectionId|requestId|url|message)=/.test(text));
    const startedRoom = getGameRoom(ids[0])!;
    startedRoom.seats = { P1: "fixture-P1", P2: "fixture-P2" };
    startedRoom.seatIdentities = { P1: { userId: randomUUID(), username: "P1", displayName: "P1" },
      P2: { userId: randomUUID(), username: "P2", displayName: "P2" } };
    startedRoom.state = { ...startedRoom.state, seats: { P1: true, P2: true } };
    await lifecycle.applyAction(startedRoom, { type: "setReady", player: "P1", ready: true }, "P1");
    await lifecycle.applyAction(startedRoom, { type: "setReady", player: "P2", ready: true }, "P2");
    assert((await lifecycle.applyAction(startedRoom, { type: "startGame" }, "P1")).ok);
    await lifecycle.applyAction(startedRoom, { type: "startGame" }, "P1");
    await lifecycle.drainActions();
    assert.match(await metrics.registry.metrics(), /fate_matches_started_total 1/);
    await lifecycle.removeRoom(startedRoom);
    await lifecycle.removeRoom(getGameRoom(ids[2])!);
    const removed = await metrics.registry.metrics();
    assert.match(removed, /fate_active_rooms 10/);
    assert.match(removed, /fate_matches_cancelled_total 1/);
    assert.match(removed, /fate_matches_interrupted_total 1/);
    for (const id of ids) metrics.observeCommand(id, new Set(["move"]), "rejected", 0);
    assert.match(await metrics.registry.metrics(), /command="UNKNOWN",result="rejected"\} 24/);
    const finished = createReplayFixture("classic", true);
    finished.room.seatIdentities = { P1: { userId: randomUUID(), username: "P1", displayName: "P1" },
      P2: { userId: randomUUID(), username: "P2", displayName: "P2" } };
    lifecycle.attachRestoredRoom(finished.room);
    // Persistence fake counts invocations, allowing the durable terminal retry boundary to be tested.
    const terminal = new MatchLifecycle(quiet, { ...memory,
      createWaitingMatch: memory.createWaitingMatch.bind(memory), findMatchByRoomId: memory.findMatchByRoomId.bind(memory),
      syncParticipant: memory.syncParticipant.bind(memory), removeWaitingParticipant: memory.removeWaitingParticipant.bind(memory),
      updateWaitingGameMode: memory.updateWaitingGameMode.bind(memory), markStarted: memory.markStarted.bind(memory),
      markCancelled: memory.markCancelled.bind(memory), appendAcceptedAction: memory.appendAcceptedAction.bind(memory),
      appendMatchSnapshot: memory.appendMatchSnapshot.bind(memory), finalizeMatch: async () => {} }, undefined, undefined, metrics);
    terminal.attachRestoredRoom(finished.room);
    await terminal.finalizeRestoredRoom(finished.room, false, new Date());
    await terminal.finalizeRestoredRoom(finished.room, false, new Date());
    assert.match(await metrics.registry.metrics(), /fate_matches_finished_total 1/);
    await terminal.close();
  } finally { await lifecycle.close(); storeTestHooks.reset(); }
});

test("replay success/error measurements and recovery metrics wrap deterministic reconstruction without state logs", async () => {
  storeTestHooks.reset();
  const metrics = new ApplicationMetrics(), captured = capture();
  const previous = process.env.LOG_LEVEL; process.env.LOG_LEVEL = "debug";
  const logger = createLogger(captured.stream);
  const source = createReplayFixture();
  const snapshot = source.history.get(20)!;
  const snapshots = new MatchSnapshotService({ create: async () => { throw new Error("Read-only"); },
    findByMatchAndRevision: async () => null, findLatestByMatchId: async () => snapshot,
    findLatestAtOrBeforeRevision: async (_id, revision) => revision >= 20 ? snapshot : null });
  const replay = new ReplayService({ findById: async () => source.match }, { findInRevisionRange: async (_id, base, target) => source.actions.filter(a => a.revision > base && a.revision <= target) }, snapshots, metrics, logger);
  const lifecycle = new MatchLifecycle(logger, new MemoryMatchPersistence(), undefined, undefined, metrics);
  try {
    await replay.reconstructAtRevision(source.match.id, 10);
    await replay.reconstructAtRevision(source.match.id, 37);
    await assert.rejects(replay.reconstructAtRevision(source.match.id, -1));
    const candidate = { ...source.match, participants: (["P1", "P2"] as const).map(seat => ({ id: randomUUID(), matchId: source.match.id, seat, userId: randomUUID(), displayNameSnapshot: seat,
      createdAt: new Date(), outcome: null, resultData: null })) };
    const recovery = new MatchRecoveryService({ findCandidates: async after => after ? [] : [candidate],
      loadDurableHistory: async () => source.actions.filter(a => a.revision <= 37), latestSnapshotRevision: async () => 20,
      interrupt: async () => { throw new Error("Should recover"); }, findUnprocessedRatings: async () => [] }, replay, { processRatedMatch: async () => { throw new Error("No ratings"); } }, metrics, logger);
    metrics.setRoomCollector(getGameRoomCount);
    assert.equal((await recovery.recover(lifecycle, logger)).recovered, 1);
    assert.equal((await recovery.recover(lifecycle, logger)).skipped, 1);
    const text = await metrics.registry.metrics();
    assert.match(text, /source="initial_state",result="success"\} 1/);
    assert.match(text, /source="snapshot_tail",result="success"\} 2/);
    assert.match(text, /source="unknown",result="error"\} 1/);
    assert.match(text, /fate_match_recovery_total\{result="recovered"\} 1/);
    assert.match(text, /fate_match_recovery_total\{result="skipped"\} 1/);
    assert.match(text, /fate_active_rooms 1/);
    assert(!text.includes(source.match.id));
    assert(!captured.lines.join("").includes('"units"'));
    assert.deepEqual(normalizeSnapshotState(deserializeMatchSnapshot(snapshot).state), snapshot.state);
  } finally { await lifecycle.close(); storeTestHooks.reset(); if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous; }
});

test("actual WS connections, accepted/rejected command timing, hidden state and ID cardinality", async () => {
  storeTestHooks.reset();
  const metrics = new ApplicationMetrics(), captured = capture();
  const previous = process.env.LOG_LEVEL; process.env.LOG_LEVEL = "debug";
  const server = await buildServer({ metrics, logStream: captured.stream, matchRecovery: false,
    matchPersistence: new MemoryMatchPersistence(), connectionIdentity: { verify: async token => token ? { userId: token, username: "fixture", displayName: "fixture" } : null } });
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address(); assert(address && typeof address !== "string");
  const first = await connectWs(`ws://127.0.0.1:${address.port}/ws`);
  const second = await connectWs(`ws://127.0.0.1:${address.port}/ws`);
  try {
    assert.match(await metrics.registry.metrics(), /fate_active_websocket_connections 2/);
    const userId = randomUUID();
    first.send({ type: "joinRoom", mode: "create", role: "P1", gameMode: "classic", accessToken: userId });
    const ack = await first.wait("joinAck");
    const roomId = ack.roomId;
    second.send({ type: "joinRoom", mode: "join", roomId, role: "spectator" }); await second.wait("joinAck");
    second.send({ type: "action", action: { type: "endTurn" } });
    assert.equal((await second.wait("actionResult")).ok, false);
    await eventually(async () => {
      return (await metrics.registry.metrics()).includes('command="endTurn",result="rejected"} 1') ? true : false;
    }, "rejected command observation");
    const text = await metrics.registry.metrics();
    assert.match(text, /fate_game_command_duration_seconds_count\{command="joinRoom",result="success"\} 2/);
    for (const id of [userId, roomId, ack.resumeToken!]) assert(!text.includes(id));
    const hidden = "HIDDEN_AUTHORITATIVE_STATE_SENTINEL";
    const room = (await import("../store")).getGameRoom(roomId)!;
    room.state.arenaId = hidden;
    first.send({ type: "setReady", ready: true }); await first.wait("roomState");
    await first.close();
    await eventually(async () => (await metrics.registry.metrics()).includes("fate_active_websocket_connections 1\n"), "one socket");
    await second.close();
    await eventually(async () => (await metrics.registry.metrics()).includes("fate_active_websocket_connections 0\n"), "zero sockets");
    assert(!captured.lines.join("").includes(hidden));
    assert(!captured.lines.join("").includes(ack.resumeToken!));
    const events = captured.lines.map(line => JSON.parse(line));
    const command = events.find(event => event.event === "game_command_complete" && event.command === "endTurn");
    assert(command.connectionId); assert(command.commandCorrelationId); assert.equal(command.roomId, roomId);
    deleteGameRoom(roomId);
    assert.match(await metrics.registry.metrics(), /fate_active_rooms 0/);
  } finally { await first.close(); await second.close(); await server.close(); storeTestHooks.reset(); if (previous === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = previous; }
});
