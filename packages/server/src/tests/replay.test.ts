import assert from "node:assert/strict";
import type { MatchSnapshot, MatchAction } from "@prisma/client";
import { SeededRNG, type GameModeId } from "rules";
import { ReplayService } from "../services/replayService";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { normalizeSnapshotState, deserializeMatchSnapshot } from "../persistence/matchSnapshot";
import { createReplayFixture } from "./replayTestSupport";
import { createGameRoomWithId, getGameRoom, storeTestHooks } from "../store";
import { setRoomGameMode } from "../modes/roomModes";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MemoryMatchPersistence } from "./matchTestSupport";
import { ReplayError } from "../replay/replayError";

function readers(fixture: ReturnType<typeof createReplayFixture>) {
  let snapshots: MatchSnapshot[] = [20, 40, 60].map((r) => fixture.history.get(r)!);
  const queries: { base: number; target: number }[] = [];
  const snapshotService = new MatchSnapshotService(
    {
      create: async () => {
        throw new Error("Replay wrote a snapshot");
      },
      findByMatchAndRevision: async (_id, revision) =>
        snapshots.find((s) => s.revision === revision) ?? null,
      findLatestByMatchId: async () => snapshots.at(-1) ?? null,
      findLatestAtOrBeforeRevision: async (_id, revision) =>
        snapshots.filter((s) => s.revision <= revision).at(-1) ?? null,
    },
    { interval: 20 },
  );
  const service = new ReplayService(
    { findById: async () => fixture.match },
    {
      findInRevisionRange: async (_id, base, target) => {
        queries.push({ base, target });
        return fixture.actions.filter((a) => a.revision > base && a.revision <= target);
      },
    },
    snapshotService,
  );
  return {
    service,
    queries,
    snapshots: () => snapshots,
    setSnapshots: (rows: MatchSnapshot[]) => {
      snapshots = rows;
    },
  };
}

async function run() {
  // Exercise the live journal boundary: mode and readiness revisions are now durable.
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle({ info() {}, error() {} }, memory);
  const live = await lifecycle.createRoom({ seed: 83, hostSeat: "P2", hostConnId: "host" });
  setRoomGameMode(live, "classic");
  lifecycle.recordModeAction(live, "P2");
  await lifecycle.syncGameMode(live);
  live.state = { ...live.state, seats: { P1: true, P2: true } };
  assert(
    (await lifecycle.applyAction(live, { type: "setReady", player: "P1", ready: true }, "P1")).ok,
  );
  assert(
    (await lifecycle.applyAction(live, { type: "setReady", player: "P2", ready: true }, "P2")).ok,
  );
  assert(await lifecycle.drainActions());
  assert.deepEqual(
    [...memory.actions.values()].map((row) => [row.revision, row.actionType]),
    [
      [1, "setGameMode"],
      [2, "setReady"],
      [3, "setReady"],
    ],
  );
  const modeFixture = createReplayFixture();
  modeFixture.match.id = live.matchId!;
  modeFixture.match.seed = live.seed;
  modeFixture.match.gameMode = live.gameMode;
  modeFixture.match.initialConfig = memory.matches.get(live.matchId!)!.initialConfig!;
  modeFixture.actions.splice(
    0,
    modeFixture.actions.length,
    ...[...memory.actions.values()].map((row) => ({
      ...row,
      id: "fixture",
      actionPayload: row.actionPayload as MatchAction["actionPayload"],
      events: row.events as MatchAction["events"],
    })),
  );
  const modeReplay = readers(modeFixture);
  modeReplay.setSnapshots([]);
  assert.deepEqual(
    normalizeSnapshotState(
      (await modeReplay.service.reconstructAtRevision(live.matchId!, 3)).state,
    ),
    normalizeSnapshotState(live.state),
  );
  await lifecycle.close();
  const fixture = createReplayFixture();
  assert.equal(getGameRoom(fixture.room.id), undefined, "historical room never published");
  const inputBefore = structuredClone({
    match: fixture.match,
    actions: fixture.actions,
    history: fixture.history,
  });
  const r = readers(fixture);
  for (const [target, base] of [
    [0, 0],
    [10, 0],
    [20, 20],
    [40, 40],
    [55, 40],
    [73, 60],
    [80, 60],
  ]) {
    const result = await r.service.reconstructAtRevision(fixture.match.id, target);
    assert.equal(result.base.revision, base);
    assert.equal(result.actionsApplied, target - base);
    if (target === 0)
      assert.deepEqual(
        normalizeSnapshotState(result.state),
        normalizeSnapshotState(fixture.initialState),
      );
    if (target) {
      const expected = fixture.history.get(target)!;
      const loaded = deserializeMatchSnapshot(expected);
      assert.deepEqual(normalizeSnapshotState(result.state), normalizeSnapshotState(loaded.state));
      assert.deepEqual(result.rngState, expected.rngState);
    }
  }
  assert(
    r.queries.some((q) => q.base === 60 && q.target === 73),
    "bounded post-snapshot range",
  );
  assert(
    !r.queries.some((q) => q.base === 40 && q.target === 40),
    "exact checkpoint requires no action query",
  );
  const [a, b] = await Promise.all([
    r.service.reconstructAtRevision(fixture.match.id, 73),
    r.service.reconstructAtRevision(fixture.match.id, 73),
  ]);
  a.state.units[Object.keys(a.state.units)[0]].hp--;
  const c = await r.service.reconstructAtRevision(fixture.match.id, 73);
  assert.deepEqual(b, c, "concurrent state and RNG are independent");
  createGameRoomWithId(fixture.room.id, { seed: 999 });
  getGameRoom(fixture.room.id)!.state.turnNumber = 9999;
  assert.deepEqual(
    await r.service.reconstructAtRevision(fixture.match.id, 73),
    c,
    "live room ignored",
  );
  assert.deepEqual(
    { match: fixture.match, actions: fixture.actions, history: fixture.history },
    inputBefore,
    "no durable input mutation",
  );
  for (const invalid of [-1, 1.2, NaN, Infinity, 2147483648])
    await assert.rejects(
      r.service.reconstructAtRevision(fixture.match.id, invalid),
      /INVALID_TARGET_REVISION/,
    );
  r.setSnapshots([]);
  assert.equal((await r.service.reconstructAtRevision(fixture.match.id, 73)).actionsApplied, 73);
  const removed = fixture.actions.splice(40, 1)[0];
  await assert.rejects(r.service.reconstructAtRevision(fixture.match.id, 73), /REPLAY_ACTION_GAP/);
  fixture.actions.splice(40, 0, removed);
  fixture.actions.splice(40, 0, structuredClone(removed));
  await assert.rejects(
    r.service.reconstructAtRevision(fixture.match.id, 73),
    /REPLAY_DUPLICATE_REVISION/,
  );
  fixture.actions.splice(40, 1);
  const valid = fixture.actions[1];
  const payload = valid.actionPayload as Record<string, MatchAction["actionPayload"]>;
  fixture.actions[1] = { ...valid, actionPayload: { type: "setReady", player: "P9", ready: true } };
  await assert.rejects(r.service.reconstructAtRevision(fixture.match.id, 73), /INVALID_ACTION_LOG/);
  fixture.actions[1] = { ...valid, actorSeat: "P1" };
  await assert.rejects(r.service.reconstructAtRevision(fixture.match.id, 73), /INVALID_ACTION_LOG/);
  fixture.actions[1] = valid;
  fixture.actions[1] = {
    ...valid,
    actionPayload: {
      ...(valid.actionPayload as object),
      _replay: {
        ...(payload._replay as object),
        armies: { P1: { archer: "unknown-historical-hero" }, P2: {} },
      },
    },
  };
  await assert.rejects(r.service.reconstructAtRevision(fixture.match.id, 73), /INVALID_ACTION_LOG/);
  fixture.actions[1] = valid;
  fixture.actions[1] = {
    ...valid,
    actionPayload: { ...payload, _replay: { ...(payload._replay as object), formatVersion: 2 } },
  };
  await assert.rejects(
    r.service.reconstructAtRevision(fixture.match.id, 73),
    /UNSUPPORTED_ACTION_FORMAT/,
  );
  fixture.actions[1] = valid;
  r.setSnapshots([{ ...fixture.history.get(60)!, formatVersion: 99 }]);
  assert.equal((await r.service.reconstructAtRevision(fixture.match.id, 73)).base.type, "initial");
  r.setSnapshots([{ ...fixture.history.get(60)!, state: {} }]);
  assert.equal((await r.service.reconstructAtRevision(fixture.match.id, 73)).base.type, "initial");
  r.setSnapshots([]);
  const initialConfig = fixture.match.initialConfig;
  fixture.match.initialConfig = null;
  await assert.rejects(
    r.service.reconstructAtRevision(fixture.match.id, 73),
    /MATCH_NOT_REPLAYABLE/,
  );
  // Compatible legacy checkpoints can still replay independently of missing initial metadata.
  r.setSnapshots([fixture.history.get(60)!]);
  assert.equal((await r.service.reconstructAtRevision(fixture.match.id, 73)).base.revision, 60);
  fixture.match.initialConfig = initialConfig;
  const actionLog = fixture.actions.splice(0);
  r.setSnapshots([]);
  await assert.rejects(
    r.service.reconstructAtRevision(fixture.match.id, 73),
    /MATCH_NOT_REPLAYABLE/,
  );
  fixture.actions.push(...actionLog);

  for (const mode of ["standard", "draft"] as GameModeId[]) {
    const f = createReplayFixture(mode);
    const s = readers(f);
    s.setSnapshots([]);
    const initial = await s.service.reconstructAtRevision(f.match.id, 80);
    assert.deepEqual(normalizeSnapshotState(initial.state), normalizeSnapshotState(f.room.state));
    s.setSnapshots([f.history.get(20)!]);
    const accelerated = await s.service.reconstructAtRevision(f.match.id, 80);
    assert.deepEqual(
      normalizeSnapshotState(initial.state),
      normalizeSnapshotState(accelerated.state),
    );
    assert.deepEqual(initial.rngState, accelerated.rngState);
  }
  const finished = createReplayFixture("classic", true);
  const final = readers(finished);
  const target = finished.match.finalRevision!;
  // Continue from a checkpoint inside random movement/combat, including pending roll state.
  final.setSnapshots([finished.history.get(100)!]);
  const randomSegment = await final.service.reconstructAtRevision(finished.match.id, 160);
  assert.deepEqual(
    normalizeSnapshotState(randomSegment.state),
    normalizeSnapshotState(deserializeMatchSnapshot(finished.history.get(160)!).state),
  );
  assert.deepEqual(randomSegment.rngState, finished.history.get(160)!.rngState);
  final.setSnapshots([]);
  assert.equal(
    (await final.service.reconstructFinalState(finished.match.id)).verification,
    "no_final_checkpoint",
  );
  assert.equal(
    (await final.service.validateFinalDeterminism(finished.match.id)).deterministic,
    null,
  );
  final.setSnapshots([finished.history.get(60)!, finished.history.get(target)!]);
  assert.equal(
    (await final.service.reconstructFinalState(finished.match.id)).verification,
    "checkpoint_loaded",
  );
  assert.deepEqual(await final.service.validateFinalDeterminism(finished.match.id), {
    matchId: finished.match.id,
    finalRevision: target,
    baseRevision: 0,
    actionsApplied: target,
    deterministic: true,
    verification: "checkpoint_matched",
  });
  final.setSnapshots([finished.history.get(60)!]);
  const continuation = await final.service.reconstructFinalState(finished.match.id);
  assert.deepEqual(
    normalizeSnapshotState(continuation.state),
    normalizeSnapshotState(finished.room.state),
  );
  assert.deepEqual(continuation.rngState, finished.history.get(target)!.rngState);
  const oracle = finished.history.get(target)!;
  final.setSnapshots([{ ...oracle, state: { ...(oracle.state as object), turnNumber: 999 } }]);
  await assert.rejects(
    final.service.validateFinalDeterminism(finished.match.id),
    /REPLAY_FINAL_STATE_MISMATCH/,
  );
  final.setSnapshots([
    {
      ...oracle,
      rngState: new SeededRNG(999).exportState() as unknown as MatchSnapshot["rngState"],
    },
  ]);
  await assert.rejects(
    final.service.validateFinalDeterminism(finished.match.id),
    /REPLAY_RNG_MISMATCH/,
  );
  await assert.rejects(
    final.service.reconstructAtRevision(finished.match.id, target + 1),
    /INVALID_TARGET_REVISION/,
  );
  finished.match.finalRevision = null;
  await assert.rejects(
    final.service.reconstructFinalState(finished.match.id),
    /MATCH_NOT_REPLAYABLE/,
  );
  finished.match.status = "CANCELLED";
  await assert.rejects(
    final.service.reconstructAtRevision(finished.match.id, 0),
    /MATCH_NOT_REPLAYABLE/,
  );
  await assert.rejects(
    new ReplayService({ findById: async () => null }).reconstructFinalState("missing"),
    /MATCH_NOT_FOUND/,
  );
  await assert.rejects(
    new ReplayService({
      findById: async () => {
        throw new Error("raw Prisma details");
      },
    }).reconstructFinalState("missing"),
    (error: unknown) =>
      error instanceof ReplayError &&
      error.code === "REPLAY_STORAGE_UNAVAILABLE" &&
      !error.message.includes("Prisma"),
  );
  storeTestHooks.reset();
  console.log(
    `replay: initial/snapshot/mid/exact, all modes/draft, real finished match (${target} actions), RNG, gaps, corruption, concurrency, read-only and live-room isolation passed`,
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
