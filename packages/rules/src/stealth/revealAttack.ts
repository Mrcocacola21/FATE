import type { GameEvent, GameState, UnitState } from "../model";
import { clearUnitStealth } from "./state";

export function revealAttackerOnAttackAttempt(
  state: GameState,
  attackerId: string,
): { state: GameState; events: GameEvent[]; wasStealthed: boolean } {
  const attacker = state.units[attackerId];
  if (!attacker || !attacker.isAlive || !attacker.position || !attacker.isStealthed) {
    return { state, events: [], wasStealthed: false };
  }

  const revealed: UnitState = clearUnitStealth(attacker);
  const lastKnownPositions = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  delete lastKnownPositions.P1[attackerId];
  delete lastKnownPositions.P2[attackerId];

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [attackerId]: revealed,
      },
      knowledge: {
        ...state.knowledge,
        P1: { ...(state.knowledge?.P1 ?? {}), [attackerId]: true },
        P2: { ...(state.knowledge?.P2 ?? {}), [attackerId]: true },
      },
      lastKnownPositions,
    },
    events: [
      {
        type: "stealthRevealed",
        unitId: attackerId,
        reason: "attacked",
        revealerId: attackerId,
      },
    ],
    wasStealthed: true,
  };
}
