import { API_BASE } from "./config";
import { ApiError, createApiClient, isRecord, type ApiClient } from "./client";
import { leaderboardParams } from "../leaderboard/query";
import { parseRankTier } from "../ranks/rankProgress";
import type {
  LeaderboardPlayer,
  LeaderboardQuery,
  LeaderboardResponse,
} from "../leaderboard/types";

function fail(): never {
  throw new ApiError("INVALID_RESPONSE");
}
function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail();
}
function integer(value: unknown, min = 0): number {
  const result = number(value);
  return Number.isSafeInteger(result) && result >= min ? result : fail();
}
function string(value: unknown): string {
  return typeof value === "string" ? value : fail();
}
function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}
function nullableInteger(value: unknown): number | null {
  return value === null ? null : integer(value);
}

export function parseLeaderboard(value: unknown): LeaderboardResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !isRecord(value.pagination) ||
    !isRecord(value.qualification)
  )
    return fail();
  const minRatedGames = integer(value.qualification.minRatedGames, 1);
  const page = integer(value.pagination.page, 1),
    limit = integer(value.pagination.limit, 1);
  if (limit > 100) return fail();
  const items = value.items.map((item: unknown): LeaderboardPlayer => {
    if (!isRecord(item) || !isRecord(item.user) || typeof item.performanceAvailable !== "boolean")
      return fail();
    const ratedGames = integer(item.ratedGames, 1);
    const qualified = ratedGames >= minRatedGames;
    if (item.status !== (qualified ? "QUALIFIED" : "PROVISIONAL")) return fail();
    const ratingRank = item.ratingRank === null ? null : integer(item.ratingRank, 1);
    if (qualified ? ratingRank === null : ratingRank !== null) return fail();
    const ratingDeviation = number(item.ratingDeviation);
    if (ratingDeviation <= 0) return fail();
    const gamesUntilQualified = integer(item.gamesUntilQualified);
    if (gamesUntilQualified !== Math.max(0, minRatedGames - ratedGames)) return fail();
    const wins = nullableInteger(item.wins),
      losses = nullableInteger(item.losses),
      draws = nullableInteger(item.draws);
    const winRate = item.winRate === null ? null : number(item.winRate);
    const lastActivity = nullableString(item.lastActivity);
    if (lastActivity !== null && !Number.isFinite(Date.parse(lastActivity))) return fail();
    if (item.performanceAvailable) {
      if (
        wins === null ||
        losses === null ||
        draws === null ||
        winRate === null ||
        wins + losses + draws !== ratedGames ||
        Math.abs(winRate - wins / ratedGames) > 1e-12
      )
        return fail();
    } else if (
      wins !== null ||
      losses !== null ||
      draws !== null ||
      winRate !== null ||
      lastActivity !== null
    )
      return fail();
    return {
      ratingRank,
      user: {
        id: string(item.user.id),
        username: string(item.user.username),
        displayName: nullableString(item.user.displayName),
        avatarUrl: nullableString(item.user.avatarUrl),
      },
      rating: number(item.rating),
      rankTier: parseRankTier(item.rankTier),
      ratingDeviation,
      ratedGames,
      wins,
      losses,
      draws,
      winRate,
      lastActivity,
      performanceAvailable: item.performanceAvailable,
      status: qualified ? "QUALIFIED" : "PROVISIONAL",
      gamesUntilQualified,
    };
  });
  const total = integer(value.pagination.total),
    totalPages = integer(value.pagination.totalPages);
  if (totalPages !== Math.ceil(total / limit) || items.length > limit) return fail();
  return {
    items,
    pagination: { page, limit, total, totalPages },
    qualification: { minRatedGames },
  };
}
export function createLeaderboardApi(client: ApiClient) {
  return {
    getLeaderboard: (query: LeaderboardQuery) =>
      client.request(`/api/leaderboard?${leaderboardParams(query)}`, parseLeaderboard),
  };
}
export const leaderboardApi = createLeaderboardApi(createApiClient(API_BASE));
