import {
  Coord,
  ForestMarker,
  GameState,
  PlayerId,
  UnitState,
  makeEmptyTurnEconomy,
} from "../model";
import { HERO_ODIN_ID } from "../heroes";
import { getForestMarkers } from "../forest";
import { VisibleStakeMarker } from "./types";

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function isStealthedEnemyVisibleToPlayer(
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

export function cloneForestMarkers(state: GameState): ForestMarker[] {
  return getForestMarkers(state).map((marker) => ({
    owner: marker.owner,
    position: { ...marker.position },
  }));
}

export function cloneUnit(unit: UnitState): UnitState {
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
    undyneImmortalUsed: unit.undyneImmortalUsed,
    undyneImmortalActive: unit.undyneImmortalActive,
  };
}

export function maskStealthedEnemy(unit: UnitState): UnitState {
  const masked = cloneUnit(unit);
  masked.charges = {};
  masked.cooldowns = {};
  masked.stealthTurnsLeft = 0;
  masked.lastChargedTurn = undefined;
  return masked;
}

function collectVisibleStakeMarkers(
  state: GameState,
  isVisible: (marker: GameState["stakeMarkers"][number]) => boolean
): VisibleStakeMarker[] {
  const stakeMarkersMap = new Map<string, VisibleStakeMarker>();
  for (const marker of state.stakeMarkers) {
    if (!isVisible(marker)) continue;
    const key = `${marker.position.col},${marker.position.row}`;
    const existing = stakeMarkersMap.get(key);
    stakeMarkersMap.set(key, {
      position: { ...marker.position },
      isRevealed: (existing?.isRevealed ?? false) || marker.isRevealed,
    });
  }
  return Array.from(stakeMarkersMap.values());
}

export function collectPlayerStakeMarkers(
  state: GameState,
  playerId: PlayerId
): VisibleStakeMarker[] {
  return collectVisibleStakeMarkers(
    state,
    (marker) => marker.owner === playerId || marker.isRevealed
  );
}

export function collectSpectatorStakeMarkers(state: GameState): VisibleStakeMarker[] {
  return collectVisibleStakeMarkers(state, (marker) => marker.isRevealed);
}
