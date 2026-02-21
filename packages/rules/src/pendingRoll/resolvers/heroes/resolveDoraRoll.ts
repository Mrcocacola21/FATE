import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../model";
import type { RNG } from "../../../rng";
import { resolveAttack } from "../../../combat";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../../abilities";
import { HERO_FEMTO_ID, HERO_PAPYRUS_ID } from "../../../heroes";
import { hasMettatonBerserkerFeature } from "../../../mettaton";
import { clearPendingRoll, requestRoll } from "../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../actions/types";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evDamageBonusApplied,
} from "../../../core";
import type { DoraAoEContext } from "../../types";
import { rollDice } from "../../utils/rollMath";

function finalizeDoraAoE(state: GameState, events: GameEvent[]): ApplyResult {
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

export function advanceDoraAoEQueue(
  state: GameState,
  context: DoraAoEContext,
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
      const nextCtx: DoraAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const attackerDice = Array.isArray(nextCtx.attackerDice)
        ? nextCtx.attackerDice
        : [];
      const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
      if (
        (target.class === "berserker" ||
          target.heroId === HERO_FEMTO_ID ||
          (target.heroId === HERO_PAPYRUS_ID &&
            target.papyrusUnbelieverActive) ||
          hasMettatonBerserkerFeature(target)) &&
        charges === 6 &&
        attackerDice.length >= 2
      ) {
        const requested = requestRoll(
          baseState,
          target.owner,
          "dora_berserkerDefenseChoice",
          nextCtx,
          target.id
        );
        return { state: requested.state, events: [...events, ...requested.events] };
      }
      const requested = requestRoll(
        baseState,
        target.owner,
        "dora_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeDoraAoE(baseState, events);
}

export function resolveDoraAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as DoraAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: DoraAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceDoraAoEQueue(state, nextCtx, []);
}

export function resolveDoraDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as DoraAoEContext;
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
    return finalizeDoraAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: DoraAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceDoraAoEQueue(state, nextCtx, []);
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
  let updatedEvents: GameEvent[] = [...events];
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

  const nextCtx: DoraAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "doraAoE",
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

  return advanceDoraAoEQueue(updatedState, nextCtx, updatedEvents);
}

export function resolveDoraBerserkerDefenseChoice(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as DoraAoEContext;
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
    return finalizeDoraAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: DoraAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceDoraAoEQueue(state, nextCtx, []);
  }

  let selected: "auto" | "roll" = choice ?? "roll";
  if (selected === "auto") {
    const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "roll") {
    const nextCtx: DoraAoEContext = {
      ...ctx,
      currentTargetIndex: idx,
      attackerDice,
    };
    const requested = requestRoll(
      clearPendingRoll(state),
      target.owner,
      "dora_defenderRoll",
      nextCtx,
      target.id
    );
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: target.id, choice: "roll" }),
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

  if (selected === "auto") {
    const sourceId = getPolkovodetsSource(state, caster.id);
    const damageBonus = sourceId ? 1 : 0;
    const { nextState, events } = resolveAttack(state, {
      attackerId: caster.id,
      defenderId: target.id,
      ignoreRange: true,
      ignoreStealth: true,
      revealStealthedAllies: true,
      revealReason: "aoeHit",
      defenderUseBerserkAutoDefense: true,
      damageBonus,
      rolls: {
        attackerDice,
        defenderDice: [],
      },
    });

    let updatedState = nextState;
    let updatedEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: target.id, choice: "auto" }),
      ...events,
    ];
    const attackEvent = events.find(
      (e) =>
        e.type === "attackResolved" &&
        e.attackerId === caster.id &&
        e.defenderId === target.id
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

    const nextCtx: DoraAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
      attackerDice,
    };

    const intimidateResume: IntimidateResume = {
      kind: "doraAoE",
      context: nextCtx as unknown as Record<string, unknown>,
    };
    const intimidate = maybeRequestIntimidate(
      updatedState,
      caster.id,
      target.id,
      updatedEvents,
      intimidateResume
    );
    if (intimidate.requested) {
      return { state: intimidate.state, events: intimidate.events };
    }

    return advanceDoraAoEQueue(updatedState, nextCtx, updatedEvents);
  }

  return { state: clearPendingRoll(state), events: [] };
}


