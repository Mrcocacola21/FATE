import type { PlayerStatistics } from "./types";
import type { MatchHistoryResponse } from "../matches/types";

/** Deterministic fixtures shared by component tests; never imported by production UI. */
export function statisticsFixture(userId = "player-a"): PlayerStatistics {
  const summary = {
    gamesPlayed: 10,
    wins: 6,
    losses: 4,
    draws: 0,
    winRate: 0.6,
    averageDurationMs: 900000,
    durationSampleSize: 8,
    averageTurns: 18.5,
    turnCountSampleSize: 6,
  };
  return {
    userId,
    overall: {
      ...summary,
      currentStreak: { type: "WIN", count: 4 },
      longestWinStreak: 4,
      longestLossStreak: 2,
    },
    byGameMode: [{ ...summary, gameMode: "classic" }],
  };
}

export function emptyStatisticsFixture(userId = "player-a"): PlayerStatistics {
  return {
    userId,
    overall: {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      averageDurationMs: null,
      durationSampleSize: 0,
      averageTurns: null,
      turnCountSampleSize: 0,
      currentStreak: { type: null, count: 0 },
      longestWinStreak: 0,
      longestLossStreak: 0,
    },
    byGameMode: [],
  };
}

export const recentFixture: MatchHistoryResponse = {
  items: ["LOSS", "DRAW", "WIN"].map((result, index) => ({
    id: `match-${index}`,
    status: "FINISHED",
    gameMode: "classic",
    result: result as "WIN" | "LOSS" | "DRAW",
    seat: "P1",
    createdAt: `2026-09-0${3 - index}T10:00:00Z`,
    startedAt: null,
    finishedAt: `2026-09-0${3 - index}T10:15:00Z`,
    durationMs: 900000,
    finishReason: null,
    finalRevision: 18,
    turnCount: 18,
    opponent: {
      userId: "opponent",
      seat: "P2",
      displayName: "Historical opponent",
      username: "Opponent",
      avatarUrl: null,
    },
  })),
  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
};
