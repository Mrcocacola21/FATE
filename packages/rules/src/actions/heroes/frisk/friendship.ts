import type { ApplyResult, GameState, PlayerId, UnitState } from "../../../model";
import { ABILITY_FRISK_GENOCIDE, getCharges } from "../../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { evGameEnded } from "../../../core";
import { isFrisk } from "./helpers";

export function canTriggerPowerOfFriendshipForFrisk(
  state: GameState,
  frisk: UnitState
): boolean {
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) return false;
  if (frisk.friskPacifismDisabled) return false;
  if (getCharges(frisk, ABILITY_FRISK_GENOCIDE) !== 0) return false;

  const enemiesAlive = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      !!unit.position &&
      unit.owner !== frisk.owner &&
      unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
  ).length;
  return enemiesAlive === 1;
}

function getPowerOfFriendshipWinner(state: GameState): PlayerId | null {
  if (state.phase === "ended") return null;
  const friskUnits = Object.values(state.units).filter(
    (unit) => isFrisk(unit) && unit.isAlive && !!unit.position
  );
  for (const frisk of friskUnits) {
    if (canTriggerPowerOfFriendshipForFrisk(state, frisk)) {
      return frisk.owner;
    }
  }
  return null;
}

export function tryApplyFriskPowerOfFriendship(
  state: GameState
): ApplyResult | null {
  const winner = getPowerOfFriendshipWinner(state);
  if (!winner) return null;
  return {
    state: {
      ...state,
      phase: "ended",
      activeUnitId: null,
      pendingMove: null,
      pendingRoll: null,
    },
    events: [evGameEnded({ winner })],
  };
}
