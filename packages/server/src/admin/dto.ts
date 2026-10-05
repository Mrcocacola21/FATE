import type { AdminMatch, AdminUser } from "../repositories/adminRepository";
import type { MatchAction } from "@prisma/client";
import { deserializeReplayAction } from "../replay/deserializeAction";
import { matchTypeFromRated } from "../matches/matchType";
import type { RoomSummary } from "../store";

export function toAdminUser(user: AdminUser) {
  return {
    id: user.id,
    username: user.profile?.username ?? null,
    displayName: user.profile?.displayName ?? null,
    ...(user.email === undefined ? {} : { email: user.email }),
    role: user.role,
    blocked: user.blockedAt !== null,
    blockedAt: user.blockedAt?.toISOString() ?? null,
    blockedReason: user.blockedReason,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
export function toAdminMatch(match: AdminMatch) {
  const config =
    match.initialConfig &&
    typeof match.initialConfig === "object" &&
    !Array.isArray(match.initialConfig)
      ? match.initialConfig
      : {};
  const origin: RoomSummary["origin"] | null =
    config.origin === "MANUAL" || config.origin === "MATCHMAKING" ? config.origin : null;
  return {
    matchId: match.id,
    roomId: match.roomId,
    status: match.status,
    gameMode: match.gameMode,
    lobbyName:
      typeof config.lobbyName === "string" && config.lobbyName.length <= 100
        ? config.lobbyName
        : null,
    origin,
    matchType: matchTypeFromRated(match.isRated),
    createdById: match.createdById,
    createdAt: match.createdAt.toISOString(),
    startedAt: match.startedAt?.toISOString() ?? null,
    finishedAt: match.finishedAt?.toISOString() ?? null,
    updatedAt: match.updatedAt.toISOString(),
    finalRevision: match.finalRevision,
    ratingProcessedAt: match.ratingProcessedAt?.toISOString() ?? null,
    result: {
      winnerUserId: match.winnerUserId,
      winnerSeat: match.winnerSeat,
      loserUserId: match.loserUserId,
      loserSeat: match.loserSeat,
      finishReason: match.finishReason,
      durationMs: match.durationMs,
      turnCount: match.turnCount,
    },
    participants: match.participants.map((p) => ({
      userId: p.userId,
      seat: p.seat,
      displayNameSnapshot: p.displayNameSnapshot,
      outcome: p.outcome,
      username: p.user?.profile?.username ?? null,
      displayName: p.user?.profile?.displayName ?? null,
      identityType: p.userId ? ("ACCOUNT" as const) : ("GUEST_OR_DELETED_ACCOUNT" as const),
    })),
  };
}

// Ability payloads are extensible JSON. Strip credential keys recursively even after validation.
function safeActionJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeActionJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(token|secret|password|credential|authorization|cookie)/i.test(key))
        .map(([key, item]) => [key, safeActionJson(item)]),
    );
  return value;
}
export function toAdminAction(
  row: Pick<
    MatchAction,
    | "matchId"
    | "revision"
    | "actorUserId"
    | "actorSeat"
    | "actionType"
    | "actionPayload"
    | "createdAt"
  >,
) {
  let actionPayload: unknown = null;
  let formatVersion: number | null = null;
  let payloadValid = false;
  try {
    const decoded = deserializeReplayAction(row);
    actionPayload = safeActionJson(decoded.action);
    formatVersion = decoded.setup?.formatVersion ?? null;
    payloadValid = true;
  } catch {
    /* Corrupt or unsupported logs expose metadata only; no arbitrary JSON dump. */
  }
  return {
    revision: row.revision,
    actorUserId: row.actorUserId,
    actorSeat: row.actorSeat,
    actionType: row.actionType,
    actionPayload,
    formatVersion,
    payloadValid,
    createdAt: row.createdAt.toISOString(),
  };
}

export function paginated<T>(query: { page: number; limit: number }, total: number, items: T[]) {
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
