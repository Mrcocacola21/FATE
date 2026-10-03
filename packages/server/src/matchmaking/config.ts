import { ProductionConfigurationError } from "../config";

export interface MatchmakingConfig {
  initialRange: number;
  rangeStep: number;
  stepMs: number;
  maxRange: number;
  tickMs: number;
  disconnectGraceMs: number;
}
export function readMatchmakingConfig(env: NodeJS.ProcessEnv = process.env): MatchmakingConfig {
  if (env.MATCHMAKING_SERVER_PROCESSES !== undefined && env.MATCHMAKING_SERVER_PROCESSES !== "1")
    throw new ProductionConfigurationError("Rated matchmaking requires one active server process");
  const read = (key: string, fallback: number, minimum: number) => {
    const raw = env[key];
    const value = raw === undefined ? fallback : Number(raw);
    if (
      (raw !== undefined && !/^\d+$/.test(raw)) ||
      !Number.isSafeInteger(value) ||
      value < minimum ||
      value > 2147483647
    )
      throw new ProductionConfigurationError(`Invalid matchmaking configuration: ${key}`);
    return value;
  };
  const config = {
    initialRange: read("MATCHMAKING_INITIAL_RATING_RANGE", 100, 0),
    rangeStep: read("MATCHMAKING_RATING_RANGE_STEP", 50, 1),
    stepMs: read("MATCHMAKING_RANGE_STEP_SECONDS", 15, 1) * 1000,
    maxRange: read("MATCHMAKING_MAX_RATING_RANGE", 400, 0),
    tickMs: 1000,
    disconnectGraceMs: read("RECONNECT_GRACE_MS", 45000, 0),
  };
  if (config.maxRange < config.initialRange || config.stepMs > 2147483647)
    throw new ProductionConfigurationError(
      "Matchmaking maximum must cover the initial range and interval must fit a timer",
    );
  return config;
}
export function getAllowedRatingRange(waitMs: number, config: MatchmakingConfig): number {
  return Math.min(
    config.maxRange,
    config.initialRange + Math.floor(Math.max(0, waitMs) / config.stepMs) * config.rangeStep,
  );
}
