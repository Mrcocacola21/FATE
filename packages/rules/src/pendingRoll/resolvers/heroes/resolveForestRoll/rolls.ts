import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../../../abilities";
import { clearPendingRoll, evBerserkerDefenseChosen, evDamageBonusApplied, requestRoll } from "../../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../../actions/types";
import type { ForestAoEContext } from "../../../types";
import { rollDice } from "../../../utils/rollMath";
import {
  applyForestMovementDisableOnHit,
  finalizeForestAoE,
  updatePendingAoeFromAttack,
} from "./helpers";
import { advanceForestAoEQueue } from "./queue";

function maybeAppendPolkovodetsDamage(
  events: GameEvent[],
  casterId: string,
  targetId: string,
  damageBonus: number,
  sourceId: string | null
): GameEvent[] {
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === casterId &&
      e.defenderId === targetId
  );
  if (
    !attackEvent ||
    attackEvent.type !== "attackResolved" ||
    !attackEvent.hit ||
    damageBonus <= 0 ||
    !sourceId
  ) {
    return events;
  }
  return [
    ...events,
    evDamageBonusApplied({
      unitId: casterId,
      amount: damageBonus,
      source: "polkovodets",
      fromUnitId: sourceId,
    }),
  ];
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

  let updatedState = updatePendingAoeFromAttack(
    nextState,
    events,
    caster.id,
    targetId
  );
  updatedState = applyForestMovementDisableOnHit(updatedState, events, targetId);
  let updatedEvents = maybeAppendPolkovodetsDamage(
    [...events],
    caster.id,
    targetId,
    damageBonus,
    sourceId
  );

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

  let updatedState = updatePendingAoeFromAttack(
    nextState,
    events,
    caster.id,
    target.id
  );
  updatedState = applyForestMovementDisableOnHit(updatedState, events, target.id);
  let updatedEvents: GameEvent[] = [
    evBerserkerDefenseChosen({ defenderId: target.id, choice: "auto" }),
    ...events,
  ];
  updatedEvents = maybeAppendPolkovodetsDamage(
    updatedEvents,
    caster.id,
    target.id,
    damageBonus,
    sourceId
  );

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
