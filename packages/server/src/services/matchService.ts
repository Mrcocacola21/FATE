import type { MatchRepository } from "../repositories/matchRepository";

export type MatchSeatId = "P1" | "P2";
export interface WaitingMatchInput {
  roomId: string;
  gameMode: string;
  seed: number;
  createdById?: string | null;
}
export interface SeatParticipantInput {
  seat: MatchSeatId;
  displayNameSnapshot: string;
  /** Only verified server identity belongs here. Runtime guests pass null. */
  userId: string | null;
}
export interface StartedMatchInput {
  gameMode: string;
  startedAt: Date;
  participants: SeatParticipantInput[];
}
export interface FinishedMatchInput {
  finishedAt: Date;
  finalRevision: number;
  winnerSeat: MatchSeatId | null;
  winnerUserId: string | null;
  finishReason: string | null;
}

export type MatchPersistence = Pick<
  MatchService,
  | "createWaitingMatch"
  | "syncParticipant"
  | "updateWaitingGameMode"
  | "markStarted"
  | "markFinished"
  | "markCancelled"
>;

export class MatchService {
  constructor(private readonly matches: MatchRepository) {}

  async createWaitingMatch(input: WaitingMatchInput): Promise<{ id: string }> {
    const match = await this.matches.createWaitingMatch(input);
    if (
      match.status !== "WAITING" ||
      match.seed !== input.seed ||
      match.gameMode !== input.gameMode
    )
      throw new Error("Room is already linked to a different or started match");
    return { id: match.id };
  }

  syncParticipant(matchId: string, input: SeatParticipantInput): Promise<void> {
    return this.matches.upsertWaitingParticipant(matchId, input);
  }

  updateWaitingGameMode(matchId: string, gameMode: string): Promise<void> {
    return this.matches.updateWaitingGameMode(matchId, gameMode);
  }

  async markStarted(matchId: string, input: StartedMatchInput): Promise<void> {
    const match = await this.matches.markStarted(matchId, input);
    if (match.status !== "IN_PROGRESS") throw new Error("Invalid match start transition");
  }

  async markFinished(matchId: string, input: FinishedMatchInput): Promise<void> {
    const match = await this.matches.markFinished(matchId, input);
    if (
      match.status !== "FINISHED" ||
      match.finalRevision !== input.finalRevision ||
      match.winnerSeat !== input.winnerSeat ||
      match.winnerUserId !== input.winnerUserId ||
      match.finishReason !== input.finishReason
    )
      throw new Error("Invalid match finish transition or conflicting final result");
  }

  async markCancelled(matchId: string, finishedAt: Date): Promise<void> {
    const match = await this.matches.markCancelled(matchId, finishedAt);
    if (match.status !== "CANCELLED") throw new Error("Only a waiting match can be cancelled");
  }
}
