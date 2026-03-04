import type { ApplyResult, GameState, PendingRoll } from "../../model";
import type { RNG } from "../../rng";
import {
  resolveCarpetStrikeAttackRoll,
  resolveCarpetStrikeBerserkerDefenseChoice,
  resolveCarpetStrikeCenterRoll,
  resolveCarpetStrikeDefenderRoll,
} from "../resolvers/heroes/resolveCarpetStrikeRoll";
import {
  resolveForestAttackerRoll,
  resolveForestBerserkerDefenseChoice,
  resolveForestDefenderRoll,
} from "../resolvers/heroes/resolveForestRoll";
import {
  resolveTricksterAoEAttackerRoll,
  resolveTricksterAoEDefenderRoll,
} from "../resolvers/heroes/resolveTricksterRoll";
import {
  resolveElCidDuelistChoice,
  resolveElCidKoladaAttackerRoll,
  resolveElCidKoladaDefenderRoll,
  resolveElCidTisonaAttackerRoll,
  resolveElCidTisonaDefenderRoll,
} from "../resolvers/heroes/resolveElCidRoll";
import {
  resolveDoraAttackerRoll,
  resolveDoraBerserkerDefenseChoice,
  resolveDoraDefenderRoll,
} from "../resolvers/heroes/resolveDoraRoll";
import {
  resolveJebeHailOfArrowsAttackerRoll,
  resolveJebeHailOfArrowsBerserkerDefenseChoice,
  resolveJebeHailOfArrowsDefenderRoll,
  resolveJebeKhansShooterRicochetRoll,
  resolveJebeKhansShooterTargetChoice,
} from "../resolvers/heroes/resolveJebeRoll";
import {
  resolveHassanAssassinOrderSelection,
  resolveHassanTrueEnemyTargetChoice,
} from "../resolvers/heroes/resolveHassanRoll";
import {
  resolveLokiChickenTargetChoice,
  resolveLokiLaughtChoice,
  resolveLokiMindControlEnemyChoice,
  resolveLokiMindControlTargetChoice,
} from "../resolvers/heroes/resolveLokiRoll";
import {
  resolveFriskGenocideChoice,
  resolveFriskKeenEyeChoice,
  resolveFriskPacifismChoice,
  resolveFriskPacifismHugsTargetChoice,
  resolveFriskWarmWordsHealRoll,
  resolveFriskWarmWordsTargetChoice,
} from "../resolvers/heroes/resolveFriskRoll";
import {
  resolveAsgoreSoulParadeIntegrityDestinationChoice,
  resolveAsgoreSoulParadeJusticeTargetChoice,
  resolveAsgoreSoulParadePatienceTargetChoice,
  resolveAsgoreSoulParadePerseveranceTargetChoice,
  resolveAsgoreSoulParadeRoll,
} from "../resolvers/heroes/resolveAsgoreRoll";
import {
  resolveVladForestChoice,
  resolveVladForestTarget,
  resolveVladIntimidateChoice,
  resolveVladPlaceStakes,
} from "../resolvers/heroes/resolveVladRoll";
import {
  resolveChikatiloFalseTrailPlacement,
  resolveChikatiloFalseTrailRevealChoice,
  resolveFalseTrailExplosionAttackerRoll,
  resolveFalseTrailExplosionDefenderRoll,
} from "../resolvers/heroes/resolveChikatiloRoll";
import {
  resolveFemtoDivineMoveDestinationChoice,
  resolveFemtoDivineMoveRoll,
} from "../../actions/heroes/griffith";
import { resolveLechyGuideTravelerPlacement } from "../../actions/heroes/lechy";
import {
  resolveRiverBoatDropDestination,
  resolveRiverTraLaLaDestinationChoice,
  resolveRiverTraLaLaTargetChoice,
} from "../../actions/heroes/riverPerson";
import { resolveRiverBoatCarryChoice } from "../../actions/movementActions";
import type { AutoRollChoice, ResolvePendingRollAction } from "./types";

export function resolveHeroPendingRollCase(
  state: GameState,
  pending: PendingRoll,
  action: ResolvePendingRollAction,
  rng: RNG,
  autoRollChoice: AutoRollChoice
): ApplyResult | null {
  switch (pending.kind) {
    case "kaiserCarpetStrikeCenter":
      return resolveCarpetStrikeCenterRoll(state, pending, rng);
    case "kaiserCarpetStrikeAttack":
      return resolveCarpetStrikeAttackRoll(state, pending, rng);
    case "carpetStrike_defenderRoll":
      return resolveCarpetStrikeDefenderRoll(state, pending, rng);
    case "carpetStrike_berserkerDefenseChoice":
      return resolveCarpetStrikeBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    case "tricksterAoE_attackerRoll":
      return resolveTricksterAoEAttackerRoll(state, pending, rng);
    case "tricksterAoE_defenderRoll":
      return resolveTricksterAoEDefenderRoll(state, pending, rng);
    case "elCidTisona_attackerRoll":
      return resolveElCidTisonaAttackerRoll(state, pending, rng);
    case "elCidTisona_defenderRoll":
      return resolveElCidTisonaDefenderRoll(state, pending, rng);
    case "elCidKolada_attackerRoll":
      return resolveElCidKoladaAttackerRoll(state, pending, rng);
    case "elCidKolada_defenderRoll":
      return resolveElCidKoladaDefenderRoll(state, pending, rng);
    case "dora_attackerRoll":
      return resolveDoraAttackerRoll(state, pending, rng);
    case "dora_defenderRoll":
      return resolveDoraDefenderRoll(state, pending, rng);
    case "dora_berserkerDefenseChoice":
      return resolveDoraBerserkerDefenseChoice(state, pending, autoRollChoice, rng);
    case "jebeHailOfArrows_attackerRoll":
      return resolveJebeHailOfArrowsAttackerRoll(state, pending, rng);
    case "jebeHailOfArrows_defenderRoll":
      return resolveJebeHailOfArrowsDefenderRoll(state, pending, rng);
    case "jebeHailOfArrows_berserkerDefenseChoice":
      return resolveJebeHailOfArrowsBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    case "jebeKhansShooterRicochetRoll":
      return resolveJebeKhansShooterRicochetRoll(state, pending, rng);
    case "jebeKhansShooterTargetChoice":
      return resolveJebeKhansShooterTargetChoice(state, pending, action.choice);
    case "hassanTrueEnemyTargetChoice":
      return resolveHassanTrueEnemyTargetChoice(state, pending, action.choice);
    case "hassanAssassinOrderSelection":
      return resolveHassanAssassinOrderSelection(state, pending, action.choice);
    case "lokiLaughtChoice":
      return resolveLokiLaughtChoice(state, pending, action.choice, rng);
    case "lokiChickenTargetChoice":
      return resolveLokiChickenTargetChoice(state, pending, action.choice);
    case "lokiMindControlEnemyChoice":
      return resolveLokiMindControlEnemyChoice(state, pending, action.choice);
    case "lokiMindControlTargetChoice":
      return resolveLokiMindControlTargetChoice(state, pending, action.choice);
    case "friskPacifismChoice":
      return resolveFriskPacifismChoice(state, pending, action.choice);
    case "friskPacifismHugsTargetChoice":
      return resolveFriskPacifismHugsTargetChoice(state, pending, action.choice);
    case "friskWarmWordsTargetChoice":
      return resolveFriskWarmWordsTargetChoice(state, pending, action.choice);
    case "friskWarmWordsHealRoll":
      return resolveFriskWarmWordsHealRoll(state, pending, action.choice, rng);
    case "friskGenocideChoice":
      return resolveFriskGenocideChoice(state, pending, action.choice);
    case "friskKeenEyeChoice":
      return resolveFriskKeenEyeChoice(state, pending, action.choice, rng);
    case "asgoreSoulParadeRoll":
      return resolveAsgoreSoulParadeRoll(state, pending, rng);
    case "asgoreSoulParadePatienceTargetChoice":
      return resolveAsgoreSoulParadePatienceTargetChoice(state, pending, action.choice);
    case "asgoreSoulParadePerseveranceTargetChoice":
      return resolveAsgoreSoulParadePerseveranceTargetChoice(
        state,
        pending,
        action.choice,
        rng
      );
    case "asgoreSoulParadeJusticeTargetChoice":
      return resolveAsgoreSoulParadeJusticeTargetChoice(state, pending, action.choice);
    case "asgoreSoulParadeIntegrityDestination":
      return resolveAsgoreSoulParadeIntegrityDestinationChoice(
        state,
        pending,
        action.choice
      );
    case "femtoDivineMoveRoll":
      return resolveFemtoDivineMoveRoll(state, pending, rng);
    case "femtoDivineMoveDestination":
      return resolveFemtoDivineMoveDestinationChoice(
        state,
        pending,
        action.choice,
        rng
      );
    case "vladIntimidateChoice":
      return resolveVladIntimidateChoice(state, pending, action.choice, rng);
    case "vladPlaceStakes":
      return resolveVladPlaceStakes(state, pending, action.choice);
    case "vladForestChoice":
      return resolveVladForestChoice(state, pending, action.choice);
    case "vladForestTarget":
      return resolveVladForestTarget(state, pending, action.choice, rng);
    case "vladForest_attackerRoll":
      return resolveForestAttackerRoll(state, pending, rng);
    case "vladForest_defenderRoll":
      return resolveForestDefenderRoll(state, pending, rng);
    case "vladForest_berserkerDefenseChoice":
      return resolveForestBerserkerDefenseChoice(state, pending, autoRollChoice, rng);
    case "elCidDuelistChoice":
      return resolveElCidDuelistChoice(state, pending, action.choice);
    case "chikatiloFalseTrailPlacement":
      return resolveChikatiloFalseTrailPlacement(state, pending, action.choice);
    case "chikatiloFalseTrailRevealChoice":
      return resolveChikatiloFalseTrailRevealChoice(state, pending, action.choice);
    case "falseTrailExplosion_attackerRoll":
      return resolveFalseTrailExplosionAttackerRoll(state, pending, rng);
    case "falseTrailExplosion_defenderRoll":
      return resolveFalseTrailExplosionDefenderRoll(state, pending, rng);
    case "lechyGuideTravelerPlacement":
      return resolveLechyGuideTravelerPlacement(state, pending, action.choice as any);
    case "riverBoatCarryChoice":
      return resolveRiverBoatCarryChoice(state, pending, action.choice);
    case "riverBoatDropDestination":
      return resolveRiverBoatDropDestination(state, pending, action.choice);
    case "riverTraLaLaTargetChoice":
      return resolveRiverTraLaLaTargetChoice(state, pending, action.choice);
    case "riverTraLaLaDestinationChoice":
      return resolveRiverTraLaLaDestinationChoice(state, pending, action.choice);
    default:
      return null;
  }
}
