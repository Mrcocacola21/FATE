import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { readMatchmakingConfig } from "../../matchmaking/config";
import type { MatchmakingStatus, PairAttempt } from "../../matchmaking/types";
import { MatchmakingService } from "../../services/matchmakingService";

const identity = (userId: string) => ({ userId, username: userId, displayName: null });

function fixture(env: NodeJS.ProcessEnv = {}) {
  let now = 1_000_000;
  const pairs: PairAttempt[] = [];
  const service = new MatchmakingService(
    {
      logger: { info() {}, error() {} },
      loadPlayer: async () => ({ rating: 1500, ratingDeviation: 350 }),
      hasPersistentActiveMatch: async () => false,
      hasRuntimeMatch: () => false,
      createPair: async (attempt) => {
        pairs.push(attempt);
        return { roomId: attempt.roomId, matchId: randomUUID() };
      },
      resultIsUsable: () => true,
    },
    readMatchmakingConfig(env),
    () => now,
    () => false,
    () => undefined,
  );
  const join = async (id: string) => {
    service.connect(identity(id), id, () => undefined);
    return service.join(identity(id), "standard");
  };
  return {
    service,
    pairs,
    join,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function proposed(status: MatchmakingStatus) {
  assert.equal(status.status, "MATCH_PROPOSED");
  return status as Extract<MatchmakingStatus, { status: "MATCH_PROPOSED" }>;
}

test("a found pair is offered first and created only once both accept", async () => {
  const f = fixture();
  await f.join("A");
  await f.join("B");
  await f.service.tick();
  const offer = proposed(f.service.getStatus("A"));
  assert.equal(offer.acceptMs, 20_000);
  assert.equal(offer.accepted, false);
  assert.equal(f.pairs.length, 0, "nothing is created before both accept");
  proposed(f.service.accept("A"));
  assert.equal(proposed(f.service.getStatus("B")).opponentAccepted, true);
  assert.equal(f.service.accept("B").status, "MATCHING");
  await f.service.tick();
  assert.equal(f.pairs.length, 1);
  assert.equal(f.service.getStatus("A").status, "MATCH_FOUND");
  assert.equal(f.service.getStatus("B").status, "MATCH_FOUND");
});

test("declining sends the other player back to searching and bans the decliner", async () => {
  const f = fixture();
  await f.join("A");
  f.advance(30_000);
  await f.join("B");
  await f.service.tick();
  const waited = f.service.getStatus("A");
  f.service.accept("A");
  const declined = f.service.decline("B");
  assert.equal(declined.status, "NOT_QUEUED");
  assert.ok(declined.penaltyUntil, "the decliner sees the ban");
  const back = f.service.getStatus("A");
  assert.equal(back.status, "QUEUED");
  assert.equal(
    back.status === "QUEUED" && back.joinedAt,
    waited.status === "MATCH_PROPOSED" && waited.joinedAt,
    "the accepter keeps the time they waited",
  );
  await assert.rejects(f.join("B"), { code: "MATCHMAKING_PENALTY" });
  f.advance(60_000);
  assert.equal((await f.join("B")).status, "QUEUED", "the first ban lasts a minute");
});

test("an offer nobody answers lapses, and the bans grow with each miss", async () => {
  const f = fixture();
  for (const [miss, length] of [
    [1, 60_000],
    [2, 300_000],
    [3, 900_000],
    [4, 900_000],
  ] as const) {
    await f.join("A");
    await f.join("B");
    await f.service.tick();
    proposed(f.service.getStatus("A"));
    f.advance(20_000);
    await f.service.tick();
    const status = f.service.getStatus("A");
    assert.ok(status.status === "NOT_QUEUED" && status.penaltyUntil, `miss ${miss}`);
    f.advance(length - 1000);
    await assert.rejects(f.join("A"), { code: "MATCHMAKING_PENALTY" }, `ban ${miss} still on`);
    f.advance(1000);
  }
  f.advance(24 * 3600_000);
  await f.join("A");
  await f.join("B");
  await f.service.tick();
  f.advance(20_000);
  await f.service.tick();
  const reset = f.service.getStatus("A");
  assert.equal(reset.status, "NOT_QUEUED");
  f.advance(60_000);
  assert.equal((await f.join("A")).status, "QUEUED", "a quiet day resets the count");
});

test("cancelling the search while a match is offered counts as declining", async () => {
  const f = fixture();
  await f.join("A");
  await f.join("B");
  await f.service.tick();
  f.service.accept("B");
  const cancelled = f.service.cancel("A");
  assert.equal(cancelled.status, "NOT_QUEUED");
  assert.ok(cancelled.penaltyUntil);
  assert.equal(f.service.getStatus("B").status, "QUEUED");
});

test("accepting can be switched off, and the timings come from configuration", async () => {
  const off = fixture({ MATCHMAKING_ACCEPT_SECONDS: "0" });
  await off.join("A");
  await off.join("B");
  await off.service.tick();
  assert.equal(off.pairs.length, 1);
  const config = readMatchmakingConfig({
    MATCHMAKING_ACCEPT_SECONDS: "30",
    MATCHMAKING_PENALTY_SECONDS: "10, 20",
    MATCHMAKING_PENALTY_WINDOW_HOURS: "2",
  });
  assert.equal(config.acceptMs, 30_000);
  assert.deepEqual(config.penaltyMs, [10_000, 20_000]);
  assert.equal(config.penaltyWindowMs, 7_200_000);
  assert.throws(() => readMatchmakingConfig({ MATCHMAKING_PENALTY_SECONDS: "ten" }));
});
