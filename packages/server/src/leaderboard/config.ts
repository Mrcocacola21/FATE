import { ProductionConfigurationError } from "../config";

export const LEADERBOARD_MIN_RATED_GAMES = 5;
export interface LeaderboardConfig {
  minRatedGames: number;
}

export function readLeaderboardConfig(env: NodeJS.ProcessEnv = process.env): LeaderboardConfig {
  const raw = env.LEADERBOARD_MIN_RATED_GAMES;
  if (raw === undefined) return { minRatedGames: LEADERBOARD_MIN_RATED_GAMES };
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2147483647)
    throw new ProductionConfigurationError(
      "LEADERBOARD_MIN_RATED_GAMES must be an integer between 1 and 2147483647",
    );
  return { minRatedGames: Number(raw) };
}
