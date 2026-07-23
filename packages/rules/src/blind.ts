import type { GameState, UnitState } from "./model";

/**
 * Apply Blind through the end of the unit's next turn.
 *
 * ownTurnsStarted is incremented when a unit starts a turn, so the next turn
 * always has ordinal current + 1, including when Blind is refreshed during the
 * unit's currently active turn.
 */
export function applyBlindUntilEndOfNextTurn(unit: UnitState): UnitState {
  const expiresAfterOwnTurn = (unit.ownTurnsStarted ?? 0) + 1;
  return {
    ...unit,
    blindUntilOwnTurnStart: true,
    blindExpiresAfterOwnTurn: Math.max(
      unit.blindExpiresAfterOwnTurn ?? 0,
      expiresAfterOwnTurn,
    ),
  };
}

export function expireBlindAfterUnitTurn(
  state: GameState,
  unitId: string | null,
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (
    !unit?.blindUntilOwnTurnStart ||
    unit.blindExpiresAfterOwnTurn === undefined ||
    (unit.ownTurnsStarted ?? 0) < unit.blindExpiresAfterOwnTurn
  ) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: {
        ...unit,
        blindUntilOwnTurnStart: false,
        blindExpiresAfterOwnTurn: undefined,
      },
    },
  };
}
