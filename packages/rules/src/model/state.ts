import type { AbilityView, Coord, GameOverResult, PlayerId } from "./shared";
import type { GameEvent } from "./events";
import type { RuleDeclarationState } from "../ruleDeclarations/types";
import type {
  CombatResolutionChain,
  ForestMarker,
  PendingAoEResolution,
  PendingCombatQueueEntry,
  PendingPapyrusBoneChoice,
  PendingRoll,
  StakeMarker,
} from "./roll";
import type { PendingMove } from "./shared";
import type { UnitState } from "./unit";

export interface JackTrapMarker {
  id: string;
  sourceUnitId: string;
  owner: PlayerId;
  position: Coord;
  isRevealed: boolean;
  trappedUnitId?: string;
  triggeredTargetIds: string[];
}

export interface VisibleJackTrapMarker {
  id: string;
  sourceUnitId?: string;
  position: Coord;
  isRevealed: boolean;
}

export type ArenaEffectDurationUnit = "turn";

export interface ArenaEffectState {
  id: string;
  effectId: string;
  sourceUnitId?: string;
  sourceAbilityId?: string;
  remaining: number;
  durationUnit: ArenaEffectDurationUnit;
  startedTurnNumber: number;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  rejectionReason?: string;
}

export interface GameState {
  boardSize: number;
  phase: "lobby" | "placement" | "battle" | "ended";
  gameOver: GameOverResult | null;
  hostPlayerId: PlayerId | null;
  playersReady: { P1: boolean; P2: boolean };
  seats: { P1: boolean; P2: boolean };
  currentPlayer: PlayerId;
  turnNumber: number;
  roundNumber: number;
  activeUnitId: string | null;
  pendingMove: PendingMove | null;
  pendingRoll: PendingRoll | null;
  /** Internal authoritative visual boundary; omitted from projected player views. */
  combatResolutionChain?: CombatResolutionChain | null;
  pendingCombatQueue: PendingCombatQueueEntry[];
  pendingAoE: PendingAoEResolution | null;
  /** Successful transformed-Papyrus hits waiting for an authoritative choice. */
  pendingPapyrusBoneChoices?: PendingPapyrusBoneChoice[];
  rollCounter: number;
  stakeMarkers: StakeMarker[];
  stakeCounter: number;
  forestMarkers: ForestMarker[];
  forestMarker: ForestMarker | null;
  jackTraps?: JackTrapMarker[];
  jackTrapCounter?: number;
  turnOrder: string[];
  turnOrderIndex: number;
  placementOrder: string[];
  turnQueue: string[];
  turnQueueIndex: number;
  units: Record<string, UnitState>;
  events: GameEvent[];
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };
  lastKnownPositions: {
    [playerId in PlayerId]: { [unitId: string]: Coord };
  };
  initiative: {
    P1: number | null;
    P2: number | null;
    winner: PlayerId | null;
  };
  ruleDeclaration: RuleDeclarationState;
  placementFirstPlayer: PlayerId | null;
  arenaId: string | null;
  arenaEffects?: ArenaEffectState[];
  boneFieldTurnsLeft?: number;
  startingUnitId: string | null;
  unitsPlaced: {
    P1: number;
    P2: number;
  };
}

export interface LegalView {
  placementsByUnitId: Record<string, Coord[]>;
  movesByUnitId: Record<string, Coord[]>;
  attackTargetsByUnitId: Record<string, string[]>;
}

export interface LegalIntents {
  movementActionsRemaining: number;
  canSearchMove: boolean;
  canSearchAction: boolean;
  searchMoveReason?: string;
  searchActionReason?: string;
  canMove: boolean;
  canAttack: boolean;
  canEnterStealth: boolean;
}

export interface AoEPreview {
  casterId: string;
  abilityId: string;
  center: Coord;
  radius: number;
}

export type PlayerView = Omit<
  GameState,
  | "knowledge"
  | "lastKnownPositions"
  | "pendingRoll"
  | "combatResolutionChain"
  | "rollCounter"
  | "pendingCombatQueue"
  | "pendingAoE"
  | "pendingPapyrusBoneChoices"
  | "stakeMarkers"
  | "stakeCounter"
  | "jackTraps"
  | "jackTrapCounter"
> & {
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };
  lastKnownPositions: { [unitId: string]: Coord };
  pendingRoll: PendingRoll | null;
  pendingCombatQueueCount: number;
  pendingAoEPreview: AoEPreview | null;
  stakeMarkers: { position: Coord; isRevealed: boolean }[];
  jackTraps: VisibleJackTrapMarker[];
  abilitiesByUnitId: Record<string, AbilityView[]>;
  legal?: LegalView;
  legalIntents?: LegalIntents;
};
