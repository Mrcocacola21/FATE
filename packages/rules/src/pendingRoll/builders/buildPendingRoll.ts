import type { ApplyResult, GameState, PlayerId, RollKind } from "../../model";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import type { AttackRollContext } from "../types";

export function replacePendingRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: Record<string, unknown>,
  actorUnitId?: string
): ApplyResult {
  const baseState = clearPendingRoll(state);
  return requestRoll(baseState, player, kind, context, actorUnitId);
}

export function makeAttackContext(params: {
  attackerId: string;
  defenderId: string;
  allowFriendlyTarget?: boolean;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  consumeSlots: boolean;
  queueKind: "normal" | "riderPath" | "aoe";
}): AttackRollContext {
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    allowFriendlyTarget: params.allowFriendlyTarget,
    ignoreRange: params.ignoreRange,
    ignoreStealth: params.ignoreStealth,
    damageBonus: params.damageBonus,
    damageBonusSourceId: params.damageBonusSourceId,
    rangedAttack: params.rangedAttack,
    damageOverride: params.damageOverride,
    ignoreBonuses: params.ignoreBonuses,
    attackerDice: [],
    defenderDice: [],
    tieBreakAttacker: [],
    tieBreakDefender: [],
    stage: "initial",
    berserkerChoiceMade: false,
    odinMuninnChoiceMade: false,
    chikatiloDecoyChoiceMade: false,
    friskSubstitutionChoiceMade: false,
    friskChildsCryChoiceMade: false,
    friskForceMiss: false,
    consumeSlots: params.consumeSlots,
    queueKind: params.queueKind,
  };
}
