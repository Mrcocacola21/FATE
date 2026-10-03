import { API_BASE } from "./config";
import { ApiError, createApiClient, isRecord, type ApiClient } from "./client";
import type { PlayerStatistics, StatisticsSummary, StatisticsStreak } from "../statistics/types";

function fail(): never {
  throw new ApiError("INVALID_RESPONSE");
}

function number(value: unknown, integer = false): number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    (!integer || Number.isSafeInteger(value))
    ? value
    : fail();
}

function average(value: unknown): number | null {
  return value === null ? null : number(value);
}

function summary(value: unknown): StatisticsSummary {
  if (!isRecord(value)) return fail();
  const winRate = number(value.winRate);
  if (winRate > 1) return fail();
  return {
    gamesPlayed: number(value.gamesPlayed, true),
    wins: number(value.wins, true),
    losses: number(value.losses, true),
    draws: number(value.draws, true),
    winRate,
    averageDurationMs: average(value.averageDurationMs),
    durationSampleSize: number(value.durationSampleSize, true),
    averageTurns: average(value.averageTurns),
    turnCountSampleSize: number(value.turnCountSampleSize, true),
  };
}

function streak(value: unknown): StatisticsStreak {
  if (!isRecord(value)) return fail();
  const type = value.type;
  if (type !== null && type !== "WIN" && type !== "LOSS" && type !== "DRAW") return fail();
  const count = number(value.count, true);
  if ((type === null) !== (count === 0)) return fail();
  return { type, count };
}

export function parsePlayerStatistics(value: unknown): PlayerStatistics {
  if (
    !isRecord(value) ||
    typeof value.userId !== "string" ||
    !isRecord(value.overall) ||
    !Array.isArray(value.byGameMode)
  )
    return fail();
  return {
    userId: value.userId,
    overall: {
      ...summary(value.overall),
      currentStreak: streak(value.overall.currentStreak),
      longestWinStreak: number(value.overall.longestWinStreak, true),
      longestLossStreak: number(value.overall.longestLossStreak, true),
    },
    byGameMode: value.byGameMode.map((mode: unknown) => {
      if (!isRecord(mode) || typeof mode.gameMode !== "string" || !mode.gameMode.trim())
        return fail();
      return { ...summary(mode), gameMode: mode.gameMode };
    }),
  };
}

export function createStatisticsApi(client: ApiClient) {
  return {
    getPlayerStatistics: (userId: string) =>
      client.request(`/api/users/${encodeURIComponent(userId)}/statistics`, (value) => {
        const data = parsePlayerStatistics(value);
        return data.userId === userId ? data : fail();
      }),
  };
}

// The endpoint is public; viewing another player never initializes an authenticated session.
export const statisticsApi = createStatisticsApi(createApiClient(API_BASE));
