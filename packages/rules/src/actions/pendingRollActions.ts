import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  MoveMode,
  PendingMove,
  PendingRoll,
  PlayerId,
  ResolveRollChoice,
  RollKind,
  StealthRevealReason,
  UnitState,
} from "../model";
import { isInsideBoard } from "../model";
import type { RNG } from "../rng";
import { roll2D6, rollD6 } from "../rng";
import { getUnitDefinition } from "../units";
import { resolveAttack } from "../combat";
import { getBerserkerMovesForRoll, getTricksterMovesForRoll } from "../movement";
import { chebyshev, coordsEqual } from "../board";
import { revealUnit } from "../stealth";
import { resolveAoE } from "../aoe";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_VLAD_FOREST,
} from "../abilities";
import { clearPendingRoll, requestInitiativeRoll, requestRoll } from "./utils/rollUtils";
import { applyStakeTriggerIfAny, getLegalStakePositions } from "./utils/stakeUtils";
import {
  activateVladForest,
  getPolkovodetsSource,
  maybeRequestIntimidate,
  requestVladStakesPlacement,
} from "./heroes/vlad";
import { isKaiserTransformed, map2d9ToCoord, rollD9 } from "./shared";
import type { IntimidateResume } from "./types";
import {
  evAoeResolved,
  evBerserkerDefenseChosen,
  evBunkerEntered,
  evBunkerEnterFailed,
  evCarpetStrikeAttackRolled,
  evCarpetStrikeCenter,
  evDamageBonusApplied,
  evInitiativeRolled,
  evInitiativeResolved,
  evIntimidateResolved,
  evMoveBlocked,
  evMoveOptionsGenerated,
  evPlacementStarted,
  evSearchStealth,
  evStealthEntered,
  evStealthRevealed,
  evStakesPlaced,
} from "./utils/events";

function resolveEnterStealthRoll(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const def = getUnitDefinition(unit.class);
  let success = false;

  if (unit.class === "archer") {
    success = roll === 6;
  } else if (unit.class === "assassin") {
    success = roll >= 5;
  }

  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const updated: UnitState = success
    ? {
        ...baseUnit,
        isStealthed: true,
        stealthTurnsLeft: def.maxStealthTurns ?? 3,
      }
    : {
        ...baseUnit,
      };

  const otherPlayer: PlayerId = unit.owner === "P1" ? "P2" : "P1";
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
    lastKnownPositions:
      success && updated.position
        ? {
            ...state.lastKnownPositions,
            [otherPlayer]: {
              ...(state.lastKnownPositions?.[otherPlayer] ?? {}),
              [updated.id]: { ...updated.position },
            },
          }
        : state.lastKnownPositions,
  };

  const events: GameEvent[] = [
    evStealthEntered({ unitId: updated.id, success, roll }),
  ];

  return { state: clearPendingRoll(nextState), events };
}

function resolveSearchStealthRoll(
  state: GameState,
  unitId: string,
  mode: "action" | "move",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const searchCosts = mode === "action" ? { action: true } : { move: true };
  if (!canSpendSlots(unit, searchCosts)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  const events: GameEvent[] = [];
  const rollResults: { targetId: string; roll: number; success: boolean }[] = [];
  const lastKnownPositions = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };

  const candidates = Object.values(units).filter((candidate) => {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      return false;
    }
    if (candidate.owner === unit.owner) {
      return false;
    }
    const dist = chebyshev(unit.position!, candidate.position);
    return dist <= 1;
  });

  if (candidates.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  for (const candidate of candidates) {
    const roll = rollD6(rng);
    const success = roll >= 5;
    rollResults.push({ targetId: candidate.id, roll, success });
    if (!success) continue;

    const updatedHidden: UnitState = {
      ...candidate,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };

    units[updatedHidden.id] = updatedHidden;
    delete lastKnownPositions.P1[updatedHidden.id];
    delete lastKnownPositions.P2[updatedHidden.id];

    events.push(
      evStealthRevealed({ unitId: updatedHidden.id, reason: "search" })
    );
  }

  const updatedSearcher: UnitState = spendSlots(unit, searchCosts);
  units[updatedSearcher.id] = updatedSearcher;

  const newState: GameState = {
    ...state,
    units,
    knowledge: {
      ...state.knowledge,
      [unit.owner]: {
        ...(state.knowledge?.[unit.owner] ?? {}),
        ...(Object.values(units)
          .filter((u) => !u.isStealthed && u.owner !== unit.owner)
          .reduce<Record<string, boolean>>((acc, u) => {
            if (state.knowledge?.[unit.owner]?.[u.id]) return acc;
            acc[u.id] = true;
            return acc;
          }, {})),
      },
    },
    lastKnownPositions,
  };

  events.unshift(
    evSearchStealth({
      unitId: updatedSearcher.id,
      mode,
      rolls: rollResults,
    })
  );

  return { state: clearPendingRoll(newState), events };
}

function resolveMoveOptionsRoll(
  state: GameState,
  unitId: string,
  kind: "moveTrickster" | "moveBerserker",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { move: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const legalMoves =
    kind === "moveTrickster"
      ? getTricksterMovesForRoll(state, unit.id, roll)
      : getBerserkerMovesForRoll(state, unit.id, roll);
  const mode =
    (state.pendingRoll?.context?.mode as MoveMode | undefined) ?? "normal";

  const pendingMove: PendingMove = {
    unitId: unit.id,
    roll,
    legalTo: legalMoves,
    expiresTurnNumber: state.turnNumber,
    mode,
  };

  const newState: GameState = {
    ...state,
    pendingMove,
  };

  const events: GameEvent[] = [
    evMoveOptionsGenerated({
      unitId: unit.id,
      roll,
      legalTo: legalMoves,
      mode,
    }),
  ];

  if (legalMoves.length === 0) {
    events.push(
      evMoveBlocked({ unitId: unit.id, reason: "noLegalDestinations" })
    );
  }

  return { state: clearPendingRoll(newState), events };
}

function resolveEnterBunkerRoll(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const success = roll >= 4;
  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const updated: UnitState = success
    ? {
        ...baseUnit,
        isStealthed: false,
        stealthTurnsLeft: 0,
        bunker: { active: true, ownTurnsInBunker: 0 },
      }
    : {
        ...baseUnit,
        bunker: { active: false, ownTurnsInBunker: 0 },
      };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
  };

  const events: GameEvent[] = [
    success
      ? evBunkerEntered({ unitId: updated.id, roll })
      : evBunkerEnterFailed({ unitId: updated.id, roll }),
  ];

  return { state: clearPendingRoll(nextState), events };
}

function resolveInitiativeRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = roll2D6(rng);
  const nextInitiative = {
    ...state.initiative,
    [pending.player]: roll.sum,
  } as GameState["initiative"];

  const nextState: GameState = {
    ...state,
    initiative: nextInitiative,
  };

  const events: GameEvent[] = [
    evInitiativeRolled({
      player: pending.player,
      dice: roll.dice,
      sum: roll.sum,
    }),
  ];

  if (pending.player === "P1") {
    const requested = requestInitiativeRoll(clearPendingRoll(nextState), "P2");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const p1 = nextInitiative.P1;
  const p2 = nextInitiative.P2;
  if (p1 === null || p2 === null) {
    return { state: clearPendingRoll(nextState), events };
  }

  if (p1 === p2) {
    const resetState: GameState = {
      ...nextState,
      initiative: { P1: null, P2: null, winner: null },
    };
    const requested = requestInitiativeRoll(clearPendingRoll(resetState), "P1");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const winner: PlayerId = p1 > p2 ? "P1" : "P2";
  const placementState: GameState = {
    ...nextState,
    phase: "placement",
    currentPlayer: winner,
    placementFirstPlayer: winner,
    initiative: { ...nextInitiative, winner },
    pendingRoll: null,
    pendingMove: null,
    activeUnitId: null,
    placementOrder: [],
    turnOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrderIndex: 0,
    unitsPlaced: { P1: 0, P2: 0 },
  };

  const resolvedEvents: GameEvent[] = [
    ...events,
    evInitiativeResolved({
      winner,
      P1sum: p1,
      P2sum: p2,
    }),
    evPlacementStarted({ placementFirstPlayer: winner }),
  ];

  return { state: placementState, events: resolvedEvents };
}

interface CarpetStrikeAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

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

function advanceCarpetStrikeQueue(
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

function resolveCarpetStrikeCenterRoll(
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

function resolveCarpetStrikeAttackRoll(
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

function resolveCarpetStrikeDefenderRoll(
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

function resolveCarpetStrikeBerserkerDefenseChoice(
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

function finalizeForestAoE(
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

function advanceForestAoEQueue(
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

function resolveForestAttackerRoll(
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

function resolveForestDefenderRoll(
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

function resolveForestBerserkerDefenseChoice(
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

interface AttackRollContext extends Record<string, unknown> {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageBonusSourceId?: string;
  attackerDice?: number[];
  defenderDice?: number[];
  tieBreakAttacker?: number[];
  tieBreakDefender?: number[];
  stage?: "initial" | "tieBreak";
  berserkerChoiceMade?: boolean;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
}

interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

interface DoraAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

interface ForestAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

function rollDice(rng: RNG, count: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(rollD6(rng));
  }
  return rolls;
}

function sumDice(dice: number[]): number {
  return dice.reduce((acc, v) => acc + v, 0);
}

function replacePendingRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: Record<string, unknown>,
  actorUnitId?: string
): ApplyResult {
  const baseState = clearPendingRoll(state);
  return requestRoll(baseState, player, kind, context, actorUnitId);
}

function makeAttackContext(params: {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  consumeSlots: boolean;
  queueKind: "normal" | "riderPath" | "aoe";
}): AttackRollContext {
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    ignoreRange: params.ignoreRange,
    ignoreStealth: params.ignoreStealth,
    damageBonus: params.damageBonus,
    damageBonusSourceId: params.damageBonusSourceId,
    attackerDice: [],
    defenderDice: [],
    tieBreakAttacker: [],
    tieBreakDefender: [],
    stage: "initial",
    berserkerChoiceMade: false,
    consumeSlots: params.consumeSlots,
    queueKind: params.queueKind,
  };
}

function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  useAutoDefense: boolean
): ApplyResult {
  const rolls = {
    attackerDice: context.attackerDice ?? [],
    defenderDice: context.defenderDice ?? [],
    tieBreakAttacker: context.tieBreakAttacker ?? [],
    tieBreakDefender: context.tieBreakDefender ?? [],
  };

  const sourceId =
    context.damageBonusSourceId ?? getPolkovodetsSource(state, context.attackerId);
  const damageBonus = sourceId ? 1 : 0;

  const { nextState, events } = resolveAttack(state, {
    attackerId: context.attackerId,
    defenderId: context.defenderId,
    defenderUseBerserkAutoDefense: useAutoDefense,
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    damageBonus,
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
    damageBonus > 0 &&
    sourceId
  ) {
    updatedEvents.push(
      evDamageBonusApplied({
        unitId: context.attackerId,
        amount: damageBonus,
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

function advanceCombatQueue(
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
    consumeSlots: false,
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

function finalizeTricksterAoE(
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

function advanceTricksterAoEQueue(
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

  return finalizeTricksterAoE(baseState, events);
}

function resolveTricksterAoEAttackerRoll(
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

function resolveTricksterAoEDefenderRoll(
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

  const nextCtx: TricksterAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
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

function finalizeDoraAoE(
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

function advanceDoraAoEQueue(
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
      if (target.class === "berserker" && charges === 6 && attackerDice.length >= 2) {
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

function resolveDoraAttackerRoll(
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

function resolveDoraDefenderRoll(
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

function resolveDoraBerserkerDefenseChoice(
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

function resolveAttackAttackerRoll(
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

  const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  if (defender.class === "berserker" && charges === 6 && !nextCtx.berserkerChoiceMade) {
    return replacePendingRoll(
      state,
      defender.owner,
      "berserkerDefenseChoice",
      nextCtx,
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
    nextCtx,
    defender.id
  );
}

function resolveAttackDefenderRoll(
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
  const intimidate = maybeRequestIntimidate(
    resolved.state,
    ctx.attackerId,
    ctx.defenderId,
    resolved.events,
    { kind: "combatQueue" }
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }
  return advanceCombatQueue(resolved.state, resolved.events);
}

function resolveBerserkerDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined
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
    const intimidate = maybeRequestIntimidate(
      resolved.state,
      ctx.attackerId,
      ctx.defenderId,
      choiceEvents,
      { kind: "combatQueue" }
    );
    if (intimidate.requested) {
      return { state: intimidate.state, events: intimidate.events };
    }
    return advanceCombatQueue(resolved.state, choiceEvents);
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

function resolveVladIntimidateChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as {
    defenderId?: string;
    attackerId?: string;
    options?: Coord[];
    resume?: IntimidateResume;
  };
  const defenderId = ctx.defenderId;
  const attackerId = ctx.attackerId;
  if (!defenderId || !attackerId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const defender = state.units[defenderId];
  const attacker = state.units[attackerId];
  if (!defender || !attacker) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const desired =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type: string; to?: Coord }).to
      : undefined;
  const canPush =
    desired &&
    options.some((opt) => coordsEqual(opt, desired));

  let updatedState: GameState = clearPendingRoll(state);
  let updatedAttacker = attacker;
  const events: GameEvent[] = [];

  if (canPush && attacker.position) {
    const from = attacker.position;
    const to = desired!;
    updatedAttacker = { ...attacker, position: { ...to } };
    updatedState = {
      ...updatedState,
      units: {
        ...updatedState.units,
        [updatedAttacker.id]: updatedAttacker,
      },
    };
    events.push(evIntimidateResolved({ attackerId, from, to }));

    if (updatedAttacker.isStealthed) {
      const revealed = revealUnit(
        updatedState,
        updatedAttacker.id,
        "forcedDisplacement",
        rng
      );
      updatedState = revealed.state;
      events.push(...revealed.events);
      updatedAttacker = updatedState.units[updatedAttacker.id] ?? updatedAttacker;
    }

    if (updatedAttacker.position) {
      const stakeResult = applyStakeTriggerIfAny(
        updatedState,
        updatedAttacker,
        updatedAttacker.position,
        rng
      );
      if (stakeResult.triggered) {
        updatedState = stakeResult.state;
        updatedAttacker = stakeResult.unit;
        events.push(...stakeResult.events);
      }
    }
  }

  const resume = ctx.resume ?? { kind: "none" };
  switch (resume.kind) {
    case "combatQueue":
      return advanceCombatQueue(updatedState, events);
    case "tricksterAoE":
      return advanceTricksterAoEQueue(
        updatedState,
        resume.context as unknown as TricksterAoEContext,
        events
      );
    case "doraAoE":
      return advanceDoraAoEQueue(
        updatedState,
        resume.context as unknown as DoraAoEContext,
        events
      );
    case "carpetStrike":
      return advanceCarpetStrikeQueue(
        updatedState,
        resume.context as unknown as CarpetStrikeAoEContext,
        events
      );
    case "forestAoE":
      return advanceForestAoEQueue(
        updatedState,
        resume.context as unknown as ForestAoEContext,
        events
      );
    default:
      return { state: updatedState, events };
  }
}

function resolveVladPlaceStakes(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    owner?: PlayerId;
    count?: number;
    reason?: "battleStart" | "turnStart";
    legalPositions?: Coord[];
    queue?: PlayerId[];
  };
  const owner = ctx.owner;
  if (!owner) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const request = choice as { type?: string; positions?: Coord[] } | undefined;
  if (!request || request.type !== "placeStakes") {
    return { state, events: [] };
  }

  const positions = Array.isArray(request.positions) ? request.positions : [];
  if (positions.length !== 3) {
    return { state, events: [] };
  }

  const legalPositions =
    Array.isArray(ctx.legalPositions) && ctx.legalPositions.length > 0
      ? ctx.legalPositions
      : getLegalStakePositions(state, owner);
  const legalSet = new Set(legalPositions.map((pos) => `${pos.col},${pos.row}`));

  const unique = new Set(positions.map((pos) => `${pos.col},${pos.row}`));
  if (unique.size !== positions.length) {
    return { state, events: [] };
  }

  for (const pos of positions) {
    if (!legalSet.has(`${pos.col},${pos.row}`)) {
      return { state, events: [] };
    }
  }

  const baseCounter = state.stakeCounter ?? 0;
  const created = positions.map((pos, index) => ({
    id: `stake-${owner}-${baseCounter + index + 1}`,
    owner,
    position: { ...pos },
    createdAt: baseCounter + index + 1,
    isRevealed: false,
  }));

  const nextState: GameState = {
    ...state,
    stakeMarkers: [...state.stakeMarkers, ...created],
    stakeCounter: baseCounter + created.length,
  };

  const events: GameEvent[] = [
    evStakesPlaced({
      owner,
      positions: positions.map((pos) => ({ ...pos })),
      hiddenFromOpponent: true,
    }),
  ];

  const cleared = clearPendingRoll(nextState);
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextOwner, ...rest] = queue;
    const requested = requestVladStakesPlacement(
      cleared,
      nextOwner,
      ctx.reason ?? "battleStart",
      rest
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  return { state: cleared, events };
}

function resolveVladForestChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    unitId?: string;
    owner?: PlayerId;
    canPlaceStakes?: boolean;
  };
  const owner = ctx.owner;
  const unitId = ctx.unitId;
  if (!owner || !unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection = choice as "activate" | "skip" | undefined;
  const unit = state.units[unitId];
  if (!unit) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (selection === "activate") {
    const cleared = clearPendingRoll(state);
    const activated = activateVladForest(cleared, unitId, owner);
    if (activated.state === cleared && activated.events.length === 0) {
      return { state: cleared, events: [] };
    }
    return activated;
  }

  return { state: clearPendingRoll(state), events: [] };
}

function resolveVladForestTarget(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as {
    unitId?: string;
    owner?: PlayerId;
  };
  const unitId = ctx.unitId;
  const owner = ctx.owner;
  if (!unitId || !owner) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload = choice as { type?: string; center?: Coord } | undefined;
  if (!payload || payload.type !== "forestTarget") {
    return { state, events: [] };
  }

  const center = payload.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const aoeRes = resolveAoE(
    state,
    unitId,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: ABILITY_VLAD_FOREST,
      emitEvent: false,
    },
    rng
  );

  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;

  if (affectedUnitIds.length === 0) {
    return {
      state: clearPendingRoll(aoeRes.nextState),
      events: [
        ...aoeRes.events,
        evAoeResolved({
          sourceUnitId: unitId,
          abilityId: ABILITY_VLAD_FOREST,
          casterId: unitId,
          center,
          radius: 1,
          affectedUnitIds,
          revealedUnitIds,
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...aoeRes.nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: unitId,
      abilityId: ABILITY_VLAD_FOREST,
      center,
      radius: 1,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const nextCtx: ForestAoEContext = {
    casterId: unitId,
    center,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    clearPendingRoll(queuedState),
    owner,
    "vladForest_attackerRoll",
    nextCtx,
    unitId
  );

  return { state: requested.state, events: [...aoeRes.events, ...requested.events] };
}

export function applyResolvePendingRoll(
  state: GameState,
  action: Extract<GameAction, { type: "resolvePendingRoll" }>,
  rng: RNG
): ApplyResult {
  const pending = state.pendingRoll;
  if (!pending || pending.id !== action.pendingRollId) {
    return { state, events: [] };
  }
  if (pending.player !== action.player) {
    return { state, events: [] };
  }
  const autoRollChoice =
    action.choice === "auto" || action.choice === "roll"
      ? action.choice
      : undefined;

  switch (pending.kind) {
    case "initiativeRoll": {
      return resolveInitiativeRoll(state, pending, rng);
    }
    case "enterBunker": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveEnterBunkerRoll(state, unitId, rng);
    }
    case "enterStealth": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveEnterStealthRoll(state, unitId, rng);
    }
    case "kaiserCarpetStrikeCenter": {
      return resolveCarpetStrikeCenterRoll(state, pending, rng);
    }
    case "kaiserCarpetStrikeAttack": {
      return resolveCarpetStrikeAttackRoll(state, pending, rng);
    }
    case "carpetStrike_defenderRoll": {
      return resolveCarpetStrikeDefenderRoll(state, pending, rng);
    }
    case "carpetStrike_berserkerDefenseChoice": {
      return resolveCarpetStrikeBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    }
    case "searchStealth": {
      const unitId = pending.context.unitId as string | undefined;
      const mode = pending.context.mode as "action" | "move" | undefined;
      if (!unitId || !mode) {
        return { state: clearPendingRoll(state), events: [] };
      }
      return resolveSearchStealthRoll(state, unitId, mode, rng);
    }
    case "moveTrickster": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveTrickster", rng);
    }
    case "moveBerserker": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveBerserker", rng);
    }
    case "attack_attackerRoll":
    case "riderPathAttack_attackerRoll": {
      return resolveAttackAttackerRoll(state, pending, rng);
    }
    case "attack_defenderRoll":
    case "riderPathAttack_defenderRoll": {
      return resolveAttackDefenderRoll(state, pending, rng);
    }
    case "tricksterAoE_attackerRoll": {
      return resolveTricksterAoEAttackerRoll(state, pending, rng);
    }
    case "tricksterAoE_defenderRoll": {
      return resolveTricksterAoEDefenderRoll(state, pending, rng);
    }
    case "dora_attackerRoll": {
      return resolveDoraAttackerRoll(state, pending, rng);
    }
    case "dora_defenderRoll": {
      return resolveDoraDefenderRoll(state, pending, rng);
    }
    case "berserkerDefenseChoice": {
      return resolveBerserkerDefenseChoiceRoll(state, pending, autoRollChoice);
    }
    case "dora_berserkerDefenseChoice": {
      return resolveDoraBerserkerDefenseChoice(state, pending, autoRollChoice, rng);
    }
    case "vladIntimidateChoice": {
      return resolveVladIntimidateChoice(state, pending, action.choice, rng);
    }
    case "vladPlaceStakes": {
      return resolveVladPlaceStakes(state, pending, action.choice);
    }
    case "vladForestChoice": {
      return resolveVladForestChoice(state, pending, action.choice);
    }
    case "vladForestTarget": {
      return resolveVladForestTarget(state, pending, action.choice, rng);
    }
    case "vladForest_attackerRoll": {
      return resolveForestAttackerRoll(state, pending, rng);
    }
    case "vladForest_defenderRoll": {
      return resolveForestDefenderRoll(state, pending, rng);
    }
    case "vladForest_berserkerDefenseChoice": {
      return resolveForestBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    }
    default:
      return { state: clearPendingRoll(state), events: [] };
  }
}

