import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../model";
import type { RNG } from "../../rng";
import { resolveAttack } from "../../combat";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../abilities";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../actions/heroes/vlad";
import type { IntimidateResume } from "../../actions/types";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evDamageBonusApplied,
} from "../../shared/events";
import type { ForestAoEContext } from "../types";
import { rollDice } from "../utils/rollMath";

function finalizeForestAoE(state: GameState, events: GameEvent[]): ApplyResult {
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

export function advanceForestAoEQueue(
  state: GameState,
  context: ForestAoEContext,
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
      const nextCtx: ForestAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
      if (target.class === "berserker" && charges === 6) {
        const requested = requestRoll(
          baseState,
          target.owner,
          "vladForest_berserkerDefenseChoice",
          nextCtx,
          target.id
        );
        return {
          state: requested.state,
          events: [...events, ...requested.events],
        };
      }
      const requested = requestRoll(
        baseState,
        target.owner,
        "vladForest_defenderRoll",
        nextCtx,
        target.id
      );
      return {
        state: requested.state,
        events: [...events, ...requested.events],
      };
    }
    idx += 1;
  }

  return finalizeForestAoE(baseState, events);
}

export function resolveForestAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ForestAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: ForestAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceForestAoEQueue(state, nextCtx, []);
}

export function resolveForestDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ForestAoEContext;
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
    return finalizeForestAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: ForestAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
      attackerDice,
    };
    return advanceForestAoEQueue(state, nextCtx, []);
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
    damageOverride: 2,
    damageBonus,
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

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

  let updatedState = nextState;
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit
  ) {
    const hitUnit = updatedState.units[targetId];
    if (hitUnit) {
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [hitUnit.id]: {
            ...hitUnit,
            movementDisabledNextTurn: true,
          },
        },
      };
    }
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

  const nextCtx: ForestAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "forestAoE",
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

  return advanceForestAoEQueue(updatedState, nextCtx, updatedEvents);
}

export function resolveForestBerserkerDefenseChoice(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ForestAoEContext;
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
    return finalizeForestAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: ForestAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
      attackerDice,
    };
    return advanceForestAoEQueue(state, nextCtx, []);
  }

  let selected: "auto" | "roll" = choice ?? "roll";
  if (selected === "auto") {
    const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "roll") {
    const nextCtx: ForestAoEContext = {
      ...ctx,
      currentTargetIndex: idx,
      attackerDice,
    };
    const requested = requestRoll(
      clearPendingRoll(state),
      target.owner,
      "vladForest_defenderRoll",
      nextCtx,
      target.id
    );
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: target.id, choice: "roll" }),
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

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
    damageOverride: 2,
    damageBonus,
    rolls: {
      attackerDice,
      defenderDice: [],
    },
  });

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

  let updatedState = nextState;
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit
  ) {
    const hitUnit = updatedState.units[target.id];
    if (hitUnit) {
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [hitUnit.id]: {
            ...hitUnit,
            movementDisabledNextTurn: true,
          },
        },
      };
    }
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

  const nextCtx: ForestAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "forestAoE",
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

  return advanceForestAoEQueue(updatedState, nextCtx, updatedEvents);
}
