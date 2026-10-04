import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { SeededRNG, type GameModeId } from "rules";
import { createReplayFixture } from "./replayTestSupport";
import { MemoryMatchPersistence } from "./matchTestSupport";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { ReplayService } from "../services/replayService";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { MatchRecoveryService } from "../services/matchRecoveryService";
import type { RecoveryMatch } from "../repositories/matchRecoveryRepository";
import { deserializeMatchSnapshot, normalizeSnapshotState } from "../persistence/matchSnapshot";
import { getGameRoom, listGameRooms, storeTestHooks } from "../store";
import { assertSeatIdentity } from "../auth/connectionIdentity";
import { registerHealthRoutes } from "../routes/healthRoutes";

const logs: object[] = [];
const logger = { info: (data: object) => logs.push(data), error: (data: object) => logs.push(data) };
function fixture(mode: GameModeId = "classic", target = 37) {
  const source = createReplayFixture(mode);
  const match: RecoveryMatch = { ...source.match, participants: (["P1", "P2"] as const).map(seat => ({
    id: randomUUID(), matchId: source.match.id, seat, userId: randomUUID(),
    displayNameSnapshot: seat, createdAt: new Date(), outcome: null, resultData: null,
  })) };
  return { source, match, rows: source.actions.filter(r => r.revision <= target),
    snapshots: [20].filter(r => r <= target).map(r => source.history.get(r)!), target };
}
type Fixture = ReturnType<typeof fixture>;
function runtime(fixtures: Fixture[]) {
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, memory, new MatchSnapshotService(undefined, { interval: 20 }));
  const snapshots = new MatchSnapshotService({
    create: async () => { throw new Error("Historical reconstruction wrote a snapshot"); },
    findByMatchAndRevision: async (id, revision) => fixtures.find(f => f.match.id === id)?.snapshots.find(s => s.revision === revision) ?? null,
    findLatestByMatchId: async id => fixtures.find(f => f.match.id === id)?.snapshots.at(-1) ?? null,
    findLatestAtOrBeforeRevision: async (id, revision) => fixtures.find(f => f.match.id === id)?.snapshots.filter(s => s.revision <= revision).at(-1) ?? null,
  }, { interval: 20 });
  const queries: { base: number; target: number }[] = [];
  const replay = new ReplayService({ findById: async id => fixtures.find(f => f.match.id === id)?.match ?? null }, {
    findInRevisionRange: async (id, base, target) => {
      queries.push({ base, target });
      return fixtures.find(f => f.match.id === id)!.rows.filter(r => r.revision > base && r.revision <= target);
    },
  }, snapshots);
  const recovery = new MatchRecoveryService({
    findCandidates: async after => after ? [] : fixtures.filter(f => ["IN_PROGRESS", "WAITING"].includes(f.match.status)).map(f => f.match),
    loadDurableHistory: async id => fixtures.find(f => f.match.id === id)!.rows,
    latestSnapshotRevision: async id => fixtures.find(f => f.match.id === id)!.snapshots.at(-1)?.revision ?? 0,
    interrupt: async (id, reason) => { const f = fixtures.find(f => f.match.id === id)!; f.match.status = "CANCELLED"; f.match.finishReason = reason; },
    findUnprocessedRatings: async () => [],
  }, replay, { processRatedMatch: async () => { throw new Error("Recovery rated an active match"); } });
  return { recovery, replay, lifecycle, memory, queries };
}

async function run() {
  storeTestHooks.reset();
  for (const mode of ["classic", "standard", "draft"] as const) {
    const f = fixture(mode), r = runtime([f]);
    const before = structuredClone({ match: f.match, rows: f.rows, snapshots: f.snapshots });
    const summary = await r.recovery.recover(r.lifecycle, logger);
    assert.equal(summary.recovered, 1);
    const room = getGameRoom(f.match.roomId!)!;
    const expected = deserializeMatchSnapshot(f.source.history.get(37)!);
    assert.equal(room.revision, 37);
    assert.equal(room.matchId, f.match.id);
    assert.deepEqual(normalizeSnapshotState(room.state), normalizeSnapshotState(expected.state));
    assert.deepEqual((room.rng as SeededRNG).exportState(), expected.rngState);
    const future = SeededRNG.fromState(expected.rngState);
    assert.deepEqual(Array.from({ length: 20 }, () => room.rng.next()), Array.from({ length: 20 }, () => future.next()));
    assert(r.queries.some(q => q.base === 20 && q.target === 37));
    assert.deepEqual(room.seats, { P1: null, P2: null });
    assert.deepEqual(room.seatTokens, { P1: null, P2: null });
    assert.equal(room.spectators.size, 0);
    assert.equal(room.hostConnId, null);
    assert.equal(room.participantsLocked, true);
    if (mode === "draft") assert.equal(room.draftState?.phase, "complete");
    assertSeatIdentity(room, "P1", room.seatIdentities.P1, "old-process-token");
    assert.throws(() => assertSeatIdentity(room, "P1", { userId: randomUUID(), username: "P1", displayName: "P1" }, ""), /reserved/);
    assert.throws(() => assertSeatIdentity(room, "P1", null, ""), /Sign in/);
    const repeat = await Promise.all([r.recovery.recover(r.lifecycle, logger), r.recovery.recover(r.lifecycle, logger)]);
    assert(repeat.every(s => s.skipped === 1));
    assert.equal(listGameRooms().length, 1);
    assert.equal(r.memory.actions.size, 0);
    assert.equal(r.memory.snapshots.size, 0);
    assert.deepEqual({ match: f.match, rows: f.rows, snapshots: f.snapshots }, before);
    room.state.turnNumber = 999;
    assert.notEqual(expected.state.turnNumber, 999);
    await r.lifecycle.close();
    storeTestHooks.reset();
  }
  // Initial replay and exact checkpoints; pending initiative must not reroll.
  for (const target of [3, 20, 37]) {
    const f = fixture("classic", target);
    if (target === 20) f.match.initialConfig = null;
    if (target === 37) f.snapshots = [];
    const r = runtime([f]);
    assert.equal((await r.recovery.recover(r.lifecycle, logger)).recovered, 1);
    const room = getGameRoom(f.match.roomId!)!;
    assert.deepEqual(normalizeSnapshotState(room.state), f.source.history.get(target)!.state);
    if (target === 3) assert(room.state.pendingRoll);
    if (target === 20) assert.equal(r.queries.filter(q => q.base === 20 && q.target === 20).length, 0);
    await r.lifecycle.close(); storeTestHooks.reset();
  }
  for (const damage of ["version", "json", "rng"] as const) {
    const f = fixture("classic", 54);
    const bad = structuredClone(f.source.history.get(40)!);
    if (damage === "version") bad.formatVersion = 999;
    if (damage === "json") bad.state = { broken: true };
    if (damage === "rng") bad.rngState = null;
    f.snapshots.push(bad);
    const r = runtime([f]);
    assert.equal((await r.recovery.recover(r.lifecycle, logger)).recovered, 1);
    assert.deepEqual(normalizeSnapshotState(getGameRoom(f.match.roomId!)!.state), f.source.history.get(54)!.state);
    assert(r.queries.some(q => q.base === 20 && q.target === 54));
    await r.lifecycle.close(); storeTestHooks.reset();
  }
  const good = fixture(), noInitial = fixture(), gap = fixture(), oldGap = fixture(), malformed = fixture(), guest = fixture(), futureSnapshot = fixture(), waiting = fixture(), terminal = fixture();
  const goodLast = fixture();
  noInitial.snapshots = []; noInitial.match.initialConfig = null;
  gap.rows = gap.rows.filter(r => r.revision !== 23);
  oldGap.rows = oldGap.rows.filter(r => r.revision !== 7);
  malformed.rows[25].actionPayload = { type: "endTurn", _replay: { formatVersion: 99 } };
  guest.match.participants[0].userId = null;
  futureSnapshot.snapshots.push(futureSnapshot.source.history.get(40)!);
  waiting.match.status = "WAITING";
  terminal.match.status = "FINISHED";
  const r = runtime([good, noInitial, gap, oldGap, malformed, guest, futureSnapshot, waiting, terminal, goodLast]);
  const summary = await r.recovery.recover(r.lifecycle, logger);
  assert.equal(summary.recovered, 2); assert.equal(summary.interrupted, 7);
  assert.equal(terminal.match.status, "FINISHED");
  for (const f of [noInitial, gap, oldGap, malformed, guest, futureSnapshot, waiting]) {
    assert.equal(f.match.status, "CANCELLED");
    assert(f.match.finishReason?.startsWith("SERVER_RESTART_UNRECOVERABLE:"));
    assert.equal(getGameRoom(f.match.roomId!), undefined);
    assert(f.match.participants.every(p => p.outcome === null));
  }
  // A storage outage must never turn a healthy match into an interruption.
  const outage = fixture();
  const broken = new MatchRecoveryService({
    findCandidates: async () => [outage.match], loadDurableHistory: async () => { throw new Error("storage offline"); },
    latestSnapshotRevision: async () => 0, interrupt: async () => { throw new Error("Must not interrupt"); },
    findUnprocessedRatings: async () => [],
  }, r.replay, { processRatedMatch: async () => { throw new Error("Must not rate"); } });
  await assert.rejects(broken.recover(r.lifecycle, logger), /storage offline/);
  assert.equal(outage.match.status, "IN_PROGRESS");
  await r.lifecycle.close(); storeTestHooks.reset();
  const health = Fastify(); let ready = false;
  registerHealthRoutes(health, async () => true, () => ready);
  assert.equal((await health.inject({ url: "/health" })).statusCode, 200);
  assert.equal((await health.inject({ url: "/ready" })).statusCode, 503);
  ready = true;
  assert.equal((await health.inject({ url: "/ready" })).statusCode, 200);
  await health.close();
  assert(logs.some(log => JSON.stringify(log).includes("match:recovery_summary")));
  assert(!logs.some(log => JSON.stringify(log).includes("old-process-token")));
  console.log("Match restart recovery tests passed");
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
