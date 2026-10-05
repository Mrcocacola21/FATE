import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ResultOutcome } from '../../persistence/matchResult';
import { calculateStreaks, calculateSummary, groupByGameMode, isCompletedStatisticsResult, type CompletedStatisticsResult } from '../../statistics/playerStatistics';
function result(
  outcome: ResultOutcome,
  mode = "standard",
  duration: number | null = null,
  turns: number | null = null,
): CompletedStatisticsResult {
  return {
    outcome,
    match: {
      id: randomUUID(),
      gameMode: mode,
      finishedAt: new Date("2026-01-01T00:00:00Z"),
      durationMs: duration,
      turnCount: turns,
    },
  };
}

export function testStatisticsCalculations() {
  assert.deepEqual(calculateSummary([]), {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    averageDurationMs: null,
    durationSampleSize: 0,
    averageTurns: null,
    turnCountSampleSize: 0,
  });
  const rows = [
    result("WIN", "classic", 1000, 10),
    result("LOSS", "classic"),
    result("WIN", "classic", 3000, 20),
    result("WIN", "classic"),
    result("LOSS", "classic"),
  ];
  assert.deepEqual(calculateSummary(rows), {
    gamesPlayed: 5,
    wins: 3,
    losses: 2,
    draws: 0,
    winRate: 0.6,
    averageDurationMs: 2000,
    durationSampleSize: 2,
    averageTurns: 15,
    turnCountSampleSize: 2,
  });
  assert.equal(calculateSummary([...rows, result("DRAW")]).winRate, 0.5);
  assert.equal(calculateSummary([...rows, result("DRAW")]).draws, 1);
  assert.equal(calculateSummary([result("WIN", "standard", 0, 1)]).averageDurationMs, 0);
  const corruptSamples = [
    result("WIN", "standard", -1, 0),
    result("LOSS", "standard", NaN, -3),
    result("DRAW", "standard", Infinity, 1.5),
  ];
  assert.equal(calculateSummary(corruptSamples).averageDurationMs, null);
  assert.equal(calculateSummary(corruptSamples).averageTurns, null);
  assert.equal(
    calculateSummary([
      result("WIN", "standard", null, 17),
      result("WIN", "standard", null, 17),
      result("WIN", "standard", null, 18),
    ]).averageTurns,
    17.33,
  );
  assert.deepEqual(calculateStreaks([]), {
    currentStreak: { type: null, count: 0 },
    longestWinStreak: 0,
    longestLossStreak: 0,
  });
  assert.deepEqual(calculateStreaks([result("LOSS")]), {
    currentStreak: { type: "LOSS", count: 1 },
    longestWinStreak: 0,
    longestLossStreak: 1,
  });
  const sequence: ResultOutcome[] = [
    "WIN",
    "WIN",
    "LOSS",
    "LOSS",
    "LOSS",
    "WIN",
    "WIN",
    "WIN",
    "WIN",
  ];
  assert.deepEqual(calculateStreaks(sequence.map((outcome) => result(outcome))), {
    currentStreak: { type: "WIN", count: 4 },
    longestWinStreak: 4,
    longestLossStreak: 3,
  });
  assert.deepEqual(
    calculateStreaks(
      ["WIN", "LOSS", "WIN", "LOSS"].map((outcome) => result(outcome as ResultOutcome)),
    ),
    { currentStreak: { type: "LOSS", count: 1 }, longestWinStreak: 1, longestLossStreak: 1 },
  );
  assert.deepEqual(
    calculateStreaks([
      result("WIN"),
      result("DRAW"),
      result("WIN"),
      result("LOSS"),
      result("DRAW"),
      result("DRAW"),
    ]),
    { currentStreak: { type: "DRAW", count: 2 }, longestWinStreak: 1, longestLossStreak: 1 },
  );
  const modes = [
    result("WIN", "classic", 1000, 10),
    result("WIN", "classic"),
    result("WIN", "classic", 3000, 20),
    result("LOSS", "classic"),
    result("WIN", "standard", 4000, 20),
    result("LOSS", "standard"),
    result("LOSS", "standard", 2000, 10),
  ];
  const groups = groupByGameMode(modes);
  assert.deepEqual(groups, [
    {
      gameMode: "classic",
      gamesPlayed: 4,
      wins: 3,
      losses: 1,
      draws: 0,
      winRate: 0.75,
      averageDurationMs: 2000,
      durationSampleSize: 2,
      averageTurns: 15,
      turnCountSampleSize: 2,
    },
    {
      gameMode: "standard",
      gamesPlayed: 3,
      wins: 1,
      losses: 2,
      draws: 0,
      winRate: 1 / 3,
      averageDurationMs: 3000,
      durationSampleSize: 2,
      averageTurns: 15,
      turnCountSampleSize: 2,
    },
  ]);
  assert.equal(
    groups.reduce((total, group) => total + group.gamesPlayed, 0),
    modes.length,
  );
  assert.deepEqual(
    groupByGameMode([result("WIN", "standard"), result("WIN", "classic")]).map(
      (group) => group.gameMode,
    ),
    ["classic", "standard"],
  );
  assert.equal(isCompletedStatisticsResult({ ...rows[0], outcome: null }), false);
  assert.equal(
    isCompletedStatisticsResult({ ...rows[0], match: { ...rows[0].match, finishedAt: null } }),
    false,
  );
  assert.equal(
    isCompletedStatisticsResult({
      ...rows[0],
      match: { ...rows[0].match, finishedAt: new Date(NaN) },
    }),
    false,
  );
  assert.equal(
    isCompletedStatisticsResult({ ...rows[0], match: { ...rows[0].match, gameMode: " " } }),
    false,
  );

 return rows;
}
