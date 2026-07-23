import type { Coord, PlayerId } from "./shared";

export interface DiceRoll {
  dice: number[];
  sum: number;
  isDouble: boolean;
}

export type StealthRevealReason =
  | "search"
  | "timerExpired"
  | "aoeHit"
  | "forcedDisplacement"
  | "adjacency"
  | "attacked"
  | "steppedOnHidden"
  | "stakeTriggered";

export type RollKind =
  | "enterStealth"
  | "enterBunker"
  | "searchStealth"
  | "moveTrickster"
  | "moveBerserker"
  | "initiativeRoll"
  | "ruleDeclarationChoice"
  | "ruleDeclarationChessKingChoice"
  | "ruleDeclarationAdvantageThreshold"
  | "courtAttackerRoll"
  | "courtDefenderRoll"
  | "courtEffectUnitChoice"
  | "courtEffectChargeChoice"
  | "courtForcedAppearanceDestination"
  | "moonRoundRoll"
  | "moonCoordinateRoll"
  | "moonCheeseHolesChoice"
  | "pureBloodRedirectChoice"
  | "papyrusBoneChoice"
  | "attack_attackerRoll"
  | "attack_defenderRoll"
  | "berserkerDefenseChoice"
  | "odinMuninnDefenseChoice"
  | "odinSleipnirDestination"
  | "chargedImpulseTargetChoice"
  | "mongolChargeAllyAttackTarget"
  | "riderPathAttack_attackerRoll"
  | "riderPathAttack_defenderRoll"
  | "tricksterAoE_attackerRoll"
  | "tricksterAoE_defenderRoll"
  | "tricksterAoE_berserkerDefenseChoice"
  | "elCidTisona_attackerRoll"
  | "elCidTisona_defenderRoll"
  | "elCidKolada_attackerRoll"
  | "elCidKolada_defenderRoll"
  | "dora_attackerRoll"
  | "dora_defenderRoll"
  | "dora_berserkerDefenseChoice"
  | "kaiserCarpetStrikeCenter"
  | "kaiserCarpetStrikeAttack"
  | "carpetStrike_defenderRoll"
  | "carpetStrike_berserkerDefenseChoice"
  | "elCidDuelistChoice"
  | "vladIntimidateChoice"
  | "vladPlaceStakes"
  | "vladForestChoice"
  | "vladForestTarget"
  | "vladForest_attackerRoll"
  | "vladForest_defenderRoll"
  | "vladForest_berserkerDefenseChoice"
  | "chikatiloFalseTrailPlacement"
  | "chikatiloDecoyChoice"
  | "falseTrailExplosion_attackerRoll"
  | "falseTrailExplosion_defenderRoll"
  | "chikatiloFalseTrailRevealChoice"
  | "groznyTyrantOptionChoice"
  | "groznyTyrantAllyChoice"
  | "groznyTyrantAttackCellChoice"
  | "lechyGuideTravelerPlacement"
  | "lechyStormStartTurnRoll"
  | "forestMoveCheck"
  | "forestMoveDestination"
  | "riverBoatCarryChoice"
  | "riverBoatDestinationChoice"
  | "riverBoatDropDestination"
  | "riverTraLaLaTargetChoice"
  | "riverTraLaLaDestinationChoice"
  | "riverTraLaLaDropDestinationChoice"
  | "jebeHailOfArrows_attackerRoll"
  | "jebeHailOfArrows_defenderRoll"
  | "jebeHailOfArrows_berserkerDefenseChoice"
  | "jebeKhansShooterRicochetRoll"
  | "jebeKhansShooterTargetChoice"
  | "hassanTrueEnemyTargetChoice"
  | "hassanAssassinOrderSelection"
  | "asgoreSoulParadeRoll"
  | "asgoreSoulParadePatienceTargetChoice"
  | "asgoreSoulParadePerseveranceTargetChoice"
  | "asgoreSoulParadeJusticeTargetChoice"
  | "asgoreSoulParadeIntegrityDestination"
  | "asgoreBraveryDefenseChoice"
  | "lokiLaughtChoice"
  | "lokiChickenTargetChoice"
  | "lokiMindControlEnemyChoice"
  | "lokiMindControlTargetChoice"
  | "lokiSpinAbilityChoice"
  | "gutsBerserkAttackChoice"
  | "femtoDivineMoveRoll"
  | "femtoDivineMoveDestination"
  | "friskPacifismChoice"
  | "friskPacifismHugsTargetChoice"
  | "friskWarmWordsTargetChoice"
  | "friskWarmWordsHealRoll"
  | "friskGenocideChoice"
  | "friskKeenEyeChoice"
  | "friskPrecisionStrikeTargetChoice"
  | "friskSubstitutionChoice"
  | "friskChildsCryChoice"
  | "donSorrowfulMoveChoice"
  | "donMadDelusionDirection"
  | "donWindmillsRepositionChoice";

export const ALL_ROLL_KINDS = [
  "enterStealth",
  "enterBunker",
  "searchStealth",
  "moveTrickster",
  "moveBerserker",
  "initiativeRoll",
  "ruleDeclarationChoice",
  "ruleDeclarationChessKingChoice",
  "ruleDeclarationAdvantageThreshold",
  "courtAttackerRoll",
  "courtDefenderRoll",
  "courtEffectUnitChoice",
  "courtEffectChargeChoice",
  "courtForcedAppearanceDestination",
  "moonRoundRoll",
  "moonCoordinateRoll",
  "moonCheeseHolesChoice",
  "pureBloodRedirectChoice",
  "papyrusBoneChoice",
  "attack_attackerRoll",
  "attack_defenderRoll",
  "berserkerDefenseChoice",
  "odinMuninnDefenseChoice",
  "odinSleipnirDestination",
  "chargedImpulseTargetChoice",
  "mongolChargeAllyAttackTarget",
  "riderPathAttack_attackerRoll",
  "riderPathAttack_defenderRoll",
  "tricksterAoE_attackerRoll",
  "tricksterAoE_defenderRoll",
  "tricksterAoE_berserkerDefenseChoice",
  "elCidTisona_attackerRoll",
  "elCidTisona_defenderRoll",
  "elCidKolada_attackerRoll",
  "elCidKolada_defenderRoll",
  "dora_attackerRoll",
  "dora_defenderRoll",
  "dora_berserkerDefenseChoice",
  "kaiserCarpetStrikeCenter",
  "kaiserCarpetStrikeAttack",
  "carpetStrike_defenderRoll",
  "carpetStrike_berserkerDefenseChoice",
  "elCidDuelistChoice",
  "vladIntimidateChoice",
  "vladPlaceStakes",
  "vladForestChoice",
  "vladForestTarget",
  "vladForest_attackerRoll",
  "vladForest_defenderRoll",
  "vladForest_berserkerDefenseChoice",
  "chikatiloFalseTrailPlacement",
  "chikatiloDecoyChoice",
  "falseTrailExplosion_attackerRoll",
  "falseTrailExplosion_defenderRoll",
  "chikatiloFalseTrailRevealChoice",
  "groznyTyrantOptionChoice",
  "groznyTyrantAllyChoice",
  "groznyTyrantAttackCellChoice",
  "lechyGuideTravelerPlacement",
  "lechyStormStartTurnRoll",
  "forestMoveCheck",
  "forestMoveDestination",
  "riverBoatCarryChoice",
  "riverBoatDestinationChoice",
  "riverBoatDropDestination",
  "riverTraLaLaTargetChoice",
  "riverTraLaLaDestinationChoice",
  "riverTraLaLaDropDestinationChoice",
  "jebeHailOfArrows_attackerRoll",
  "jebeHailOfArrows_defenderRoll",
  "jebeHailOfArrows_berserkerDefenseChoice",
  "jebeKhansShooterRicochetRoll",
  "jebeKhansShooterTargetChoice",
  "hassanTrueEnemyTargetChoice",
  "hassanAssassinOrderSelection",
  "asgoreSoulParadeRoll",
  "asgoreSoulParadePatienceTargetChoice",
  "asgoreSoulParadePerseveranceTargetChoice",
  "asgoreSoulParadeJusticeTargetChoice",
  "asgoreSoulParadeIntegrityDestination",
  "asgoreBraveryDefenseChoice",
  "lokiLaughtChoice",
  "lokiChickenTargetChoice",
  "lokiMindControlEnemyChoice",
  "lokiMindControlTargetChoice",
  "lokiSpinAbilityChoice",
  "gutsBerserkAttackChoice",
  "femtoDivineMoveRoll",
  "femtoDivineMoveDestination",
  "friskPacifismChoice",
  "friskPacifismHugsTargetChoice",
  "friskWarmWordsTargetChoice",
  "friskWarmWordsHealRoll",
  "friskGenocideChoice",
  "friskKeenEyeChoice",
  "friskPrecisionStrikeTargetChoice",
  "friskSubstitutionChoice",
  "friskChildsCryChoice",
  "donSorrowfulMoveChoice",
  "donMadDelusionDirection",
  "donWindmillsRepositionChoice",
] as const satisfies readonly RollKind[];

export type PendingRollPresentationKind =
  | "attack"
  | "defense"
  | "stealth"
  | "statusSave"
  | "trap"
  | "explosion"
  | "ability"
  | "phantasm"
  | "reaction"
  | "unknown";

/**
 * Player-facing, structured context for a pending task.
 *
 * Resolution data remains in `PendingRoll.context`; this object is descriptive
 * only and must never be used to decide a roll result.
 */
export interface PendingRollContext {
  title: string;
  reason: string;
  rollKind: PendingRollPresentationKind;

  actorUnitId?: string;
  actorName?: string;
  sourceUnitId?: string;
  sourceName?: string;
  targetUnitId?: string;
  targetName?: string;

  abilityId?: string;
  abilityName?: string;

  diceLabel: string;
  successRule?: string;
  successText?: string;
  failureText?: string;

  requestedPlayerId: PlayerId;
  requestedPlayerLabel?: string;

  opponentRollTotal?: number;
  comparedAgainst?: string;

  isPrivate?: boolean;
  isControlledRoll?: boolean;
}

export interface PendingRoll {
  id: string;
  player: PlayerId;
  kind: RollKind;
  context: Record<string, unknown>;
  /** Optional for compatibility with saved games created before contextual roll UI. */
  presentation?: PendingRollContext;
}

export interface PendingPapyrusBoneChoice {
  papyrusUnitId: string;
  targetUnitId: string;
}

export interface StakeMarker {
  id: string;
  owner: PlayerId;
  position: Coord;
  createdAt: number;
  isRevealed: boolean;
}

export interface ForestMarker {
  owner: PlayerId;
  position: Coord;
}

export interface PendingCombatQueueEntry {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  allowFriendlyTarget?: boolean;
  blindOnHit?: boolean;
  sourceAbilityId?: string;
  consumeSlots?: boolean;
  kind: "riderPath" | "aoe";
}

export interface PendingAoEResolution {
  casterId: string;
  abilityId: string;
  center: Coord;
  radius: number;
  affectedUnitIds: string[];
  revealedUnitIds: string[];
  damagedUnitIds: string[];
  damageByUnitId: Record<string, number>;
}

export type SearchStealthMode = "action" | "move";
