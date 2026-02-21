// packages/rules/src/view.ts

import {
  AbilityView,
  Coord,
  ForestMarker,
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
import { getAbilityViewsForUnit } from "./abilities";
import { HERO_CHIKATILO_ID, HERO_ODIN_ID } from "./heroes";
import { getForestMarkers } from "./forest";

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function isStealthedEnemyVisibleToPlayer(
  state: GameState,
  playerId: PlayerId,
  enemy: UnitState
): boolean {
  if (!enemy.isAlive || !enemy.position || !enemy.isStealthed) return false;
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.owner !== playerId) continue;
    if (unit.heroId !== HERO_ODIN_ID) continue;
    if (chebyshevDistance(unit.position, enemy.position) <= 1) {
      return true;
    }
  }
  return false;
}

function cloneForestMarkers(state: GameState): ForestMarker[] {
  return getForestMarkers(state).map((marker) => ({
    owner: marker.owner,
    position: { ...marker.position },
  }));
}

function cloneUnit(unit: UnitState): UnitState {
  const turn = unit.turn ?? makeEmptyTurnEconomy();
  return {
    ...unit,
    position: unit.position ? { ...unit.position } : null,
    bunker: unit.bunker ? { ...unit.bunker } : undefined,
    movementDisabledNextTurn: unit.movementDisabledNextTurn,
    ownTurnsStarted: unit.ownTurnsStarted,
    charges: { ...unit.charges },
    cooldowns: { ...unit.cooldowns },
    turn: { ...turn },
    genghisKhanDiagonalMoveActive: unit.genghisKhanDiagonalMoveActive,
    genghisKhanDecreeMovePending: unit.genghisKhanDecreeMovePending,
    genghisKhanMongolChargeActive: unit.genghisKhanMongolChargeActive,
    genghisKhanAttackedThisTurn: unit.genghisKhanAttackedThisTurn
      ? [...unit.genghisKhanAttackedThisTurn]
      : unit.genghisKhanAttackedThisTurn,
    genghisKhanAttackedLastTurn: unit.genghisKhanAttackedLastTurn
      ? [...unit.genghisKhanAttackedLastTurn]
      : unit.genghisKhanAttackedLastTurn,
    papyrusUnbelieverActive: unit.papyrusUnbelieverActive,
    papyrusBoneMode: unit.papyrusBoneMode,
    papyrusLongBoneMode: unit.papyrusLongBoneMode,
    papyrusLineAxis: unit.papyrusLineAxis,
    papyrusBoneStatus: unit.papyrusBoneStatus
      ? { ...unit.papyrusBoneStatus }
      : unit.papyrusBoneStatus,
    sansUnbelieverUnlocked: unit.sansUnbelieverUnlocked,
    sansMoveLockArmed: unit.sansMoveLockArmed,
    sansMoveLockSourceId: unit.sansMoveLockSourceId,
    sansBoneFieldStatus: unit.sansBoneFieldStatus
      ? { ...unit.sansBoneFieldStatus }
      : unit.sansBoneFieldStatus,
    sansLastAttackCurseSourceId: unit.sansLastAttackCurseSourceId,
    mettatonRating: unit.mettatonRating,
    mettatonExUnlocked: unit.mettatonExUnlocked,
    mettatonNeoUnlocked: unit.mettatonNeoUnlocked,
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

  const visiblePendingRoll =
    pendingRoll && pendingRoll.player === playerId ? pendingRoll : null;
  const pendingAoEPreview =
    pendingAoE && pendingAoE.abilityId
      ? {
          casterId: pendingAoE.casterId,
          abilityId: pendingAoE.abilityId,
          center: { ...pendingAoE.center },
          radius: pendingAoE.radius,
        }
      : null;
  const stakeMarkersMap = new Map<string, { position: Coord; isRevealed: boolean }>();
  for (const marker of state.stakeMarkers) {
    const visible = marker.owner === playerId || marker.isRevealed;
    if (!visible) continue;
    const key = `${marker.position.col},${marker.position.row}`;
    const existing = stakeMarkersMap.get(key);
    stakeMarkersMap.set(key, {
      position: { ...marker.position },
      isRevealed: (existing?.isRevealed ?? false) || marker.isRevealed,
    });
  }
  const stakeMarkers = Array.from(stakeMarkersMap.values());
  const forestMarkers = cloneForestMarkers(state);

  const basePendingCount = pendingCombatQueue?.length ?? 0;
  let pendingCombatQueueCount = basePendingCount;
  if (
    pendingCombatQueueCount === 0 &&
    pendingRoll &&
    (pendingRoll.kind === "tricksterAoE_attackerRoll" ||
      pendingRoll.kind === "tricksterAoE_defenderRoll" ||
      pendingRoll.kind === "falseTrailExplosion_attackerRoll" ||
      pendingRoll.kind === "falseTrailExplosion_defenderRoll" ||
      pendingRoll.kind === "elCidTisona_attackerRoll" ||
      pendingRoll.kind === "elCidTisona_defenderRoll" ||
      pendingRoll.kind === "elCidKolada_attackerRoll" ||
      pendingRoll.kind === "elCidKolada_defenderRoll" ||
      pendingRoll.kind === "dora_attackerRoll" ||
      pendingRoll.kind === "dora_defenderRoll" ||
      pendingRoll.kind === "dora_berserkerDefenseChoice" ||
      pendingRoll.kind === "vladForest_attackerRoll" ||
      pendingRoll.kind === "vladForest_defenderRoll" ||
      pendingRoll.kind === "vladForest_berserkerDefenseChoice" ||
      pendingRoll.kind === "kaiserCarpetStrikeAttack" ||
      pendingRoll.kind === "carpetStrike_defenderRoll" ||
      pendingRoll.kind === "carpetStrike_berserkerDefenseChoice")
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
      pendingRoll.kind === "tricksterAoE_defenderRoll" ||
      pendingRoll.kind === "falseTrailExplosion_attackerRoll" ||
      pendingRoll.kind === "falseTrailExplosion_defenderRoll" ||
      pendingRoll.kind === "elCidTisona_attackerRoll" ||
      pendingRoll.kind === "elCidTisona_defenderRoll" ||
      pendingRoll.kind === "elCidKolada_attackerRoll" ||
      pendingRoll.kind === "elCidKolada_defenderRoll" ||
      pendingRoll.kind === "dora_attackerRoll" ||
      pendingRoll.kind === "dora_defenderRoll" ||
      pendingRoll.kind === "dora_berserkerDefenseChoice" ||
      pendingRoll.kind === "vladForest_attackerRoll" ||
      pendingRoll.kind === "vladForest_defenderRoll" ||
      pendingRoll.kind === "vladForest_berserkerDefenseChoice" ||
      pendingRoll.kind === "kaiserCarpetStrikeAttack" ||
      pendingRoll.kind === "carpetStrike_defenderRoll" ||
      pendingRoll.kind === "carpetStrike_berserkerDefenseChoice")
  ) {
    const ctx = pendingRoll.context as {
      targetsQueue?: string[];
      currentTargetIndex?: number;
    };
    const total = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue.length : 0;
    const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
    pendingCombatQueueCount = Math.max(0, total - idx);
  }

  const stakeMarkersMap = new Map<string, { position: Coord; isRevealed: boolean }>();
  for (const marker of state.stakeMarkers) {
    if (!marker.isRevealed) continue;
    const key = `${marker.position.col},${marker.position.row}`;
    const existing = stakeMarkersMap.get(key);
    stakeMarkersMap.set(key, {
      position: { ...marker.position },
      isRevealed: (existing?.isRevealed ?? false) || marker.isRevealed,
    });
  }
  const stakeMarkers = Array.from(stakeMarkersMap.values());
  const forestMarkers = cloneForestMarkers(state);

  return {
    ...baseState,
    units,
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    forestMarkers,
    forestMarker: forestMarkers[0] ?? null,
    pendingRoll: null,
    pendingCombatQueueCount,
    pendingAoEPreview:
      pendingAoE && pendingAoE.abilityId
        ? {
            casterId: pendingAoE.casterId,
            abilityId: pendingAoE.abilityId,
            center: { ...pendingAoE.center },
            radius: pendingAoE.radius,
          }
        : null,
    stakeMarkers,
    pendingMove: null,
    turnOrder: [...state.turnOrder],
    placementOrder: [...state.placementOrder],
    turnQueue: [...state.turnQueue],
    initiative: { ...state.initiative },
    unitsPlaced: { ...state.unitsPlaced },
    events: [],
    abilitiesByUnitId: {},
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
