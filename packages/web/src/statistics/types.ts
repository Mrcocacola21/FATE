import type { MatchOutcome } from "../matches/types";

/** Public Phase 13 DTO. Rates are fractions; averages use only their tracked samples. */
export interface StatisticsSummary {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  averageDurationMs: number | null;
  durationSampleSize: number;
  averageTurns: number | null;
  turnCountSampleSize: number;
}

export interface StatisticsStreak {
  type: MatchOutcome | null;
  count: number;
}

export interface OverallStatistics extends StatisticsSummary {
  currentStreak: StatisticsStreak;
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface GameModeStatistics extends StatisticsSummary {
  gameMode: string;
}

export interface PlayerStatistics {
  userId: string;
  overall: OverallStatistics;
  byGameMode: GameModeStatistics[];
}
