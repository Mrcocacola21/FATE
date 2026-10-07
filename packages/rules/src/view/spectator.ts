import { GameState, PlayerView, UnitState } from "../model";
import {
  clonePublicUnit,
  cloneArenaEffectsForRecipient,
  cloneForestMarkers,
  collectSpectatorStakeMarkers,
} from "./helpers";
import { buildPendingAoEPreview, projectPendingDecision } from "./pending";
import { projectRuleDeclarationState } from "./ruleDeclarations";
import { projectRosterUnits } from "./roster";

export function makeSpectatorView(state: GameState): PlayerView {
  const {
    pendingRoll,
    pendingReactionMovement: _pendingReactionMovement,
    combatResolutionChain: _combatResolutionChain,
    rollCounter,
    abilityUseCounter: _abilityUseCounter,
    pendingCombatQueue,
    pendingAoE,
    pendingPapyrusBoneChoices: _pendingPapyrusBoneChoices,
    stakeCounter: _stakeCounter,
    jackTrapCounter: _jackTrapCounter,
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

  // Public waiting status conveys no private target/remaining-roll cardinality.
  const pendingCombatQueueCount = 0;
  const stakeMarkers = collectSpectatorStakeMarkers(state);
  const forestMarkers = cloneForestMarkers(state);
  const arenaEffects = cloneArenaEffectsForRecipient(state, "spectator");

  return {
    ...baseState,
    jackTraps: [],
    units,
    rosterUnits: projectRosterUnits(units, "spectator"),
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    forestMarkers,
    forestMarker: forestMarkers[0] ?? null,
    arenaEffects,
    pendingRoll: null,
    pendingDecision: projectPendingDecision(state, "spectator"),
    pendingCombatQueueCount,
    pendingAoEPreview: buildPendingAoEPreview(state, "spectator"),
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
