import type { LeaderboardConfig } from "../leaderboard/config";
import type { LeaderboardQuery } from "../leaderboard/querySchema";
import type { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { getRatingTier } from "../rating/rankTiers";

export class LeaderboardService {
  constructor(
    private readonly repository: Pick<LeaderboardRepository, "getLeaderboard">,
    private readonly configuration: LeaderboardConfig,
  ) {}

  async getLeaderboard(query: LeaderboardQuery) {
    const { minRatedGames } = this.configuration;
    const { total, items } = await this.repository.getLeaderboard(query, minRatedGames);
    return {
      items: items.map((row) => {
        const qualified = row.ratedGames >= minRatedGames;
        const performanceAvailable = row.ratedResultsCount === row.ratedGames;
        return {
          ratingRank: qualified ? Number(row.ratingRank) : null,
          user: {
            id: row.userId,
            username: row.username,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
          },
          rating: row.rating,
          rankTier: getRatingTier(row.rating),
          ratingDeviation: row.ratingDeviation,
          ratedGames: row.ratedGames,
          wins: performanceAvailable ? row.wins : null,
          losses: performanceAvailable ? row.losses : null,
          draws: performanceAvailable ? row.draws : null,
          winRate: performanceAvailable ? row.winRate : null,
          // Missing/deleted results must not claim to represent the latest career activity.
          lastActivity: performanceAvailable ? (row.lastActivity?.toISOString() ?? null) : null,
          performanceAvailable,
          status: qualified ? ("QUALIFIED" as const) : ("PROVISIONAL" as const),
          gamesUntilQualified: Math.max(0, minRatedGames - row.ratedGames),
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      qualification: { minRatedGames },
    };
  }
}
