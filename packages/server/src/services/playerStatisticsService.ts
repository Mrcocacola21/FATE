import { getLogger } from "../observability/logger";
import { AuthError } from "../auth/authErrors";
import type { StatisticsRepository } from "../repositories/statisticsRepository";
import {
  calculateSummary,
  calculateStreaks,
  groupByGameMode,
  isCompletedStatisticsResult,
  type PlayerStatisticsDTO,
} from "../statistics/playerStatistics";

export class PlayerStatisticsService {
  constructor(
    private readonly statistics: Pick<StatisticsRepository, "userExists" | "findFinishedResults">,
    private readonly logger: { warn(data: object, message: string): void } = getLogger(),
  ) {}

  async getPlayerStatistics(userId: string): Promise<PlayerStatisticsDTO> {
    if (!(await this.statistics.userExists(userId))) throw new AuthError("USER_NOT_FOUND");
    const history = await this.statistics.findFinishedResults(userId);
    const eligible = history.filter(isCompletedStatisticsResult);
    if (eligible.length !== history.length) {
      this.logger.warn(
        {
          event: "statistics:invalid_history",
          userId,
          excludedMatches: history.length - eligible.length,
        },
        "Statistics excluded finished rows without a valid outcome, completion date or game mode",
      );
    }
    return {
      userId,
      overall: { ...calculateSummary(eligible), ...calculateStreaks(eligible) },
      byGameMode: groupByGameMode(eligible),
    };
  }
}
