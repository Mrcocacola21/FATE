import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getAllowedRatingRange, readMatchmakingConfig } from "../matchmaking/config";
import { PairCreationRolledBack } from "../matchmaking/errors";
import type { MatchmakingEvent, MatchmakingStatus, PairAttempt } from "../matchmaking/types";
import { MatchmakingService, type MatchmakingDependencies } from "../services/matchmakingService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { assertSeatIdentity } from "../auth/connectionIdentity";
import { getGameRoom, listRoomSummaries, storeTestHooks } from "../store";
import { MemoryMatchPersistence } from "./matchTestSupport";
import type { GameModeId } from "rules";

const logger = { info() {}, error() {} };
const config = readMatchmakingConfig({});
const identity = (userId: string) => ({ userId, username: userId, displayName: null });
function queued(status: MatchmakingStatus) {
  assert(status.status === "QUEUED" || status.status === "MATCHING");
  return status;
}
function fixture(
  ratings: Record<string, number> = {},
  overrides: Partial<MatchmakingDependencies> = {},
) {
  let now = 100000;
  const pairs: PairAttempt[] = [];
  const events: Record<string, MatchmakingEvent[]> = {};
  const service = new MatchmakingService(
    {
      logger,
      loadPlayer: async (id) => ({ rating: ratings[id] ?? 1500, ratingDeviation: 350 }),
      hasPersistentActiveMatch: async () => false,
      hasRuntimeMatch: () => false,
      createPair: async (attempt) => {
        pairs.push(attempt);
        return { roomId: attempt.roomId, matchId: randomUUID() };
      },
      resultIsUsable: () => true,
      ...overrides,
    },
    config,
    () => now,
    () => false,
    () => undefined,
  );
  const connect = (id: string, connection = id) => {
    events[id] ??= [];
    service.connect(identity(id), connection, (event) => events[id].push(event));
  };
  const join = (id: string, mode: GameModeId = "standard") => {
    connect(id);
    return service.join(identity(id), mode);
  };
  return {
    service,
    pairs,
    events,
    connect,
    join,
    time: (value: number) => {
      now = value;
    },
  };
}
async function run() {
  for (const [ms, range] of [
    [0, 100],
    [14999, 100],
    [15000, 150],
    [30000, 200],
    [45000, 250],
    [90000, 400],
    [300000, 400],
    [-100, 100],
  ])
    assert.equal(getAllowedRatingRange(ms, config), range);
  for (const env of [
    { MATCHMAKING_INITIAL_RATING_RANGE: "-1" },
    { MATCHMAKING_RATING_RANGE_STEP: "0" },
    { MATCHMAKING_RANGE_STEP_SECONDS: "0" },
    { MATCHMAKING_MAX_RATING_RANGE: "99" },
    { MATCHMAKING_SERVER_PROCESSES: "2" },
  ])
    assert.throws(() => readMatchmakingConfig(env));
  {
    const f = fixture({ A: 1500, B: 1750 });
    await f.join("A");
    f.time(160000);
    await f.join("B");
    await f.service.tick();
    assert.equal(f.pairs.length, 0); // Mutual consent: fresh B accepts only 100.
    f.time(205000);
    await f.service.tick();
    assert.equal(f.pairs.length, 1);
    await f.service.close();
  }
  {
    const f = fixture({ A: 1500, B: 1590, C: 1510 });
    await f.join("A");
    f.time(100010);
    await f.join("B");
    await f.join("C");
    await f.service.tick();
    assert.equal(f.pairs.length, 1);
    assert.equal(f.pairs[0].players.P1.identity.userId, "A");
    assert.equal(f.pairs[0].players.P2.identity.userId, "C");
    assert.equal(f.service.getStatus("B").status, "QUEUED");
    const result = f.service.getStatus("A");
    assert.equal(result.status, "MATCH_FOUND");
    assert.equal(f.events.A[f.events.A.length - 1]?.type, "matchmakingFound");
    assert.equal(f.service.cancel("A").status, "MATCH_FOUND");
    await f.service.close();
  }
  {
    const f = fixture({ A: 1500, B: 1510, C: 1490 });
    await f.join("A");
    f.time(100010);
    await f.join("B");
    f.time(100020);
    await f.join("C");
    await f.service.tick();
    assert.equal(f.pairs[0].players.P2.identity.userId, "B");
    await f.service.close();
  }
  {
    const f = fixture();
    await f.join("A");
    await f.join("B", "classic");
    await f.join("C", "draft");
    await f.service.tick();
    assert.equal(f.pairs.length, 0);
    f.time(400000);
    await f.service.tick();
    assert.equal(f.pairs.length, 0);
    await f.service.close();
  }
  {
    let loads = 0;
    const f = fixture(
      {},
      {
        loadPlayer: async () => {
          loads++;
          return { rating: 1500, ratingDeviation: 350 };
        },
      },
    );
    f.connect("A");
    const statuses = await Promise.all(
      Array.from({ length: 6 }, () => f.service.join(identity("A"), "standard")),
    );
    assert.equal(loads, 1);
    assert(statuses.every((s) => queued(s).joinedAt === queued(statuses[0]).joinedAt));
    f.time(140000);
    const duplicate = await f.service.join(identity("A"), "classic");
    assert.equal(queued(duplicate).gameMode, "standard");
    assert.equal(queued(duplicate).currentRange, 200);
    assert.equal(f.service.cancel("A").status, "NOT_QUEUED");
    assert.equal(f.service.cancel("A").status, "NOT_QUEUED");
    await f.service.tick();
    assert.equal(f.pairs.length, 0);
    await f.service.close();
  }
  {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let count = 0;
    const f = fixture(
      {},
      {
        createPair: async (a) => {
          count++;
          await barrier;
          return { matchId: "one-match", roomId: a.roomId };
        },
      },
    );
    await Promise.all([f.join("A"), f.join("B"), f.join("C")]);
    const passes = Array.from({ length: 10 }, () => f.service.tick());
    assert.equal(count, 1);
    assert.equal(f.service.cancel("A").status, "MATCHING");
    await assert.rejects(
      f.service.withCompetitor("A", "another-room", async () => undefined),
      /Cancel your search/,
    );
    release();
    await Promise.all(passes);
    assert.equal(count, 1);
    assert.equal(f.service.getStatus("C").status, "QUEUED");
    await f.service.close();
  }
  {
    const f = fixture();
    await Promise.all([f.join("A"), f.join("B"), f.join("C"), f.join("D")]);
    await Promise.all([f.service.tick(), f.service.tick()]);
    assert.equal(f.pairs.length, 2);
    assert.equal(
      new Set(f.pairs.flatMap((p) => Object.values(p.players).map((e) => e.identity.userId))).size,
      4,
    );
    await f.service.close();
  }
  {
    let fail = true;
    const ids: string[] = [];
    const f = fixture(
      {},
      {
        createPair: async (a) => {
          ids.push(a.roomId);
          if (fail) throw new Error("Ambiguous commit");
          return { roomId: a.roomId, matchId: "committed" };
        },
      },
    );
    await Promise.all([f.join("A"), f.join("B")]);
    const joinedAt = queued(f.service.getStatus("A")).joinedAt;
    await f.service.tick();
    assert.equal(f.service.getStatus("A").status, "MATCHING");
    assert(!f.events.A.some((e) => e.type === "matchmakingFound"));
    f.time(101000);
    fail = false;
    await f.service.tick();
    assert.equal(ids[0], ids[1]);
    assert.equal(f.service.getStatus("A").status, "MATCH_FOUND");
    assert.equal(f.pairs.length, 0);
    assert(joinedAt);
    await f.service.close();
  }
  {
    const f = fixture(
      {},
      {
        createPair: async () => {
          throw new PairCreationRolledBack();
        },
      },
    );
    await Promise.all([f.join("A"), f.join("B")]);
    const joinedAt = queued(f.service.getStatus("A")).joinedAt;
    await f.service.tick();
    assert.equal(f.service.getStatus("A").status, "QUEUED");
    assert.equal(queued(f.service.getStatus("A")).joinedAt, joinedAt);
    assert.equal(f.service.cancel("A").status, "NOT_QUEUED");
    await f.service.close();
  }
  {
    const f = fixture();
    await f.join("A");
    const joinedAt = queued(f.service.getStatus("A")).joinedAt;
    f.connect("A", "tab2");
    f.service.disconnect("A", "A");
    assert.equal(queued(f.service.getStatus("A")).available, true);
    f.service.disconnect("A", "tab2");
    await f.join("B");
    await f.service.tick();
    assert.equal(f.pairs.length, 0);
    f.time(130000);
    f.connect("A", "refresh");
    assert.equal(queued(f.service.getStatus("A")).joinedAt, joinedAt);
    await f.service.tick();
    assert.equal(f.pairs.length, 1);
    await f.service.close();
  }
  {
    const f = fixture();
    await f.join("A");
    f.service.disconnect("A", "A");
    f.time(145000);
    await f.service.tick();
    assert.equal(f.service.getStatus("A").status, "NOT_QUEUED");
    await f.service.close();
  }
  {
    const f = fixture({}, { hasPersistentActiveMatch: async () => true });
    await assert.rejects(f.join("A"), /active match/);
    await f.service.close();
    const g = fixture({}, { hasRuntimeMatch: () => true });
    await assert.rejects(g.join("A"), /active match/);
    await g.service.close();
  }
  {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture(
      {},
      {
        loadPlayer: async () => {
          await barrier;
          return { rating: 1500, ratingDeviation: 350 };
        },
      },
    );
    const join = f.join("A");
    f.service.cancel("A");
    release();
    await assert.rejects(join, /cancelled/);
    assert.equal(f.service.getStatus("A").status, "NOT_QUEUED");
    await f.join("A");
    assert.equal(f.service.getStatus("A").status, "QUEUED");
    await f.service.close();
  }
  {
    storeTestHooks.reset();
    const persistence = new MemoryMatchPersistence();
    const lifecycle = new MatchLifecycle(logger, persistence);
    const a = {
      identity: identity("A"),
      gameMode: "classic" as const,
      rating: 1500,
      ratingDeviation: 350,
      joinedAt: 0,
      state: "MATCHING" as const,
    };
    const attempt = {
      roomId: randomUUID(),
      players: { P1: a, P2: { ...a, identity: identity("B") } },
      retryAt: 0,
    };
    persistence.fail.add("create");
    await assert.rejects(lifecycle.createMatchedRoom(attempt), PairCreationRolledBack);
    assert.equal(getGameRoom(attempt.roomId), undefined);
    persistence.fail.clear();
    const created = await lifecycle.createMatchedRoom(attempt);
    const room = getGameRoom(created.roomId)!;
    assert.equal(room.matchType, "RATED");
    assert.equal(room.gameMode, "classic");
    assert.equal(persistence.matches.get(created.matchId)?.participants.size, 2);
    assert.throws(() => assertSeatIdentity(room, "P1", identity("C"), ""), /reserved/);
    assert.doesNotThrow(() => assertSeatIdentity(room, "P1", identity("A"), ""));
    assert(listRoomSummaries().find((r) => r.id === room.id)?.players.P1);
    assert.deepEqual(await lifecycle.createMatchedRoom(attempt), created);
    assert.equal(persistence.matches.size, 1);
    await lifecycle.close();
    storeTestHooks.reset();
  }
  {
    let usable = true;
    const f = fixture({}, { resultIsUsable: () => usable });
    await Promise.all([f.join("A"), f.join("B")]);
    await f.service.tick();
    assert.equal(f.service.getStatus("A").status, "MATCH_FOUND");
    usable = false;
    await f.service.tick();
    assert.equal(f.service.getStatus("A").status, "NOT_QUEUED");
    assert.equal(f.events.A[f.events.A.length - 1]?.status.status, "NOT_QUEUED");
    assert.equal(f.events.B[f.events.B.length - 1]?.status.status, "NOT_QUEUED");
    await f.service.close();
  }

  // A transport error can happen before a late commit, or after a completed commit.
  // Neither outcome may release the stable room/seed for a different pair.
  for (const commitBeforeError of [false, true]) {
    storeTestHooks.reset();
    const persistence = new MemoryMatchPersistence();
    const create = persistence.createWaitingMatch.bind(persistence);
    const seeds: number[] = [];
    let tries = 0;
    persistence.createWaitingMatch = async (input) => {
      seeds.push(input.seed);
      tries++;
      if (tries === 1) {
        if (commitBeforeError) await create(input);
        throw new Error("Connection lost with unknown commit outcome");
      }
      if (tries === 2) throw new PairCreationRolledBack("Later retry rolled back");
      return create(input);
    };
    const lifecycle = new MatchLifecycle(logger, persistence);
    const player = {
      identity: identity("A"), gameMode: "classic" as const,
      rating: 1500, ratingDeviation: 350, joinedAt: 0, state: "MATCHING" as const,
    };
    const attempt = {
      roomId: randomUUID(), players: { P1: player, P2: { ...player, identity: identity("B") } },
      retryAt: 0,
    };
    await assert.rejects(lifecycle.createMatchedRoom(attempt), (error: unknown) =>
      error instanceof Error && !(error instanceof PairCreationRolledBack));
    assert.equal(getGameRoom(attempt.roomId), undefined);
    assert.equal(persistence.matches.size, commitBeforeError ? 1 : 0);
    await assert.rejects(lifecycle.createMatchedRoom(attempt), (error: unknown) =>
      error instanceof Error && !(error instanceof PairCreationRolledBack));
    assert.equal(getGameRoom(attempt.roomId), undefined);
    assert.equal(persistence.matches.size, commitBeforeError ? 1 : 0);
    const created = await lifecycle.createMatchedRoom(attempt);
    assert.equal(seeds[0], seeds[1]);
    assert.equal(seeds[0], seeds[2], "A later rollback cannot release an earlier ambiguous try");
    assert.equal(persistence.matches.size, 1);
    assert.equal(persistence.matches.get(created.matchId)?.participants.size, 2);
    assert.deepEqual(await lifecycle.createMatchedRoom(attempt), created);
    await lifecycle.close();
    storeTestHooks.reset();
  }
  console.log(
    "Matchmaking: range, fairness, idempotency, concurrency, cancellation, recovery, connections and reserved runtime tests passed",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
