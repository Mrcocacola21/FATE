import type { GameOverReason } from "rules";
import type { GameRoom } from "../store";

export type ResultSeat = "P1" | "P2";
export type ResultOutcome = "WIN" | "LOSS" | "DRAW";
export interface ParticipantResultData {
  version: 1;
  remainingUnits: number;
  remainingHealth: number;
}
export interface ParticipantResult {
  seat: ResultSeat;
  userId: string | null;
  outcome: ResultOutcome;
  resultData: ParticipantResultData;
}
export interface FinishedMatchInput {
  finishedAt: Date;
  finalRevision: number;
  winnerSeat: ResultSeat | null;
  winnerUserId: string | null;
  loserSeat: ResultSeat | null;
  loserUserId: string | null;
  finishReason: string;
  turnCount: number | null;
  participants: ParticipantResult[];
}

export class MatchResultError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) {
    super(code);
  }
}

/** These are the only reasons currently produced by competitive rules. */
export function mapGameEndReasonToMatchFinishReason(reason: GameOverReason): string {
  switch (reason) {
    case "allEnemyUnitsDefeated": return "allEnemyUnitsDefeated";
    // Frisk friendship uses the existing generic terminal reason.
    case "unknown": return "unknown";
    default: throw new MatchResultError("MATCH_RESULT_INVALID");
  }
}

/** Pure extraction after the accepted terminal action and revision increment. */
export function extractPersistentMatchResult(room: GameRoom, finishedAt: Date): FinishedMatchInput {
  const result = room.state.gameOver;
  const chess = room.state.ruleDeclaration.ruleData.chessParty;
  const draw = !result && room.state.ruleDeclaration.selectedRuleId === "chess_party" &&
    !!chess?.kings.P1 && !!chess.kings.P2 &&
    room.state.units[chess.kings.P1]?.isAlive === false &&
    room.state.units[chess.kings.P2]?.isAlive === false;
  if (room.roomMode !== "normal" || !room.matchId || room.state.phase !== "ended" || (!result && !draw) ||
      (result && (result.winnerPlayerId === result.loserPlayerId || result.endedAtRevision !== room.revision)) ||
      room.state.pendingRoll || room.state.pendingAoE || room.state.pendingCombatQueue.length)
    throw new MatchResultError("MATCH_RESULT_INVALID");
  const participants = (["P1", "P2"] as const).map((seat): ParticipantResult => {
    // At phase=ended the existing spectator projection reveals all units.
    const alive = Object.values(room.state.units).filter((unit) => unit.owner === seat && unit.isAlive);
    return {
      seat,
      userId: room.seatIdentities[seat]?.userId ?? null,
      outcome: draw ? "DRAW" : seat === result!.winnerPlayerId ? "WIN" : "LOSS",
      resultData: {
        version: 1,
        remainingUnits: alive.length,
        remainingHealth: alive.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
      },
    };
  });
  return {
    finishedAt,
    finalRevision: room.revision,
    winnerSeat: result?.winnerPlayerId ?? null,
    winnerUserId: result ? participants.find((p) => p.seat === result.winnerPlayerId)!.userId : null,
    loserSeat: result?.loserPlayerId ?? null,
    loserUserId: result ? participants.find((p) => p.seat === result.loserPlayerId)!.userId : null,
    finishReason: draw ? "chessMutualKingDefeat" : mapGameEndReasonToMatchFinishReason(result!.reason),
    // Includes the terminal battle turn; legacy results without its stamp stay null.
    turnCount: draw ? room.state.turnNumber : result?.endedAtTurn ?? null,
    participants,
  };
}

/** Whitelist JSON even when reading historical/corrupt rows. */
export function safeParticipantResultData(value: unknown): ParticipantResultData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Number.isSafeInteger(data.remainingUnits) ||
      (data.remainingUnits as number) < 0 || typeof data.remainingHealth !== "number" ||
      !Number.isFinite(data.remainingHealth) || data.remainingHealth < 0) return null;
  return { version: 1, remainingUnits: data.remainingUnits as number, remainingHealth: data.remainingHealth };
}
