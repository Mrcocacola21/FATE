import type { GameModeId } from "rules";
import type { ConnectionIdentity } from "../auth/connectionIdentity";

export interface MatchFound {
  status: "MATCH_FOUND";
  matchId: string;
  roomId: string;
  seat: "P1" | "P2";
  gameMode: GameModeId;
  matchType: "RATED";
  opponent: { displayName: string };
}
export type MatchmakingStatus =
  | { status: "NOT_QUEUED" }
  | MatchFound
  | {
      status: "QUEUED" | "MATCHING";
      joinedAt: string;
      waitMs: number;
      rating: number;
      currentRange: number;
      gameMode: GameModeId;
      available: boolean;
    };
export interface MatchmakingEntry {
  identity: ConnectionIdentity;
  joinedAt: number;
  rating: number;
  ratingDeviation: number;
  gameMode: GameModeId;
  state: "QUEUED" | "MATCHING";
  disconnectedAt?: number;
}
export interface PairAttempt {
  roomId: string;
  players: Record<"P1" | "P2", MatchmakingEntry>;
  retryAt: number;
}
export type MatchmakingEvent = {
  type: "matchmakingStatus" | "matchmakingFound";
  revision: number;
  status: MatchmakingStatus;
};
