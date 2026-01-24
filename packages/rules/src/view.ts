// packages/rules/src/view.ts

import {
  Coord,
  GameState,
  PlayerId,
  PlayerView,
  UnitState,
  makeEmptyTurnEconomy,
} from "./model";
import { getLegalMovesForUnit } from "./movement";
import {
  getLegalPlacements,
  getLegalAttackTargets,
  getLegalIntents,
} from "./legal";

function cloneUnit(unit: UnitState): UnitState {
  const turn = unit.turn ?? makeEmptyTurnEconomy();
  return {
    ...unit,
    position: unit.position ? { ...unit.position } : null,
    charges: { ...unit.charges },
    cooldowns: { ...unit.cooldowns },
    turn: { ...turn },
  };
}

function maskStealthedEnemy(unit: UnitState): UnitState {
  const masked = cloneUnit(unit);
  masked.charges = {};
  masked.cooldowns = {};
  masked.stealthTurnsLeft = 0;
  masked.lastChargedTurn = undefined;
  return masked;
}

/**
 * Build a player-specific view of the game state.
 * - Friendly units are fully visible.
 * - Enemy stealthed units are hidden (no real position leaks).
 * - Last-known positions for hidden enemies are provided separately.
 */
export function makePlayerView(
  state: GameState,
  playerId: PlayerId
): PlayerView {
  const {
    pendingRoll,
    rollCounter,
    pendingCombatQueue,
    pendingAoE,
    ...baseState
  } = state;
  const units: Record<string, UnitState> = {};
  const lastKnownPositions: Record<string, Coord> = {};

  for (const unit of Object.values(state.units)) {
    if (unit.owner === playerId) {
      units[unit.id] = cloneUnit(unit);
      continue;
    }

    if (!unit.isAlive) {
      units[unit.id] = cloneUnit(unit);
      continue;
    }

    if (unit.isStealthed) {
      if (unit.owner !== playerId) {
        const lastKnown = state.lastKnownPositions?.[playerId]?.[unit.id];
        if (lastKnown) {
          lastKnownPositions[unit.id] = { ...lastKnown };
        }
      }
      continue;
    }

    units[unit.id] = cloneUnit(unit);
  }

  const knowledge = {
    P1: playerId === "P1" ? { ...(state.knowledge?.P1 ?? {}) } : {},
    P2: playerId === "P2" ? { ...(state.knowledge?.P2 ?? {}) } : {},
  };

  const placementsByUnitId: Record<string, Coord[]> = {};
  const movesByUnitId: Record<string, Coord[]> = {};
  const attackTargetsByUnitId: Record<string, string[]> = {};

  for (const unit of Object.values(state.units)) {
    if (!unit || !unit.isAlive) continue;
    if (unit.owner !== playerId) continue;
    placementsByUnitId[unit.id] = getLegalPlacements(state, unit.id);
    movesByUnitId[unit.id] = getLegalMovesForUnit(state, unit.id);
    attackTargetsByUnitId[unit.id] = getLegalAttackTargets(state, unit.id);
  }

  let pendingMove = state.pendingMove;
  if (pendingMove) {
    const pendingUnit = state.units[pendingMove.unitId];
    if (!pendingUnit || pendingUnit.owner !== playerId) {
      pendingMove = null;
    } else {
      pendingMove = {
        ...pendingMove,
        legalTo: pendingMove.legalTo.map((c) => ({ ...c })),
      };
    }
  }

  const visiblePendingRoll =
    pendingRoll && pendingRoll.player === playerId ? pendingRoll : null;

  const basePendingCount = pendingCombatQueue?.length ?? 0;
  let pendingCombatQueueCount = basePendingCount;
  if (
    pendingCombatQueueCount === 0 &&
    pendingRoll &&
    (pendingRoll.kind === "tricksterAoE_attackerRoll" ||
      pendingRoll.kind === "tricksterAoE_defenderRoll")
  ) {
    const ctx = pendingRoll.context as {
      targetsQueue?: string[];
      currentTargetIndex?: number;
    };
    const total = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue.length : 0;
    const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
    pendingCombatQueueCount = Math.max(0, total - idx);
  }

  return {
    ...baseState,
    units,
    knowledge,
    lastKnownPositions,
    pendingRoll: visiblePendingRoll,
    pendingCombatQueueCount,
    pendingMove,
    turnOrder: [...state.turnOrder],
    placementOrder: [...state.placementOrder],
    turnQueue: [...state.turnQueue],
    initiative: { ...state.initiative },
    unitsPlaced: { ...state.unitsPlaced },
    events: [],
    legal: {
      placementsByUnitId,
      movesByUnitId,
      attackTargetsByUnitId,
    },
    legalIntents: getLegalIntents(state, playerId),
  };
}

export function makeSpectatorView(state: GameState): PlayerView {
  const {
    pendingRoll,
    rollCounter,
    pendingCombatQueue,
    pendingAoE,
    ...baseState
  } = state;
  const units: Record<string, UnitState> = {};

  for (const unit of Object.values(state.units)) {
    if (!unit) continue;
    if (unit.isAlive && unit.isStealthed) {
      continue;
    }
    units[unit.id] = cloneUnit(unit);
  }

  const basePendingCount = pendingCombatQueue?.length ?? 0;
  let pendingCombatQueueCount = basePendingCount;
  if (
    pendingCombatQueueCount === 0 &&
    pendingRoll &&
    (pendingRoll.kind === "tricksterAoE_attackerRoll" ||
      pendingRoll.kind === "tricksterAoE_defenderRoll")
  ) {
    const ctx = pendingRoll.context as {
      targetsQueue?: string[];
      currentTargetIndex?: number;
    };
    const total = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue.length : 0;
    const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
    pendingCombatQueueCount = Math.max(0, total - idx);
  }

  return {
    ...baseState,
    units,
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    pendingRoll: null,
    pendingCombatQueueCount,
    pendingMove: null,
    turnOrder: [...state.turnOrder],
    placementOrder: [...state.placementOrder],
    turnQueue: [...state.turnQueue],
    initiative: { ...state.initiative },
    unitsPlaced: { ...state.unitsPlaced },
    events: [],
    legal: {
      placementsByUnitId: {},
      movesByUnitId: {},
      attackTargetsByUnitId: {},
    },
    legalIntents: {
      canSearchMove: false,
      canSearchAction: false,
      searchMoveReason: "spectator",
      searchActionReason: "spectator",
      canMove: false,
      canAttack: false,
      canEnterStealth: false,
    },
  };
}
