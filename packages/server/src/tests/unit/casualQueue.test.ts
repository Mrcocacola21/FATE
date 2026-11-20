import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getAllowedRatingRange, readMatchmakingConfig } from "../../matchmaking/config";
import type { MatchType } from "../../matches/matchType";
import type { PairAttempt } from "../../matchmaking/types";
import { MatchmakingService } from "../../services/matchmakingService";

const identity = (userId: string) => ({ userId, username: userId, displayName: null });

function fixture(ratings: Record<string, number> = {}) {
  let now = 1_000_000;
  const pairs: PairAttempt[] = [];
  const service = new MatchmakingService(
    {
      logger: { info() {}, error() {} },
      loadPlayer: async (id) => ({ rating: ratings[id] ?? 1500, ratingDeviation: 350 }),
      hasPersistentActiveMatch: async () => false,
      hasRuntimeMatch: () => false,
      createPair: async (attempt) => {
        pairs.push(attempt);
        return { roomId: attempt.roomId, matchId: randomUUID() };
      },
      resultIsUsable: () => true,
    },
    readMatchmakingConfig({}),
    () => now,
    () => false,
    () => undefined,
  );
  const join = async (id: string, matchType: MatchType) => {
    service.connect(identity(id), id, () => undefined);
    return service.join(identity(id), "standard", matchType);
  };
  const pair = async (a: string, b: string) => {
    await service.tick();
    service.accept(a);
    service.accept(b);
    await service.tick();
  };
  return { service, pairs, join, pair, advance: (ms: number) => void (now += ms) };
}

test("Casual and Rated searches never meet, and a Casual pair makes a Casual match", async () => {
  const f = fixture();
  await f.join("rated", "RATED");
  await f.join("casual", "CASUAL");
  await f.service.tick();
  assert.equal(f.service.getStatus("rated").status, "QUEUED");
  assert.equal(f.service.getStatus("casual").status, "QUEUED");
  await f.join("casual-2", "CASUAL");
  await f.pair("casual", "casual-2");
  assert.equal(f.pairs.length, 1);
  assert.equal(f.pairs[0].players.P1.matchType, "CASUAL");
  const found = f.service.getStatus("casual");
  assert.ok(found.status === "MATCH_FOUND");
  assert.equal(found.matchType, "CASUAL");
  assert.equal(f.service.getStatus("rated").status, "QUEUED");
});

test("Casual search widens faster than Rated and, after a while, takes anyone free", async () => {
  const config = readMatchmakingConfig({});
  assert.ok(getAllowedRatingRange(0, config, "CASUAL") > getAllowedRatingRange(0, config));
  assert.equal(
    getAllowedRatingRange(config.casualOpenMs, config, "CASUAL"),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    getAllowedRatingRange(config.casualOpenMs, config),
    getAllowedRatingRange(config.casualOpenMs, config, "RATED"),
  );
  const f = fixture({ strong: 2400, new: 1500 });
  await f.join("strong", "CASUAL");
  await f.join("new", "CASUAL");
  await f.service.tick();
  assert.equal(f.service.getStatus("strong").status, "QUEUED", "too far apart at first");
  f.advance(config.casualOpenMs);
  await f.service.tick();
  assert.equal(f.service.getStatus("strong").status, "MATCH_PROPOSED");
});

test("a missed Casual match pauses Casual search only, and for less than a Rated one", async () => {
  const f = fixture();
  await f.join("A", "CASUAL");
  await f.join("B", "CASUAL");
  await f.service.tick();
  f.service.accept("B");
  const declined = f.service.decline("A");
  assert.ok(declined.status === "NOT_QUEUED" && declined.casualPenaltyUntil);
  assert.equal(declined.penaltyUntil, undefined, "the Rated queue stays open");
  await assert.rejects(f.join("A", "CASUAL"), { code: "MATCHMAKING_PENALTY" });
  assert.equal((await f.join("A", "RATED")).status, "QUEUED");
  f.service.cancel("A");
  f.advance(30_000);
  assert.equal(
    (await f.join("A", "CASUAL")).status,
    "QUEUED",
    "the first Casual pause is 30 seconds",
  );
  const config = readMatchmakingConfig({});
  config.casualPenaltyMs.forEach((length, step) => assert.ok(length < config.penaltyMs[step]));
});
