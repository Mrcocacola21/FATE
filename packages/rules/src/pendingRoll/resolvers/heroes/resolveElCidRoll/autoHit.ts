import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { resolveAttack } from "../../../../combat";
import { clearPendingRoll } from "../../../../core";
import { getPolkovodetsSource } from "../../../../actions/heroes/vlad";
import type { ElCidAoEContext } from "../../../types";
import {
  finalizeElCidAoE,
  maybeBuildPolkovodetsDamageEvent,
  updatePendingAoEFromAttack,
} from "./helpers";

export function resolveElCidAoEAutoHit(
  state: GameState,
  context: ElCidAoEContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;
  let workingState = baseState;
  let updatedEvents = [...events];

  const attackerDice = Array.isArray(context.attackerDice)
    ? context.attackerDice
    : [];

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = workingState.units[targetId];
    if (!target || !target.isAlive) {
      idx += 1;
      continue;
    }

    const sourceId = getPolkovodetsSource(workingState, context.casterId);
    const damageBonus = sourceId ? 1 : 0;
    const { nextState, events: attackEvents } = resolveAttack(workingState, {
      attackerId: context.casterId,
      defenderId: targetId,
      ignoreRange: true,
      ignoreStealth: true,
      revealStealthedAllies: true,
      revealReason: "aoeHit",
      damageBonus,
      autoHit: true,
      rolls: {
        attackerDice,
        defenderDice: [],
      },
    });

    workingState = updatePendingAoEFromAttack(
      nextState,
      attackEvents,
      context.casterId,
      targetId
    );
    updatedEvents.push(...attackEvents);

    const damageEvent = maybeBuildPolkovodetsDamageEvent(
      attackEvents,
      context.casterId,
      targetId,
      damageBonus,
      sourceId
    );
    if (damageEvent) {
      updatedEvents.push(damageEvent);
    }

    idx += 1;
  }

  return finalizeElCidAoE(workingState, updatedEvents);
}
