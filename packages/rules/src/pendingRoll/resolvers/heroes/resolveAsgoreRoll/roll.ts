import type { ApplyResult, GameState, PendingRoll, UnitState } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import { ABILITY_ASGORE_SOUL_PARADE } from "../../../../abilities";
import { clearPendingRoll, requestRoll, evUnitHealed } from "../../../../core";
import {
  getAsgoreIntegrityDestinations,
  getAsgoreJusticeTargetIds,
  getAsgorePatienceTargetIds,
  getAsgorePerseveranceTargetIds,
} from "../../../../actions/heroes/asgore";
import { getUnitBaseMaxHp } from "../../../../actions/shared";
import type {
  AsgoreSoulParadeIntegrityDestinationContext,
  AsgoreSoulParadeRollContext,
  AsgoreSoulParadeTargetChoiceContext,
} from "../../../types";
import { getAsgore } from "./helpers";

export function resolveAsgoreSoulParadeRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeRollContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const outcome = rollD6(rng);

  if (outcome === 1) {
    const updatedAsgore: UnitState = {
      ...asgore,
      asgorePatienceStealthActive: true,
    };
    const stateAfterBuff: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedAsgore.id]: updatedAsgore,
      },
    };
    const options = getAsgorePatienceTargetIds(stateAfterBuff, updatedAsgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(stateAfterBuff), events: [] };
    }
    return requestRoll(
      clearPendingRoll(stateAfterBuff),
      updatedAsgore.owner,
      "asgoreSoulParadePatienceTargetChoice",
      {
        asgoreId: updatedAsgore.id,
        options,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      updatedAsgore.id
    );
  }

  if (outcome === 2) {
    const updatedAsgore: UnitState = {
      ...asgore,
      asgoreBraveryAutoDefenseReady: true,
    };
    return {
      state: clearPendingRoll({
        ...state,
        units: {
          ...state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events: [],
    };
  }

  if (outcome === 3) {
    const options = getAsgoreIntegrityDestinations(state, asgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(state), events: [] };
    }
    return requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadeIntegrityDestination",
      {
        asgoreId: asgore.id,
        options,
      } satisfies AsgoreSoulParadeIntegrityDestinationContext,
      asgore.id
    );
  }

  if (outcome === 4) {
    const options = getAsgorePerseveranceTargetIds(state, asgore.id);
    if (options.length === 0) {
      return { state: clearPendingRoll(state), events: [] };
    }
    return requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadePerseveranceTargetChoice",
      {
        asgoreId: asgore.id,
        options,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      asgore.id
    );
  }

  if (outcome === 5) {
    const maxHp = getUnitBaseMaxHp(asgore);
    const hpAfter = Math.min(maxHp, asgore.hp + 2);
    const healedAmount = Math.max(0, hpAfter - asgore.hp);
    const updatedAsgore: UnitState = {
      ...asgore,
      hp: hpAfter,
    };
    return {
      state: clearPendingRoll({
        ...state,
        units: {
          ...state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events:
        healedAmount > 0
          ? [
              evUnitHealed({
                unitId: updatedAsgore.id,
                amount: healedAmount,
                hpAfter,
                sourceAbilityId: ABILITY_ASGORE_SOUL_PARADE,
              }),
            ]
          : [],
    };
  }

  const options = getAsgoreJusticeTargetIds(state, asgore.id);
  if (options.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }
  return requestRoll(
    clearPendingRoll(state),
    asgore.owner,
    "asgoreSoulParadeJusticeTargetChoice",
    {
      asgoreId: asgore.id,
      options,
    } satisfies AsgoreSoulParadeTargetChoiceContext,
    asgore.id
  );
}
