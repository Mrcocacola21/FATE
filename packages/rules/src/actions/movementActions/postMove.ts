import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { getUnitAt } from "../../board";
import { spendSlots } from "../../turnEconomy";
import { unitCanSeeStealthed } from "../../visibility";
import { makeAttackContext, requestRoll } from "../../core";
import { getPolkovodetsSource } from "../heroes/vlad";
import { HERO_LECHY_ID } from "../../heroes";
import {
  getRiverDropOptions,
  isRiverPerson,
  requestRiverBoatDropDestination,
} from "../heroes/riverPerson";
import { requestLechyGuideTravelerPlacement } from "../heroes/lechy";
import { evMoveBlocked, evStealthRevealed } from "../../core";
import { collectRiderPathTargets } from "./rider";

export function resolveSteppedOnHiddenDestination(
  state: GameState,
  unit: UnitState,
  finalTo: Coord,
  pendingValid: boolean,
  hasRiverBoatmanMove: boolean,
  hasDecreeMove: boolean
): ApplyResult | null {
  const hiddenAtDest = getUnitAt(state, finalTo);
  if (
    !hiddenAtDest ||
    !hiddenAtDest.isAlive ||
    hiddenAtDest.owner === unit.owner ||
    !hiddenAtDest.isStealthed
  ) {
    return null;
  }

  const known = state.knowledge?.[unit.owner]?.[hiddenAtDest.id];
  const canSee = unitCanSeeStealthed(state, unit, hiddenAtDest);
  if (known || canSee) {
    return null;
  }

  const revealed: UnitState = {
    ...hiddenAtDest,
    isStealthed: false,
    stealthTurnsLeft: 0,
  };
  let movedUnit: UnitState = hasRiverBoatmanMove
    ? { ...unit, riverBoatmanMovePending: false }
    : spendSlots(unit, { move: true });
  if (isRiverPerson(movedUnit)) {
    movedUnit = {
      ...movedUnit,
      riverBoatCarryAllyId: undefined,
    };
  }
  if (hasDecreeMove) {
    movedUnit = { ...movedUnit, genghisKhanDecreeMovePending: false };
  }
  const updatedLastKnown = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  delete updatedLastKnown.P1[revealed.id];
  delete updatedLastKnown.P2[revealed.id];
  const newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [revealed.id]: revealed,
      [movedUnit.id]: movedUnit,
    },
    knowledge: {
      ...state.knowledge,
      [unit.owner]: {
        ...(state.knowledge?.[unit.owner] ?? {}),
        [revealed.id]: true,
      },
    },
    lastKnownPositions: updatedLastKnown,
    pendingMove: pendingValid ? null : state.pendingMove,
  };
  const events: GameEvent[] = [
    evStealthRevealed({
      unitId: revealed.id,
      reason: "steppedOnHidden",
      revealerId: unit.id,
    }),
  ];
  return { state: newState, events };
}

export function applyAdjacencyRevealAfterMove(
  state: GameState,
  updatedUnit: UnitState,
  events: GameEvent[]
): { state: GameState; events: GameEvent[] } {
  if (!updatedUnit.position) {
    return { state, events };
  }

  let newState = state;
  const nextEvents = [...events];
  const moverOwner = updatedUnit.owner;
  const moverPos = updatedUnit.position;

  for (const other of Object.values(newState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.owner === moverOwner) continue;
    if (!other.isStealthed) continue;

    const dx = Math.abs(other.position.col - moverPos.col);
    const dy = Math.abs(other.position.row - moverPos.row);
    const dist = Math.max(dx, dy);
    if (dist > 1) continue;

    const revealed: UnitState = {
      ...other,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };
    const updatedLastKnown = {
      ...newState.lastKnownPositions,
      P1: { ...(newState.lastKnownPositions?.P1 ?? {}) },
      P2: { ...(newState.lastKnownPositions?.P2 ?? {}) },
    };
    delete updatedLastKnown.P1[revealed.id];
    delete updatedLastKnown.P2[revealed.id];

    newState = {
      ...newState,
      units: {
        ...newState.units,
        [revealed.id]: revealed,
      },
      knowledge: {
        ...newState.knowledge,
        [moverOwner]: {
          ...(newState.knowledge?.[moverOwner] ?? {}),
          [revealed.id]: true,
        },
      },
      lastKnownPositions: updatedLastKnown,
    };

    nextEvents.push(
      evStealthRevealed({
        unitId: revealed.id,
        reason: "adjacency",
        revealerId: updatedUnit.id,
      })
    );
  }

  return { state: newState, events: nextEvents };
}

export function maybeRequestRiderPathAttacks(
  originalState: GameState,
  currentState: GameState,
  unit: UnitState,
  from: Coord,
  finalTo: Coord,
  events: GameEvent[],
  riderMovementMode: boolean,
  riderPathFeatureEnabled: boolean
): ApplyResult | null {
  if (!riderMovementMode || !riderPathFeatureEnabled) {
    return null;
  }

  const auraSource =
    getPolkovodetsSource(originalState, unit.id, from) ??
    getPolkovodetsSource(originalState, unit.id, finalTo);
  const damageBonus = auraSource ? 1 : 0;
  const targetIds = collectRiderPathTargets(originalState, unit, from, finalTo);
  if (targetIds.length === 0) {
    return null;
  }

  const queue = targetIds.map((defenderId) => ({
    attackerId: unit.id,
    defenderId,
    ignoreRange: true,
    ignoreStealth: true,
    damageBonus: damageBonus > 0 ? damageBonus : undefined,
    damageBonusSourceId: auraSource ?? undefined,
    kind: "riderPath" as const,
  }));

  const queuedState: GameState = {
    ...currentState,
    pendingCombatQueue: queue,
  };

  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: queue[0].defenderId,
    ignoreRange: true,
    ignoreStealth: true,
    damageBonus: damageBonus > 0 ? damageBonus : undefined,
    damageBonusSourceId: auraSource ?? undefined,
    consumeSlots: false,
    queueKind: "riderPath",
  });

  const requested = requestRoll(
    queuedState,
    unit.owner,
    "riderPathAttack_attackerRoll",
    ctx,
    unit.id
  );

  return {
    state: requested.state,
    events: [...events, ...requested.events],
  };
}

export function maybeHandleRiverCarryDrop(
  state: GameState,
  updatedUnit: UnitState,
  events: GameEvent[]
): ApplyResult | null {
  if (
    !isRiverPerson(updatedUnit) ||
    !updatedUnit.riverBoatCarryAllyId ||
    !updatedUnit.position
  ) {
    return null;
  }

  const allyId = updatedUnit.riverBoatCarryAllyId;
  const ally = state.units[allyId];
  if (!ally || !ally.isAlive || !ally.position || ally.owner !== updatedUnit.owner) {
    const clearedRiver: UnitState = {
      ...updatedUnit,
      riverBoatCarryAllyId: undefined,
    };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [clearedRiver.id]: clearedRiver,
        },
      },
      events,
    };
  }

  const dropOptions = getRiverDropOptions(state, updatedUnit.position, allyId);
  if (dropOptions.length === 0) {
    return {
      state,
      events: [
        ...events,
        evMoveBlocked({ unitId: updatedUnit.id, reason: "noLegalDestinations" }),
      ],
    };
  }

  const requestedDrop = requestRiverBoatDropDestination(
    state,
    updatedUnit.id,
    allyId,
    dropOptions
  );
  return {
    state: requestedDrop.state,
    events: [...events, ...requestedDrop.events],
  };
}

export function maybeHandleLechyGuideTraveler(
  state: GameState,
  updatedUnit: UnitState,
  events: GameEvent[]
): ApplyResult | null {
  if (
    updatedUnit.heroId !== HERO_LECHY_ID ||
    !updatedUnit.lechyGuideTravelerTargetId
  ) {
    return null;
  }

  const guideResult = requestLechyGuideTravelerPlacement(
    state,
    updatedUnit.id,
    updatedUnit.lechyGuideTravelerTargetId
  );
  if (guideResult.state === state && guideResult.events.length === 0) {
    return null;
  }
  return {
    state: guideResult.state,
    events: [...events, ...guideResult.events],
  };
}
