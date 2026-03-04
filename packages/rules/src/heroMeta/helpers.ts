import type { UnitClass } from "../model";
import { getUnitDefinition } from "../units";
import { getAbilitySpec } from "../abilities";
import { getHeroDefinition } from "../heroes";
import type { AbilityMeta } from "./types";

export function getMoveType(unitClass: UnitClass): string {
  if (unitClass === "rider") return "rider";
  if (unitClass === "berserker") return "berserker";
  return "normal";
}

export function getAttackRange(unitClass: UnitClass): string {
  if (unitClass === "archer") return "line";
  if (unitClass === "spearman") return "reach-2";
  return "melee";
}

export function buildBaseStats(mainClass: UnitClass, heroId?: string) {
  const definition = getUnitDefinition(mainClass);
  const hero = getHeroDefinition(heroId);
  return {
    hp: hero?.baseHpOverride ?? definition.maxHp,
    damage: hero?.baseAttackOverride ?? definition.baseAttack,
    moveType: getMoveType(mainClass),
    attackRange: getAttackRange(mainClass),
  };
}

export function buildAbilityMeta(abilityId: string): AbilityMeta | null {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return null;
  const consumes = spec.actionCost?.consumes;
  const chargeRequired = spec.chargeUnlimited
    ? null
    : spec.chargesPerUse ?? spec.chargeCost ?? spec.maxCharges;
  return {
    id: spec.id,
    name: spec.displayName,
    type: spec.kind,
    description: spec.description,
    consumesAction: consumes?.action === true,
    consumesMove: consumes?.move === true,
    chargeRequired,
  };
}

export function mapAbilityMetaList(abilityIds: string[]): AbilityMeta[] {
  return abilityIds
    .map(buildAbilityMeta)
    .filter((item): item is AbilityMeta => item !== null);
}
