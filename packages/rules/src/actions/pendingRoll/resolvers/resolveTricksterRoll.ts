import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../model";
import type { RNG } from "../../../rng";
import { resolveAttack } from "../../../combat";
import { clearPendingRoll, requestRoll } from "../../utils/rollUtils";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../heroes/vlad";
import type { IntimidateResume } from "../../types";
import { evAoeResolved, evDamageBonusApplied } from "../../utils/events";
import type { TricksterAoEContext } from "../types";
import { rollDice } from "../utils/rollMath";

function finalizeTricksterAoE(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  if (!state.pendingAoE) {
    return { state: clearPendingRoll(state), events };
  }

  const aoe = state.pendingAoE;
  const nextState: GameState = { ...state, pendingAoE: null };
  return {
    state: clearPendingRoll(nextState),
    events: [
      ...events,
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
      }),
    ],
  };
}

export function advanceTricksterAoEQueue(
  state: GameState,
  context: TricksterAoEContext,
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
      const nextCtx: TricksterAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        "tricksterAoE_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeTricksterAoE(baseState, events);
}

export function resolveTricksterAoEAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as TricksterAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: TricksterAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceTricksterAoEQueue(state, nextCtx, []);
}

export function resolveTricksterAoEDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as TricksterAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = Array.isArray(ctx.attackerDice) ? ctx.attackerDice : [];
  if (attackerDice.length < 2) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
  const idx = ctx.currentTargetIndex ?? 0;
  const targetId = targets[idx];
  if (!targetId) {
    return finalizeTricksterAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: TricksterAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceTricksterAoEQueue(state, nextCtx, []);
  }

  const defenderDice = rollDice(rng, 2);
  const sourceId = getPolkovodetsSource(state, caster.id);
  const damageBonus = sourceId ? 1 : 0;
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageBonus,
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

  let updatedState = nextState;
  let updatedEvents = [...events];
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === caster.id &&
      e.defenderId === targetId
  );
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    damageBonus > 0 &&
    sourceId
  ) {
    updatedEvents.push(
      evDamageBonusApplied({
        unitId: caster.id,
        amount: damageBonus,
        source: "polkovodets",
        fromUnitId: sourceId,
      })
    );
  }
  if (attackEvent && attackEvent.type === "attackResolved" && updatedState.pendingAoE) {
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent.damage > 0) {
      const damaged = nextPendingAoE.damagedUnitIds.includes(attackEvent.defenderId)
        ? nextPendingAoE.damagedUnitIds
        : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
      const damageByUnitId = {
        ...nextPendingAoE.damageByUnitId,
        [attackEvent.defenderId]: attackEvent.damage,
      };
      nextPendingAoE = {
        ...nextPendingAoE,
        damagedUnitIds: damaged,
        damageByUnitId,
      };
    }

    const revealedIds = events
      .filter((e) => e.type === "stealthRevealed")
      .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
      .filter((id) => id.length > 0);
    if (revealedIds.length > 0) {
      const merged = Array.from(
        new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
      );
      nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
    }

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  const nextCtx: TricksterAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "tricksterAoE",
    context: nextCtx as unknown as Record<string, unknown>,
  };
  const intimidate = maybeRequestIntimidate(
    updatedState,
    caster.id,
    targetId,
    updatedEvents,
    intimidateResume
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return advanceTricksterAoEQueue(updatedState, nextCtx, updatedEvents);
}
