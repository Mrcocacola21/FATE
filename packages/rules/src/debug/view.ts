import { getAbilityViewsForUnit } from "../abilities";
import { getLegalAttackTargets, getLegalPlacements } from "../legal";
import { getLegalMovesForUnit } from "../movement";
import type { AbilityView, Coord, GameState, PlayerView, UnitState } from "../model";
import { makePlayerView } from "../view";
import { cloneForestMarkers, cloneUnit } from "../view/helpers";

export function makeTestRoomView(state: GameState): PlayerView {
  const base = makePlayerView(state, state.currentPlayer);
  const units: Record<string, UnitState> = {};
  const abilitiesByUnitId: Record<string, AbilityView[]> = {};
  const placementsByUnitId: Record<string, Coord[]> = {};
  const movesByUnitId: Record<string, Coord[]> = {};
  const attackTargetsByUnitId: Record<string, string[]> = {};

  for (const unit of Object.values(state.units)) {
    units[unit.id] = cloneUnit(unit);
    abilitiesByUnitId[unit.id] = getAbilityViewsForUnit(state, unit.id);
    placementsByUnitId[unit.id] = getLegalPlacements(state, unit.id);
    movesByUnitId[unit.id] = getLegalMovesForUnit(state, unit.id);
    attackTargetsByUnitId[unit.id] = getLegalAttackTargets(state, unit.id);
  }

  return {
    ...base,
    units,
    pendingRoll: state.pendingRoll ? { ...state.pendingRoll, context: { ...state.pendingRoll.context } } : null,
    pendingMove: state.pendingMove
      ? { ...state.pendingMove, legalTo: state.pendingMove.legalTo.map((coord) => ({ ...coord })) }
      : null,
    pendingCombatQueueCount: state.pendingCombatQueue.length,
    stakeMarkers: state.stakeMarkers.map((marker) => ({
      position: { ...marker.position },
      isRevealed: marker.isRevealed,
    })),
    forestMarkers: cloneForestMarkers(state),
    forestMarker: state.forestMarker ? { ...state.forestMarker, position: { ...state.forestMarker.position } } : null,
    abilitiesByUnitId,
    legal: {
      placementsByUnitId,
      movesByUnitId,
      attackTargetsByUnitId,
    },
  };
}
