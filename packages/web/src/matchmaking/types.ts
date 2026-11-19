import type { GameModeId } from "rules";
import type { SealId } from "../../../rules/src/cosmetics/seals";

export interface MatchFound {
  status: "MATCH_FOUND";
  matchId: string;
  roomId: string;
  seat: "P1" | "P2";
  gameMode: GameModeId;
  matchType: "RATED";
  /** Told once both have accepted; a null seal stamps the default. */
  opponent: { displayName: string; seal: SealId | null };
}
export interface MatchProposed {
  status: "MATCH_PROPOSED";
  joinedAt: string;
  gameMode: GameModeId;
  expiresAt: string;
  acceptMs: number;
  accepted: boolean;
  opponentAccepted: boolean;
}
export type MatchmakingStatus = (
  | { status: "NOT_QUEUED"; penaltyUntil?: string }
  | MatchFound
  | MatchProposed
  | {
      status: "QUEUED" | "MATCHING";
      joinedAt: string;
      waitMs: number;
      rating: number;
      currentRange: number;
      gameMode: GameModeId;
      available: boolean;
    }
) & { revision?: number };
export interface MatchmakingEvent {
  type: "matchmakingStatus" | "matchmakingFound";
  revision: number;
  status: MatchmakingStatus;
}
