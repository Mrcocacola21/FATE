import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { clearPendingRoll, requestRoll, evAoeResolved } from "../../../../core";
import { removeFalseTrailToken, requestChikatiloRevealChoice } from "../../../../actions/heroes/chikatilo";
import type { FalseTrailExplosionContext } from "./shared";

function finalizeFalseTrailExplosion(
  state: GameState,
  context: FalseTrailExplosionContext,
  events: GameEvent[]
): ApplyResult {
  let nextState: GameState = clearPendingRoll(state);
  let nextEvents = [...events];

  if (nextState.pendingAoE) {
    const aoe = nextState.pendingAoE;
    nextState = { ...nextState, pendingAoE: null };
    nextEvents.push(
      evAoeResolved({
        sourceUnitId: aoe.casterId,
        abilityId: aoe.abilityId,
        casterId: aoe.casterId,
        center: aoe.center,
        radius: aoe.radius,
        affectedUnitIds: aoe.affectedUnitIds,
        revealedUnitIds: aoe.revealedUnitIds,
        damagedUnitIds: aoe.damagedUnitIds,
        damageByUnitId: aoe.damageByUnitId,
      })
    );
  }

  const removed = removeFalseTrailToken(nextState, context.casterId);
  nextState = removed.state;
  nextEvents = [...nextEvents, ...removed.events];

  const revealQueue = Array.isArray(context.revealQueue)
    ? context.revealQueue
    : [];
  if (revealQueue.length > 0) {
    const [nextId, ...rest] = revealQueue;
    const requested = requestChikatiloRevealChoice(nextState, nextId, rest);
    nextState = requested.state;
    nextEvents = [...nextEvents, ...requested.events];
  }

  return { state: nextState, events: nextEvents };
}

export function advanceFalseTrailExplosionQueue(
  state: GameState,
  context: FalseTrailExplosionContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = baseState.units[targetId];
    if (target && target.isAlive) {
      const nextCtx: FalseTrailExplosionContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        "falseTrailExplosion_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeFalseTrailExplosion(baseState, context, events);
}
