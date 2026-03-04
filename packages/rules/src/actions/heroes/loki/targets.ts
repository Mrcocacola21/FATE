import type { Coord, GameState } from "../../../model";
import { chebyshev } from "../../../board";
import { canAttackTarget } from "../../../combat";
import { canDirectlyTargetUnit } from "../../../visibility";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { canSpendSlots } from "../../../turnEconomy";
import { isLoki } from "./effects";

export function getLokiTricksterAreaTargetIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === loki.id) return false;
      return chebyshev(loki.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiChickenTargetIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === loki.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return chebyshev(loki.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiForcedAttackTargetIds(
  state: GameState,
  attackerId: string
): string[] {
  const attacker = state.units[attackerId];
  if (!attacker || !attacker.isAlive || !attacker.position) {
    return [];
  }
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return [];
  }

  return Object.values(state.units)
    .filter((target) => {
      if (!target.isAlive || !target.position) return false;
      if (target.id === attacker.id) return false;
      if (!canDirectlyTargetUnit(state, attacker.id, target.id)) return false;
      return canAttackTarget(state, attacker, target, {
        allowFriendlyTarget: true,
      });
    })
    .map((target) => target.id)
    .sort();
}

export function getLokiMindControlEnemyIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === loki.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      if (chebyshev(loki.position!, unit.position) > 2) return false;
      if (!canSpendSlots(unit, { attack: true, action: true })) return false;
      return getLokiForcedAttackTargetIds(state, unit.id).length > 0;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiSpinCandidateIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner !== loki.owner) return false;
      if (unit.id === loki.id) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return true;
    })
    .map((unit) => unit.id)
    .sort();
}

export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}
