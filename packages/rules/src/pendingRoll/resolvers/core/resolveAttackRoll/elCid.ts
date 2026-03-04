import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { canAttackTarget } from "../../../../combat";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { AttackRollContext } from "../../../types";
import { makeAttackContext } from "../../../builders/buildPendingRoll";
import { findAttackResolved } from "../../../utils/attackEvents";

export function requestElCidDuelistChoice(
  state: GameState,
  baseEvents: GameEvent[],
  attackerId: string,
  targetId: string
): ApplyResult {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events: baseEvents };
  }
  if (attacker.hp <= 1) {
    return { state, events: baseEvents };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    attacker.owner,
    "elCidDuelistChoice",
    { attackerId, targetId, duelInProgress: true },
    attackerId
  );
  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function requestNextElCidDuelAttack(
  state: GameState,
  baseEvents: GameEvent[],
  attackerId: string,
  targetId: string
): ApplyResult {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events: baseEvents };
  }

  if (!canAttackTarget(state, attacker, target)) {
    return { state, events: baseEvents };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    elCidDuelist: { attackerId, targetId },
  };

  const requested = requestRoll(
    clearPendingRoll(state),
    attacker.owner,
    "attack_attackerRoll",
    ctx,
    attacker.id
  );
  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function handleElCidDuelistAfterAttack(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext
): ApplyResult {
  const duel = context.elCidDuelist;
  if (!duel) {
    return { state, events };
  }

  const attackEvent = findAttackResolved(events, duel.attackerId, duel.targetId);
  if (!attackEvent) {
    return { state, events };
  }

  const attacker = state.units[duel.attackerId];
  const target = state.units[duel.targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events };
  }

  if (attackEvent.hit) {
    return requestNextElCidDuelAttack(state, events, duel.attackerId, duel.targetId);
  }

  const intimidate = maybeRequestIntimidate(
    state,
    duel.attackerId,
    duel.targetId,
    events,
    { kind: "elCidDuelist", context: { attackerId: duel.attackerId, targetId: duel.targetId } }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return requestElCidDuelistChoice(state, events, duel.attackerId, duel.targetId);
}
