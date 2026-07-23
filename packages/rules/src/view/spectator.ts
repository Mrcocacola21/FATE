import { GameState, PlayerView, UnitState } from "../model";
import {
  clonePublicUnit,
  cloneArenaEffectsForRecipient,
  cloneForestMarkers,
  collectSpectatorStakeMarkers,
} from "./helpers";
import { buildPendingAoEPreview, getPendingCombatQueueCount } from "./pending";
import { projectRuleDeclarationState } from "./ruleDeclarations";

export function makeSpectatorView(state: GameState): PlayerView {
  const {
    pendingRoll,
    combatResolutionChain: _combatResolutionChain,
    rollCounter,
    pendingCombatQueue,
    pendingAoE,
    pendingPapyrusBoneChoices: _pendingPapyrusBoneChoices,
    ...baseState
  } = state;
  const units: Record<string, UnitState> = {};

  for (const unit of Object.values(state.units)) {
    if (!unit) continue;
    if (state.phase !== "ended" && unit.isAlive && unit.isStealthed) {
      continue;
    }
    units[unit.id] = clonePublicUnit(unit);
  }

  const pendingCombatQueueCount = getPendingCombatQueueCount(
    pendingCombatQueue,
    pendingRoll
  );
  const stakeMarkers = collectSpectatorStakeMarkers(state);
  const forestMarkers = cloneForestMarkers(state);
  const arenaEffects = cloneArenaEffectsForRecipient(state, "spectator");

  return {
    ...baseState,
    jackTraps: (state.jackTraps ?? [])
      .filter((trap) => trap.isRevealed === true)
      .map((trap) => ({
        id: trap.id,
        position: { ...trap.position },
        isRevealed: true,
      })),
    units,
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    forestMarkers,
    forestMarker: forestMarkers[0] ?? null,
    arenaEffects,
    pendingRoll: null,
    pendingCombatQueueCount,
    pendingAoEPreview: buildPendingAoEPreview(pendingAoE),
    stakeMarkers,
    pendingMove: null,
    ruleDeclaration: projectRuleDeclarationState(state.ruleDeclaration, "spectator"),
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
      movementActionsRemaining: 0,
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
