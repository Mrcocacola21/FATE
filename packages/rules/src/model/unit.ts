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

export type CourtActionType = "move" | "main" | "stealth";

export interface CourtRoundStatus {
  expiresAtRoundEnd: number;
}

export interface CourtExtraFlexibleActionStatus extends CourtRoundStatus {
  used: boolean;
}

export interface CourtGlobalMoveStatus extends CourtRoundStatus {
  used: boolean;
}

export interface CourtProceduralRestrictionStatus extends CourtRoundStatus {
  spentType?: CourtActionType;
}

export interface CourtAttackDamageStatus extends CourtRoundStatus {
  used: boolean;
}

export interface CourtStasisStatus extends CourtRoundStatus {
  returnPosition: Coord;
}

export interface StealthDurationState {
  /** Number of this figure's own turn starts completed while it remained hidden. */
  ownTurnStartsWhileHidden: number;
  /** Normal stealth remains active through this many own turn starts. */
  maxOwnTurnStartsHidden: number;
  /**
   * Own-turn ordinal already processed for duration. This makes turn-start
   * continuation after a pending choice idempotent.
   */
  lastProcessedOwnTurnStart?: number;
  /** False Trail is explicitly exempt from the normal duration limit. */
  kind: "normal" | "falseTrail";
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
  /** Authoritative per-figure duration metadata. Optional for legacy saves. */
  stealthDuration?: StealthDurationState;
  /** Legacy compatibility field, derived from stealthDuration for normal stealth. */
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
  chikatiloTrackedTargets?: string[];
  chikatiloMarkStatus?: {
    sourceUnitId: string;
    exactTrackingActive: boolean;
    trackingStarts: "startOfChikatiloTurn";
    trackingExpires: "afterMarkedUnitTurn";
  };
  chikatiloFalseTrailTokenId?: string;
  lechyGuideTravelerTargetId?: string;
  stormStartTurnResolvedTurnNumber?: number;
  lastChargedTurn?: number;

  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasActedThisTurn: boolean;

  /** Orange Bone resolves once, against the first meaningful turn resource use. */
  orangeBoneFirstMoveSatisfied?: boolean;
  orangeBonePenaltyAppliedThisTurn?: boolean;
  hasSpentMeaningfulTurnAction?: boolean;

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
  riverBoatmanExtraMoves?: number;
  papyrusUnbelieverActive?: boolean;
  papyrusLongBoneMode?: boolean;
  papyrusLineAxis?: PapyrusLineAxis;
  papyrusBoneStatus?: PapyrusBoneStatus;
  sansUnbelieverUnlocked?: boolean;
  sansBoneFieldActivated?: boolean;
  sansMoveLockArmed?: boolean;
  sansMoveLockSourceId?: string;
  sansBoneFieldStatus?: SansBoneFieldStatus;
  sansLastAttackCurseSourceId?: string;
  mettatonRating?: number;
  mettatonExUnlocked?: boolean;
  mettatonNeoUnlocked?: boolean;
  undyneImmortalUsed?: boolean;
  undyneImmortalActive?: boolean;

  duolingoHitTargetsThisTurn?: string[];
  duolingoHitTargetsLastTurn?: string[];
  duolingoBerserkerUnlocked?: boolean;
  duolingoAttackBatchHit?: boolean;
  blindUntilOwnTurnStart?: boolean;
  /** Own-turn ordinal after whose end Blind expires. */
  blindExpiresAfterOwnTurn?: number;
  kanekiCentipedeUnlocked?: boolean;
  donSorrowfulReactionAvailable?: boolean;
  donMadDelusionPending?: boolean;
  donMadDelusionOrigin?: Coord;
  jackTrapPlacedTurnNumber?: number;
  jackHolyMotherUsed?: boolean;
  jackKnownHpByTarget?: Record<string, number>;
  immobilizedUntilOwnTurnStart?: boolean;

  courtExtraFlexibleAction?: CourtExtraFlexibleActionStatus;
  courtGlobalMoveOnce?: CourtGlobalMoveStatus;
  courtProceduralRestriction?: CourtProceduralRestrictionStatus;
  courtDamageCompensation?: CourtAttackDamageStatus;
  courtCosts?: CourtAttackDamageStatus;
  courtStasis?: CourtStasisStatus;
  cannotStealthUntilRoundEnd?: number;

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
