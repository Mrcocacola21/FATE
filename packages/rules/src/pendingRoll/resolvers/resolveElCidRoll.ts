import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  RollKind,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { resolveAttack } from "../../combat";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../actions/heroes/vlad";
import { isElCid } from "../../actions/shared";
import type { IntimidateResume } from "../../actions/types";
import { evAoeResolved, evDamageBonusApplied } from "../../shared/events";
import type { ElCidAoEContext } from "../types";
import { findAttackResolved } from "../utils/attackEvents";
import { isDoubleRoll, rollDice } from "../utils/rollMath";
import { requestNextElCidDuelAttack } from "./resolveAttackRoll";

function finalizeElCidAoE(
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

export function advanceElCidAoEQueue(
  state: GameState,
  context: ElCidAoEContext,
  events: GameEvent[],
  defenderRollKind: RollKind
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
      const nextCtx: ElCidAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        defenderRollKind,
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeElCidAoE(baseState, events);
}

function resolveElCidAoEAutoHit(
  state: GameState,
  context: ElCidAoEContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;
  let workingState = baseState;
  let updatedEvents = [...events];

  const attackerDice = Array.isArray(context.attackerDice)
    ? context.attackerDice
    : [];

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = workingState.units[targetId];
    if (!target || !target.isAlive) {
      idx += 1;
      continue;
    }

    const sourceId = getPolkovodetsSource(workingState, context.casterId);
    const damageBonus = sourceId ? 1 : 0;
    const { nextState, events: attackEvents } = resolveAttack(workingState, {
      attackerId: context.casterId,
      defenderId: targetId,
      ignoreRange: true,
      ignoreStealth: true,
      revealStealthedAllies: true,
      revealReason: "aoeHit",
      damageBonus,
      autoHit: true,
      rolls: {
        attackerDice,
        defenderDice: [],
      },
    });

    workingState = nextState;
    updatedEvents.push(...attackEvents);

    const attackEvent = findAttackResolved(
      attackEvents,
      context.casterId,
      targetId
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
          unitId: context.casterId,
          amount: damageBonus,
          source: "polkovodets",
          fromUnitId: sourceId,
        })
      );
    }

    if (attackEvent && attackEvent.type === "attackResolved" && workingState.pendingAoE) {
      let nextPendingAoE = workingState.pendingAoE;
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

      const revealedIds = attackEvents
        .filter((e) => e.type === "stealthRevealed")
        .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
        .filter((id) => id.length > 0);
      if (revealedIds.length > 0) {
        const merged = Array.from(
          new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
        );
        nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
      }

      if (nextPendingAoE !== workingState.pendingAoE) {
        workingState = { ...workingState, pendingAoE: nextPendingAoE };
      }
    }

    idx += 1;
  }

  return finalizeElCidAoE(workingState, updatedEvents);
}

export function resolveElCidTisonaAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: ElCidAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  if (isElCid(caster) && isDoubleRoll(attackerDice)) {
    return resolveElCidAoEAutoHit(state, nextCtx, []);
  }

  return advanceElCidAoEQueue(state, nextCtx, [], "elCidTisona_defenderRoll");
}

export function resolveElCidTisonaDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
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
    return finalizeElCidAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: ElCidAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceElCidAoEQueue(state, nextCtx, [], "elCidTisona_defenderRoll");
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
  const attackEvent = findAttackResolved(events, caster.id, targetId);
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

  const nextCtx: ElCidAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "elCidTisonaAoE",
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

  return advanceElCidAoEQueue(
    updatedState,
    nextCtx,
    updatedEvents,
    "elCidTisona_defenderRoll"
  );
}

export function resolveElCidKoladaAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: ElCidAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  if (isElCid(caster) && isDoubleRoll(attackerDice)) {
    return resolveElCidAoEAutoHit(state, nextCtx, []);
  }

  return advanceElCidAoEQueue(state, nextCtx, [], "elCidKolada_defenderRoll");
}

export function resolveElCidKoladaDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
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
    return finalizeElCidAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: ElCidAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceElCidAoEQueue(state, nextCtx, [], "elCidKolada_defenderRoll");
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
  const attackEvent = findAttackResolved(events, caster.id, targetId);
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

  const nextCtx: ElCidAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "elCidKoladaAoE",
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

  return advanceElCidAoEQueue(
    updatedState,
    nextCtx,
    updatedEvents,
    "elCidKolada_defenderRoll"
  );
}

export function resolveElCidDuelistChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    attackerId?: string;
    targetId?: string;
  };
  const attackerId = ctx.attackerId;
  const targetId = ctx.targetId;
  if (!attackerId || !targetId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection =
    choice === "elCidDuelistContinue"
      ? "continue"
      : choice === "elCidDuelistStop"
      ? "stop"
      : undefined;

  if (!selection) {
    return { state, events: [] };
  }

  if (selection === "stop") {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (attacker.hp <= 1) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const updatedAttacker: UnitState = {
    ...attacker,
    hp: attacker.hp - 1,
  };

  const updatedState: GameState = {
    ...clearPendingRoll(state),
    units: {
      ...state.units,
      [updatedAttacker.id]: updatedAttacker,
    },
  };

  return requestNextElCidDuelAttack(
    updatedState,
    [],
    updatedAttacker.id,
    targetId
  );
}
