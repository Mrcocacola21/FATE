import { GameState, PlayerView, UnitState } from "../model";
import {
  cloneForestMarkers,
  cloneUnit,
  collectSpectatorStakeMarkers,
} from "./helpers";
import { buildPendingAoEPreview, getPendingCombatQueueCount } from "./pending";

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

  const pendingCombatQueueCount = getPendingCombatQueueCount(
    pendingCombatQueue,
    pendingRoll
  );
  const stakeMarkers = collectSpectatorStakeMarkers(state);
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
    pendingAoEPreview: buildPendingAoEPreview(pendingAoE),
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
