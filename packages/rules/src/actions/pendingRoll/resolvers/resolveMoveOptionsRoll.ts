import type {
  ApplyResult,
  GameEvent,
  GameState,
  MoveMode,
  PendingMove,
} from "../../../model";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";
import {
  getBerserkerMovesForRoll,
  getTricksterMovesForRoll,
} from "../../../movement";
import { canSpendSlots } from "../../../turnEconomy";
import { clearPendingRoll } from "../../utils/rollUtils";
import { evMoveBlocked, evMoveOptionsGenerated } from "../../utils/events";

export function resolveMoveOptionsRoll(
  state: GameState,
  unitId: string,
  kind: "moveTrickster" | "moveBerserker",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { move: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const legalMoves =
    kind === "moveTrickster"
      ? getTricksterMovesForRoll(state, unit.id, roll)
      : getBerserkerMovesForRoll(state, unit.id, roll);
  const mode =
    (state.pendingRoll?.context?.mode as MoveMode | undefined) ?? "normal";

  const pendingMove: PendingMove = {
    unitId: unit.id,
    roll,
    legalTo: legalMoves,
    expiresTurnNumber: state.turnNumber,
    mode,
  };

  const newState: GameState = {
    ...state,
    pendingMove,
  };

  const events: GameEvent[] = [
    evMoveOptionsGenerated({
      unitId: unit.id,
      roll,
      legalTo: legalMoves,
      mode,
    }),
  ];

  if (legalMoves.length === 0) {
    events.push(
      evMoveBlocked({ unitId: unit.id, reason: "noLegalDestinations" })
    );
  }

  return { state: clearPendingRoll(newState), events };
}
