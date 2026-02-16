import type { Coord, MoveMode, StealthRevealReason } from "../model";

export interface CarpetStrikeAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface AttackRollContext extends Record<string, unknown> {
  attackerId: string;
  defenderId: string;
  allowFriendlyTarget?: boolean;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  attackerDice?: number[];
  defenderDice?: number[];
  tieBreakAttacker?: number[];
  tieBreakDefender?: number[];
  stage?: "initial" | "tieBreak";
  berserkerChoiceMade?: boolean;
  odinMuninnChoiceMade?: boolean;
  asgoreBraveryChoiceMade?: boolean;
  chikatiloDecoyChoiceMade?: boolean;
  friskSubstitutionChoiceMade?: boolean;
  friskChildsCryChoiceMade?: boolean;
  friskForceMiss?: boolean;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
  elCidDuelist?: {
    attackerId: string;
    targetId: string;
  };
  jebeKhansShooter?: {
    casterId: string;
    remainingAttacks: number;
  };
}

export interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
  damageOverride?: number;
  ignoreBonuses?: boolean;
  immobilizeOnHit?: boolean;
  immobilizeSourceId?: string;
}

export interface DoraAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface ForestAoEContext extends Record<string, unknown> {
  casterId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface ElCidAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface JebeHailOfArrowsAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

export interface JebeKhansShooterRicochetContext
  extends Record<string, unknown> {
  casterId: string;
  initialTargetId: string;
}

export interface JebeKhansShooterTargetChoiceContext
  extends Record<string, unknown> {
  casterId: string;
  remainingAttacks: number;
  options: string[];
  lastTargetId?: string;
}

export interface HassanTrueEnemyTargetChoiceContext
  extends Record<string, unknown> {
  hassanId: string;
  forcedAttackerId: string;
  options: string[];
}

export interface HassanAssassinOrderSelectionContext
  extends Record<string, unknown> {
  owner: "P1" | "P2";
  hassanId: string;
  eligibleUnitIds: string[];
  queue?: ("P1" | "P2")[];
}

export interface AsgoreSoulParadeRollContext extends Record<string, unknown> {
  asgoreId: string;
}

export interface AsgoreSoulParadeTargetChoiceContext
  extends Record<string, unknown> {
  asgoreId: string;
  options: string[];
}

export interface AsgoreSoulParadeIntegrityDestinationContext
  extends Record<string, unknown> {
  asgoreId: string;
  options: Coord[];
}

export interface LokiLaughtChoiceContext extends Record<string, unknown> {
  lokiId: string;
  chickenOptions: string[];
  mindControlEnemyOptions: string[];
  spinCandidateIds: string[];
}

export interface LokiChickenTargetChoiceContext extends Record<string, unknown> {
  lokiId: string;
  options: string[];
}

export interface LokiMindControlEnemyChoiceContext
  extends Record<string, unknown> {
  lokiId: string;
  options: string[];
}

export interface LokiMindControlTargetChoiceContext
  extends Record<string, unknown> {
  lokiId: string;
  controlledUnitId: string;
  options: string[];
}

export interface FemtoDivineMoveRollContext extends Record<string, unknown> {
  unitId: string;
}

export interface FemtoDivineMoveDestinationContext
  extends Record<string, unknown> {
  unitId: string;
  roll: number;
  options: Coord[];
}

export interface FriskPacifismChoiceContext extends Record<string, unknown> {
  friskId: string;
  hugsOptions: string[];
  warmWordsOptions: string[];
  canPowerOfFriendship: boolean;
}

export interface FriskPacifismTargetChoiceContext
  extends Record<string, unknown> {
  friskId: string;
  options: string[];
}

export interface FriskWarmWordsHealRollContext extends Record<string, unknown> {
  friskId: string;
  targetId: string;
}

export interface FriskGenocideChoiceContext extends Record<string, unknown> {
  friskId: string;
}

export interface FriskKeenEyeChoiceContext extends Record<string, unknown> {
  friskId: string;
  options: string[];
}

export interface RiverBoatCarryChoiceContext extends Record<string, unknown> {
  riverId: string;
  mode?: MoveMode;
  options: string[];
}

export interface RiverBoatDropDestinationContext
  extends Record<string, unknown> {
  riverId: string;
  allyId: string;
  options: Coord[];
}

export interface RiverTraLaLaTargetChoiceContext
  extends Record<string, unknown> {
  riverId: string;
  options: string[];
}

export interface RiverTraLaLaDestinationChoiceContext
  extends Record<string, unknown> {
  riverId: string;
  targetId: string;
  options: Coord[];
}
