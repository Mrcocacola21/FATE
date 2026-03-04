import type { Coord, PlayerId, TurnEconomy, UnitClass } from "./shared";

export type PapyrusBoneType = "blue" | "orange";
export type PapyrusLineAxis = "row" | "col" | "diagMain" | "diagAnti";

export interface PapyrusBoneStatus {
  sourceUnitId: string;
  kind: PapyrusBoneType;
  expiresOnSourceOwnTurn: number;
  bluePunishedTurnNumber?: number;
}

export interface SansBoneFieldStatus {
  kind: PapyrusBoneType;
  turnNumber: number;
  bluePunishedTurnNumber?: number;
}

export interface UnitState {
  id: string;
  owner: PlayerId;
  class: UnitClass;
  figureId?: string;
  heroId?: string;
  hp: number;
  attack: number;
  position: Coord | null;

  isStealthed: boolean;
  stealthTurnsLeft: number;
  stealthSuccessMinRoll?: number;
  stealthAttemptedThisTurn: boolean;

  bunker?: { active: boolean; ownTurnsInBunker: number };
  transformed?: boolean;
  movementDisabledNextTurn?: boolean;
  ownTurnsStarted?: number;

  turn: TurnEconomy;

  charges: Record<string, number>;
  cooldowns: Record<string, number>;
  chikatiloMarkedTargets?: string[];
  chikatiloFalseTrailTokenId?: string;
  lechyGuideTravelerTargetId?: string;
  lastChargedTurn?: number;

  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasActedThisTurn: boolean;

  genghisKhanDiagonalMoveActive?: boolean;
  genghisKhanDecreeMovePending?: boolean;
  genghisKhanMongolChargeActive?: boolean;
  genghisKhanAttackedThisTurn?: string[];
  genghisKhanAttackedLastTurn?: string[];
  gutsBerserkModeActive?: boolean;
  gutsBerserkExitUsed?: boolean;
  kaladinMoveLockSources?: string[];
  lokiMoveLockSources?: string[];
  lokiChickenSources?: string[];
  friskPacifismDisabled?: boolean;
  friskCleanSoulShield?: boolean;
  friskDidAttackWhileStealthedSinceLastEnter?: boolean;
  friskPrecisionStrikeReady?: boolean;
  friskKillCount?: number;
  asgorePatienceStealthActive?: boolean;
  asgoreBraveryAutoDefenseReady?: boolean;
  riverBoatCarryAllyId?: string;
  riverBoatmanMovePending?: boolean;
  papyrusUnbelieverActive?: boolean;
  papyrusBoneMode?: PapyrusBoneType;
  papyrusLongBoneMode?: boolean;
  papyrusLineAxis?: PapyrusLineAxis;
  papyrusBoneStatus?: PapyrusBoneStatus;
  sansUnbelieverUnlocked?: boolean;
  sansMoveLockArmed?: boolean;
  sansMoveLockSourceId?: string;
  sansBoneFieldStatus?: SansBoneFieldStatus;
  sansLastAttackCurseSourceId?: string;
  mettatonRating?: number;
  mettatonExUnlocked?: boolean;
  mettatonNeoUnlocked?: boolean;
  undyneImmortalUsed?: boolean;
  undyneImmortalActive?: boolean;

  isAlive: boolean;
}

export function makeEmptyTurnEconomy(): TurnEconomy {
  return {
    moveUsed: false,
    attackUsed: false,
    actionUsed: false,
    stealthUsed: false,
  };
}
