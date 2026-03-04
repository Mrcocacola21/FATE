import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../../../abilities";
import { clearPendingRoll, evBerserkerDefenseChosen, requestRoll } from "../../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../../actions/types";
import type { DoraAoEContext } from "../../../types";
import { rollDice } from "../../../utils/rollMath";
import { advanceDoraAoEQueue } from "./queue";
import {
  appendPolkovodetsDamageEvent,
  finalizeDoraAoE,
  updatePendingAoeFromAttack,
} from "./helpers";

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

  let updatedState = updatePendingAoeFromAttack(
    nextState,
    events,
    caster.id,
    targetId
  );
  let updatedEvents: GameEvent[] = appendPolkovodetsDamageEvent(
    [...events],
    caster.id,
    targetId,
    damageBonus,
    sourceId
  );

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

  let updatedState = updatePendingAoeFromAttack(
    nextState,
    events,
    caster.id,
    target.id
  );
  let updatedEvents: GameEvent[] = [
    evBerserkerDefenseChosen({ defenderId: target.id, choice: "auto" }),
    ...events,
  ];
  updatedEvents = appendPolkovodetsDamageEvent(
    updatedEvents,
    caster.id,
    target.id,
    damageBonus,
    sourceId
  );

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
