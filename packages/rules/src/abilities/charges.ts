import type { UnitState } from "../model";
import { ABILITY_SPECS } from "./specs";
import type { AbilitySpec } from "./types";

export function getAbilitySpec(id: string): AbilitySpec | undefined {
  return ABILITY_SPECS[id];
}

export function getCharges(unit: UnitState, abilityId: string): number {
  return unit.charges[abilityId] ?? 0;
}

export function setCharges(
  unit: UnitState,
  abilityId: string,
  value: number
): UnitState {
  return {
    ...unit,
    charges: {
      ...unit.charges,
      [abilityId]: value,
    },
  };
}

export function addCharges(
  unit: UnitState,
  abilityId: string,
  delta: number
): UnitState {
  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);
  let next = current + delta;

  if (spec?.maxCharges !== undefined) {
    next = Math.min(next, spec.maxCharges);
  }
  if (next < 0) next = 0;

  return setCharges(unit, abilityId, next);
}

export function canUseAbility(unit: UnitState, abilityId: string): boolean {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return false;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const current = getCharges(unit, abilityId);

  return current >= need;
}

export function consumeAbilityCharges(
  unit: UnitState,
  abilityId: string
): UnitState {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return unit;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: updated } = spendCharges(unit, abilityId, need);
  return updated;
}

export function spendCharges(
  unit: UnitState,
  abilityId: string,
  amount: number
): { unit: UnitState; ok: boolean } {
  if (amount <= 0) {
    return { unit, ok: true };
  }

  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);

  if (current < amount) {
    return { unit, ok: false };
  }

  const resets = spec?.resetsChargesOnUse ?? false;
  const newValue = resets ? 0 : current - amount;

  const updated = setCharges(unit, abilityId, newValue);
  return { unit: updated, ok: true };
}
