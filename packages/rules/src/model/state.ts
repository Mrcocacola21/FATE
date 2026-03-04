import type { AbilityView, Coord, PlayerId } from "./shared";
import type { GameEvent } from "./events";
import type {
  ForestMarker,
  PendingAoEResolution,
  PendingCombatQueueEntry,
  PendingRoll,
  StakeMarker,
} from "./roll";
import type { PendingMove } from "./shared";
import type { UnitState } from "./unit";

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export interface GameState {
  boardSize: number;
  phase: "lobby" | "placement" | "battle" | "ended";
  hostPlayerId: PlayerId | null;
  playersReady: { P1: boolean; P2: boolean };
  seats: { P1: boolean; P2: boolean };
  currentPlayer: PlayerId;
  turnNumber: number;
  roundNumber: number;
  activeUnitId: string | null;
  pendingMove: PendingMove | null;
  pendingRoll: PendingRoll | null;
  pendingCombatQueue: PendingCombatQueueEntry[];
  pendingAoE: PendingAoEResolution | null;
  rollCounter: number;
  stakeMarkers: StakeMarker[];
  stakeCounter: number;
  forestMarkers: ForestMarker[];
  forestMarker: ForestMarker | null;
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
  placementFirstPlayer: PlayerId | null;
  arenaId: string | null;
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
  | "rollCounter"
  | "pendingCombatQueue"
  | "pendingAoE"
  | "stakeMarkers"
  | "stakeCounter"
> & {
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };
  lastKnownPositions: { [unitId: string]: Coord };
  pendingRoll: PendingRoll | null;
  pendingCombatQueueCount: number;
  pendingAoEPreview: AoEPreview | null;
  stakeMarkers: { position: Coord; isRevealed: boolean }[];
  abilitiesByUnitId: Record<string, AbilityView[]>;
  legal?: LegalView;
  legalIntents?: LegalIntents;
};
