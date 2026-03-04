import { AbilityView, Coord, GameState, PlayerId, PlayerView, UnitState } from "../model";
import { getLegalMovesForUnit } from "../movement";
import { getLegalAttackTargets, getLegalIntents, getLegalPlacements } from "../legal";
import { getAbilityViewsForUnit } from "../abilities";
import { HERO_CHIKATILO_ID } from "../heroes";
import {
  cloneForestMarkers,
  cloneUnit,
  collectPlayerStakeMarkers,
  isStealthedEnemyVisibleToPlayer,
  maskStealthedEnemy,
} from "./helpers";
import {
  buildPendingAoEPreview,
  getPendingCombatQueueCount,
  getVisiblePendingRollForPlayer,
} from "./pending";

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
  const abilitiesByUnitId: Record<string, AbilityView[]> = {};

  const activeUnit =
    state.activeUnitId && state.units[state.activeUnitId]
      ? state.units[state.activeUnitId]
      : null;
  const activeChikatilo =
    activeUnit &&
    activeUnit.owner === playerId &&
    activeUnit.heroId === HERO_CHIKATILO_ID
      ? activeUnit
      : null;
  const markedTargets = new Set(activeChikatilo?.chikatiloMarkedTargets ?? []);

  for (const unit of Object.values(state.units)) {
    if (unit.owner === playerId) {
      units[unit.id] = cloneUnit(unit);
      abilitiesByUnitId[unit.id] = getAbilityViewsForUnit(state, unit.id);
      continue;
    }

    if (!unit.isAlive) {
      units[unit.id] = cloneUnit(unit);
      continue;
    }

    if (unit.isStealthed) {
      if (activeChikatilo && markedTargets.has(unit.id)) {
        units[unit.id] = maskStealthedEnemy(unit);
        continue;
      }
      if (isStealthedEnemyVisibleToPlayer(state, playerId, unit)) {
        units[unit.id] = maskStealthedEnemy(unit);
        continue;
      }
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

  const visiblePendingRoll = getVisiblePendingRollForPlayer(pendingRoll, playerId);
  const pendingAoEPreview = buildPendingAoEPreview(pendingAoE);
  const stakeMarkers = collectPlayerStakeMarkers(state, playerId);
  const forestMarkers = cloneForestMarkers(state);
  const pendingCombatQueueCount = getPendingCombatQueueCount(
    pendingCombatQueue,
    pendingRoll
  );

  return {
    ...baseState,
    units,
    knowledge,
    lastKnownPositions,
    forestMarkers,
    forestMarker: forestMarkers[0] ?? null,
    pendingRoll: visiblePendingRoll,
    pendingCombatQueueCount,
    pendingAoEPreview,
    stakeMarkers,
    pendingMove,
    turnOrder: [...state.turnOrder],
    placementOrder: [...state.placementOrder],
    turnQueue: [...state.turnQueue],
    initiative: { ...state.initiative },
    unitsPlaced: { ...state.unitsPlaced },
    events: [],
    abilitiesByUnitId,
    legal: {
      placementsByUnitId,
      movesByUnitId,
      attackTargetsByUnitId,
    },
    legalIntents: getLegalIntents(state, playerId),
  };
}
