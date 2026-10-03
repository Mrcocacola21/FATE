import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../api/client";
import { createLeaderboardApi, parseLeaderboard } from "../api/leaderboardApi";
import { leaderboardFixture, leaderboardPlayer, provisionalPlayer } from "./fixtures";
import { readLeaderboardQuery } from "./query";
import { setLanguage, translate } from "../i18n";

test("configured qualification text stays Ukrainian when count has no plural variants", () => {
  setLanguage("uk", null);
  try {
    assert.equal(
      translate("leaderboard.policy", { count: 9 }),
      "Гравці потрапляють до основної таблиці після 9 рейтингових матчів.",
    );
    assert.match(
      translate("leaderboard.emptyHint", { count: 9 }),
      /Завершіть 9 рейтингових матчів/,
    );
    assert.equal(
      translate("leaderboard.untilRanked", { count: 3 }),
      "Ще 3 гри до основної таблиці",
    );
  } finally {
    setLanguage("en", null);
  }
});

test("safe leaderboard decoder preserves precision/provisional and strips private extras", () => {
  const fixture = leaderboardFixture();
  const result = parseLeaderboard({
    ...fixture,
    token: "secret",
    items: [
      {
        ...fixture.items[0],
        volatility: 0.06,
        user: { ...fixture.items[0].user, email: "secret", passwordHash: "secret" },
      },
    ],
  });
  assert.equal(result.items[0].rating, 1684.721);
  assert.doesNotMatch(JSON.stringify(result), /secret|email|password|token|volatility/);
  assert.equal(
    parseLeaderboard(leaderboardFixture([provisionalPlayer()])).items[0].ratingRank,
    null,
  );
  const partial = leaderboardPlayer({
    wins: null,
    losses: null,
    draws: null,
    winRate: null,
    lastActivity: null,
    performanceAvailable: false,
  });
  assert.equal(parseLeaderboard(leaderboardFixture([partial])).items[0].winRate, null);
});
test("decoder rejects corrupt numbers, ranks, qualification, activity and contradictory performance", () => {
  for (const patch of [
    { rating: NaN },
    { ratedGames: 0 },
    { ratingDeviation: -1 },
    { ratingRank: null },
    { winRate: 0.99 },
    { lastActivity: "invalid" },
    { gamesUntilQualified: -1 },
    { wins: 30 },
    { status: "PROVISIONAL" },
    { performanceAvailable: false },
  ])
    assert.throws(
      () => parseLeaderboard(leaderboardFixture([leaderboardPlayer(patch as never)])),
      /INVALID_RESPONSE/,
    );
  assert.throws(
    () => parseLeaderboard(leaderboardFixture([{ ...provisionalPlayer(), ratingRank: 1 }])),
    /INVALID_RESPONSE/,
  );
  assert.throws(
    () => parseLeaderboard({ ...leaderboardFixture(), qualification: { minRatedGames: 0 } }),
    /INVALID_RESPONSE/,
  );
  assert.throws(
    () =>
      parseLeaderboard({
        ...leaderboardFixture(),
        pagination: { page: 1, limit: 101, total: 1, totalPages: 1 },
      }),
    /INVALID_RESPONSE/,
  );
});
test("API transmits all bounded filters and URL parser normalizes malformed requests", async () => {
  let path = "";
  const api = createLeaderboardApi(
    createApiClient("http://localhost", async (url) => {
      path = String(url);
      return new Response(JSON.stringify(leaderboardFixture()), { status: 200 });
    }),
  );
  await api.getLeaderboard({
    status: "provisional",
    page: 2,
    limit: 10,
    sort: "winRate",
    order: "asc",
  });
  assert.equal(
    path,
    "http://localhost/api/leaderboard?status=provisional&page=2&limit=10&sort=winRate&order=asc",
  );
  assert.deepEqual(
    readLeaderboardQuery(
      new URLSearchParams("page=banana&limit=999&sort=hacker&status=whatever&order=evil"),
    ),
    { status: "qualified", page: 1, limit: 20, sort: "rating", order: "desc" },
  );
});
