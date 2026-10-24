import type { Coord, GameEvent, UnitState } from "../model";
import {
  HERO_DUOLINGO_ID,
  HERO_GRIFFITH_ID,
  HERO_GUTS_ID,
  HERO_KALADIN_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { applyGriffithFemtoRebirth } from "../actions/heroes/griffith";
import { hasUndyneImmortalActive } from "../undyne";
import { getChikatiloMarkBonus, hasLegendOfTheSteppesBonus } from "./helpers";
import { distanceInfo, isSpearmanReachTarget } from "./math";
import type { HitResolution, ResolveAttackParams } from "./types";
import { resolveUnitDeath } from "../death";

type HitDamageParams = Pick<
  ResolveAttackParams,
  "damageOverride" | "damageBonus" | "ignoreBonuses" | "rangedAttack" | "ignoreRange" | "suppressGutsBerserkBonus"
>;

/** Damage a successful hit would deal, before HP is applied; shared by the defense prompt label. */
export function computeHitDamage(
  params: HitDamageParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  attackerWasStealthedAtAttempt: boolean,
): {
  damage: number;
  bunkerAbsorbedDamage: number;
  damageReductions: NonNullable<HitResolution["damageReductions"]>;
} {
  let damage = 0;
  const attackerWasStealthed = attackerAfter.class === "assassin" && attackerWasStealthedAtAttempt;

  if (params.damageOverride !== undefined) {
    damage = params.damageOverride;
  } else if (attackerWasStealthed) {
    damage = 2;
  } else {
    damage = attackerAfter.attack;
  }

  if (!params.ignoreBonuses) {
    if (params.damageBonus) {
      damage += params.damageBonus;
    }
    if (
      attackerAfter.heroId === HERO_DUOLINGO_ID &&
      (attackerAfter.duolingoHitTargetsLastTurn ?? []).includes(defenderAfter.id)
    ) {
      damage += 1;
    }
    const markBonus = getChikatiloMarkBonus(
      attackerAfter,
      defenderAfter.id,
      attackerWasStealthedAtAttempt,
    );
    if (markBonus) {
      damage += markBonus;
    }
    if (hasLegendOfTheSteppesBonus(attackerAfter, defenderAfter.id)) {
      damage += 1;
    }
    if (
      attackerAfter.heroId === HERO_GUTS_ID &&
      attackerAfter.gutsBerserkModeActive &&
      !params.rangedAttack &&
      !params.suppressGutsBerserkBonus &&
      attackerAfter.position &&
      defenderAfter.position &&
      distanceInfo(attackerAfter.position, defenderAfter.position).cheb === 1
    ) {
      damage += 1;
    }
    if (
      attackerAfter.heroId === HERO_KALADIN_ID &&
      !params.rangedAttack &&
      !params.ignoreRange &&
      attackerAfter.position &&
      defenderAfter.position &&
      isSpearmanReachTarget(attackerAfter.position, defenderAfter.position)
    ) {
      damage += 1;
    }
    if (
      attackerAfter.heroId === HERO_UNDYNE_ID &&
      hasUndyneImmortalActive(attackerAfter) &&
      attackerAfter.position &&
      defenderAfter.position &&
      distanceInfo(attackerAfter.position, defenderAfter.position).cheb === 1
    ) {
      damage += 1;
    }
  }

  if (attackerAfter.heroId === HERO_GRIFFITH_ID) {
    damage = Math.max(0, damage - 1);
  }

  const bunkerAbsorbedDamage = defenderAfter.bunker?.active ? Math.max(0, damage - Math.min(1, damage)) : 0;
  if (defenderAfter.bunker?.active) {
    damage = Math.min(1, damage);
  }

  const damageReductions: NonNullable<HitResolution["damageReductions"]> = [];
  if (defenderAfter.heroId === HERO_GUTS_ID && defenderAfter.gutsBerserkModeActive) {
    if (damage > 1) damageReductions.push({ abilityId: "gutsBerserkMode", amount: damage - 1 });
    damage = Math.min(1, damage);
  }
  if (defenderAfter.heroId === HERO_UNDYNE_ID && hasUndyneImmortalActive(defenderAfter)) {
    if (damage > 1) damageReductions.push({ abilityId: "undyneUndying", amount: damage - 1 });
    damage = Math.min(1, damage);
  }

  return { damage, bunkerAbsorbedDamage, damageReductions };
}

export function resolveHitDamage(
  params: ResolveAttackParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>,
  events: GameEvent[],
  hit: boolean,
  attackerWasStealthedAtAttempt: boolean,
): HitResolution {
  let defenderHpAfterEvent = defenderAfter.hp;
  const attackerRevealedToDefender = false;
  const revealedAttackerPos: Coord | null = null;

  if (!hit) {
    return {
      attackerAfter,
      defenderAfter,
      units,
      events,
      damage: 0,
      defenderHpAfterEvent,
      attackerRevealedToDefender,
      revealedAttackerPos,
    };
  }

  const computed = computeHitDamage(
    params,
    attackerAfter,
    defenderAfter,
    attackerWasStealthedAtAttempt,
  );
  const damage = computed.damage;
  const bunkerAbsorbedDamage = computed.bunkerAbsorbedDamage;
  const damageReductions = computed.damageReductions;

  const newHp = Math.max(0, defenderAfter.hp - damage);
  defenderAfter = {
    ...defenderAfter,
    hp: newHp,
  };
  defenderHpAfterEvent = newHp;

  if (newHp <= 0) {
    const deathPosition = defenderAfter.position ? { ...defenderAfter.position } : null;
    defenderAfter = resolveUnitDeath(defenderAfter, attackerAfter.id, events);
    const rebirth = applyGriffithFemtoRebirth(defenderAfter, deathPosition);
    if (rebirth.transformed) {
      defenderAfter = rebirth.unit;
      events.push(...rebirth.events);
    }
  }

  units[attackerAfter.id] = attackerAfter;
  units[defenderAfter.id] = defenderAfter;

  return {
    attackerAfter,
    defenderAfter,
    units,
    events,
    damage,
    defenderHpAfterEvent,
    attackerRevealedToDefender,
    revealedAttackerPos,
    ...(bunkerAbsorbedDamage > 0 ? { bunkerAbsorbedDamage } : {}),
    ...(damageReductions.length ? { damageReductions } : {}),
  };
}
