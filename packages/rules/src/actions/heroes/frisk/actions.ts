import type { ApplyResult, GameState, UnitState } from "../../../model";
import { requestRoll } from "../../../core";
import {
  canFriskUsePacifism,
  getFriskPacifismTargetIds,
  getFriskWarmWordsTargetIds,
  isFrisk,
} from "./helpers";
import { canTriggerPowerOfFriendshipForFrisk } from "./friendship";

export function applyFriskPacifism(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!canFriskUsePacifism(unit) || !unit.position) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    unit.owner,
    "friskPacifismChoice",
    {
      friskId: unit.id,
      hugsOptions: getFriskPacifismTargetIds(state, unit.id),
      warmWordsOptions: getFriskWarmWordsTargetIds(state, unit.id),
      canPowerOfFriendship: canTriggerPowerOfFriendshipForFrisk(state, unit),
    },
    unit.id
  );
}

export function applyFriskGenocide(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isFrisk(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    unit.owner,
    "friskGenocideChoice",
    { friskId: unit.id },
    unit.id
  );
}

export function markFriskAttackedWhileStealthed(
  state: GameState,
  attackerId: string
): GameState {
  const attacker = state.units[attackerId];
  if (!isFrisk(attacker) || !attacker.isStealthed) {
    return state;
  }
  if (attacker.friskDidAttackWhileStealthedSinceLastEnter) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [attacker.id]: {
        ...attacker,
        friskDidAttackWhileStealthedSinceLastEnter: true,
      },
    },
  };
}
