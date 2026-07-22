import type { Coord, MoveMode, PlayerId, StealthRevealReason } from "../model";

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
  preserveAttackerStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  suppressGutsBerserkBonus?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  blindOnHit?: boolean;
  sourceAbilityId?: string;
  controllerPlayerId?: PlayerId;
  lokiStatusOnHit?: "chicken";
  lokiStatusSourceId?: string;
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
  pureBloodRedirected?: boolean;
  pureBloodRedirectTargetId?: string;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
  elCidDuelist?: {
    attackerId: string;
    targetId: string;
  };
  jebeKhansShooter?: {
    casterId: string;
    remainingAttacks: number;
    totalAttacks?: number;
    selectedTargetIds?: string[];
    ricochetRoll?: number;
  };
}

export interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  allowFriendlyTarget?: boolean;
  ignoreStealth?: boolean;
  preserveAttackerStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  attackerDice?: number[];
  damageOverride?: number;
  ignoreBonuses?: boolean;
  suppressGutsBerserkBonus?: boolean;
  immobilizeOnHit?: boolean;
  immobilizeSourceId?: string;
  lokiStatusOnHit?: "entangled" | "chicken";
  lokiStatusSourceId?: string;
  lokiStatusAppliedTargetIds?: string[];
}

export interface PapyrusBoneChoiceContext extends Record<string, unknown> {
  papyrusUnitId: string;
  targetUnitId: string;
  targetIds: string[];
  currentTargetIndex: number;
  targetIndex: number;
  targetCount: number;
  availableBones: Array<"blue" | "orange">;
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
  selectedTargetIds?: string[];
}

export interface JebeKhansShooterTargetChoiceContext
  extends Record<string, unknown> {
  casterId: string;
  remainingAttacks: number;
  options: string[];
  lastTargetId?: string;
  selectedTargetIds?: string[];
  totalAttacks?: number;
  ricochetRoll?: number;
  stepIndex?: number;
  totalSteps?: number;
}

export interface HassanTrueEnemyTargetChoiceContext
  extends Record<string, unknown> {
  hassanId: string;
  forcedAttackerId: string;
  options: string[];
}

export interface MongolChargeAllyAttackTargetContext
  extends Record<string, unknown> {
  sourceUnitId: string;
  controllerUnitId: string;
  legalTargetIds: string[];
  /** Standard pending-target alias used by projections and board targeting. */
  options: string[];
  remainingAllyIds: string[];
  queuedAttacks: import("../model").PendingCombatQueueEntry[];
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

export type AsgoreSoulParadeSoulId =
  | "patience"
  | "bravery"
  | "integrity"
  | "perseverance"
  | "kindness"
  | "justice";

export interface AsgoreSoulParadeResultContext
  extends Record<string, unknown> {
  roll: number;
  soulId: AsgoreSoulParadeSoulId;
  soulName: string;
  effectDescription: string;
}

export interface AsgoreSoulParadeTargetChoiceContext
  extends Record<string, unknown> {
  asgoreId: string;
  options: string[];
  soulResult?: AsgoreSoulParadeResultContext;
}

export interface AsgoreSoulParadeIntegrityDestinationContext
  extends Record<string, unknown> {
  asgoreId: string;
  options: Coord[];
  soulResult?: AsgoreSoulParadeResultContext;
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

export interface LokiSpinAbilityChoiceContext extends Record<string, unknown> {
  lokiId: string;
  selectedUnitId: string;
  options: string[];
}

export interface GutsBerserkAttackChoiceContext
  extends Record<string, unknown> {
  gutsId: string;
  targetId: string;
  singleTargetOptions: string[];
  aoeTargetIds: string[];
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

export interface FriskPrecisionStrikeTargetChoiceContext
  extends Record<string, unknown> {
  friskId: string;
  options: string[];
}

export interface RiverBoatCarryChoiceContext extends Record<string, unknown> {
  riverId: string;
  mode?: MoveMode;
  options: string[];
}

export interface RiverBoatDestinationChoiceContext
  extends Record<string, unknown> {
  riverId: string;
  allyId?: string;
  options: Coord[];
}

export interface RiverBoatDropDestinationContext
  extends Record<string, unknown> {
  riverId: string;
  allyId: string;
  riverDestination?: Coord;
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

export interface RiverTraLaLaDropDestinationChoiceContext
  extends Record<string, unknown> {
  riverId: string;
  targetId: string;
  riverDestination: Coord;
  options: Coord[];
}

export interface LechyStormStartTurnRollContext extends Record<string, unknown> {
  unitId: string;
}
