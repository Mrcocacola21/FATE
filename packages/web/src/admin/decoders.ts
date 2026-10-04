import { ApiError, isRecord } from "../api/client";
import { getRankPresentation } from "../ranks/rankAssets";
import {
  roles,
  modes,
  statuses,
  type AdminUser,
  type AdminUserDetail,
  type AdminMatch,
  type AdminMatchDetail,
  type AdminAction,
  type AdminSummary,
  type Page,
  type JsonValue,
} from "./types";

function record(v: unknown) {
  if (!isRecord(v)) throw new ApiError("INVALID_RESPONSE");
  return v;
}
function str(v: unknown) {
  if (typeof v !== "string") throw new ApiError("INVALID_RESPONSE");
  return v;
}
function num(v: unknown) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ApiError("INVALID_RESPONSE");
  return v;
}
function bool(v: unknown) {
  if (typeof v !== "boolean") throw new ApiError("INVALID_RESPONSE");
  return v;
}
const nullable = <T>(v: unknown, decode: (v: unknown) => T): T | null =>
  v === null ? null : decode(v);
function list<T>(v: unknown, decode: (v: unknown) => T): T[] {
  if (!Array.isArray(v)) throw new ApiError("INVALID_RESPONSE");
  return v.map(decode);
}
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new ApiError("INVALID_RESPONSE");
  return v as T;
}
export function user(v: unknown): AdminUser {
  const x = record(v);
  return {
    id: str(x.id),
    username: nullable(x.username, str),
    displayName: nullable(x.displayName, str),
    ...(x.email === undefined ? {} : { email: str(x.email) }),
    role: choice(x.role, roles),
    blocked: bool(x.blocked),
    blockedAt: nullable(x.blockedAt, str),
    blockedReason: nullable(x.blockedReason, str),
    createdAt: str(x.createdAt),
    updatedAt: str(x.updatedAt),
  };
}
export function userDetail(v: unknown): AdminUserDetail {
  const x = record(record(v).user);
  return {
    ...user(x),
    matchCount: num(x.matchCount),
    ratings: list(x.ratings, (v) => {
      const r = record(v),
        rank = getRankPresentation(r.rankTier);
      if (!rank) throw new ApiError("INVALID_RESPONSE");
      return {
        gameMode: choice(r.gameMode, modes),
        rating: num(r.rating),
        rankTier: rank.id,
        ratingDeviation: num(r.ratingDeviation),
        volatility: num(r.volatility),
        ratedGames: num(r.ratedGames),
        updatedAt: str(r.updatedAt),
      };
    }),
  };
}
export const userResponse = (v: unknown) => user(record(v).user);
export function match(v: unknown): AdminMatch {
  const x = record(v),
    r = record(x.result);
  return {
    matchId: str(x.matchId),
    roomId: str(x.roomId),
    lobbyName: nullable(x.lobbyName, str),
    origin: nullable(x.origin, (v) => choice(v, ["MANUAL", "MATCHMAKING"])),
    status: choice(x.status, statuses),
    gameMode: choice(x.gameMode, modes),
    matchType: choice(x.matchType, ["CASUAL", "RATED"]),
    createdById: nullable(x.createdById, str),
    createdAt: str(x.createdAt),
    updatedAt: str(x.updatedAt),
    startedAt: nullable(x.startedAt, str),
    finishedAt: nullable(x.finishedAt, str),
    finalRevision: nullable(x.finalRevision, num),
    ratingProcessedAt: nullable(x.ratingProcessedAt, str),
    result: {
      winnerUserId: nullable(r.winnerUserId, str),
      winnerSeat: nullable(r.winnerSeat, str),
      loserUserId: nullable(r.loserUserId, str),
      loserSeat: nullable(r.loserSeat, str),
      finishReason: nullable(r.finishReason, str),
      durationMs: nullable(r.durationMs, num),
      turnCount: nullable(r.turnCount, num),
    },
    participants: list(x.participants, (v) => {
      const p = record(v);
      return {
        userId: nullable(p.userId, str),
        seat: str(p.seat),
        username: nullable(p.username, str),
        displayName: nullable(p.displayName, str),
        displayNameSnapshot: str(p.displayNameSnapshot),
        outcome: nullable(p.outcome, str),
        identityType: str(p.identityType),
      };
    }),
  };
}
export function matchDetail(v: unknown): AdminMatchDetail {
  const x = record(record(v).match);
  return {
    ...match(x),
    actionCount: num(x.actionCount),
    snapshotCount: num(x.snapshotCount),
    latestActionRevision: nullable(x.latestActionRevision, num),
    durableRevision: num(x.durableRevision),
    latestSnapshot: nullable(x.latestSnapshot, (v) => {
      const s = record(v);
      return {
        revision: num(s.revision),
        formatVersion: num(s.formatVersion),
        createdAt: str(s.createdAt),
      };
    }),
  };
}
// Defense in depth: only text-safe JSON reaches the expandable action panel.
export function safeJson(v: unknown): JsonValue {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return num(v);
  if (Array.isArray(v)) return v.map(safeJson);
  return Object.fromEntries(
    Object.entries(record(v))
      .filter(([key]) => !/(token|secret|password|credential|authorization|cookie)/i.test(key))
      .map(([key, item]) => [key, safeJson(item)]),
  );
}
export function action(v: unknown): AdminAction {
  const x = record(v);
  return {
    revision: num(x.revision),
    actorUserId: nullable(x.actorUserId, str),
    actorSeat: nullable(x.actorSeat, str),
    actionType: str(x.actionType),
    payloadValid: bool(x.payloadValid),
    actionPayload: x.payloadValid ? safeJson(x.actionPayload) : null,
    formatVersion: nullable(x.formatVersion, num),
    createdAt: str(x.createdAt),
  };
}
export function page<T>(decode: (v: unknown) => T) {
  return (v: unknown): Page<T> => {
    const x = record(v),
      p = record(x.pagination);
    return {
      items: list(x.items, decode),
      pagination: {
        page: num(p.page),
        limit: num(p.limit),
        total: num(p.total),
        totalPages: num(p.totalPages),
      },
    };
  };
}
function counts<T extends string>(v: unknown, keys: readonly T[]): Record<T, number> {
  const x = record(v);
  return Object.fromEntries(keys.map((key) => [key, num(x[key])])) as Record<T, number>;
}
export function summary(v: unknown): AdminSummary {
  const x = record(v),
    u = record(x.users),
    m = record(x.matches),
    a = record(x.activity);
  return {
    users: {
      total: num(u.total),
      active: num(u.active),
      blocked: num(u.blocked),
      byRole: counts(u.byRole, roles),
    },
    matches: {
      total: num(m.total),
      byStatus: counts(m.byStatus, statuses),
      byGameMode: counts(m.byGameMode, modes),
      classification: counts(m.classification, ["CASUAL", "RATED"]),
    },
    activity: {
      usersCreatedLast7d: num(a.usersCreatedLast7d),
      matchesCreatedLast24h: num(a.matchesCreatedLast24h),
      matchesFinishedLast24h: num(a.matchesFinishedLast24h),
    },
  };
}
