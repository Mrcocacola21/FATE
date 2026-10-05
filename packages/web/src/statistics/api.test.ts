import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient } from "../api/client";
import { createStatisticsApi, parsePlayerStatistics } from "../api/statisticsApi";
import { statisticsFixture, emptyStatisticsFixture, recentFixture } from "./fixtures";
import { formatNumber, formatWinRate, recentResults, recentWinTrend } from "./presentation";

test("statistics decoder matches the backend DTO and does not invent hero or loadout data", () => {
  const fixture = statisticsFixture();
  assert.deepEqual(parsePlayerStatistics(fixture), fixture);
  assert.deepEqual(parsePlayerStatistics(emptyStatisticsFixture()), emptyStatisticsFixture());
  assert.deepEqual(
    parsePlayerStatistics({ ...fixture, byHero: null, loadouts: [], privateField: "hidden" }),
    fixture,
  );
  for (const overall of [
    { ...fixture.overall, winRate: 60 },
    { ...fixture.overall, averageTurns: NaN },
    { ...fixture.overall, gamesPlayed: 1.5 },
    { ...fixture.overall, draws: -1 },
    { ...fixture.overall, averageDurationMs: undefined },
    { ...fixture.overall, currentStreak: { type: "INVALID", count: 3 } },
    { ...fixture.overall, currentStreak: { type: null, count: 3 } },
    { ...fixture.overall, durationSampleSize: Infinity },
  ])
    assert.throws(() => parsePlayerStatistics({ ...fixture, overall }), /INVALID_RESPONSE/);
  assert.throws(() => parsePlayerStatistics({ ...fixture, byGameMode: [{}] }), /INVALID_RESPONSE/);
});

test("public statistics client requests the target id, validates ownership and preserves sanitized errors", async () => {
  let requested = "";
  let headers!: Headers;
  const id = "player/id";
  const fixture = statisticsFixture(id);
  const api = createStatisticsApi(
    createApiClient("http://localhost", async (path, options) => {
      requested = String(path);
      headers = new Headers(options?.headers);
      return Response.json(fixture);
    }),
  );
  assert.deepEqual(await api.getPlayerStatistics(id), fixture);
  assert.equal(requested, "http://localhost/api/users/player%2Fid/statistics");
  assert.equal(headers.has("Authorization"), false);
  await assert.rejects(api.getPlayerStatistics("someone-else"), /INVALID_RESPONSE/);
  const failing = createStatisticsApi(
    createApiClient("http://localhost", async () =>
      Response.json({ error: { code: "USER_NOT_FOUND", message: "User not found." } }, { status: 404 }),
    ),
  );
  await assert.rejects(
    failing.getPlayerStatistics("missing"),
    (error: unknown) =>
      error instanceof ApiError &&
      error.code === "USER_NOT_FOUND" &&
      error.status === 404 &&
      error.message === "User not found.",
  );
});

test("formatting preserves null, percentages, integer counts and fractional averages", () => {
  assert.equal(formatWinRate(0.6, "en"), "60%");
  assert.equal(formatWinRate(0.625, "en"), "62.5%");
  assert.equal(formatNumber(10, "en"), "10");
  assert.equal(formatNumber(18.5, "en", 2), "18.5");
  assert.equal(formatNumber(null, "en", 2), "—");
  assert.match(formatWinRate(0.625, "uk"), /62,5/);
});

test("recent chart is chronological, uses draws in the sample denominator and excludes unknown results", () => {
  const items = recentResults([
    ...recentFixture.items,
    { ...recentFixture.items[0], id: "unknown", result: null },
  ]);
  assert.deepEqual(
    items.map((item) => item.result),
    ["WIN", "DRAW", "LOSS"],
  );
  assert.deepEqual(recentWinTrend(items), [1, 0.5, 1 / 3]);
  assert.deepEqual(
    recentFixture.items.map((item) => item.result),
    ["LOSS", "DRAW", "WIN"],
  );
});
