import { ApiError, isRecord } from "./client";
import { authClient } from "../auth/authStore";
import { isGameModeId } from "../modes/modeLabels";
import type { MatchmakingStatus, QueueMatchType } from "../matchmaking/types";
import type { GameModeId } from "rules";
import { isSealId } from "../../../rules/src/cosmetics/seals";

export function parseMatchmakingStatus(value: unknown): MatchmakingStatus {
  const fail = (): never => {
    throw new ApiError("INVALID_RESPONSE");
  };
  if (!isRecord(value)) return fail();
  if (value.revision !== undefined) {
    if (
      typeof value.revision !== "number" ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    )
      return fail();
    const { revision, ...status } = value;
    return { ...parseMatchmakingStatus(status), revision };
  }
  const date = (field: unknown) => {
    if (field === undefined) return undefined;
    if (typeof field !== "string" || !Number.isFinite(Date.parse(field))) return fail();
    return field;
  };
  if (value.status === "NOT_QUEUED") {
    const penaltyUntil = date(value.penaltyUntil);
    const casualPenaltyUntil = date(value.casualPenaltyUntil);
    return {
      status: "NOT_QUEUED",
      ...(penaltyUntil ? { penaltyUntil } : {}),
      ...(casualPenaltyUntil ? { casualPenaltyUntil } : {}),
    };
  }
  if (!isGameModeId(value.gameMode)) return fail();
  // Servers from before the Casual queue only ever searched for Rated matches.
  const matchType: QueueMatchType =
    value.matchType === undefined
      ? "RATED"
      : value.matchType === "CASUAL"
        ? "CASUAL"
        : value.matchType === "RATED"
          ? "RATED"
          : fail();
  if (value.status === "MATCH_PROPOSED") {
    if (
      typeof value.joinedAt !== "string" ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      typeof value.acceptMs !== "number" ||
      !Number.isFinite(value.acceptMs) ||
      typeof value.accepted !== "boolean" ||
      typeof value.opponentAccepted !== "boolean"
    )
      return fail();
    return {
      status: "MATCH_PROPOSED",
      joinedAt: value.joinedAt,
      gameMode: value.gameMode,
      matchType,
      expiresAt: value.expiresAt,
      acceptMs: value.acceptMs,
      accepted: value.accepted,
      opponentAccepted: value.opponentAccepted,
    };
  }
  if (value.status === "MATCH_FOUND") {
    if (
      typeof value.matchId !== "string" ||
      !value.matchId ||
      typeof value.roomId !== "string" ||
      !value.roomId ||
      !["P1", "P2"].includes(String(value.seat)) ||
      !isRecord(value.opponent) ||
      typeof value.opponent.displayName !== "string"
    )
      return fail();
    return {
      status: "MATCH_FOUND",
      matchId: value.matchId,
      roomId: value.roomId,
      seat: value.seat as "P1" | "P2",
      matchType,
      gameMode: value.gameMode,
      opponent: {
        displayName: value.opponent.displayName,
        // Older servers do not send it, and a retired seal reads as the default.
        seal: isSealId(value.opponent.seal) ? value.opponent.seal : null,
      },
    };
  }
  if (
    (value.status !== "QUEUED" && value.status !== "MATCHING") ||
    typeof value.joinedAt !== "string" ||
    !Number.isFinite(Date.parse(value.joinedAt)) ||
    typeof value.waitMs !== "number" ||
    !Number.isFinite(value.waitMs) ||
    value.waitMs < 0 ||
    typeof value.rating !== "number" ||
    !Number.isFinite(value.rating) ||
    typeof value.currentRange !== "number" ||
    !Number.isFinite(value.currentRange) ||
    value.currentRange < 0 ||
    typeof value.available !== "boolean"
  )
    return fail();
  return {
    status: value.status,
    joinedAt: value.joinedAt,
    waitMs: value.waitMs,
    rating: value.rating,
    currentRange: value.currentRange,
    gameMode: value.gameMode,
    matchType,
    available: value.available,
  };
}
export const matchmakingApi = {
  status: () => authClient.request("/api/matchmaking/queue", parseMatchmakingStatus),
  join: (gameMode: GameModeId, matchType: QueueMatchType = "RATED") =>
    authClient.request("/api/matchmaking/queue", parseMatchmakingStatus, {
      method: "POST",
      body: JSON.stringify({ gameMode, matchType }),
    }),
  cancel: () =>
    authClient.request("/api/matchmaking/queue", parseMatchmakingStatus, { method: "DELETE" }),
  accept: () =>
    authClient.request("/api/matchmaking/accept", parseMatchmakingStatus, { method: "POST" }),
  decline: () =>
    authClient.request("/api/matchmaking/decline", parseMatchmakingStatus, { method: "POST" }),
  rating: (id: string, gameMode: GameModeId) =>
    authClient.request(
      `/api/users/${encodeURIComponent(id)}/rating?gameMode=${gameMode}`,
      (value) => {
        if (!isRecord(value) || typeof value.rating !== "number" || !Number.isFinite(value.rating))
          throw new ApiError("INVALID_RESPONSE");
        return value.rating;
      },
    ),
};
