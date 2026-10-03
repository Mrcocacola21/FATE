import type { ResultOutcome } from "../persistence/matchResult";
import type { StatisticsResultRow } from "../repositories/statisticsRepository";

export interface StatisticsSummaryDTO {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Fraction in [0, 1]; draws are included in the denominator. */
  winRate: number;
  averageDurationMs: number | null;
  durationSampleSize: number;
  averageTurns: number | null;
  turnCountSampleSize: number;
}

export interface StatisticsStreaksDTO {
  currentStreak: { type: ResultOutcome | null; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface PlayerStatisticsDTO {
  userId: string;
  overall: StatisticsSummaryDTO & StatisticsStreaksDTO;
  byGameMode: (StatisticsSummaryDTO & { gameMode: string })[];
}

export type CompletedStatisticsResult = StatisticsResultRow & {
  outcome: ResultOutcome;
  match: { finishedAt: Date };
};

/** Same outcome source as Match History; no fallback to winner fields or names. */
export function isCompletedStatisticsResult(
  row: StatisticsResultRow,
): row is CompletedStatisticsResult {
  return (
    (row.outcome === "WIN" || row.outcome === "LOSS" || row.outcome === "DRAW") &&
    row.match.finishedAt !== null &&
    Number.isFinite(row.match.finishedAt.getTime()) &&
    row.match.gameMode.trim().length > 0
  );
}

function isValidSample(value: number | null, minimum: number): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= minimum;
}

export function calculateSummary(rows: readonly CompletedStatisticsResult[]): StatisticsSummaryDTO {
  let wins = 0,
    losses = 0,
    draws = 0;
  let durationTotal = 0,
    durationSampleSize = 0,
    turnsTotal = 0,
    turnCountSampleSize = 0;
  for (const row of rows) {
    if (row.outcome === "WIN") wins++;
    else if (row.outcome === "LOSS") losses++;
    else draws++;
    if (isValidSample(row.match.durationMs, 0)) {
      durationTotal += row.match.durationMs;
      durationSampleSize++;
    }
    // The persisted counter includes the terminal battle turn and starts at 1.
    if (isValidSample(row.match.turnCount, 1)) {
      turnsTotal += row.match.turnCount;
      turnCountSampleSize++;
    }
  }
  return {
    gamesPlayed: rows.length,
    wins,
    losses,
    draws,
    winRate: rows.length ? wins / rows.length : 0,
    averageDurationMs: durationSampleSize ? durationTotal / durationSampleSize : null,
    durationSampleSize,
    averageTurns: turnCountSampleSize
      ? Number((turnsTotal / turnCountSampleSize).toFixed(2))
      : null,
    turnCountSampleSize,
  };
}

/** Input is eligible history in finishedAt ASC, match id ASC order. */
export function calculateStreaks(rows: readonly CompletedStatisticsResult[]): StatisticsStreaksDTO {
  const currentStreak: StatisticsStreaksDTO["currentStreak"] = { type: null, count: 0 };
  let longestWinStreak = 0,
    longestLossStreak = 0;
  for (const { outcome } of rows) {
    if (currentStreak.type === outcome) currentStreak.count++;
    else {
      currentStreak.type = outcome;
      currentStreak.count = 1;
    }
    if (outcome === "WIN") longestWinStreak = Math.max(longestWinStreak, currentStreak.count);
    if (outcome === "LOSS") longestLossStreak = Math.max(longestLossStreak, currentStreak.count);
  }
  return { currentStreak, longestWinStreak, longestLossStreak };
}

export function groupByGameMode(
  rows: readonly CompletedStatisticsResult[],
): PlayerStatisticsDTO["byGameMode"] {
  const groups = new Map<string, CompletedStatisticsResult[]>();
  for (const row of rows) {
    const mode = row.match.gameMode;
    const group = groups.get(mode);
    if (group) group.push(row);
    else groups.set(mode, [row]);
  }
  return [...groups]
    .map(([gameMode, results]) => ({ gameMode, ...calculateSummary(results) }))
    .sort(
      (a, b) =>
        b.gamesPlayed - a.gamesPlayed ||
        (a.gameMode < b.gameMode ? -1 : a.gameMode > b.gameMode ? 1 : 0),
    );
}
