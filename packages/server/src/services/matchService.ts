import { matchTypeFromRated, type MatchType } from "../matches/matchType";
import { isDeepStrictEqual } from "node:util";
import { RatingService } from "./ratingService";
import type { InitialMatchConfig } from "../replay/initialState";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import type { AcceptedActionRecord } from "../persistence/acceptedAction";
import type { SerializedMatchSnapshot } from "../persistence/matchSnapshot";
import { MatchSnapshotService } from "./matchSnapshotService";
import type { DetailedMatch, MatchRepository } from "../repositories/matchRepository";
import {
  MatchResultError,
  safeParticipantResultData,
  type FinishedMatchInput,
} from "../persistence/matchResult";
import type { ParticipantResultData, ResultOutcome } from "../persistence/matchResult";
export type { FinishedMatchInput } from "../persistence/matchResult";

export type MatchSeatId = "P1" | "P2";
export interface MatchResultIdentityDTO {
  seat: MatchSeatId;
  userId: string | null;
  displayName: string;
}
export interface MatchDetailsDTO {
  id: string;
  status: "FINISHED";
  matchType: MatchType;
  gameMode: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  finalRevision: number | null;
  turnCount: number | null;
  finishReason: string | null;
  winner: MatchResultIdentityDTO | null;
  loser: MatchResultIdentityDTO | null;
  participants: (MatchResultIdentityDTO & {
    outcome: ResultOutcome | null;
    resultData: ParticipantResultData | null;
  })[];
}
export interface PublicMatchDetailsDTO extends Omit<MatchDetailsDTO, "participants"> {
  participants: (MatchDetailsDTO["participants"][number] & {
    username: string | null;
    avatarUrl: string | null;
  })[];
}
export interface WaitingMatchInput {
  roomId: string;
  /** Trusted server designation only. Derived from validated immutable room classification. */
  isRated?: boolean;
  gameMode: string;
  seed: number;
  initialConfig?: InitialMatchConfig;
  createdById?: string | null;
  /** Atomic initial seat reservations, used by the server-owned Rated queue. */
  participants?: SeatParticipantInput[];
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
export type MatchPersistence = Pick<
  MatchService,
  | "createWaitingMatch"
  | "syncParticipant"
  | "removeWaitingParticipant"
  | "updateWaitingGameMode"
  | "markStarted"
  | "markCancelled"
  | "appendAcceptedAction"
  | "appendMatchSnapshot"
> & { finalizeMatch(matchId: string, input: FinishedMatchInput): Promise<unknown>;
  findMatchByRoomId?(roomId: string): Promise<{ id: string } | null> };

export class MatchService {
  private actions?: MatchActionRepository;
  constructor(
    private readonly matches: MatchRepository,
    private readonly logger: { error(data: object, message: string): void; info?(data: object, message: string): void } = console,
    actions?: MatchActionRepository,
    private snapshots?: MatchSnapshotService,
    private ratings?: Pick<RatingService, "processRatedMatch">,
  ) {
    this.actions = actions;
  }

  appendAcceptedAction(record: AcceptedActionRecord): Promise<void> {
    return (this.actions ??= new MatchActionRepository()).appendAcceptedAction(record);
  }

  appendMatchSnapshot(snapshot: SerializedMatchSnapshot): Promise<void> {
    return (this.snapshots ??= new MatchSnapshotService()).persistSnapshot(snapshot);
  }

  async createWaitingMatch(input: WaitingMatchInput): Promise<{ id: string }> {
    if (input.participants && (!input.isRated || input.participants.length !== 2 ||
      new Set(input.participants.map(p => p.seat)).size !== 2 ||
      input.participants.some(p => !p.userId || !["P1", "P2"].includes(p.seat)) ||
      input.participants[0].userId === input.participants[1].userId))
      throw new Error("Rated matchmaking requires two distinct persistent participants");
    const match = await this.matches.createWaitingMatch(input);
    if (
      match.status !== "WAITING" ||
      match.seed !== input.seed ||
      match.isRated !== (input.isRated ?? false) ||
      match.gameMode !== input.gameMode
      || (input.initialConfig && !isDeepStrictEqual(match.initialConfig, input.initialConfig))
    )
      throw new Error("Room is already linked to a different or started match");
    if (input.participants) {
      const participants = await this.matches.findParticipants(match.id);
      if (participants.length !== 2 || input.participants.some(p =>
        !participants.some(stored => stored.seat === p.seat && stored.userId === p.userId && stored.displayNameSnapshot === p.displayNameSnapshot)))
        throw new Error("Existing matchmaking participants differ from the claimed pair");
    }
    return { id: match.id };
  }

  findMatchByRoomId(roomId: string): Promise<{ id: string } | null> {
    return this.matches.findByRoomId(roomId);
  }

  syncParticipant(matchId: string, input: SeatParticipantInput): Promise<void> {
    return this.matches.upsertWaitingParticipant(matchId, input);
  }

  removeWaitingParticipant(matchId: string, seat: MatchSeatId): Promise<void> {
    return this.matches.removeWaitingParticipant(matchId, seat);
  }

  updateWaitingGameMode(matchId: string, gameMode: string): Promise<void> {
    return this.matches.updateWaitingGameMode(matchId, gameMode);
  }

  async markStarted(matchId: string, input: StartedMatchInput): Promise<void> {
    const match = await this.matches.markStarted(matchId, input);
    if (match.status !== "IN_PROGRESS") throw new Error("Invalid match start transition");
  }

  async finalizeMatch(matchId: string, input: FinishedMatchInput) {
    const canonical = await this.matches.finalizeMatch(matchId, (match, changed) => {
      if (!match) throw new MatchResultError("MATCH_NOT_FOUND", 404);
      if (!changed && match.status !== "FINISHED")
        throw new MatchResultError("MATCH_INVALID_TRANSITION");
      const fail = () => {
        throw new MatchResultError(changed ? "MATCH_RESULT_INVALID" : "MATCH_RESULT_CONFLICT");
      };
      const draw = input.winnerSeat === null && input.loserSeat === null;
      if (
        !Number.isSafeInteger(input.finalRevision) ||
        input.finalRevision < 1 ||
        input.finalRevision > 2147483647 ||
        !Number.isFinite(input.finishedAt.getTime()) ||
        (input.turnCount !== null &&
          (!Number.isSafeInteger(input.turnCount) ||
            input.turnCount < 1 ||
            input.turnCount > 2147483647)) ||
        !["allEnemyUnitsDefeated", "unknown", "chessMutualKingDefeat"].includes(
          input.finishReason,
        ) ||
        (draw
          ? input.finishReason !== "chessMutualKingDefeat" ||
            input.winnerUserId !== null ||
            input.loserUserId !== null
          : !input.winnerSeat ||
            !input.loserSeat ||
            !["P1", "P2"].includes(input.winnerSeat) ||
            !["P1", "P2"].includes(input.loserSeat) ||
            input.winnerSeat === input.loserSeat ||
            input.finishReason === "chessMutualKingDefeat") ||
        match.participants.length !== 2 ||
        input.participants.length !== 2 ||
        new Set(input.participants.map((p) => p.seat)).size !== 2
      )
        fail();
      for (const seat of ["P1", "P2"] as const) {
        const stored = match.participants.find((p) => p.seat === seat);
        const result = input.participants.find((p) => p.seat === seat);
        if (
          !stored ||
          !result ||
          stored.userId !== result.userId ||
          result.outcome !== (draw ? "DRAW" : seat === input.winnerSeat ? "WIN" : "LOSS") ||
          !isDeepStrictEqual(safeParticipantResultData(result.resultData), result.resultData) ||
          (seat === input.winnerSeat && result.userId !== input.winnerUserId) ||
          (seat === input.loserSeat && result.userId !== input.loserUserId)
        )
          fail();
        if (
          !changed &&
          (stored!.outcome !== result!.outcome ||
            !isDeepStrictEqual(stored!.resultData, result!.resultData))
        )
          fail();
      }
      const ids = input.participants.map((p) => p.userId).filter((id) => id !== null);
      if (new Set(ids).size !== ids.length) fail();
      if (!changed) {
        for (const key of [
          "winnerSeat",
          "winnerUserId",
          "loserSeat",
          "loserUserId",
          "finishReason",
          "finalRevision",
          "turnCount",
        ] as const)
          if (match[key] !== input[key]) fail();
        // The first committed timestamp/duration remain canonical on retries.
        return null;
      }
      const durationMs = match.startedAt
        ? input.finishedAt.getTime() - match.startedAt.getTime()
        : null;
      if (durationMs !== null && (durationMs < 0 || durationMs > 2147483647)) fail();
      if (!match.startedAt)
        this.logger.error(
          { event: "match:missing_started_at", matchId },
          "Cannot derive match duration",
        );
      return { result: input, durationMs };
    });
    // The result transaction has committed. A failed rating call leaves FINISHED
    // intact and propagates to the existing bounded lifecycle retry/drain path.
    // Re-finalization also retries rating after a crash between these commits.
    if (canonical.isRated) {
      this.ratings ??= new RatingService(this.matches.createRatingRepository(), {
        info: (data, message) => this.logger.info?.(data, message),
        error: (data, message) => this.logger.error(data, message),
      });
      await this.ratings.processRatedMatch(matchId);
    }
    return toMatchDetails(canonical);
  }

  async getFinishedMatchDetails(id: string): Promise<PublicMatchDetailsDTO> {
    const match = await this.matches.findByIdWithParticipants(id);
    if (!match) throw new MatchResultError("MATCH_NOT_FOUND", 404);
    if (match.status !== "FINISHED") throw new MatchResultError("MATCH_NOT_FINISHED");
    const details = toMatchDetails(match);
    return {
      ...details,
      participants: details.participants.map((participant) => {
        const profile = match.participants.find((p) => p.seat === participant.seat)?.user?.profile;
        return { ...participant, username: profile?.username ?? null, avatarUrl: profile?.avatarUrl ?? null };
      }),
    };
  }

  async markCancelled(matchId: string, finishedAt: Date): Promise<void> {
    const match = await this.matches.markCancelled(matchId, finishedAt);
    if (match.status !== "CANCELLED") throw new Error("Only a waiting match can be cancelled");
  }
}

export function toMatchDetails(match: DetailedMatch): MatchDetailsDTO {
  if (match.status !== "FINISHED") throw new MatchResultError("MATCH_NOT_FINISHED");
  const participants = [...match.participants]
    .sort((a, b) => a.seat.localeCompare(b.seat))
    .map((p) => ({
      seat: p.seat,
      userId: p.userId,
      displayName: p.displayNameSnapshot,
      outcome: p.outcome,
      resultData: safeParticipantResultData(p.resultData),
    }));
  const identity = (seat: MatchSeatId | null) => {
    const p = participants.find((participant) => participant.seat === seat);
    return p ? { seat: p.seat, userId: p.userId, displayName: p.displayName } : null;
  };
  return {
    id: match.id,
    status: match.status,
    gameMode: match.gameMode,
    matchType: matchTypeFromRated(match.isRated),
    createdAt: match.createdAt.toISOString(),
    startedAt: match.startedAt?.toISOString() ?? null,
    finishedAt: match.finishedAt?.toISOString() ?? null,
    durationMs: match.durationMs,
    finalRevision: match.finalRevision,
    turnCount: match.turnCount,
    finishReason: match.finishReason,
    winner: identity(match.winnerSeat),
    loser: identity(match.loserSeat),
    participants,
  };
}
