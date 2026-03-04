import type { GameEvent, GameState, UnitState } from "../../../model";
import { evBunkerExited } from "../../../core";

export function exitBunkerForUnit(
  state: GameState,
  unit: UnitState,
  reason: "timerExpired" | "attacked" | "transformed"
): { state: GameState; events: GameEvent[]; unit: UnitState } {
  if (!unit.bunker?.active) {
    return { state, events: [], unit };
  }

  const updated: UnitState = {
    ...unit,
    bunker: { active: false, ownTurnsInBunker: 0 },
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events: [evBunkerExited({ unitId: updated.id, reason })],
    unit: updated,
  };
}

export function processUnitStartOfTurnBunker(
  state: GameState,
  unitId: string
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.bunker?.active) {
    return { state, events: [] };
  }

  if (unit.bunker.ownTurnsInBunker >= 3) {
    const exited = exitBunkerForUnit(state, unit, "timerExpired");
    return { state: exited.state, events: exited.events };
  }

  const updated: UnitState = {
    ...unit,
    bunker: {
      active: true,
      ownTurnsInBunker: unit.bunker.ownTurnsInBunker + 1,
    },
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events: [],
  };
}
