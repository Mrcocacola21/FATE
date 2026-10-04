import assert from "node:assert/strict";
import test from "node:test";
import {
  RATING_TIERS,
  getRatingTier,
  getRankProgress,
  compareRankTiers,
} from "../rating/rankTiers";
import { RatingError } from "../rating/ratingError";
import Fastify from "fastify";
import { RatingService } from "../services/ratingService";
import { ratingRoutes } from "../routes/ratingRoutes";
import { INITIAL_RATING } from "../rating/constants";

test("every exact and fractional boundary uses precise rating without rounding or caps", () => {
  const examples = [
    [-500, "SHADOW"],
    [0, "SHADOW"],
    [349.999, "SHADOW"],
    [350, "CRESCENT"],
    [699.999, "CRESCENT"],
    [700, "HALF"],
    [1099.999, "HALF"],
    [1100, "FULL"],
    [1500, "FULL"],
    [1599.999, "FULL"],
    [1600, "ECLIPSE"],
    [1749.999, "ECLIPSE"],
    [1750, "BLACK_MOON"],
    [1849.999, "BLACK_MOON"],
    [1850, "NOVA"],
    [1999.999, "NOVA"],
    [1999.7, "NOVA"],
    [2000, "DESTINY"],
    [2500, "DESTINY"],
    [10000, "DESTINY"],
  ] as const;
  for (const [rating, tier] of examples) assert.equal(getRatingTier(rating), tier, String(rating));
  assert.equal(RATING_TIERS.length, 8);
});

test("invalid rating state throws a controlled domain error", () => {
  for (const rating of [NaN, Infinity, -Infinity]) {
    for (const helper of [getRatingTier, getRankProgress])
      assert.throws(
        () => helper(rating),
        (error) => error instanceof RatingError && error.code === "RATING_INVALID_STATE",
      );
  }
});

test("finite tiers have zero, midpoint and near-complete progress", () => {
  for (const [min, midpoint, last, next] of [
    [350, 525, 699, 700],
    [700, 900, 1099, 1100],
    [1100, 1350, 1599, 1600],
    [1600, 1675, 1749, 1750],
    [1750, 1800, 1849, 1850],
    [1850, 1925, 1999, 2000],
  ]) {
    assert.equal(getRankProgress(min).progress, 0);
    assert.equal(getRankProgress(midpoint).progress, 0.5);
    const progress = getRankProgress(last);
    assert(progress.progress! > 0.98 && progress.progress! < 1);
    assert.equal(progress.nextRating, next);
    assert.equal(progress.ratingToNext, 1);
    assert.equal(progress.isMaxRank, false);
  }
});

test("Shadow has no invented lower bound or percentage", () => {
  assert.deepEqual(getRankProgress(100), {
    currentMin: null,
    nextTier: "CRESCENT",
    nextRating: 350,
    ratingToNext: 250,
    progress: null,
    isMaxRank: false,
  });
  assert.equal(getRankProgress(-500).ratingToNext, 850);
});

test("Destiny has no next tier while numerical rating remains unbounded", () => {
  assert.deepEqual(getRankProgress(2150), {
    currentMin: 2000,
    nextTier: null,
    nextRating: null,
    ratingToNext: 0,
    progress: null,
    isMaxRank: true,
  });
  assert.equal(getRatingTier(Number.MAX_VALUE), "DESTINY");
});

test("ordered major tiers support future promotion and demotion detection", () => {
  assert.equal(compareRankTiers(getRatingTier(1748), getRatingTier(1755)), 1);
  assert.equal(compareRankTiers("DESTINY", "NOVA"), -1);
  assert.equal(compareRankTiers("FULL", "FULL"), 0);
});

test("rating API derives the real tier/progress for new and provisional players without capping", async () => {
  let rating: number | null = null;
  const userId = "00000000-0000-4000-8000-000000000001";
  const service = new RatingService({
    userExists: async () => ({ id: userId }),
    getRating: async () =>
      rating === null
        ? null
        : { userId, gameMode: "standard", ...INITIAL_RATING, rating, ratedGames: 2 },
    getHistory: async () => ({ total: 0, items: [] }),
    serializable: async () => {
      throw new Error("Read-only test");
    },
  });
  const server = Fastify();
  await server.register(ratingRoutes, { prefix: "/api", ratings: service });
  try {
    const initial = (await server.inject({ url: `/api/users/${userId}/rating` })).json();
    assert.equal(initial.rating, 1500);
    assert.equal(initial.rankTier, "FULL");
    assert.equal(initial.ratedGames, 0);
    for (const value of [
      349.999, 350, 699.999, 700, 1099.999, 1100, 1200, 1599.999, 1600, 1749.999, 1750, 1849.999,
      1850, 1999.7, 2000, 2150,
    ]) {
      rating = value;
      const response = await server.inject({ url: `/api/users/${userId}/rating` });
      assert.equal(response.statusCode, 200);
      const dto = response.json();
      assert.equal(dto.rating, value);
      assert.equal(dto.rankTier, getRatingTier(value));
      assert.deepEqual(dto.rankProgress, getRankProgress(value));
      assert.equal(dto.ratedGames, 2);
      assert(!response.body.includes(".png"));
    }
    rating = NaN;
    const invalid = await server.inject({ url: `/api/users/${userId}/rating` });
    assert.equal(invalid.statusCode, 500);
    assert(!invalid.body.includes("Glicko"));
  } finally {
    await server.close();
  }
});
