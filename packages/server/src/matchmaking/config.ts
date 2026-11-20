import { ProductionConfigurationError } from "../config";

export interface MatchmakingConfig {
  initialRange: number;
  rangeStep: number;
  stepMs: number;
  maxRange: number;
  tickMs: number;
  disconnectGraceMs: number;
  /** Time both players have to accept a found match. 0 pairs them straight away. */
  acceptMs: number;
  /** Search bans for missed or declined matches, growing with each miss inside the window. */
  penaltyMs: number[];
  penaltyWindowMs: number;
  /** Casual: a milder ban ladder, and the wait after which any rating gap is accepted. */
  casualPenaltyMs: number[];
  casualOpenMs: number;
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
    disconnectGraceMs: read("LOBBY_RECONNECT_GRACE_MS", 45000, 0),
    acceptMs: read("MATCHMAKING_ACCEPT_SECONDS", 20, 0) * 1000,
    penaltyMs: readSteps(env.MATCHMAKING_PENALTY_SECONDS, [60, 300, 900]).map((s) => s * 1000),
    penaltyWindowMs: read("MATCHMAKING_PENALTY_WINDOW_HOURS", 24, 1) * 3600000,
    casualPenaltyMs: readSteps(
      env.MATCHMAKING_CASUAL_PENALTY_SECONDS,
      [30, 150, 450],
      "MATCHMAKING_CASUAL_PENALTY_SECONDS",
    ).map((s) => s * 1000),
    casualOpenMs: read("MATCHMAKING_CASUAL_OPEN_SECONDS", 30, 0) * 1000,
  };
  if (config.maxRange < config.initialRange || config.stepMs > 2147483647)
    throw new ProductionConfigurationError(
      "Matchmaking maximum must cover the initial range and interval must fit a timer",
    );
  return config;
}
function readSteps(
  raw: string | undefined,
  fallback: number[],
  key = "MATCHMAKING_PENALTY_SECONDS",
): number[] {
  if (raw === undefined) return fallback;
  const steps = raw.split(",").map((part) => part.trim());
  if (!steps.length || steps.some((step) => !/^\d+$/.test(step) || Number(step) > 86400))
    throw new ProductionConfigurationError(`Invalid matchmaking configuration: ${key}`);
  return steps.map(Number);
}
export function getAllowedRatingRange(
  waitMs: number,
  config: MatchmakingConfig,
  matchType: "RATED" | "CASUAL" = "RATED",
): number {
  // Casual search starts twice as wide and, after a while, takes anyone free.
  if (matchType === "CASUAL")
    return waitMs >= config.casualOpenMs
      ? Number.MAX_SAFE_INTEGER
      : Math.max(config.maxRange, getAllowedRatingRange(waitMs, config) * 2);
  return Math.min(
    config.maxRange,
    config.initialRange + Math.floor(Math.max(0, waitMs) / config.stepMs) * config.rangeStep,
  );
}
