import type { GameState, UnitState } from "../../../model";
import { isRiverPerson } from "./helpers";

export function clearRiverTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !isRiverPerson(unit)) return state;
  if (!unit.riverBoatmanMovePending && !unit.riverBoatCarryAllyId) {
    return state;
  }
  const cleared: UnitState = {
    ...unit,
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [cleared.id]: cleared,
    },
  };
}
