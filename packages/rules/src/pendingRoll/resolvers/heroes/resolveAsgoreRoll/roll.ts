import type { ApplyResult, GameState, PendingRoll, UnitState } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollManualD6 as rollD6 } from "../../../manualRoll";
import { ABILITY_ASGORE_SOUL_PARADE } from "../../../../abilities";
import { clearPendingRoll, requestRoll, evUnitHealed } from "../../../../core";
import {
  getAsgoreIntegrityDestinations,
  getAsgoreJusticeTargetIds,
  getAsgorePatienceTargetIds,
  getAsgorePerseveranceTargetIds,
  getAsgoreSoulParadeOutcome,
} from "../../../../actions/heroes/asgore";
import { getUnitBaseMaxHp } from "../../../../actions/shared";
import type {
  AsgoreSoulParadeIntegrityDestinationContext,
  AsgoreSoulParadeRollContext,
  AsgoreSoulParadeTargetChoiceContext,
} from "../../../types";
import { commitAsgoreSoulParadeCost, getAsgore } from "./helpers";
import { EVENT_VISIBILITY, movementVisibility } from "../../../../model/events/visibility";

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
  const soulResult = getAsgoreSoulParadeOutcome(outcome);
  const soulEvent = {
    type: "asgoreSoulParadeResolved" as const,
    asgoreId: asgore.id,
    sourceCell: asgore.position ? { ...asgore.position } : undefined,
    [EVENT_VISIBILITY]: {
      ...movementVisibility(state, asgore.id, asgore.position!),
      sourceCellRecipients: movementVisibility(state, asgore.id, asgore.position!).recipients,
    },
    roll: soulResult.roll,
    soulId: soulResult.soulId,
    soulName: soulResult.soulName,
    effectDescription: soulResult.effectDescription,
  };

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
        events: [soulEvent, ...committed.events],
      };
    }
    const requested = requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadePatienceTargetChoice",
      {
        asgoreId: asgore.id,
        options,
        soulResult,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      asgore.id
    );
    return { state: requested.state, events: [soulEvent, ...requested.events] };
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
      events: [soulEvent, ...committed.events],
    };
  }

  if (outcome === 3) {
    const options = getAsgoreIntegrityDestinations(state, asgore.id);
    if (options.length === 0) {
      const committed = commitAsgoreSoulParadeCost(state, asgore.id);
      if (!committed.ok) return { state, events: [] };
      return {
        state: clearPendingRoll(committed.state),
        events: [soulEvent, ...committed.events],
      };
    }
    const requested = requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadeIntegrityDestination",
      {
        asgoreId: asgore.id,
        options,
        soulResult,
      } satisfies AsgoreSoulParadeIntegrityDestinationContext,
      asgore.id
    );
    return { state: requested.state, events: [soulEvent, ...requested.events] };
  }

  if (outcome === 4) {
    const options = getAsgorePerseveranceTargetIds(state, asgore.id);
    if (options.length === 0) {
      const committed = commitAsgoreSoulParadeCost(state, asgore.id);
      if (!committed.ok) return { state, events: [] };
      return {
        state: clearPendingRoll(committed.state),
        events: [soulEvent, ...committed.events],
      };
    }
    const requested = requestRoll(
      clearPendingRoll(state),
      asgore.owner,
      "asgoreSoulParadePerseveranceTargetChoice",
      {
        asgoreId: asgore.id,
        options,
        soulResult,
      } satisfies AsgoreSoulParadeTargetChoiceContext,
      asgore.id
    );
    return { state: requested.state, events: [soulEvent, ...requested.events] };
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
              soulEvent,
              ...committed.events,
              evUnitHealed({
                unitId: updatedAsgore.id,
                amount: healedAmount,
                hpAfter,
                sourceAbilityId: ABILITY_ASGORE_SOUL_PARADE,
              }),
            ]
          : [soulEvent, ...committed.events],
    };
  }

  const options = getAsgoreJusticeTargetIds(state, asgore.id);
  if (options.length === 0) {
    const committed = commitAsgoreSoulParadeCost(state, asgore.id);
    if (!committed.ok) return { state, events: [] };
    return {
      state: clearPendingRoll(committed.state),
      events: [soulEvent, ...committed.events],
    };
  }
  const requested = requestRoll(
    clearPendingRoll(state),
    asgore.owner,
    "asgoreSoulParadeJusticeTargetChoice",
    {
      asgoreId: asgore.id,
      options,
      soulResult,
    } satisfies AsgoreSoulParadeTargetChoiceContext,
    asgore.id
  );
  return { state: requested.state, events: [soulEvent, ...requested.events] };
}
