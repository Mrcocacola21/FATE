import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice, UnitState } from "../../../../model";
import { clearPendingRoll } from "../../../../core";
import { requestNextElCidDuelAttack } from "../../core/resolveAttackRoll";

export function resolveElCidDuelistChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    attackerId?: string;
    targetId?: string;
  };
  const attackerId = ctx.attackerId;
  const targetId = ctx.targetId;
  if (!attackerId || !targetId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection =
    choice === "elCidDuelistContinue"
      ? "continue"
      : choice === "elCidDuelistStop"
      ? "stop"
      : undefined;

  if (!selection) {
    return { state, events: [] };
  }

  if (selection === "stop") {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (attacker.hp <= 1) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const updatedAttacker: UnitState = {
    ...attacker,
    hp: attacker.hp - 1,
  };

  const updatedState: GameState = {
    ...clearPendingRoll(state),
    units: {
      ...state.units,
      [updatedAttacker.id]: updatedAttacker,
    },
  };

  return requestNextElCidDuelAttack(
    updatedState,
    [],
    updatedAttacker.id,
    targetId
  );
}
