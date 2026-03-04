import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../../model";
import {
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_CANNON,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { evAbilityUsed } from "../../../core";
import { canUseArcherLikeAttack, isGuts, requestGutsRangedAttack } from "./helpers";
import type { TargetPayload } from "./types";

export function applyGutsArbalet(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (target.owner === unit.owner) {
    return { state, events: [] };
  }
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_ARBALET);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(unit, costs);
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const requested = requestGutsRangedAttack(nextState, updatedUnit, targetId, {
    damageOverride: 1,
    ignoreBonuses: true,
  });
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyGutsCannon(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (target.owner === unit.owner) {
    return { state, events: [] };
  }
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_CANNON);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const requested = requestGutsRangedAttack(nextState, updatedUnit, targetId);
  return { state: requested.state, events: [...events, ...requested.events] };
}
