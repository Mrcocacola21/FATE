import type { GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../heroes";
import { revealUnit } from "./reveal";
import { getStealthDurationState } from "./state";

export function processUnitStartOfTurnStealth(
  state: GameState,
  unitId: string,
  rng: RNG,
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  if (!unit.isStealthed) {
    return { state, events: [] };
  }

  const ownTurnOrdinal = (unit.ownTurnsStarted ?? 0) + 1;
  const duration = getStealthDurationState(unit);
  if (duration.lastProcessedOwnTurnStart === ownTurnOrdinal) {
    return { state, events: [] };
  }

  if (unit.heroId === HERO_CHIKATILO_ID) {
    const otherRealUnits = Object.values(state.units).filter(
      (other) =>
        other.isAlive && other.id !== unit.id && other.heroId !== HERO_FALSE_TRAIL_TOKEN_ID,
    );
    if (otherRealUnits.length === 0) {
      const result = revealUnit(state, unit.id, "timerExpired", rng);
      return { state: result.state, events: result.events };
    }

    const tokenId = unit.chikatiloFalseTrailTokenId;
    const tokenAlive = tokenId && state.units[tokenId] && state.units[tokenId].isAlive;
    const isFalseTrailStealth =
      duration.kind === "falseTrail" || (unit.stealthDuration === undefined && tokenAlive);
    if (tokenAlive && isFalseTrailStealth) {
      const updated: UnitState = {
        ...unit,
        stealthDuration: {
          ...duration,
          kind: "falseTrail",
          lastProcessedOwnTurnStart: ownTurnOrdinal,
        },
      };
      return {
        state: {
          ...state,
          units: { ...state.units, [updated.id]: updated },
        },
        events: [],
      };
    }
  }

  const ownTurnStartsWhileHidden = duration.ownTurnStartsWhileHidden + 1;
  if (ownTurnStartsWhileHidden > duration.maxOwnTurnStartsHidden) {
    const result = revealUnit(state, unit.id, "timerExpired", rng);
    return { state: result.state, events: result.events };
  }

  const updated: UnitState = {
    ...unit,
    stealthTurnsLeft: Math.max(0, duration.maxOwnTurnStartsHidden - ownTurnStartsWhileHidden),
    stealthDuration: {
      ...duration,
      ownTurnStartsWhileHidden,
      lastProcessedOwnTurnStart: ownTurnOrdinal,
      kind: "normal",
    },
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
