import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  RollKind,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { canAttackTarget, resolveAttack } from "../../../combat";
import { getLegalAttackTargets } from "../../../legal";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_ODIN_MUNINN,
  getCharges,
  spendCharges,
} from "../../../abilities";
import { spendSlots } from "../../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../../core";
import { getPolkovodetsSource, maybeRequestIntimidate } from "../../../actions/heroes/vlad";
import { isElCid } from "../../../actions/shared";
import { handleGroznyTyrantAfterAttack } from "../../../actions/heroes/grozny";
import { hasMettatonBerserkerFeature } from "../../../mettaton";
import {
  HERO_ASGORE_ID,
  HERO_CHIKATILO_ID,
  HERO_FEMTO_ID,
  HERO_FRISK_ID,
  HERO_GUTS_ID,
  HERO_ODIN_ID,
  HERO_PAPYRUS_ID,
} from "../../../heroes";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evDamageBonusApplied,
} from "../../../core";
import type { AttackRollContext } from "../../types";
import { makeAttackContext, replacePendingRoll } from "../../builders/buildPendingRoll";
import { findAttackResolved } from "../../utils/attackEvents";
import { isDoubleRoll, rollDice, sumDice } from "../../utils/rollMath";

function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  autoDefenseMode: "none" | "berserk" | "muninn" = "none",
  autoHit: boolean = false,
  damageOverride?: number,
  ignoreBonuses: boolean = false,
  forceMiss: boolean = false
): ApplyResult {
  const resolvedDamageOverride =
    damageOverride !== undefined ? damageOverride : context.damageOverride;
  const resolvedIgnoreBonuses = ignoreBonuses || context.ignoreBonuses === true;
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
    allowFriendlyTarget: context.allowFriendlyTarget,
    defenderUseBerserkAutoDefense: autoDefenseMode === "berserk",
    defenderUseMuninnAutoDefense: autoDefenseMode === "muninn",
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    rangedAttack: context.rangedAttack,
    damageBonus,
    damageOverride: resolvedDamageOverride,
    ignoreBonuses: resolvedIgnoreBonuses,
    autoHit,
    forceMiss,
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
    !resolvedIgnoreBonuses &&
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

export function requestJebeKhansShooterAttack(
  state: GameState,
  baseEvents: GameEvent[],
  casterId: string,
  targetId: string,
  remainingAttacks: number
): ApplyResult {
  const caster = state.units[casterId];
  const target = state.units[targetId];
  if (
    !caster ||
    !caster.isAlive ||
    !caster.position ||
    !target ||
    !target.isAlive ||
    !target.position
  ) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  if (!canAttackTarget(state, caster, target)) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId: casterId,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    jebeKhansShooter: {
      casterId,
      remainingAttacks,
    },
  };

  const requested = requestRoll(
    clearPendingRoll(state),
    caster.owner,
    "attack_attackerRoll",
    ctx,
    caster.id
  );

  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

export function continueJebeKhansShooter(
  state: GameState,
  baseEvents: GameEvent[],
  context: Record<string, unknown>
): ApplyResult {
  const casterId =
    typeof context.casterId === "string" ? context.casterId : undefined;
  const remainingAttacks =
    typeof context.remainingAttacks === "number"
      ? context.remainingAttacks
      : undefined;
  const lastTargetId =
    typeof context.lastTargetId === "string" ? context.lastTargetId : undefined;
  if (!casterId || !remainingAttacks || remainingAttacks <= 0) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const caster = state.units[casterId];
  if (!caster || !caster.isAlive || !caster.position) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const options = getLegalAttackTargets(state, casterId).filter(
    (targetId) => targetId !== lastTargetId
  );
  if (options.length === 0) {
    return { state: clearPendingRoll(state), events: baseEvents };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    caster.owner,
    "jebeKhansShooterTargetChoice",
    {
      casterId,
      remainingAttacks,
      options,
      lastTargetId,
    },
    caster.id
  );

  return { state: requested.state, events: [...baseEvents, ...requested.events] };
}

function handleJebeKhansShooterAfterAttack(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext
): ApplyResult {
  const shooter = context.jebeKhansShooter;
  if (!shooter) {
    return { state, events };
  }

  const attackEvent = findAttackResolved(
    events,
    context.attackerId,
    context.defenderId
  );
  if (!attackEvent) {
    return { state, events };
  }

  const remainingAttacks = shooter.remainingAttacks - 1;
  if (remainingAttacks <= 0) {
    return { state: clearPendingRoll(state), events };
  }

  const resumeContext: Record<string, unknown> = {
    casterId: shooter.casterId,
    remainingAttacks,
    lastTargetId: context.defenderId,
  };
  const intimidate = maybeRequestIntimidate(
    state,
    context.attackerId,
    context.defenderId,
    events,
    { kind: "jebeKhansShooter", context: resumeContext }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return continueJebeKhansShooter(state, events, resumeContext);
}

function canUseFriskSubstitution(defender: UnitState): boolean {
  return (
    defender.heroId === HERO_FRISK_ID &&
    getCharges(defender, ABILITY_FRISK_GENOCIDE) >= 3
  );
}

function canUseFriskChildsCry(defender: UnitState): boolean {
  return (
    defender.heroId === HERO_FRISK_ID &&
    !defender.friskPacifismDisabled &&
    getCharges(defender, ABILITY_FRISK_PACIFISM) >= 5
  );
}

function wouldAttackHitFromContext(
  ctx: AttackRollContext,
  attacker: UnitState,
  defender: UnitState
): boolean {
  if (ctx.friskForceMiss) return false;

  const attackerTotal =
    sumDice(ctx.attackerDice ?? []) + sumDice(ctx.tieBreakAttacker ?? []);
  const defenderTotal =
    sumDice(ctx.defenderDice ?? []) + sumDice(ctx.tieBreakDefender ?? []);

  let hit = attackerTotal > defenderTotal;
  const attackerDice = ctx.attackerDice ?? [];
  const defenderDice = ctx.defenderDice ?? [];
  const attackerDouble =
    attackerDice.length >= 2 && attackerDice[0] === attackerDice[1];
  const defenderDouble =
    defenderDice.length >= 2 && defenderDice[0] === defenderDice[1];

  if (
    (defender.class === "spearman" ||
      defender.heroId === HERO_ASGORE_ID ||
      defender.heroId === HERO_FEMTO_ID ||
      defender.heroId === HERO_ODIN_ID) &&
    defenderDouble
  ) {
    hit = false;
  }
  if (
    (attacker.class === "knight" ||
      attacker.heroId === HERO_ODIN_ID ||
      attacker.heroId === HERO_GUTS_ID) &&
    attackerDouble
  ) {
    hit = true;
  }
  return hit;
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
  let nextCtx: AttackRollContext = { ...ctx, stage };
  let workingState = state;
  let workingDefender = defender;
  let workingAttacker = attacker;

  if (stage === "tieBreak") {
    nextCtx.tieBreakAttacker = [...(ctx.tieBreakAttacker ?? []), ...dice];
  } else {
    nextCtx.attackerDice = dice;
  }

  if (
    workingDefender.heroId === HERO_FRISK_ID &&
    workingDefender.friskCleanSoulShield
  ) {
    workingDefender = {
      ...workingDefender,
      friskCleanSoulShield: false,
    };
    workingState = {
      ...workingState,
      units: {
        ...workingState.units,
        [workingDefender.id]: workingDefender,
      },
    };
    nextCtx = {
      ...nextCtx,
      friskForceMiss: true,
      friskSubstitutionChoiceMade: true,
      friskChildsCryChoiceMade: true,
      defenderDice: [],
      tieBreakDefender: [],
      stage: "initial",
    };
  }

  const canDecoy =
    workingDefender.heroId === HERO_CHIKATILO_ID &&
    getCharges(workingDefender, ABILITY_CHIKATILO_DECOY) >= 3 &&
    !nextCtx.chikatiloDecoyChoiceMade;
  if (canDecoy) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "chikatiloDecoyChoice",
      nextCtx,
      workingDefender.id
    );
  }

  const resolvedCtx: AttackRollContext = {
    ...nextCtx,
    chikatiloDecoyChoiceMade: true,
  };

  if (
    !resolvedCtx.friskForceMiss &&
    canUseFriskSubstitution(workingDefender) &&
    !resolvedCtx.friskSubstitutionChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "friskSubstitutionChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  if (resolvedCtx.friskForceMiss) {
    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      false,
      undefined,
      false,
      true
    );
    if (resolvedCtx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(
        resolved.state,
        resolved.events,
        resolvedCtx
      );
    }
    if (resolvedCtx.jebeKhansShooter) {
      return handleJebeKhansShooterAfterAttack(
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

  if (workingAttacker.heroId === HERO_FRISK_ID && workingAttacker.friskPrecisionStrikeReady) {
    workingAttacker = {
      ...workingAttacker,
      friskPrecisionStrikeReady: false,
    };
    workingState = {
      ...workingState,
      units: {
        ...workingState.units,
        [workingAttacker.id]: workingAttacker,
      },
    };

    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      true,
      Math.max(0, workingAttacker.attack * 2),
      true
    );
    if (resolvedCtx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(
        resolved.state,
        resolved.events,
        resolvedCtx
      );
    }
    if (resolvedCtx.jebeKhansShooter) {
      return handleJebeKhansShooterAfterAttack(
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

  const isAutoHit =
    stage === "initial" && isElCid(workingAttacker) && isDoubleRoll(dice);
  if (isAutoHit) {
    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      true
    );
    if (resolvedCtx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(
        resolved.state,
        resolved.events,
        resolvedCtx
      );
    }
    if (resolvedCtx.jebeKhansShooter) {
      return handleJebeKhansShooterAfterAttack(
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

  const charges = workingDefender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  if (
    (workingDefender.class === "berserker" ||
      workingDefender.heroId === HERO_FEMTO_ID ||
      (workingDefender.heroId === HERO_PAPYRUS_ID &&
        workingDefender.papyrusUnbelieverActive) ||
      hasMettatonBerserkerFeature(workingDefender)) &&
    charges === 6 &&
    !resolvedCtx.berserkerChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "berserkerDefenseChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  if (
    workingDefender.heroId === HERO_ASGORE_ID &&
    workingDefender.asgoreBraveryAutoDefenseReady &&
    !resolvedCtx.asgoreBraveryChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "asgoreBraveryDefenseChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  const defenderRollKind: RollKind =
    pending.kind === "riderPathAttack_attackerRoll"
      ? "riderPathAttack_defenderRoll"
      : "attack_defenderRoll";

  return replacePendingRoll(
    workingState,
    workingDefender.owner,
    defenderRollKind,
    resolvedCtx,
    workingDefender.id
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
    asgoreBraveryChoiceMade: true,
    chikatiloDecoyChoiceMade: true,
    friskSubstitutionChoiceMade: true,
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

  if (
    wouldAttackHitFromContext(nextCtx, attacker, defender) &&
    canUseFriskChildsCry(defender) &&
    !nextCtx.friskChildsCryChoiceMade
  ) {
    return replacePendingRoll(
      state,
      defender.owner,
      "friskChildsCryChoice",
      nextCtx,
      defender.id
    );
  }

  const muninnCharges = defender.charges?.[ABILITY_ODIN_MUNINN] ?? 0;
  if (
    defender.heroId === HERO_ODIN_ID &&
    muninnCharges === 6 &&
    !nextCtx.odinMuninnChoiceMade
  ) {
    return replacePendingRoll(
      state,
      defender.owner,
      "odinMuninnDefenseChoice",
      nextCtx,
      defender.id
    );
  }

  const finalizedCtx: AttackRollContext = {
    ...nextCtx,
    odinMuninnChoiceMade: true,
  };
  const resolved = finalizeAttackFromContext(state, finalizedCtx, "none");
  if (finalizedCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(
      resolved.state,
      resolved.events,
      finalizedCtx
    );
  }
  if (finalizedCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
      resolved.state,
      resolved.events,
      finalizedCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(
    resolved.state,
    resolved.events,
    finalizedCtx,
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
    const resolved = finalizeAttackFromContext(state, ctx, "berserk");
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: defender.id, choice: "auto" }),
      ...resolved.events,
    ];
    if (ctx.elCidDuelist) {
      return handleElCidDuelistAfterAttack(resolved.state, choiceEvents, ctx);
    }
    if (ctx.jebeKhansShooter) {
      return handleJebeKhansShooterAfterAttack(
        resolved.state,
        choiceEvents,
        ctx
      );
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

export function resolveOdinMuninnDefenseChoiceRoll(
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

  let selected = choice === "auto" ? "auto" : "roll";
  if (selected === "auto") {
    const charges = defender.charges?.[ABILITY_ODIN_MUNINN] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  const finalizedCtx: AttackRollContext = {
    ...ctx,
    odinMuninnChoiceMade: true,
  };

  const resolved = finalizeAttackFromContext(
    state,
    finalizedCtx,
    selected === "auto" ? "muninn" : "none"
  );

  if (finalizedCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(
      resolved.state,
      resolved.events,
      finalizedCtx
    );
  }
  if (finalizedCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
      resolved.state,
      resolved.events,
      finalizedCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(
    resolved.state,
    resolved.events,
    finalizedCtx,
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

export function resolveAsgoreBraveryDefenseChoiceRoll(
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

  let selected = choice === "auto" ? "auto" : "roll";
  if (
    selected === "auto" &&
    (defender.heroId !== HERO_ASGORE_ID || !defender.asgoreBraveryAutoDefenseReady)
  ) {
    selected = "roll";
  }

  let nextState = state;
  if (selected === "auto") {
    const updatedDefender: UnitState = {
      ...defender,
      asgoreBraveryAutoDefenseReady: false,
    };
    nextState = {
      ...state,
      units: {
        ...state.units,
        [updatedDefender.id]: updatedDefender,
      },
    };
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    asgoreBraveryChoiceMade: true,
  };

  if (selected === "roll") {
    const defenderRollKind: RollKind =
      nextCtx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";
    return replacePendingRoll(
      nextState,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
  }

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    false,
    undefined,
    false,
    true
  );
  if (nextCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(
      resolved.state,
      resolved.events,
      nextCtx
    );
  }
  if (nextCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
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

export function resolveFriskSubstitutionChoiceRoll(
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

  let nextState = state;
  let selected = choice === "activate" ? "activate" : "roll";
  if (selected === "activate") {
    const spent = spendCharges(defender, ABILITY_FRISK_GENOCIDE, 3);
    if (!spent.ok) {
      selected = "roll";
    } else {
      nextState = {
        ...state,
        units: {
          ...state.units,
          [defender.id]: spent.unit,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    friskSubstitutionChoiceMade: true,
    friskChildsCryChoiceMade: true,
  };

  if (selected !== "activate") {
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";
    return replacePendingRoll(
      nextState,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
  }

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    true,
    1,
    true
  );
  if (nextCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(resolved.state, resolved.events, nextCtx);
  }
  if (nextCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
      resolved.state,
      resolved.events,
      nextCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(resolved.state, resolved.events, nextCtx, rng);
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

export function resolveFriskChildsCryChoiceRoll(
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

  let nextState = state;
  let selected = choice === "activate" ? "activate" : "roll";
  if (selected === "activate") {
    const spent = spendCharges(defender, ABILITY_FRISK_PACIFISM, 5);
    if (!spent.ok) {
      selected = "roll";
    } else {
      nextState = {
        ...state,
        units: {
          ...state.units,
          [defender.id]: spent.unit,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    friskChildsCryChoiceMade: true,
  };

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    false,
    selected === "activate" ? 0 : undefined,
    selected === "activate"
  );
  if (nextCtx.elCidDuelist) {
    return handleElCidDuelistAfterAttack(resolved.state, resolved.events, nextCtx);
  }
  if (nextCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
      resolved.state,
      resolved.events,
      nextCtx
    );
  }
  const tyrant = handleTyrantIfNeeded(resolved.state, resolved.events, nextCtx, rng);
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
    "none",
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
  if (nextCtx.jebeKhansShooter) {
    return handleJebeKhansShooterAfterAttack(
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


