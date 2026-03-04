import type { Coord, GameEvent, UnitState } from "../model";
import {
  HERO_GRIFFITH_ID,
  HERO_GUTS_ID,
  HERO_KALADIN_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { applyGriffithFemtoRebirth } from "../actions/heroes/griffith";
import { hasUndyneImmortalActive } from "../undyne";
import {
  getChikatiloMarkBonus,
  hasLegendOfTheSteppesBonus,
} from "./helpers";
import { distanceInfo, isSpearmanReachTarget } from "./math";
import type { HitResolution, ResolveAttackParams } from "./types";

export function resolveHitDamage(
  params: ResolveAttackParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>,
  events: GameEvent[],
  hit: boolean
): HitResolution {
  let damage = 0;
  let defenderHpAfterEvent = defenderAfter.hp;
  let attackerRevealedToDefender = false;
  let revealedAttackerPos: Coord | null = null;

  if (!hit) {
    return {
      attackerAfter,
      defenderAfter,
      units,
      events,
      damage,
      defenderHpAfterEvent,
      attackerRevealedToDefender,
      revealedAttackerPos,
    };
  }

  const attackerWasStealthed =
    attackerAfter.class === "assassin" && attackerAfter.isStealthed;

  if (attackerWasStealthed) {
    attackerAfter = {
      ...attackerAfter,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };
    revealedAttackerPos = attackerAfter.position ?? null;
    attackerRevealedToDefender = true;
  }

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
    const markBonus = getChikatiloMarkBonus(attackerAfter, defenderAfter.id);
    if (markBonus) {
      damage += markBonus;
    }
    if (hasLegendOfTheSteppesBonus(attackerAfter, defenderAfter.id)) {
      damage += 1;
    }
    if (
      attackerAfter.heroId === HERO_GUTS_ID &&
      attackerAfter.gutsBerserkModeActive &&
      !params.rangedAttack
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

  if (defenderAfter.bunker?.active) {
    damage = Math.min(1, damage);
  }

  if (
    defenderAfter.heroId === HERO_GUTS_ID &&
    defenderAfter.gutsBerserkModeActive
  ) {
    damage = Math.min(1, damage);
  }
  if (
    defenderAfter.heroId === HERO_UNDYNE_ID &&
    hasUndyneImmortalActive(defenderAfter)
  ) {
    damage = Math.min(1, damage);
  }

  const newHp = Math.max(0, defenderAfter.hp - damage);
  defenderAfter = {
    ...defenderAfter,
    hp: newHp,
  };
  defenderHpAfterEvent = newHp;

  if (newHp <= 0) {
    const deathPosition = defenderAfter.position ? { ...defenderAfter.position } : null;
    defenderAfter = {
      ...defenderAfter,
      isAlive: false,
      position: null,
    };
    events.push({
      type: "unitDied",
      unitId: defenderAfter.id,
      killerId: attackerAfter.id,
    });
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
  };
}
