import type { AuthUser } from "../auth/types";
import type { RankTier } from "../ranks/rankAssets";

export type UserRole = AuthUser["role"];
export const roles = ["USER", "MODERATOR", "ADMIN"] as const;
export const modes = ["standard", "draft", "classic"] as const;
export const statuses = ["WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"] as const;
export type GameMode = (typeof modes)[number];
export type MatchStatus = (typeof statuses)[number];
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface Page<T> {
  items: T[];
  pagination: Pagination;
}
export interface AdminUser {
  id: string;
  username: string | null;
  displayName: string | null;
  email?: string;
  role: UserRole;
  blocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUserDetail extends AdminUser {
  matchCount: number;
  ratings: {
    gameMode: GameMode;
    rating: number;
    rankTier: RankTier;
    ratingDeviation: number;
    volatility: number;
    ratedGames: number;
    updatedAt: string;
  }[];
}
export interface Participant {
  userId: string | null;
  seat: string;
  username: string | null;
  displayName: string | null;
  displayNameSnapshot: string;
  outcome: string | null;
  identityType: string;
}
export interface AdminMatch {
  matchId: string;
  roomId: string;
  status: MatchStatus;
  gameMode: GameMode;
  lobbyName: string | null;
  origin: "MANUAL" | "MATCHMAKING" | null;
  matchType: "CASUAL" | "RATED";
  createdById: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  finalRevision: number | null;
  ratingProcessedAt: string | null;
  result: {
    winnerUserId: string | null;
    winnerSeat: string | null;
    loserUserId: string | null;
    loserSeat: string | null;
    finishReason: string | null;
    durationMs: number | null;
    turnCount: number | null;
  };
  participants: Participant[];
}
export interface AdminMatchDetail extends AdminMatch {
  actionCount: number;
  snapshotCount: number;
  latestActionRevision: number | null;
  durableRevision: number;
  latestSnapshot: { revision: number; formatVersion: number; createdAt: string } | null;
}
export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface AdminAction {
  revision: number;
  actorUserId: string | null;
  actorSeat: string | null;
  actionType: string;
  actionPayload: JsonValue;
  formatVersion: number | null;
  payloadValid: boolean;
  createdAt: string;
}
export interface AdminSummary {
  users: { total: number; active: number; blocked: number; byRole: Record<UserRole, number> };
  matches: {
    total: number;
    byStatus: Record<MatchStatus, number>;
    byGameMode: Record<GameMode, number>;
    classification: Record<"CASUAL" | "RATED", number>;
  };
  activity: {
    usersCreatedLast7d: number;
    matchesCreatedLast24h: number;
    matchesFinishedLast24h: number;
  };
}
export type Query = Record<string, string | number | undefined>;
export const auditEventTypes = [
  "USER_BLOCKED",
  "USER_UNBLOCKED",
  "USER_ROLE_CHANGED",
  "MATCH_INTERRUPTED",
] as const;
export interface AuditIdentity {
  id: string;
  username: string | null;
  displayName: string | null;
}
export interface AuditRecord {
  id: string;
  eventType: (typeof auditEventTypes)[number];
  actorType: "USER" | "SYSTEM";
  actorUserId: string | null;
  actorRole: UserRole | null;
  actor: AuditIdentity | null;
  targetUserId: string | null;
  targetUser: AuditIdentity | null;
  matchId: string | null;
  reason: string | null;
  metadata: Record<string, string | number | null> | null;
  createdAt: string;
}
