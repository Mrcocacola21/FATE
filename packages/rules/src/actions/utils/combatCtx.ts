import type { AttackRollContext } from "../types";

export function makeAttackContext(params: {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  consumeSlots: boolean;
  queueKind: "normal" | "riderPath" | "aoe";
}): AttackRollContext {
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    ignoreRange: params.ignoreRange,
    ignoreStealth: params.ignoreStealth,
    damageBonus: params.damageBonus,
    damageBonusSourceId: params.damageBonusSourceId,
    attackerDice: [],
    defenderDice: [],
    tieBreakAttacker: [],
    tieBreakDefender: [],
    stage: "initial",
    berserkerChoiceMade: false,
    consumeSlots: params.consumeSlots,
    queueKind: params.queueKind,
  };
}
