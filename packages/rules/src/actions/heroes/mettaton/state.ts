import type { GameEvent, GameState, UnitState } from "../../../model";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { getAbilitySpec } from "../../../abilities";
import {
  addMettatonRating,
  buildMettatonRatingChangedEvent,
  getMettatonRating,
  hasMettatonStagePhenomenon,
  isMettaton,
  spendMettatonRating,
} from "../../../mettaton";
import { evAbilityUsed } from "../../../core";

export function applyMettatonRatingSpend(
  state: GameState,
  unitId: string,
  amount: number
): { state: GameState; events: GameEvent[]; ok: boolean } {
  const unit = state.units[unitId];
  if (!unit || !isMettaton(unit)) {
    return { state, events: [], ok: false };
  }
  const spent = spendMettatonRating(unit, amount);
  if (!spent.ok) {
    return { state, events: [], ok: false };
  }
  if (spent.spent <= 0) {
    return { state, events: [], ok: true };
  }
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: spent.unit,
    },
  };
  return {
    state: nextState,
    events: [
      buildMettatonRatingChangedEvent({
        unitId: unit.id,
        delta: -spent.spent,
        now: getMettatonRating(spent.unit),
        reason: "abilitySpend",
      }),
    ],
    ok: true,
  };
}

export function applyMettatonStagePhenomenonBonus(
  state: GameState,
  unitId: string
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !isMettaton(unit) || !hasMettatonStagePhenomenon(unit)) {
    return { state, events: [] };
  }
  const gained = addMettatonRating(unit, 1);
  if (gained.applied <= 0) {
    return { state, events: [] };
  }
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: gained.unit,
    },
  };
  return {
    state: nextState,
    events: [
      buildMettatonRatingChangedEvent({
        unitId: unit.id,
        delta: gained.applied,
        now: getMettatonRating(gained.unit),
        reason: "stagePhenomenon",
      }),
    ],
  };
}

export function buildActionBaseState(
  state: GameState,
  unit: UnitState,
  abilityId: string,
  ratingCost: number
): { state: GameState; events: GameEvent[] } | null {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return null;
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return null;
  }

  const spent = applyMettatonRatingSpend(state, unit.id, ratingCost);
  if (!spent.ok) {
    return null;
  }
  const afterSpend = spent.state.units[unit.id];
  if (!afterSpend) return null;

  const updatedUnit = spendSlots(afterSpend, costs);
  const afterSlotState: GameState = {
    ...spent.state,
    units: {
      ...spent.state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const stageBonus = applyMettatonStagePhenomenonBonus(afterSlotState, updatedUnit.id);

  return {
    state: stageBonus.state,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
      ...spent.events,
      ...stageBonus.events,
    ],
  };
}

export function applyMettatonStagePhenomenonOnAttackAction(
  state: GameState,
  attackerId: string
): { state: GameState; events: GameEvent[] } {
  return applyMettatonStagePhenomenonBonus(state, attackerId);
}
