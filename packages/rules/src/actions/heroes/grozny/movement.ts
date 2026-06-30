import type { Coord, GameEvent, GameState, UnitState } from "../../../model";
import { coordsEqual } from "../../../board";
import { applyStakeTriggerIfAny, evUnitMoved } from "../../../core";
import type { RNG } from "../../../rng";

export function applyGroznyFreeMove(
  state: GameState,
  unit: UnitState,
  to: Coord,
  rng: RNG
): { state: GameState; events: GameEvent[]; unit: UnitState } {
  if (!unit.position || coordsEqual(unit.position, to)) {
    return { state, events: [], unit };
  }

  const from = unit.position;
  let movedUnit: UnitState = {
    ...unit,
    position: { ...to },
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [movedUnit.id]: movedUnit,
    },
  };

  const events: GameEvent[] = [
    evUnitMoved({ unitId: movedUnit.id, from, to: movedUnit.position! }),
  ];

  const stakeResult = applyStakeTriggerIfAny(
    nextState,
    movedUnit,
    movedUnit.position!,
    rng
  );
  if (stakeResult.triggered) {
    nextState = stakeResult.state;
    movedUnit = stakeResult.unit;
    events.push(...stakeResult.events);
  }

  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events, unit: movedUnit };
  }

  return { state: nextState, events, unit: movedUnit };
}
