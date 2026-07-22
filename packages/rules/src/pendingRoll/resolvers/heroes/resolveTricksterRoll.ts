import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../model";
import type { RNG } from "../../../rng";
import { resolveAttack } from "../../../combat";
import { clearPendingRoll, requestRoll } from "../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../actions/heroes/vlad";
import { addKaladinMoveLock } from "../../../actions/heroes/kaladin";
import { addLokiChicken, addLokiMoveLock } from "../../../actions/heroes/loki";
import { ABILITY_LOKI_LAUGHT } from "../../../abilities";
import type { IntimidateResume } from "../../../actions/types";
import { evAoeResolved, evDamageBonusApplied } from "../../../core";
import type { TricksterAoEContext } from "../../types";
import { rollDice } from "../../utils/rollMath";

function finalizeTricksterAoE(
  state: GameState,
  events: GameEvent[],
  context?: TricksterAoEContext
): ApplyResult {
  if (!state.pendingAoE) {
    return { state: clearPendingRoll(state), events };
  }

  const aoe = state.pendingAoE;
  const nextState: GameState = { ...state, pendingAoE: null };
  const statusTargetIds = context?.lokiStatusAppliedTargetIds ?? [];
  const statusEvents: GameEvent[] =
    context?.lokiStatusOnHit === "chicken" &&
    context.lokiStatusSourceId &&
    statusTargetIds.length > 0
      ? [{
          type: "lokiChickenGroupApplied",
          lokiId: context.lokiStatusSourceId,
          targetIds: [...statusTargetIds],
          abilityId: ABILITY_LOKI_LAUGHT,
        }]
      : [];
  return {
    state: clearPendingRoll(nextState),
    events: [
      ...events,
      ...statusEvents,
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

  return finalizeTricksterAoE(baseState, events, context);
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
  const damageOverride =
    typeof ctx.damageOverride === "number" ? ctx.damageOverride : undefined;
  const ignoreBonuses = ctx.ignoreBonuses === true;
  const suppressGutsBerserkBonus = ctx.suppressGutsBerserkBonus === true;
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    allowFriendlyTarget: ctx.allowFriendlyTarget,
    ignoreRange: true,
    ignoreStealth: ctx.ignoreStealth ?? true,
    preserveAttackerStealth: ctx.preserveAttackerStealth,
    revealStealthedAllies: ctx.revealStealthedAllies ?? true,
    revealReason: ctx.revealReason ?? "aoeHit",
    damageBonus,
    damageOverride,
    ignoreBonuses,
    suppressGutsBerserkBonus,
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
  let statusAppliedTargetIds = ctx.lokiStatusAppliedTargetIds ?? [];
  if (
    attackEvent?.type === "attackResolved" &&
    attackEvent.hit &&
    ctx.lokiStatusOnHit &&
    ctx.lokiStatusSourceId
  ) {
    const targetAfter = updatedState.units[attackEvent.defenderId];
    if (targetAfter?.isAlive) {
      const affected =
        ctx.lokiStatusOnHit === "chicken"
          ? addLokiChicken(targetAfter, ctx.lokiStatusSourceId)
          : addLokiMoveLock(targetAfter, ctx.lokiStatusSourceId);
      updatedState = {
        ...updatedState,
        units: { ...updatedState.units, [affected.id]: affected },
      };
      statusAppliedTargetIds = statusAppliedTargetIds.includes(affected.id)
        ? statusAppliedTargetIds
        : [...statusAppliedTargetIds, affected.id];
    }
  }
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    damageBonus > 0 &&
    !ignoreBonuses &&
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

  if (attackEvent && attackEvent.type === "attackResolved" && attackEvent.damage > 0) {
    const immobilizeSourceId =
      typeof ctx.immobilizeSourceId === "string" ? ctx.immobilizeSourceId : "";
    if (ctx.immobilizeOnHit && immobilizeSourceId) {
      const targetAfter = updatedState.units[targetId];
      if (targetAfter && targetAfter.isAlive) {
        const locked = addKaladinMoveLock(targetAfter, immobilizeSourceId);
        if (locked !== targetAfter) {
          updatedState = {
            ...updatedState,
            units: {
              ...updatedState.units,
              [locked.id]: locked,
            },
          };
        }
      }
    }
  }

  const nextCtx: TricksterAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
    lokiStatusAppliedTargetIds: statusAppliedTargetIds,
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


