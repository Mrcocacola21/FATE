import type { GameState, PlayerId, UnitState } from "../../model";

export function nextPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

export function clearGenghisTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit) return state;
  if (
    unit.genghisKhanDiagonalMoveActive !== true &&
    unit.genghisKhanDecreeMovePending !== true &&
    unit.genghisKhanMongolChargeActive !== true
  ) {
    return state;
  }
  const cleared: UnitState = {
    ...unit,
    genghisKhanDiagonalMoveActive: false,
    genghisKhanDecreeMovePending: false,
    genghisKhanMongolChargeActive: false,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: cleared,
    },
  };
}

export function clearLechyGuideTravelerTarget(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !unit.lechyGuideTravelerTargetId) return state;
  const cleared: UnitState = {
    ...unit,
    lechyGuideTravelerTargetId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: cleared,
    },
  };
}

export function getNextAliveUnitIndex(
  state: GameState,
  fromIndex: number,
  queue: string[]
): number | null {
  const len = queue.length;
  if (len === 0) return null;

  for (let step = 1; step <= len; step++) {
    const idx = (fromIndex + step) % len;
    const unitId = queue[idx];
    const unit = state.units[unitId];
    if (unit && unit.isAlive && unit.position) {
      return idx;
    }
  }

  return null;
}
