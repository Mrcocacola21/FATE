import type { GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../heroes";
import { revealUnit } from "./reveal";

export function processUnitStartOfTurnStealth(
  state: GameState,
  unitId: string,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  if (!unit.isStealthed) {
    return { state, events: [] };
  }

  if (unit.heroId === HERO_CHIKATILO_ID) {
    const otherRealUnits = Object.values(state.units).filter(
      (other) =>
        other.isAlive &&
        other.id !== unit.id &&
        other.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    );
    if (otherRealUnits.length === 0) {
      const result = revealUnit(state, unit.id, "timerExpired", rng);
      return { state: result.state, events: result.events };
    }

    const tokenId = unit.chikatiloFalseTrailTokenId;
    const tokenAlive =
      tokenId && state.units[tokenId] && state.units[tokenId].isAlive;
    if (tokenAlive) {
      return { state, events: [] };
    }
  }

  if (unit.stealthTurnsLeft <= 0) {
    const result = revealUnit(state, unit.id, "timerExpired", rng);
    return { state: result.state, events: result.events };
  }

  const updated: UnitState = {
    ...unit,
    stealthTurnsLeft: unit.stealthTurnsLeft - 1,
  };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
  };

  return { state: nextState, events: [] };
}
