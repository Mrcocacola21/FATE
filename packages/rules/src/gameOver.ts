import { evGameEnded } from "./core";
import type {
  ApplyResult,
  GameEvent,
  GameOverReason,
  GameState,
  PlayerId,
} from "./model";

export const GAME_OVER_REJECTION = "Game is already over.";

export function otherPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

/**
 * Victory is deferred until every forced choice and queued resolution has
 * completed. This keeps death phantasms and chained combat authoritative.
 */
export function hasPendingBattleResolution(state: GameState): boolean {
  return (
    state.pendingRoll !== null ||
    state.pendingAoE !== null ||
    state.pendingCombatQueue.length > 0
  );
}

export function endGameWithWinner(
  state: GameState,
  events: GameEvent[],
  winnerPlayerId: PlayerId,
  reason: GameOverReason
): ApplyResult {
  if (state.phase === "ended") return { state, events };
  const loserPlayerId = otherPlayer(winnerPlayerId);
  return {
    state: {
      ...state,
      phase: "ended",
      gameOver: {
        winnerPlayerId,
        loserPlayerId,
        reason,
        endedAtRevision: 0,
        endedAtTurn: state.turnNumber,
      },
      activeUnitId: null,
      pendingMove: null,
      pendingRoll: null,
      pendingCombatQueue: [],
      pendingAoE: null,
    },
    events: [...events, evGameEnded({ winner: winnerPlayerId })],
  };
}
