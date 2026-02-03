import type { ApplyResult, GameState, PlayerId, RollKind } from "../../../model";
import { clearPendingRoll, requestRoll } from "../../utils/rollUtils";
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
