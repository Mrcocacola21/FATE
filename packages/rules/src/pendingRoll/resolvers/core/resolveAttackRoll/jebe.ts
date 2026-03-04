import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { canAttackTarget } from "../../../../combat";
import { getLegalAttackTargets } from "../../../../legal";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { AttackRollContext } from "../../../types";
import { makeAttackContext } from "../../../builders/buildPendingRoll";
import { findAttackResolved } from "../../../utils/attackEvents";

export function requestJebeKhansShooterAttack(
  state: GameState,
  baseEvents: GameEvent[],
  casterId: string,
  targetId: string,
  remainingAttacks: number
): ApplyResult {
  const caster = state.units[casterId];
  const target = state.units[targetId];
  if (
    !caster ||
    !caster.isAlive ||
    !caster.position ||
    !target ||
    !target.isAlive ||
    !target.position
  ) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  if (!canAttackTarget(state, caster, target)) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId: casterId,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    jebeKhansShooter: {
      casterId,
      remainingAttacks,
    },
  };

  const requested = requestRoll(
    clearPendingRoll(state),
    caster.owner,
    "attack_attackerRoll",
    ctx,
    caster.id
  );

  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function continueJebeKhansShooter(
  state: GameState,
  baseEvents: GameEvent[],
  context: Record<string, unknown>
): ApplyResult {
  const casterId =
    typeof context.casterId === "string" ? context.casterId : undefined;
  const remainingAttacks =
    typeof context.remainingAttacks === "number"
      ? context.remainingAttacks
      : undefined;
  const lastTargetId =
    typeof context.lastTargetId === "string" ? context.lastTargetId : undefined;
  if (!casterId || !remainingAttacks || remainingAttacks <= 0) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const caster = state.units[casterId];
  if (!caster || !caster.isAlive || !caster.position) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const options = getLegalAttackTargets(state, casterId).filter(
    (targetId) => targetId !== lastTargetId
  );
  if (options.length === 0) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    caster.owner,
    "jebeKhansShooterTargetChoice",
    {
      casterId,
      remainingAttacks,
      options,
      lastTargetId,
    },
    caster.id
  );

  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function handleJebeKhansShooterAfterAttack(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext
): ApplyResult {
  const shooter = context.jebeKhansShooter;
  if (!shooter) {
    return { state, events };
  }

  const attackEvent = findAttackResolved(
    events,
    context.attackerId,
    context.defenderId
  );
  if (!attackEvent) {
    return { state, events };
  }

  const remainingAttacks = shooter.remainingAttacks - 1;
  if (remainingAttacks <= 0) {
    return { state: clearPendingRoll(state), events };
  }

  const resumeContext: Record<string, unknown> = {
    casterId: shooter.casterId,
    remainingAttacks,
    lastTargetId: context.defenderId,
  };
  const intimidate = maybeRequestIntimidate(
    state,
    context.attackerId,
    context.defenderId,
    events,
    { kind: "jebeKhansShooter", context: resumeContext }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return continueJebeKhansShooter(state, events, resumeContext);
}
