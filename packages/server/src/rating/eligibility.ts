import { isGameModeId } from "rules";
import type { Match, MatchParticipant } from "@prisma/client";
import { RatingError } from "./ratingError";

export type RatingMatch = Pick<
  Match,
  | "id"
  | "status"
  | "isRated"
  | "ratingProcessedAt"
  | "gameMode"
  | "finishedAt"
  | "winnerSeat"
  | "loserSeat"
  | "winnerUserId"
  | "loserUserId"
  | "finishReason"
  | "finalRevision"
> & { participants: Pick<MatchParticipant, "seat" | "userId" | "outcome">[] };
export interface RatingCompetitor {
  userId: string;
  result: "WIN" | "LOSS" | "DRAW";
  score: 0 | 0.5 | 1;
}

/** Only normal rooms persist Matches. Test/Heartbreak rooms never enter this domain;
 * unknown/test/debug game modes and terminal reasons are also excluded here. */
export function eligibleRatingPlayers(
  match: RatingMatch,
): [RatingCompetitor, RatingCompetitor] | null {
  if (!match.isRated || match.status !== "FINISHED" || !isGameModeId(match.gameMode)) return null;
  if (
    !match.finishedAt ||
    !Number.isFinite(match.finishedAt.getTime()) ||
    !Number.isSafeInteger(match.finalRevision) ||
    match.finalRevision! < 1
  )
    throw new RatingError("RATING_INVALID_RESULT");
  if (match.participants.length !== 2) return null;
  const p1 = match.participants.find((p) => p.seat === "P1");
  const p2 = match.participants.find((p) => p.seat === "P2");
  if (!p1?.userId || !p2?.userId || p1.userId === p2.userId) return null;
  const draw = p1.outcome === "DRAW" && p2.outcome === "DRAW";
  if (draw) {
    if (
      match.finishReason !== "chessMutualKingDefeat" ||
      match.winnerSeat !== null ||
      match.loserSeat !== null ||
      match.winnerUserId !== null ||
      match.loserUserId !== null
    )
      throw new RatingError("RATING_INVALID_RESULT");
  } else {
    if (!["allEnemyUnitsDefeated", "unknown"].includes(match.finishReason ?? "")) return null;
    const winner = p1.outcome === "WIN" ? p1 : p2.outcome === "WIN" ? p2 : null;
    const loser = p1.outcome === "LOSS" ? p1 : p2.outcome === "LOSS" ? p2 : null;
    if (
      !winner ||
      !loser ||
      winner === loser ||
      match.winnerSeat !== winner.seat ||
      match.loserSeat !== loser.seat ||
      match.winnerUserId !== winner.userId ||
      match.loserUserId !== loser.userId
    )
      throw new RatingError("RATING_INVALID_RESULT");
  }
  return [p1, p2].map((p) => ({
    userId: p.userId!,
    result: p.outcome!,
    score: p.outcome === "WIN" ? 1 : p.outcome === "DRAW" ? 0.5 : 0,
  })) as [RatingCompetitor, RatingCompetitor];
}
