import type { LeaderboardPlayer, LeaderboardResponse } from "./types";
export function leaderboardPlayer(overrides: Partial<LeaderboardPlayer> = {}): LeaderboardPlayer {
  return {
    ratingRank: 1,
    user: {
      id: "leader",
      username: "Tactician",
      displayName: "Established player",
      avatarUrl: null,
    },
    rating: 1684.721,
    ratingDeviation: 65.43,
    ratedGames: 10,
    wins: 6,
    losses: 3,
    draws: 1,
    winRate: 0.6,
    lastActivity: "2026-10-03T08:00:00Z",
    performanceAvailable: true,
    status: "QUALIFIED",
    gamesUntilQualified: 0,
    ...overrides,
  };
}
export function leaderboardFixture(items = [leaderboardPlayer()]): LeaderboardResponse {
  return {
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: items.length ? 1 : 0 },
    qualification: { minRatedGames: 5 },
  };
}
export function provisionalPlayer(): LeaderboardPlayer {
  return leaderboardPlayer({
    ratingRank: null,
    ratedGames: 2,
    wins: 2,
    losses: 0,
    draws: 0,
    winRate: 1,
    ratingDeviation: 280,
    status: "PROVISIONAL",
    gamesUntilQualified: 3,
  });
}
