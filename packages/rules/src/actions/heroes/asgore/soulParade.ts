import type { ApplyResult, GameState } from "../../../model";
import {
  ABILITY_ASGORE_SOUL_PARADE,
  getAbilitySpec,
  getCharges,
} from "../../../abilities";
import { requestRoll } from "../../../core";
import { canCommitAbilityCost } from "../../abilityCosts";
import type { AsgoreSoulParadeRollContext } from "../../../pendingRoll/types";
import { isAsgore } from "./helpers";

export function maybeTriggerAsgoreSoulParade(
  state: GameState,
  unitId: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !isAsgore(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_SOUL_PARADE);
  if (!spec) {
    return { state, events: [] };
  }
  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  if (getCharges(unit, spec.id) < chargeAmount) {
    return { state, events: [] };
  }

  if (!canCommitAbilityCost(state, unit.id, spec.id)) {
    return { state, events: [] };
  }

  const updatedUnit = {
    ...unit,
    asgorePatienceStealthActive: false,
  };
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const requested = requestRoll(
    nextState,
    updatedUnit.owner,
    "asgoreSoulParadeRoll",
    { asgoreId: updatedUnit.id } satisfies AsgoreSoulParadeRollContext,
    updatedUnit.id
  );
  return requested;
}

export function clearAsgoreTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !isAsgore(unit) || !unit.asgorePatienceStealthActive) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: {
        ...unit,
        asgorePatienceStealthActive: false,
      },
    },
  };
}
