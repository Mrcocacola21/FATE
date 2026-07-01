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
import { commitAsgoreSoulParadeCost, getAsgore } from "./helpers";

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
    const options = getAsgorePatienceTargetIds(state, asgore.id);
    if (options.length === 0) {
      const committed = commitAsgoreSoulParadeCost(state, asgore.id);
      if (!committed.ok) return { state, events: [] };
      const updatedAsgore: UnitState = {
        ...committed.unit,
        asgorePatienceStealthActive: true,
      };
      return {
        state: clearPendingRoll({
          ...committed.state,
          units: {
            ...committed.state.units,
            [updatedAsgore.id]: updatedAsgore,
          },
        }),
        events: committed.events,
      };
    }
    return requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadePatienceTargetChoice",
      {
        asgoreId: asgore.id,
        options,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      asgore.id
    );
  }

  if (outcome === 2) {
    const committed = commitAsgoreSoulParadeCost(state, asgore.id);
    if (!committed.ok) return { state, events: [] };
    const updatedAsgore: UnitState = {
      ...committed.unit,
      asgoreBraveryAutoDefenseReady: true,
    };
    return {
      state: clearPendingRoll({
        ...committed.state,
        units: {
          ...committed.state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events: committed.events,
    };
  }

  if (outcome === 3) {
    const options = getAsgoreIntegrityDestinations(state, asgore.id);
    if (options.length === 0) {
      const committed = commitAsgoreSoulParadeCost(state, asgore.id);
      if (!committed.ok) return { state, events: [] };
      return { state: clearPendingRoll(committed.state), events: committed.events };
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
      const committed = commitAsgoreSoulParadeCost(state, asgore.id);
      if (!committed.ok) return { state, events: [] };
      return { state: clearPendingRoll(committed.state), events: committed.events };
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
    const committed = commitAsgoreSoulParadeCost(state, asgore.id);
    if (!committed.ok) return { state, events: [] };
    const committedAsgore = committed.unit;
    const maxHp = getUnitBaseMaxHp(asgore);
    const hpAfter = Math.min(maxHp, committedAsgore.hp + 2);
    const healedAmount = Math.max(0, hpAfter - committedAsgore.hp);
    const updatedAsgore: UnitState = {
      ...committedAsgore,
      hp: hpAfter,
    };
    return {
      state: clearPendingRoll({
        ...committed.state,
        units: {
          ...committed.state.units,
          [updatedAsgore.id]: updatedAsgore,
        },
      }),
      events:
        healedAmount > 0
          ? [
              ...committed.events,
              evUnitHealed({
                unitId: updatedAsgore.id,
                amount: healedAmount,
                hpAfter,
                sourceAbilityId: ABILITY_ASGORE_SOUL_PARADE,
              }),
            ]
          : committed.events,
    };
  }

  const options = getAsgoreJusticeTargetIds(state, asgore.id);
  if (options.length === 0) {
    const committed = commitAsgoreSoulParadeCost(state, asgore.id);
    if (!committed.ok) return { state, events: [] };
    return { state: clearPendingRoll(committed.state), events: committed.events };
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
