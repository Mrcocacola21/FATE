import { AbilityView, Coord, GameState, PlayerId, PlayerView, UnitState } from "../model";
import { getLegalMovesForUnit } from "../movement";
import { getLegalAttackTargets, getLegalIntents, getLegalPlacements } from "../legal";
import { getAbilityViewsForUnit } from "../abilities";
import {
  cloneEnemyUnitForPlayer,
  cloneArenaEffectsForRecipient,
  cloneForestMarkers,
  clonePublicUnit,
  cloneUnit,
  collectPlayerStakeMarkers,
  isStealthedEnemyVisibleToPlayer,
} from "./helpers";
import {
  buildPendingAoEPreview,
  getPendingCombatQueueCount,
  getVisiblePendingRollForPlayer,
} from "./pending";
import { projectRuleDeclarationState } from "./ruleDeclarations";

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
    pendingPapyrusBoneChoices: _pendingPapyrusBoneChoices,
    ...baseState
  } = state;
  const units: Record<string, UnitState> = {};
  const lastKnownPositions: Record<string, Coord> = {};
  const abilitiesByUnitId: Record<string, AbilityView[]> = {};

  for (const unit of Object.values(state.units)) {
    if (state.phase === "ended") {
      units[unit.id] = clonePublicUnit(unit);
      continue;
    }
    if (unit.owner === playerId) {
      units[unit.id] = cloneUnit(unit);
      abilitiesByUnitId[unit.id] = getAbilityViewsForUnit(state, unit.id);
      continue;
    }

    if (!unit.isAlive) {
      units[unit.id] = cloneEnemyUnitForPlayer(state, playerId, unit);
      continue;
    }

    if (unit.isStealthed) {
      if (isStealthedEnemyVisibleToPlayer(state, playerId, unit)) {
        const projected = cloneEnemyUnitForPlayer(state, playerId, unit);
        projected.charges = {};
        projected.cooldowns = {};
        projected.stealthTurnsLeft = 0;
        projected.lastChargedTurn = undefined;
        units[unit.id] = projected;
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

    units[unit.id] = cloneEnemyUnitForPlayer(state, playerId, unit);
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

  const visiblePendingRoll = getVisiblePendingRollForPlayer(state, pendingRoll, playerId);
  const pendingAoEPreview = buildPendingAoEPreview(pendingAoE);
  const stakeMarkers = collectPlayerStakeMarkers(state, playerId);
  const forestMarkers = cloneForestMarkers(state);
  const arenaEffects = cloneArenaEffectsForRecipient(state, playerId);
  const pendingCombatQueueCount = getPendingCombatQueueCount(
    pendingCombatQueue,
    visiblePendingRoll
  );

  return {
    ...baseState,
    jackTraps: (state.jackTraps ?? [])
      .filter((trap) => trap.owner === playerId || trap.isRevealed === true)
      .map((trap) => ({
        id: trap.id,
        sourceUnitId: trap.owner === playerId ? trap.sourceUnitId : undefined,
        position: { ...trap.position },
        isRevealed: trap.isRevealed === true,
      })),
    units,
    knowledge,
    lastKnownPositions,
    forestMarkers,
    forestMarker: forestMarkers[0] ?? null,
    arenaEffects,
    pendingRoll: visiblePendingRoll,
    pendingCombatQueueCount,
    pendingAoEPreview,
    stakeMarkers,
    pendingMove,
    ruleDeclaration: projectRuleDeclarationState(state.ruleDeclaration, playerId),
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
