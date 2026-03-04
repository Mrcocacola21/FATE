import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import { ABILITY_BERSERK_AUTO_DEFENSE } from "../../../../abilities";
import { clearPendingRoll, evBerserkerDefenseChosen, evDamageBonusApplied, requestRoll } from "../../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../../actions/types";
import type { JebeHailOfArrowsAoEContext } from "../../../types";
import { rollDice } from "../../../utils/rollMath";
import { advanceJebeHailOfArrowsQueue } from "./queue";
import { finalizeJebeHailOfArrows, updatePendingAoeFromAttack } from "./helpers";

function appendPolkovodetsDamageEvent(
  events: GameEvent[],
  attackerId: string,
  defenderId: string,
  damageBonus: number,
  sourceId: string | null
): GameEvent[] {
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attackerId &&
      event.defenderId === defenderId
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
      unitId: attackerId,
      amount: damageBonus,
      source: "polkovodets",
      fromUnitId: sourceId,
    }),
  ];
}

export function resolveJebeHailOfArrowsAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as JebeHailOfArrowsAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: JebeHailOfArrowsAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceJebeHailOfArrowsQueue(state, nextCtx, []);
}

export function resolveJebeHailOfArrowsDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as JebeHailOfArrowsAoEContext;
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
    return finalizeJebeHailOfArrows(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: JebeHailOfArrowsAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceJebeHailOfArrowsQueue(state, nextCtx, []);
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
  let updatedEvents = appendPolkovodetsDamageEvent(
    [...events],
    caster.id,
    targetId,
    damageBonus,
    sourceId
  );

  const nextCtx: JebeHailOfArrowsAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };
  const intimidateResume: IntimidateResume = {
    kind: "jebeHailOfArrowsAoE",
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

  return advanceJebeHailOfArrowsQueue(updatedState, nextCtx, updatedEvents);
}

export function resolveJebeHailOfArrowsBerserkerDefenseChoice(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as JebeHailOfArrowsAoEContext;
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
    return finalizeJebeHailOfArrows(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: JebeHailOfArrowsAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceJebeHailOfArrowsQueue(state, nextCtx, []);
  }

  let selected: "auto" | "roll" = choice ?? "roll";
  if (selected === "auto") {
    const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "roll") {
    const nextCtx: JebeHailOfArrowsAoEContext = {
      ...ctx,
      currentTargetIndex: idx,
      attackerDice,
    };
    const requested = requestRoll(
      clearPendingRoll(state),
      target.owner,
      "jebeHailOfArrows_defenderRoll",
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

  const nextCtx: JebeHailOfArrowsAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "jebeHailOfArrowsAoE",
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

  return advanceJebeHailOfArrowsQueue(updatedState, nextCtx, updatedEvents);
}
