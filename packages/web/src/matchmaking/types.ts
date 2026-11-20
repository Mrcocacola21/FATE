import type { GameModeId } from "rules";

/** Which queue: Rated changes ratings and calibration, Casual never does. */
export type QueueMatchType = "RATED" | "CASUAL";
import type { SealId } from "../../../rules/src/cosmetics/seals";

export interface MatchFound {
  status: "MATCH_FOUND";
  matchId: string;
  roomId: string;
  seat: "P1" | "P2";
  gameMode: GameModeId;
  matchType: QueueMatchType;
  /** Told once both have accepted; a null seal stamps the default. */
  opponent: { displayName: string; seal: SealId | null };
}
export interface MatchProposed {
  status: "MATCH_PROPOSED";
  joinedAt: string;
  gameMode: GameModeId;
  matchType: QueueMatchType;
  expiresAt: string;
  acceptMs: number;
  accepted: boolean;
  opponentAccepted: boolean;
}
export type MatchmakingStatus = (
  | { status: "NOT_QUEUED"; penaltyUntil?: string; casualPenaltyUntil?: string }
  | MatchFound
  | MatchProposed
  | {
      status: "QUEUED" | "MATCHING";
      joinedAt: string;
      waitMs: number;
      rating: number;
      currentRange: number;
      gameMode: GameModeId;
      matchType: QueueMatchType;
      available: boolean;
    }
) & { revision?: number };
export interface MatchmakingEvent {
  type: "matchmakingStatus" | "matchmakingFound";
  revision: number;
  status: MatchmakingStatus;
}
