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
import { canAttackTarget, resolveAttack } from "../../combat";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_DECOY,
  getCharges,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../actions/heroes/vlad";
import { isElCid } from "../../actions/shared";
import { handleGroznyTyrantAfterAttack } from "../../actions/heroes/grozny";
import { HERO_CHIKATILO_ID } from "../../heroes";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evDamageBonusApplied,
} from "../../shared/events";
import type { AttackRollContext } from "../types";
import { makeAttackContext, replacePendingRoll } from "../builders/buildPendingRoll";
import { findAttackResolved } from "../utils/attackEvents";
import { isDoubleRoll, rollDice, sumDice } from "../utils/rollMath";

function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  useAutoDefense: boolean,
  autoHit: boolean = false,
  damageOverride?: number,
  ignoreBonuses: boolean = false
): ApplyResult {
  const rolls = {
    attackerDice: context.attackerDice ?? [],
    defenderDice: context.defenderDice ?? [],
    tieBreakAttacker: context.tieBreakAttacker ?? [],
    tieBreakDefender: context.tieBreakDefender ?? [],
  };

  const sourceId =
    context.damageBonusSourceId ?? getPolkovodetsSource(state, context.attackerId);
  const polkovodetsBonus = sourceId ? 1 : 0;
  const damageBonus = polkovodetsBonus;

  const { nextState, events } = resolveAttack(state, {
    attackerId: context.attackerId,
    defenderId: context.defenderId,
    defenderUseBerserkAutoDefense: useAutoDefense,
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    damageBonus,
    damageOverride,
    ignoreBonuses,
    autoHit,
    rolls,
  });

  let updatedEvents = [...events];
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === context.attackerId &&
      e.defenderId === context.defenderId
  );
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    polkovodetsBonus > 0 &&
    !ignoreBonuses &&
    sourceId
  ) {
    updatedEvents.push(
      evDamageBonusApplied({
        unitId: context.attackerId,
        amount: polkovodetsBonus,
        source: "polkovodets",
        fromUnitId: sourceId,
      })
    );
  }

  const attackResolved = events.some((e) => e.type === "attackResolved");
  let updatedState = nextState;

  if (attackResolved && context.consumeSlots) {
    const attackerAfter = updatedState.units[context.attackerId];
    if (attackerAfter) {
      const updatedAttacker: UnitState = spendSlots(attackerAfter, {
        attack: true,
        action: true,
      });
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [updatedAttacker.id]: updatedAttacker,
        },
      };
    }
  }

  if (attackResolved && context.queueKind === "aoe" && updatedState.pendingAoE) {
    const attackEvent = events.find(
      (e) =>
        e.type === "attackResolved" &&
        e.attackerId === context.attackerId &&
        e.defenderId === context.defenderId
    );
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent && attackEvent.type === "attackResolved") {
      const shouldRecord = attackEvent.damage > 0;
      if (shouldRecord) {
        const damaged = nextPendingAoE.damagedUnitIds.includes(
          attackEvent.defenderId
        )
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

  return { state: clearPendingRoll(updatedState), events: updatedEvents };
}

function handleTyrantIfNeeded(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext,
  rng: RNG
): { state: GameState; events: GameEvent[]; requested: boolean } {
  return handleGroznyTyrantAfterAttack(state, events, context, rng);
}

export function advanceCombatQueue(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const queue = state.pendingCombatQueue ?? [];
  if (queue.length === 0) {
    if (state.pendingAoE) {
      const aoe = state.pendingAoE;
      const nextState: GameState = { ...state, pendingAoE: null };
      return {
        state: nextState,
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
    return { state, events };
  }

  const [, ...rest] = queue;
  let nextState: GameState = { ...state, pendingCombatQueue: rest };
  let nextEvents = [...events];

  if (rest.length === 0) {
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
    return { state: nextState, events: nextEvents };
  }

  const nextEntry = rest[0];
  const attacker = nextState.units[nextEntry.attackerId];
  const defender = nextState.units[nextEntry.defenderId];
  if (!attacker || !defender) {
    return advanceCombatQueue(nextState, nextEvents);
  }

  const ctx = makeAttackContext({
    attackerId: nextEntry.attackerId,
    defenderId: nextEntry.defenderId,
    ignoreRange: nextEntry.ignoreRange,
    ignoreStealth: nextEntry.ignoreStealth,
    damageBonus: nextEntry.damageBonus,
    damageBonusSourceId: nextEntry.damageBonusSourceId,
    consumeSlots: nextEntry.consumeSlots ?? false,
    queueKind: nextEntry.kind,
  });

  const rollKind: RollKind =
    nextEntry.kind === "riderPath"
      ? "riderPathAttack_attackerRoll"
      : "attack_attackerRoll";

  const requested = replacePendingRoll(
    nextState,
    attacker.owner,
    rollKind,
    ctx,
    attacker.id
  );

  nextEvents = [...nextEvents, ...requested.events];
  return { state: requested.state, events: nextEvents };
}

export function requestElCidDuelistChoice(
  state: GameState,
  baseEvents: GameEvent[],
  attackerId: string,
  targetId: string
): ApplyResult {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events: baseEvents };
  }
  if (attacker.hp <= 1) {
    return { state, events: baseEvents };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    attacker.owner,
    "elCidDuelistChoice",
    { attackerId, targetId, duelInProgress: true },
    attackerId
  );
  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function requestNextElCidDuelAttack(
  state: GameState,
  baseEvents: GameEvent[],
  attackerId: string,
  targetId: string
): ApplyResult {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events: baseEvents };
  }

  if (!canAttackTarget(state, attacker, target)) {
    return { state, events: baseEvents };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    elCidDuelist: { attackerId, targetId },
  };

  const requested = requestRoll(
    clearPendingRoll(state),
    attacker.owner,
    "attack_attackerRoll",
    ctx,
    attacker.id
  );
  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

function handleElCidDuelistAfterAttack(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext
): ApplyResult {
  const duel = context.elCidDuelist;
  if (!duel) {
    return { state, events };
  }

  const attackEvent = findAttackResolved(events, duel.attackerId, duel.targetId);
  if (!attackEvent) {
    return { state, events };
  }

  const attacker = state.units[duel.attackerId];
  const target = state.units[duel.targetId];
  if (!attacker || !attacker.isAlive || !target || !target.isAlive) {
    return { state, events };
  }

  if (attackEvent.hit) {
    return requestNextElCidDuelAttack(state, events, duel.attackerId, duel.targetId);
  }

  const intimidate = maybeRequestIntimidate(
    state,
    duel.attackerId,
    duel.targetId,
    events,
    { kind: "elCidDuelist", context: { attackerId: duel.attackerId, targetId: duel.targetId } }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return requestElCidDuelistChoice(state, events, duel.attackerId, duel.targetId);
}

export function resolveAttackAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const stage = ctx.stage ?? "initial";
  const dice = rollDice(rng, stage === "tieBreak" ? 1 : 2);
  const nextCtx: AttackRollContext = { ...ctx, stage };

  if (stage === "tieBreak") {
    nextCtx.tieBreakAttacker = [...(ctx.tieBreakAttacker ?? []), ...dice];
  } else {
    nextCtx.attackerDice = dice;
  }

  const canDecoy =
    defender.heroId === HERO_CHIKATILO_ID &&
    getCharges(defender, ABILITY_CHIKATILO_DECOY) >= 3 &&
    !nextCtx.chikatiloDecoyChoiceMade;
  if (canDecoy) {
    return replacePendingRoll(
      state,
      defender.owner,
      "chikatiloDecoyChoice",
      nextCtx,
      defender.id
    );
  }

  const resolvedCtx: AttackRollContext = {
    ...nextCtx,
    chikatiloDecoyChoiceMade: true,
  };

  const isAutoHit =
    stage === "initial" && isElCid(attacker) && isDoubleRoll(dice);
  if (isAutoHit) {
    const resolved = finalizeAttackFromContext(state, resolvedCtx, false, true);
    if (resolvedCtx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(
        resolved.state,
        resolved.events,
        resolvedCtx
      );
    }
    const tyrant = handleTyrantIfNeeded(
      resolved.state,
      resolved.events,
      resolvedCtx,
      rng
    );
    if (tyrant.requested) {
      return { state: tyrant.state, events: tyrant.events };
    }
    const intimidate = maybeRequestIntimidate(
      tyrant.state,
      ctx.attackerId,
      ctx.defenderId,
      tyrant.events,
      { kind: "combatQueue" }
    );
    if (intimidate.requested) {
      return { state: intimidate.state, events: intimidate.events };
    }
    return advanceCombatQueue(tyrant.state, tyrant.events);
  }

  const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  if (
    defender.class === "berserker" &&
    charges === 6 &&
    !resolvedCtx.berserkerChoiceMade
  ) {
    return replacePendingRoll(
      state,
      defender.owner,
      "berserkerDefenseChoice",
      resolvedCtx,
      defender.id
    );
  }

  const defenderRollKind: RollKind =
    pending.kind === "riderPathAttack_attackerRoll"
      ? "riderPathAttack_defenderRoll"
      : "attack_defenderRoll";

  return replacePendingRoll(
    state,
    defender.owner,
    defenderRollKind,
    resolvedCtx,
    defender.id
  );
}

export function resolveAttackDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const stage = ctx.stage ?? "initial";
  const dice = rollDice(rng, stage === "tieBreak" ? 1 : 2);
  const nextCtx: AttackRollContext = {
    ...ctx,
    stage,
    berserkerChoiceMade: true,
    chikatiloDecoyChoiceMade: true,
  };

  if (stage === "tieBreak") {
    nextCtx.tieBreakDefender = [...(ctx.tieBreakDefender ?? []), ...dice];
  } else {
    nextCtx.defenderDice = dice;
  }

  const attackerTotal =
    sumDice(nextCtx.attackerDice ?? []) +
    sumDice(nextCtx.tieBreakAttacker ?? []);
  const defenderTotal =
    sumDice(nextCtx.defenderDice ?? []) +
    sumDice(nextCtx.tieBreakDefender ?? []);

  if (attackerTotal === defenderTotal) {
    nextCtx.stage = "tieBreak";
    const attackerRollKind: RollKind =
      pending.kind === "riderPathAttack_defenderRoll"
        ? "riderPathAttack_attackerRoll"
        : "attack_attackerRoll";

    return replacePendingRoll(
      state,
      attacker.owner,
      attackerRollKind,
      nextCtx,
      attacker.id
    );
  }

  const resolved = finalizeAttackFromContext(state, nextCtx, false);
  if (nextCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(
      resolved.state,
      resolved.events,
      nextCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
  if (tyrant.requested) {
    return { state: tyrant.state, events: tyrant.events };
  }
  const intimidate = maybeRequestIntimidate(
    tyrant.state,
    ctx.attackerId,
    ctx.defenderId,
    tyrant.events,
    { kind: "combatQueue" }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }
  return advanceCombatQueue(tyrant.state, tyrant.events);
}

export function resolveBerserkerDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selected = choice;
  if (selected === "auto") {
    const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "auto") {
    const resolved = finalizeAttackFromContext(state, ctx, true);
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: defender.id, choice: "auto" }),
      ...resolved.events,
    ];
    if (ctx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(resolved.state, choiceEvents, ctx);
    }
    const tyrant = handleTyrantIfNeeded(resolved.state, choiceEvents, ctx, rng);
    if (tyrant.requested) {
      return { state: tyrant.state, events: tyrant.events };
    }
    const intimidate = maybeRequestIntimidate(
      tyrant.state,
      ctx.attackerId,
      ctx.defenderId,
      tyrant.events,
      { kind: "combatQueue" }
    );
    if (intimidate.requested) {
      return { state: intimidate.state, events: intimidate.events };
    }
    return advanceCombatQueue(tyrant.state, tyrant.events);
  }

  if (selected === "roll") {
    const nextCtx: AttackRollContext = { ...ctx, berserkerChoiceMade: true };
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";

    const requested = replacePendingRoll(
      state,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: defender.id, choice: "roll" }),
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

  return { state: clearPendingRoll(state), events: [] };
}

export function resolveChikatiloDecoyChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selection = choice === "decoy" ? "decoy" : "roll";
  let nextState: GameState = state;

  if (selection === "decoy") {
    const spent = spendCharges(defender, ABILITY_CHIKATILO_DECOY, 3);
    if (!spent.ok) {
      selection = "roll";
    } else {
      const updatedDefender = spent.unit;
      nextState = {
        ...state,
        units: {
          ...state.units,
          [updatedDefender.id]: updatedDefender,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    chikatiloDecoyChoiceMade: true,
  };

  if (selection !== "decoy") {
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";

    const requested = replacePendingRoll(
      nextState,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
    return { state: requested.state, events: requested.events };
  }

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    false,
    true,
    1,
    true
  );

  if (nextCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(
      resolved.state,
      resolved.events,
      nextCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
  if (tyrant.requested) {
    return { state: tyrant.state, events: tyrant.events };
  }
  const intimidate = maybeRequestIntimidate(
    tyrant.state,
    ctx.attackerId,
    ctx.defenderId,
    tyrant.events,
    { kind: "combatQueue" }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }
  return advanceCombatQueue(tyrant.state, tyrant.events);
}
