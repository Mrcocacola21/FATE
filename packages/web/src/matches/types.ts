import type { MatchType } from "./matchType";
export type MatchOutcome = "WIN" | "LOSS" | "DRAW";
export interface MatchIdentity {
  userId: string | null;
  seat: "P1" | "P2";
  displayName: string;
}
export interface MatchOpponent extends MatchIdentity {
  username: string | null;
  avatarUrl: string | null;
}
export interface MatchMetadata {
  id: string;
  status: "FINISHED";
  matchType: MatchType;
  gameMode: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  finishReason: string | null;
  finalRevision: number | null;
  turnCount: number | null;
}
export interface MatchHistoryItem extends MatchMetadata {
  result: MatchOutcome | null;
  seat: "P1" | "P2";
  opponent: MatchOpponent | null;
}
export interface MatchHistoryResponse {
  items: MatchHistoryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export interface MatchHistoryFilters {
  page: number;
  limit: number;
  result?: MatchOutcome;
  gameMode?: string;
}
export interface MatchDetails extends MatchMetadata {
  winner: MatchIdentity | null;
  loser: MatchIdentity | null;
  participants: (MatchOpponent & { outcome: MatchOutcome | null })[];
}
