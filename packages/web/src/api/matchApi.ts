import { API_BASE } from "./config";
import { ApiError, createApiClient, isRecord, type ApiClient } from "./client";
import type {
  MatchDetails,
  MatchHistoryFilters,
  MatchHistoryResponse,
  MatchIdentity,
  MatchMetadata,
  MatchOpponent,
  MatchOutcome,
} from "../matches/types";

function fail(): never {
  throw new ApiError("INVALID_RESPONSE");
}
function string(value: unknown): string {
  return typeof value === "string" ? value : fail();
}
function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}
function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fail();
}
function nullableInteger(value: unknown): number | null {
  return value === null ? null : integer(value);
}
function date(value: unknown): string {
  const result = string(value);
  return Number.isFinite(Date.parse(result)) ? result : fail();
}
function nullableDate(value: unknown): string | null {
  return value === null ? null : date(value);
}
function seat(value: unknown): "P1" | "P2" {
  return value === "P1" || value === "P2" ? value : fail();
}
function outcome(value: unknown): MatchOutcome | null {
  return value === null || value === "WIN" || value === "LOSS" || value === "DRAW" ? value : fail();
}
function identity(value: unknown): MatchIdentity {
  if (!isRecord(value)) return fail();
  return {
    userId: nullableString(value.userId),
    seat: seat(value.seat),
    displayName: string(value.displayName),
  };
}
function opponent(value: unknown): MatchOpponent {
  if (!isRecord(value)) return fail();
  return {
    ...identity(value),
    username: nullableString(value.username ?? null),
    avatarUrl: nullableString(value.avatarUrl ?? null),
  };
}
function metadata(value: unknown): MatchMetadata {
  if (!isRecord(value) || value.status !== "FINISHED") return fail();
  return {
    id: string(value.id),
    status: "FINISHED",
    gameMode: string(value.gameMode),
    createdAt: date(value.createdAt),
    startedAt: nullableDate(value.startedAt),
    finishedAt: nullableDate(value.finishedAt),
    durationMs: nullableInteger(value.durationMs),
    finishReason: nullableString(value.finishReason),
    finalRevision: nullableInteger(value.finalRevision),
    turnCount: nullableInteger(value.turnCount),
  };
}
export function parseMatchHistory(value: unknown): MatchHistoryResponse {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)) return fail();
  const pagination = value.pagination;
  const page = integer(pagination.page),
    limit = integer(pagination.limit);
  if (page < 1 || limit < 1 || limit > 100) return fail();
  return {
    items: value.items.map((item: unknown) => {
      if (!isRecord(item)) return fail();
      return {
        ...metadata(item),
        seat: seat(item.seat),
        result: outcome(item.result),
        opponent: item.opponent === null ? null : opponent(item.opponent),
      };
    }),
    pagination: {
      page,
      limit,
      total: integer(pagination.total),
      totalPages: integer(pagination.totalPages),
    },
  };
}
export function parseMatchDetails(value: unknown): MatchDetails {
  if (!isRecord(value) || !Array.isArray(value.participants)) return fail();
  return {
    ...metadata(value),
    winner: value.winner === null ? null : identity(value.winner),
    loser: value.loser === null ? null : identity(value.loser),
    participants: value.participants.map((p: unknown) => {
      if (!isRecord(p)) return fail();
      return { ...opponent(p), outcome: outcome(p.outcome) };
    }),
  };
}
export function createMatchApi(client: ApiClient) {
  return {
    getUserMatches(userId: string, filters: MatchHistoryFilters) {
      const query = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.result) query.set("result", filters.result);
      if (filters.gameMode) query.set("gameMode", filters.gameMode);
      return client.request(
        `/api/users/${encodeURIComponent(userId)}/matches?${query}`,
        parseMatchHistory,
      );
    },
    getMatchDetails: (id: string) =>
      client.request(`/api/matches/${encodeURIComponent(id)}`, parseMatchDetails),
  };
}
export const matchApi = createMatchApi(createApiClient(API_BASE));
