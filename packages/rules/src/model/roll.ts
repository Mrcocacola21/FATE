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
  | "attack_attackerRoll"
  | "attack_defenderRoll"
  | "berserkerDefenseChoice"
  | "odinMuninnDefenseChoice"
  | "riderPathAttack_attackerRoll"
  | "riderPathAttack_defenderRoll"
  | "tricksterAoE_attackerRoll"
  | "tricksterAoE_defenderRoll"
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
  | "lechyGuideTravelerPlacement"
  | "forestMoveCheck"
  | "forestMoveDestination"
  | "riverBoatCarryChoice"
  | "riverBoatDropDestination"
  | "riverTraLaLaTargetChoice"
  | "riverTraLaLaDestinationChoice"
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
  | "femtoDivineMoveRoll"
  | "femtoDivineMoveDestination"
  | "friskPacifismChoice"
  | "friskPacifismHugsTargetChoice"
  | "friskWarmWordsTargetChoice"
  | "friskWarmWordsHealRoll"
  | "friskGenocideChoice"
  | "friskKeenEyeChoice"
  | "friskSubstitutionChoice"
  | "friskChildsCryChoice";

export interface PendingRoll {
  id: string;
  player: PlayerId;
  kind: RollKind;
  context: Record<string, unknown>;
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
