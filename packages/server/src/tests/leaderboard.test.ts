import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { readLeaderboardConfig, LEADERBOARD_MIN_RATED_GAMES } from "../leaderboard/config";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { LeaderboardService } from "../services/leaderboardService";
import { leaderboardRoutes } from "../routes/leaderboardRoutes";
import type { LeaderboardRow } from "../repositories/leaderboardRepository";

const defaults = {
  gameMode: "standard",
  status: "qualified",
  page: 1,
  limit: 20,
  sort: "rating",
  order: "desc",
} as const;
test("qualification configuration is centralized, configurable and validated", () => {
  assert.equal(LEADERBOARD_MIN_RATED_GAMES, 5);
  assert.deepEqual(readLeaderboardConfig({}), { minRatedGames: 5 });
  assert.deepEqual(readLeaderboardConfig({ LEADERBOARD_MIN_RATED_GAMES: "9" }), {
    minRatedGames: 9,
  });
  for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", " 5", "2147483648"])
    assert.throws(
      () => readLeaderboardConfig({ LEADERBOARD_MIN_RATED_GAMES: value }),
      /LEADERBOARD_MIN_RATED_GAMES/,
    );
});
test("query defaults and strict bounded whitelist", () => {
  assert.deepEqual(leaderboardQuerySchema.parse({}), defaults);
  for (const query of [
    { page: "0" },
    { page: "banana" },
    { page: "21474837" },
    { limit: "101" },
    { limit: "-1" },
    { sort: "rating;DROP TABLE" },
    { status: "all" },
    { order: "DESC" },
    { extra: "value" },
  ])
    assert.equal(leaderboardQuerySchema.safeParse(query).success, false);
});
const row: LeaderboardRow = {
  userId: "player",
  username: "Tactician",
  displayName: null,
  avatarUrl: null,
  rating: 1584.7281,
  ratingDeviation: 82.31,
  ratedGames: 5,
  ratingRank: 21n,
  ratedResultsCount: 5,
  wins: 3,
  losses: 1,
  draws: 1,
  winRate: 0.6,
  lastActivity: new Date("2026-10-03T10:00:00Z"),
};
test("DTO preserves precise state and canonical rank, hides storage/private fields", async () => {
  let receivedThreshold = 0;
  const service = new LeaderboardService(
    {
      getLeaderboard: async (_query, threshold) => {
        receivedThreshold = threshold;
        return { total: 25, items: [row] };
      },
    },
    { minRatedGames: 5 },
  );
  const result = await service.getLeaderboard({ ...defaults, sort: "winRate", page: 2 });
  assert.equal(receivedThreshold, 5);
  assert.equal(result.items[0].ratingRank, 21);
  assert.equal(result.items[0].rating, row.rating);
  assert.equal(result.items[0].rankTier, "FULL");
  assert.equal(result.items[0].gamesUntilQualified, 0);
  assert.equal(result.items[0].lastActivity, row.lastActivity!.toISOString());
  assert.deepEqual(result.pagination, { page: 2, limit: 20, total: 25, totalPages: 2 });
  assert.doesNotMatch(
    JSON.stringify(result),
    /email|password|volatility|ratedResultsCount|createdAt|token|session/,
  );
});
test("provisional has no ranked placement and partial results are explicitly unavailable", async () => {
  const service = new LeaderboardService(
    {
      getLeaderboard: async () => ({
        total: 1,
        items: [{ ...row, ratedGames: 2, ratedResultsCount: 1 }],
      }),
    },
    { minRatedGames: 5 },
  );
  const {
    items: [player],
  } = await service.getLeaderboard({ ...defaults, status: "provisional" });
  assert.equal(player.status, "PROVISIONAL");
  assert.equal(player.rankTier, "FULL");
  assert.equal(player.ratingRank, null);
  assert.equal(player.gamesUntilQualified, 3);
  assert.equal(player.performanceAvailable, false);
  for (const field of ["wins", "losses", "draws", "winRate", "lastActivity"] as const)
    assert.equal(player[field], null);
});

test("boundary tiers enrich qualified/provisional rows while preserving numeric order", async () => {
  const ratings = [
    2150, 2000, 1999.999, 1850, 1849.999, 1750, 1749.999, 1600, 1599.999, 1100, 1099.999, 700,
    699.999, 350, 349.999,
  ];
  const tiers = [
    "DESTINY",
    "DESTINY",
    "NOVA",
    "NOVA",
    "BLACK_MOON",
    "BLACK_MOON",
    "ECLIPSE",
    "ECLIPSE",
    "FULL",
    "FULL",
    "HALF",
    "HALF",
    "CRESCENT",
    "CRESCENT",
    "SHADOW",
  ];
  for (const ratedGames of [2, 5]) {
    const service = new LeaderboardService(
      {
        getLeaderboard: async () => ({
          total: ratings.length,
          items: ratings.map((rating, i) => ({
            ...row,
            userId: `player-${i}`,
            rating,
            ratedGames,
            ratingRank: BigInt(i + 1),
          })),
        }),
      },
      { minRatedGames: 5 },
    );
    const result = await service.getLeaderboard({
      ...defaults,
      status: ratedGames === 2 ? "provisional" : "qualified",
    });
    assert.deepEqual(
      result.items.map((player) => player.rating),
      ratings,
    );
    assert.deepEqual(
      result.items.map((player) => player.rankTier),
      tiers,
    );
    assert.equal(result.items[0].ratingRank, ratedGames === 2 ? null : 1);
  }
});
test("public read route validates before calling service and sanitizes failures", async () => {
  const app = Fastify();
  let reads = 0;
  await app.register(leaderboardRoutes, {
    prefix: "/api",
    leaderboard: {
      getLeaderboard: async (query) => {
        reads++;
        assert.deepEqual(query, defaults);
        return {
          gameMode: query.gameMode,
          items: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
          qualification: { minRatedGames: 5 },
        };
      },
    },
  });
  try {
    const response = await app.inject({ url: "/api/leaderboard" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().qualification.minRatedGames, 5);
    for (const query of [
      "status=whatever",
      "sort=hacker",
      "sort=rating%3BDROP%20TABLE",
      "page=0",
      "limit=101",
      "order=evil",
      "limit=1.5",
      "page=1&page=2",
    ])
      assert.equal((await app.inject({ url: `/api/leaderboard?${query}` })).statusCode, 400);
    assert.equal(reads, 1);
    assert.equal((await app.inject({ method: "POST", url: "/api/leaderboard" })).statusCode, 404);
  } finally {
    await app.close();
  }
  const failing = Fastify();
  await failing.register(leaderboardRoutes, {
    prefix: "/api",
    leaderboard: {
      getLeaderboard: async () => {
        throw new Error("secret-db-credentials");
      },
    },
  });
  try {
    const response = await failing.inject({ url: "/api/leaderboard" });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /secret-db/);
  } finally {
    await failing.close();
  }
});
