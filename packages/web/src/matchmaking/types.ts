import type { GameModeId } from "rules";

export interface MatchFound {
  status: "MATCH_FOUND";
  matchId: string;
  roomId: string;
  seat: "P1" | "P2";
  gameMode: GameModeId;
  matchType: "RATED";
  opponent: { displayName: string };
}
export type MatchmakingStatus = (
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
    }) & { revision?: number };
export interface MatchmakingEvent {
  type: "matchmakingStatus" | "matchmakingFound";
  revision: number;
  status: MatchmakingStatus;
}
