import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type MatchSnapshot, type PrismaClient } from "@prisma/client";
import { SeededRNG, DefaultRNG, type GameState } from "rules";
import { createGameRoom, storeTestHooks, type GameRoom } from "../store";
import { readMatchSnapshotConfig } from "../config";
import {
  serializeMatchSnapshot,
  deserializeMatchSnapshot,
  MATCH_SNAPSHOT_FORMAT_VERSION,
  MatchSnapshotError,
  type SerializedMatchSnapshot,
} from "../persistence/matchSnapshot";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { MatchActionQueue } from "../persistence/matchActionQueue";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MemoryMatchPersistence } from "./matchTestSupport";

const logs: object[] = [];
const logger = { info() {}, error: (data: object) => logs.push(data) };
const snapshots = (interval: number) => new MatchSnapshotService(undefined, { interval });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function row(snapshot: SerializedMatchSnapshot): MatchSnapshot {
  return {
    ...snapshot,
    state: snapshot.state as Prisma.JsonObject,
    rngState: snapshot.rngState as Prisma.JsonObject,
    id: randomUUID(),
    createdAt: new Date(),
  };
}
function dbError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("controlled failure", {
    code,
    clientVersion: "6.19.0",
  });
}
function normalizedState(state: GameState): GameState {
  return JSON.parse(JSON.stringify({ ...state, events: [] })) as GameState;
}
function makeRoom(): GameRoom {
  const room = createGameRoom({ seed: 37 });
  room.matchId = randomUUID();
  room.revision = 20;
  return room;
}
function serializationTests() {
  const room = makeRoom();
  const id = Object.keys(room.state.units)[0];
  room.state = {
    ...room.state,
    phase: "battle",
    activeUnitId: id,
    turnNumber: 9,
    roundNumber: 3,
    pendingMove: { unitId: id, legalTo: [{ row: 1, col: 2 }], expiresTurnNumber: 9, mode: "rider" },
    pendingRoll: {
      id: "roll-8",
      player: "P1",
      kind: "attack_attackerRoll",
      context: { attackerId: id, nested: { damage: 3 } },
    },
    pendingCombatQueue: [{ kind: "aoe", attackerId: id, defenderId: "target", damageBonus: 2 }],
    pendingAoE: {
      casterId: id,
      abilityId: "aoe",
      center: { row: 2, col: 2 },
      radius: 1,
      affectedUnitIds: [id],
      revealedUnitIds: [],
      damagedUnitIds: [id],
      damageByUnitId: { [id]: 2 },
    },
    stakeMarkers: [
      { id: "stake", owner: "P1", position: { row: 3, col: 4 }, createdAt: 5, isRevealed: false },
    ],
    forestMarkers: [{ owner: "P2", position: { row: 3, col: 1 } }],
    jackTraps: [
      {
        id: "trap",
        owner: "P1",
        sourceUnitId: id,
        position: { row: 4, col: 4 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
    knowledge: { P1: { [id]: true }, P2: { [id]: false } },
    lastKnownPositions: { P1: { [id]: { row: 1, col: 1 } }, P2: {} },
    events: [{ type: "turnStarted", player: "P1", turnNumber: 9 }],
  };
  room.state.units[id] = {
    ...room.state.units[id],
    position: { row: 1, col: 1 },
    isStealthed: true,
    stealthDuration: { kind: "normal", ownTurnStartsWhileHidden: 1, maxOwnTurnStartsHidden: 3 },
    courtStasis: { expiresAtRoundEnd: 3, returnPosition: { row: 4, col: 4 } },
    charges: { ability: 2 },
    sansUnbelieverUnlocked: true,
    jackKnownHpByTarget: { target: 4 },
  };
  room.rng.next();
  room.rng.next();
  for (const ruleData of [
    {
      court: {
        attackerPlayer: "P1",
        defenderPlayer: "P2",
        pendingEffects: [{ side: "attacker", player: "P1", roll: 4, effectId: "detention" }],
      },
    },
    { chessParty: { kings: { P1: id, P2: null } } },
    {
      moonGame: {
        crater: { center: { row: 1, col: 1 }, radius: 2, expiresAtRoundStart: 4 },
        cheeseHoles: { choices: { P1: id } },
      },
    },
    {
      advantageGame: { threshold: 5 },
      pendingRoundAdvance: {
        nextRoundNumber: 4,
        nextTurnNumber: 10,
        nextIndex: 0,
        nextUnitId: id,
        nextPlayer: "P1",
      },
    },
  ] satisfies GameState["ruleDeclaration"]["ruleData"][]) {
    room.state.ruleDeclaration.ruleData = ruleData;
    const saved = serializeMatchSnapshot(room);
    assert.equal(saved.formatVersion, MATCH_SNAPSHOT_FORMAT_VERSION);
    assert.deepEqual(deserializeMatchSnapshot(row(saved)).state, normalizedState(room.state));
    assert(!("actionLog" in saved.state));
    assert.deepEqual(saved.state.events, []);
    assert(Object.isFrozen(saved.state.units));
    const rng = SeededRNG.fromState(deserializeMatchSnapshot(row(saved)).rngState);
    const original = SeededRNG.fromState((room.rng as SeededRNG).exportState());
    for (let n = 0; n < 100; n++) assert.equal(rng.next(), original.next());
  }
  const captured = serializeMatchSnapshot(room);
  const expected = structuredClone(captured);
  room.state.units[id].hp--;
  room.state.pendingMove!.legalTo[0].row++;
  room.state.pendingRoll!.context.nested = { damage: 99 };
  room.revision++;
  room.rng.next();
  assert.deepEqual(captured, expected, "nested state and RNG captured before later mutations");
  assert.equal(Reflect.set((captured.state.units as object[])[0], "hp", 999), false);

  const valid = row(captured);
  const units = (valid.state as Prisma.JsonObject).units as Prisma.JsonArray;
  assert.throws(
    () =>
      deserializeMatchSnapshot({
        ...valid,
        state: { ...(valid.state as Prisma.JsonObject), units: [units[0], units[0]] },
      }),
    /MATCH_SNAPSHOT_INVALID/,
  );
  assert.throws(
    () => deserializeMatchSnapshot({ ...valid, formatVersion: 999 }),
    /UNSUPPORTED_SNAPSHOT_VERSION/,
  );
  for (const invalid of [
    { revision: -1 },
    { revision: 1.5 },
    { revision: 2147483648 },
    { state: {} },
    { rngState: null },
    { rngState: { algorithm: "unknown", state: 1 } },
    { rngState: { algorithm: "lcg32-numerical-recipes-v1", state: -1 } },
    { state: { ...(valid.state as Prisma.JsonObject), units: { bad: { hp: "bad" } } } },
    {
      state: {
        ...(valid.state as Prisma.JsonObject),
        pendingRoll: { id: "x", player: "P9", kind: "wrong", context: [] },
      },
    },
    {
      state: {
        ...(valid.state as Prisma.JsonObject),
        ruleDeclaration: {
          selectedRuleId: "court",
          chooserPlayer: "P1",
          setupComplete: true,
          ruleData: { court: {} },
        },
      },
    },
    { state: { ...(valid.state as Prisma.JsonObject), events: [{ type: "turnStarted" }] } },
  ])
    assert.throws(
      () => deserializeMatchSnapshot({ ...valid, ...invalid } as MatchSnapshot),
      /MATCH_SNAPSHOT_INVALID/,
    );
  for (const value of [
    new Map(),
    new Set(),
    new Date(),
    1n,
    NaN,
    Infinity,
    () => 1,
    [undefined],
    new Array(2),
  ]) {
    room.state.pendingRoll!.context = { bad: value };
    assert.throws(() => serializeMatchSnapshot(room), /MATCH_SNAPSHOT_INVALID/);
  }
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  room.state.pendingRoll!.context = { cycle };
  assert.throws(() => serializeMatchSnapshot(room), /MATCH_SNAPSHOT_INVALID/);
  for (const key of ["accessToken", "resume_token", "connId", "email", "userId"]) {
    room.state.pendingRoll!.context = { nested: { [key]: "PRIVATE" } };
    assert.throws(() => serializeMatchSnapshot(room), /MATCH_SNAPSHOT_INVALID/);
  }
  room.rng = new DefaultRNG();
  assert.throws(() => serializeMatchSnapshot(room), /MATCH_SNAPSHOT_INVALID/);
  const zero = SeededRNG.fromState({ algorithm: "lcg32-numerical-recipes-v1", state: 0 });
  assert.equal(zero.next(), 1013904223 / 0x100000000);
  assert.throws(() =>
    SeededRNG.fromState({ algorithm: "lcg32-numerical-recipes-v1", state: 0x100000000 }),
  );
}

async function repositoryTests() {
  const records = new Map<number, MatchSnapshot>();
  const snapshot = serializeMatchSnapshot(makeRoom());
  const calls: object[] = [];
  const repository = new MatchSnapshotRepository({
    matchSnapshot: {
      create: async ({ data }: { data: SerializedMatchSnapshot }) => {
        if (records.has(data.revision)) throw dbError("P2002");
        const saved = row(data);
        records.set(data.revision, saved);
        return saved;
      },
      findUnique: async ({ where }: { where: { matchId_revision: { revision: number } } }) =>
        records.get(where.matchId_revision.revision) ?? null,
      findFirst: async (args: {
        where: { matchId: string; revision?: { lte: number } };
        orderBy: { revision: string };
      }) => {
        calls.push(args);
        assert.equal(args.orderBy.revision, "desc");
        return (
          [...records.values()]
            .filter(
              (r) =>
                r.matchId === args.where.matchId &&
                r.revision <= (args.where.revision?.lte ?? Infinity),
            )
            .sort((a, b) => b.revision - a.revision)[0] ?? null
        );
      },
    },
  } as unknown as PrismaClient);
  const service = new MatchSnapshotService(repository, { interval: 20 });
  await service.persistSnapshot(snapshot);
  const canonical = structuredClone(records.get(20));
  // Equivalent JSON with the opposite property insertion order is still idempotent.
  await service.persistSnapshot({
    ...snapshot,
    state: Object.fromEntries(Object.entries(snapshot.state).reverse()),
  });
  assert.equal(records.size, 1);
  for (const change of [
    { state: { ...snapshot.state, turnNumber: 99 } },
    { rngState: { ...snapshot.rngState, state: 99 } },
    { formatVersion: 999 },
  ]) {
    await assert.rejects(
      repository.create({ ...snapshot, ...change } as SerializedMatchSnapshot),
      /MATCH_SNAPSHOT_CONFLICT/,
    );
    assert.deepEqual(records.get(20), canonical);
  }
  for (const revision of [40, 60, 73]) await service.persistSnapshot({ ...snapshot, revision });
  assert.equal((await service.loadLatestSnapshot(snapshot.matchId))!.revision, 73);
  for (const [query, expected] of [
    [10, null],
    [20, 20],
    [39, 20],
    [40, 40],
    [55, 40],
    [73, 73],
    [100, 73],
  ]) {
    assert.equal(
      (await service.loadLatestSnapshotAtOrBefore(snapshot.matchId, query!))?.revision ?? null,
      expected,
    );
  }
  assert.deepEqual(calls[1], {
    where: { matchId: snapshot.matchId, revision: { lte: 10 } },
    orderBy: { revision: "desc" },
  });
  assert.equal((await service.loadSnapshot(snapshot.matchId, 20))!.revision, 20);
  assert.equal(await service.loadSnapshot(snapshot.matchId, 21), null);
  assert.equal(await service.loadLatestSnapshot(randomUUID()), null, "legacy absence is valid");
  await assert.rejects(
    service.loadLatestSnapshotAtOrBefore(snapshot.matchId, NaN),
    /MATCH_SNAPSHOT_INVALID/,
  );
  records.get(73)!.formatVersion = 999;
  await assert.rejects(
    service.loadLatestSnapshot(snapshot.matchId),
    /UNSUPPORTED_SNAPSHOT_VERSION/,
  );
}

async function queueTests() {
  const snapshot = serializeMatchSnapshot(makeRoom());
  const action = {
    matchId: snapshot.matchId,
    revision: 20,
    actorUserId: null,
    actorSeat: "P1" as const,
    actionType: "endTurn",
    actionPayload: { type: "endTurn" },
    events: [],
    createdAt: new Date(),
  };
  const gate = deferred();
  const writes: string[] = [];
  let attempts = 0;
  const queue = new MatchActionQueue(
    {
      appendAcceptedAction: async (r) => {
        if (r.matchId === snapshot.matchId) await gate.promise;
        writes.push(`action:${r.matchId}:${r.revision}`);
      },
      appendMatchSnapshot: async (r) => {
        if (++attempts < 3) throw dbError("P1001");
        writes.push(`snapshot:${r.matchId}:${r.revision}`);
      },
    },
    logger,
    { backoffMs: 0 },
  );
  queue.enqueue(action, "room");
  queue.enqueueSnapshot(snapshot, "room");
  queue.enqueue({ ...action, revision: 21 }, "room");
  const other = randomUUID();
  queue.enqueue({ ...action, matchId: other }, "other");
  assert(await queue.drain(other));
  assert.deepEqual(writes, [`action:${other}:20`]);
  gate.resolve();
  assert(await queue.drain());
  assert.equal(attempts, 3);
  assert.deepEqual(writes.slice(1), [
    `action:${snapshot.matchId}:20`,
    `snapshot:${snapshot.matchId}:20`,
    `action:${snapshot.matchId}:21`,
  ]);
  for (const error of [
    new MatchSnapshotError("MATCH_SNAPSHOT_CONFLICT"),
    dbError("P2003"),
    dbError("P1001"),
  ]) {
    let count = 0;
    const failed = new MatchActionQueue(
      {
        appendAcceptedAction: async () => {
          writes.push("should not reach");
        },
        appendMatchSnapshot: async () => {
          count++;
          throw error;
        },
      },
      logger,
      { backoffMs: 0 },
    );
    failed.enqueueSnapshot(snapshot, "room");
    failed.enqueue({ ...action, revision: 21 }, "room");
    assert.equal(await failed.drain(), false);
    assert.equal(count, error instanceof MatchSnapshotError || error.code === "P2003" ? 1 : 3);
    assert(!writes.includes("should not reach"));
  }
  assert(
    logs.some(
      (data) =>
        (data as { operation?: string; formatVersion?: number }).operation === "snapshot" &&
        (data as { formatVersion?: number }).formatVersion === MATCH_SNAPSHOT_FORMAT_VERSION,
    ),
  );
}

async function runtimeTests() {
  for (const [interval, terminal, expected] of [
    [20, 73, [20, 40, 60, 73]],
    [20, 80, [20, 40, 60, 80]],
    [0, 73, [73]],
  ] as const) {
    const memory = new MemoryMatchPersistence();
    const lifecycle = new MatchLifecycle(logger, memory, snapshots(interval));
    const room = await lifecycle.createRoom({ seed: 54 });
    room.seats = { P1: "one", P2: "two" };
    room.seatIdentities = {
      P1: { userId: randomUUID(), username: "Alice", displayName: null },
      P2: { userId: randomUUID(), username: "Bob", displayName: null },
    };
    room.state = {
      ...room.state,
      seats: { P1: true, P2: true },
      playersReady: { P1: true, P2: true },
    };
    const originalSnapshot = memory.appendMatchSnapshot.bind(memory);
    memory.appendMatchSnapshot = async (snapshot) => {
      assert(
        memory.actions.has(`${snapshot.matchId}:${snapshot.revision}`),
        "action is durable before checkpoint",
      );
      await originalSnapshot(snapshot);
    };
    const finalize = memory.finalizeMatch.bind(memory);
    memory.finalizeMatch = async (id, input) => {
      assert(
        memory.snapshots.has(`${id}:${input.finalRevision}`),
        "final checkpoint exists before FINISHED",
      );
      await finalize(id, input);
    };
    try {
      assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
      while (room.revision < terminal - 1) {
        if (room.revision === 19) {
          await lifecycle.drainActions();
          assert.equal(memory.snapshots.size, 0);
          const before = room.revision;
          assert(
            !(
              await lifecycle.applyAction(
                room,
                { type: "resolvePendingRoll", player: "P1", pendingRollId: "invalid" },
                "P1",
              )
            ).ok,
          );
          assert.equal(room.revision, before);
          assert.equal(memory.snapshots.size, 0);
        }
        lifecycle.recordDraftAction(room, {
          type: "draftBanHero",
          player: "P1",
          heroId: `hero-${room.revision}`,
        });
        if ([20, 39, 40].includes(room.revision)) {
          await lifecycle.drainActions();
          assert.deepEqual(
            [...memory.snapshots.values()].map((s) => s.revision),
            interval ? (room.revision < 40 ? [20] : [20, 40]) : [],
          );
        }
      }
      room.state = {
        ...room.state,
        phase: "battle",
        pendingRoll: null,
        ruleDeclaration: {
          ...room.state.ruleDeclaration,
          selectedRuleId: "normal_rule",
          setupComplete: true,
        },
        units: Object.fromEntries(
          Object.entries(room.state.units).map(([id, u]) => [
            id,
            u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u,
          ]),
        ),
      };
      assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
      assert.equal(room.revision, terminal);
      assert(await lifecycle.drainActions(room.matchId!));
      // Repeated terminal callback is equivalent and preserves a single canonical row.
      lifecycle.recordAcceptedAction(room);
      assert(await lifecycle.drainActions());
      assert.deepEqual(
        [...memory.snapshots.values()].map((s) => s.revision),
        expected,
      );
      assert.equal(memory.matches.get(room.matchId!)!.result!.finalRevision, terminal);
      assert.equal(
        deserializeMatchSnapshot(row([...memory.snapshots.values()].at(-1)!)).state.phase,
        "ended",
      );
    } finally {
      await lifecycle.close();
    }
  }

  // Capture while DB is stalled; close and room removal retain the checkpoint.
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, memory, snapshots(1));
  const room = await lifecycle.createRoom();
  const gate = deferred();
  const append = memory.appendAcceptedAction.bind(memory);
  memory.appendAcceptedAction = async (action) => {
    await gate.promise;
    await append(action);
  };
  lifecycle.recordDraftAction(room, { type: "draftStarted", player: "P1" });
  const hp = Object.values(room.state.units)[0].hp;
  Object.values(room.state.units)[0].hp = 99;
  room.rng.next();
  lifecycle.recordDraftAction(room, { type: "draftBanHero", player: "P1", heroId: "hero" });
  assert.equal(memory.snapshots.size, 0, "gameplay continued with queued DB work");
  const removal = lifecycle.removeRoom(room);
  gate.resolve();
  await removal;
  await lifecycle.close();
  const captured = memory.snapshots.get(`${room.matchId}:1`)!;
  assert.equal(Object.values(deserializeMatchSnapshot(row(captured)).state.units)[0].hp, hp);
  assert.equal(memory.snapshots.size, 2);
  assert.equal(lifecycle.actionQueue.pendingCount, 0);

  const failing = new MemoryMatchPersistence();
  const failureLifecycle = new MatchLifecycle(logger, failing, snapshots(0));
  const terminalRoom = await failureLifecycle.createRoom();
  terminalRoom.seats = { P1: "one", P2: "two" };
  terminalRoom.seatIdentities = {
    P1: { userId: randomUUID(), username: "A", displayName: null },
    P2: { userId: randomUUID(), username: "B", displayName: null },
  };
  terminalRoom.state = {
    ...terminalRoom.state,
    seats: { P1: true, P2: true },
    playersReady: { P1: true, P2: true },
  };
  await failureLifecycle.applyAction(terminalRoom, { type: "startGame" }, "P1");
  terminalRoom.state = {
    ...terminalRoom.state,
    phase: "battle",
    pendingRoll: null,
    ruleDeclaration: {
      ...terminalRoom.state.ruleDeclaration,
      selectedRuleId: "normal_rule",
      setupComplete: true,
    },
    units: Object.fromEntries(
      Object.entries(terminalRoom.state.units).map(([id, u]) => [
        id,
        u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u,
      ]),
    ),
  };
  failing.fail.add("snapshot");
  assert((await failureLifecycle.applyAction(terminalRoom, { type: "endTurn" }, "P1")).ok);
  assert.equal(await failureLifecycle.drainActions(), false);
  assert.equal(terminalRoom.state.phase, "ended");
  assert.equal(failing.matches.get(terminalRoom.matchId!)!.status, "IN_PROGRESS");
  await failureLifecycle.retryPending();
  assert(!failing.calls.includes("finish"));
  await failureLifecycle.close();
  const sandboxMemory = new MemoryMatchPersistence();
  const sandboxLifecycle = new MatchLifecycle(logger, sandboxMemory, snapshots(1));
  const sandbox = await sandboxLifecycle.createRoom({ roomMode: "test" });
  sandboxLifecycle.recordDraftAction(sandbox, { type: "draftStarted", player: "P1" });
  await sandboxLifecycle.drainActions();
  assert.equal(sandbox.revision, 1);
  assert.equal(sandboxMemory.snapshots.size, 0);
  assert.equal(sandboxMemory.matches.size, 0);
  await sandboxLifecycle.close();
}

async function run() {
  assert.deepEqual(readMatchSnapshotConfig({}), { interval: 20 });
  assert.deepEqual(readMatchSnapshotConfig({ MATCH_SNAPSHOT_INTERVAL: "0" }), { interval: 0 });
  assert.deepEqual(readMatchSnapshotConfig({ MATCH_SNAPSHOT_INTERVAL: "7" }), { interval: 7 });
  for (const raw of ["-1", "NaN", "1.5", "Infinity", "", "oops", "9007199254740992"])
    assert.throws(
      () => readMatchSnapshotConfig({ MATCH_SNAPSHOT_INTERVAL: raw }),
      /MATCH_SNAPSHOT_INTERVAL/,
    );
  for (let revision = 1; revision <= 40; revision++)
    assert.equal(snapshots(20).shouldCapture(revision), [20, 40].includes(revision));
  assert(snapshots(0).shouldCapture(73, true));
  assert(!snapshots(0).shouldCapture(20));
  serializationTests();
  await repositoryTests();
  await queueTests();
  await runtimeTests();
  storeTestHooks.reset();
  console.log(
    "match snapshots: serialization, RNG, validation, conflicts, loading, queue retries/order, intervals, final state, mutation, failure and cleanup passed",
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
