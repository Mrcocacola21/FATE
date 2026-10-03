import type { MatchType } from "../matches/matchType";
import type { ReplayView } from "rules";
import type { MatchOpponent, MatchOutcome } from "../matches/types";

export type { ReplayView } from "rules";
export interface ReplayParticipant extends MatchOpponent {
  outcome: MatchOutcome | null;
}
export interface ReplayTimelineEntry {
  revision: number;
  actorSeat: "P1" | "P2" | null;
  actionType: string;
  createdAt: string;
}
export interface ReplayMetadata {
  matchId: string;
  status: "FINISHED";
  matchType: MatchType;
  gameMode: string;
  initialRevision: number;
  finalRevision: number;
  participants: ReplayParticipant[];
  winnerSeat: "P1" | "P2" | null;
  finishReason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  timeline: ReplayTimelineEntry[];
}
export interface ReplayStateResponse {
  matchId: string;
  revision: number;
  state: ReplayView;
  action: ReplayTimelineEntry | null;
}
