import type { GameModeId, SealId } from "rules";
import type { ConnectionIdentity } from "../auth/connectionIdentity";

export interface MatchFound {
  status: "MATCH_FOUND";
  matchId: string;
  roomId: string;
  seat: "P1" | "P2";
  gameMode: GameModeId;
  matchType: "RATED";
  /** Shown once both have accepted: the opponent's name and the seal they stamped (null: default). */
  opponent: { displayName: string; seal: SealId | null };
}
export type MatchmakingStatus =
  | {
      status: "NOT_QUEUED";
      /** A search ban for a missed or declined match, while it lasts. */
      penaltyUntil?: string;
    }
  | MatchFound
  | {
      status: "MATCH_PROPOSED";
      joinedAt: string;
      gameMode: GameModeId;
      /** When the offer lapses; whoever has not accepted by then is penalised. */
      expiresAt: string;
      acceptMs: number;
      accepted: boolean;
      opponentAccepted: boolean;
    }
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
  state: "QUEUED" | "PROPOSED" | "MATCHING";
  disconnectedAt?: number;
  proposalId?: string;
}
/** A found pair waiting for both players to accept before the match is created. */
export interface MatchProposal {
  id: string;
  players: [MatchmakingEntry, MatchmakingEntry];
  accepted: Set<string>;
  expiresAt: number;
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
