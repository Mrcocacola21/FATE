import type { GameEvent, GameState, TurnSlot, UnitState } from "../model";
import {
  getAbilitySpec,
  spendCharges,
  type AbilitySpec,
} from "../abilities";
import {
  canSpendSlots,
  spendSlots,
  type TurnSlotCosts,
} from "../turnEconomy";
import { evAbilityUsed } from "../core";

export interface AbilityCostCommitOptions {
  costs?: Partial<Record<TurnSlot, boolean>>;
  chargeAmount?: number;
  emitAbilityUsedEvent?: boolean;
}

export type AbilityCostCommitResult =
  | {
      ok: true;
      state: GameState;
      unit: UnitState;
      events: GameEvent[];
      spec: AbilitySpec;
    }
  | {
      ok: false;
      state: GameState;
      events: [];
      spec?: AbilitySpec;
    };

function hasSlotCost(costs: TurnSlotCosts | undefined): boolean {
  return !!(costs?.move || costs?.attack || costs?.action || costs?.stealth);
}

function getCommitCosts(
  spec: AbilitySpec,
  options?: AbilityCostCommitOptions
): TurnSlotCosts | undefined {
  return options?.costs ?? spec.actionCost?.consumes;
}

function getCommitChargeAmount(
  spec: AbilitySpec,
  options?: AbilityCostCommitOptions
): number {
  return options?.chargeAmount ?? spec.chargesPerUse ?? spec.chargeCost ?? 0;
}

export function canCommitAbilityCost(
  state: GameState,
  unitId: string,
  abilityId: string,
  options?: AbilityCostCommitOptions
): boolean {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return false;
  const unit = state.units[unitId];
  if (!unit) return false;

  const costs = getCommitCosts(spec, options);
  if (!canSpendSlots(unit, costs)) return false;

  const chargeAmount = getCommitChargeAmount(spec, options);
  return spendCharges(unit, spec.id, chargeAmount).ok;
}

export function commitAbilityCost(
  state: GameState,
  unitId: string,
  abilityId: string,
  options?: AbilityCostCommitOptions
): AbilityCostCommitResult {
  const spec = getAbilitySpec(abilityId);
  if (!spec) {
    return { ok: false, state, events: [] };
  }

  const unit = state.units[unitId];
  if (!unit) {
    return { ok: false, state, events: [], spec };
  }

  const costs = getCommitCosts(spec, options);
  if (!canSpendSlots(unit, costs)) {
    return { ok: false, state, events: [], spec };
  }

  const chargeAmount = getCommitChargeAmount(spec, options);
  const spentCharges = spendCharges(unit, spec.id, chargeAmount);
  if (!spentCharges.ok) {
    return { ok: false, state, events: [], spec };
  }

  const updatedUnit = hasSlotCost(costs)
    ? spendSlots(spentCharges.unit, costs)
    : spentCharges.unit;
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events =
    options?.emitAbilityUsedEvent === false
      ? []
      : [evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id })];

  return {
    ok: true,
    state: nextState,
    unit: updatedUnit,
    events,
    spec,
  };
}
