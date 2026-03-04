import type { ApplyResult, GameState, UnitState } from "../../../model";
import { canAttackTarget } from "../../../combat";
import { HERO_GUTS_ID } from "../../../heroes";
import { makeAttackContext, requestRoll } from "../../../core";

export function isGuts(unit: UnitState): boolean {
  return unit.heroId === HERO_GUTS_ID;
}

export function canUseArcherLikeAttack(
  state: GameState,
  attacker: UnitState,
  target: UnitState
): boolean {
  const archerLikeAttacker: UnitState = {
    ...attacker,
    class: "archer",
  };
  return canAttackTarget(state, archerLikeAttacker, target);
}

export function requestGutsRangedAttack(
  state: GameState,
  unit: UnitState,
  targetId: string,
  options?: {
    damageOverride?: number;
    ignoreBonuses?: boolean;
  }
): ApplyResult {
  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: targetId,
    ignoreRange: true,
    consumeSlots: false,
    queueKind: "normal",
    rangedAttack: true,
    damageOverride: options?.damageOverride,
    ignoreBonuses: options?.ignoreBonuses,
  });
  const requested = requestRoll(
    state,
    unit.owner,
    "attack_attackerRoll",
    ctx,
    unit.id
  );
  return requested;
}
