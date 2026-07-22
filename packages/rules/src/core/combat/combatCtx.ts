import type { AttackRollContext } from "../../actions/types";

export function makeAttackContext(params: {
  attackerId: string;
  defenderId: string;
  allowFriendlyTarget?: boolean;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  preserveAttackerStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  suppressGutsBerserkBonus?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  blindOnHit?: boolean;
  sourceAbilityId?: string;
  controllerPlayerId?: import("../../model").PlayerId;
  lokiStatusOnHit?: "chicken";
  lokiStatusSourceId?: string;
  consumeSlots: boolean;
  queueKind: "normal" | "riderPath" | "aoe";
}): AttackRollContext {
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    allowFriendlyTarget: params.allowFriendlyTarget,
    ignoreRange: params.ignoreRange,
    ignoreStealth: params.ignoreStealth,
    preserveAttackerStealth: params.preserveAttackerStealth,
    damageBonus: params.damageBonus,
    damageBonusSourceId: params.damageBonusSourceId,
    rangedAttack: params.rangedAttack,
    suppressGutsBerserkBonus: params.suppressGutsBerserkBonus,
    damageOverride: params.damageOverride,
    ignoreBonuses: params.ignoreBonuses,
    blindOnHit: params.blindOnHit,
    sourceAbilityId: params.sourceAbilityId,
    controllerPlayerId: params.controllerPlayerId,
    lokiStatusOnHit: params.lokiStatusOnHit,
    lokiStatusSourceId: params.lokiStatusSourceId,
    attackerDice: [],
    defenderDice: [],
    tieBreakAttacker: [],
    tieBreakDefender: [],
    stage: "initial",
    berserkerChoiceMade: false,
    odinMuninnChoiceMade: false,
    asgoreBraveryChoiceMade: false,
    chikatiloDecoyChoiceMade: false,
    friskSubstitutionChoiceMade: false,
    friskChildsCryChoiceMade: false,
    friskForceMiss: false,
    consumeSlots: params.consumeSlots,
    queueKind: params.queueKind,
  };
}
