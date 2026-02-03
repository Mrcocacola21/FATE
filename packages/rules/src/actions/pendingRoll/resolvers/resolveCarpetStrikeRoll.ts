import type { ApplyResult, GameEvent, GameState, PendingRoll } from "../../../model";
import type { RNG } from "../../../rng";
import { resolveAoE } from "../../../aoe";
import { resolveAttack } from "../../../combat";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_CARPET_STRIKE,
} from "../../../abilities";
import { clearPendingRoll, requestRoll } from "../../utils/rollUtils";
import { maybeRequestIntimidate } from "../../heroes/vlad";
import { isKaiserTransformed, map2d9ToCoord, rollD9 } from "../../shared";
import type { IntimidateResume } from "../../types";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evCarpetStrikeAttackRolled,
  evCarpetStrikeCenter,
} from "../../utils/events";
import type { CarpetStrikeAoEContext } from "../types";
import { replacePendingRoll } from "../builders/buildPendingRoll";
import { rollDice, sumDice } from "../utils/rollMath";

function finalizeCarpetStrikeAoE(
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

export function advanceCarpetStrikeQueue(
  state: GameState,
  context: CarpetStrikeAoEContext,
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
      const nextCtx: CarpetStrikeAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const attackerDice = Array.isArray(nextCtx.attackerDice)
        ? nextCtx.attackerDice
        : [];
      const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
      if (target.class === "berserker" && charges === 6 && attackerDice.length >= 2) {
        const requested = requestRoll(
          baseState,
          target.owner,
          "carpetStrike_berserkerDefenseChoice",
          nextCtx,
          target.id
        );
        return { state: requested.state, events: [...events, ...requested.events] };
      }
      const requested = requestRoll(
        baseState,
        target.owner,
        "carpetStrike_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeCarpetStrikeAoE(baseState, events);
}

export function resolveCarpetStrikeCenterRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  if (!unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const caster = state.units[unitId];
  if (!caster || !caster.isAlive || !caster.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const d1 = rollD9(rng);
  const d2 = rollD9(rng);
  const center = map2d9ToCoord(state, d1, d2);

  const aoeRes = resolveAoE(
    state,
    caster.id,
    center,
    {
      radius: 2,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: ABILITY_KAISER_CARPET_STRIKE,
      emitEvent: false,
    },
    rng
  );

  let affectedUnitIds = aoeRes.affectedUnitIds.filter((id) => {
    const unit = aoeRes.nextState.units[id];
    if (!unit || !unit.isAlive) return false;
    if (isKaiserTransformed(unit)) return false;
    if (unit.id === caster.id && caster.bunker?.active) return false;
    return true;
  });

  affectedUnitIds = [...affectedUnitIds].sort();

  const nextState: GameState = {
    ...aoeRes.nextState,
    pendingAoE: {
      casterId: caster.id,
      abilityId: ABILITY_KAISER_CARPET_STRIKE,
      center,
      radius: 2,
      affectedUnitIds,
      revealedUnitIds: aoeRes.revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const events: GameEvent[] = [
    ...aoeRes.events,
    evCarpetStrikeCenter({
      unitId: caster.id,
      dice: [d1, d2],
      sum: d1 + d2,
      center,
      area: { shape: "square", radius: 2 },
    }),
  ];

  const ctx: CarpetStrikeAoEContext = {
    casterId: caster.id,
    center,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = replacePendingRoll(
    nextState,
    caster.owner,
    "kaiserCarpetStrikeAttack",
    ctx,
    caster.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveCarpetStrikeAttackRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as CarpetStrikeAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const sum = sumDice(attackerDice);
  const affectedUnitIds = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];

  const events: GameEvent[] = [
    evCarpetStrikeAttackRolled({
      unitId: caster.id,
      dice: attackerDice,
      sum,
      center: ctx.center,
      affectedUnitIds,
    }),
  ];

  const nextCtx: CarpetStrikeAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceCarpetStrikeQueue(state, nextCtx, events);
}

export function resolveCarpetStrikeDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as CarpetStrikeAoEContext;
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
    return finalizeCarpetStrikeAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: CarpetStrikeAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceCarpetStrikeQueue(state, nextCtx, []);
  }

  const defenderDice = rollDice(rng, 2);
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: 1,
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

  const nextCtx: CarpetStrikeAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "carpetStrike",
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

  return advanceCarpetStrikeQueue(updatedState, nextCtx, updatedEvents);
}

export function resolveCarpetStrikeBerserkerDefenseChoice(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as CarpetStrikeAoEContext;
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
    return finalizeCarpetStrikeAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: CarpetStrikeAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceCarpetStrikeQueue(state, nextCtx, []);
  }

  let selected: "auto" | "roll" = choice ?? "roll";
  if (selected === "auto") {
    const charges = target.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "roll") {
    const nextCtx: CarpetStrikeAoEContext = {
      ...ctx,
      currentTargetIndex: idx,
      attackerDice,
    };
    const requested = requestRoll(
      clearPendingRoll(state),
      target.owner,
      "carpetStrike_defenderRoll",
      nextCtx,
      target.id
    );
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: target.id, choice: "roll" }),
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: target.id,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    defenderUseBerserkAutoDefense: true,
    damageOverride: 1,
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

  const nextCtx: CarpetStrikeAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "carpetStrike",
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

  return advanceCarpetStrikeQueue(updatedState, nextCtx, updatedEvents);
}
