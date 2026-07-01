import type { UnitState } from "../model";
import { ABILITY_SPECS } from "./specs";
import type { AbilitySpec } from "./types";

export function getAbilitySpec(id: string): AbilitySpec | undefined {
  return ABILITY_SPECS[id];
}

export function getCharges(unit: UnitState, abilityId: string): number {
  return unit.charges[abilityId] ?? 0;
}

function toChargeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function getChargeLimit(abilityId: string): number | null {
  const spec = getAbilitySpec(abilityId);
  if (spec?.chargeUnlimited === true) return null;
  if (typeof spec?.maxCharges === "number") {
    return toChargeInt(spec.maxCharges);
  }
  return null;
}

export function isUnboundedChargeCounter(abilityId: string): boolean {
  return getAbilitySpec(abilityId)?.chargeUnlimited === true;
}

export function clampCharges(abilityId: string, value: number): number {
  const next = toChargeInt(value);
  const limit = getChargeLimit(abilityId);
  return limit === null ? next : Math.min(next, limit);
}

export function setCharges(
  unit: UnitState,
  abilityId: string,
  value: number
): UnitState {
  const next = clampCharges(abilityId, value);
  return {
    ...unit,
    charges: {
      ...unit.charges,
      [abilityId]: next,
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
  if (!spec && delta === 0) return unit;

  return setCharges(unit, abilityId, current + delta);
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
