import type { ApplyResult, GameAction, GameState } from "../model";
import type { RNG } from "../rng";
import { clearPendingRoll } from "../shared/rollUtils";
import { resolveEnterBunkerRoll } from "./resolvers/resolveBunkerRoll";
import { resolveInitiativeRoll } from "./resolvers/resolveInitiativeRoll";
import { resolveMoveOptionsRoll } from "./resolvers/resolveMoveOptionsRoll";
import {
  resolveCarpetStrikeAttackRoll,
  resolveCarpetStrikeBerserkerDefenseChoice,
  resolveCarpetStrikeCenterRoll,
  resolveCarpetStrikeDefenderRoll,
} from "./resolvers/resolveCarpetStrikeRoll";
import {
  resolveForestAttackerRoll,
  resolveForestBerserkerDefenseChoice,
  resolveForestDefenderRoll,
} from "./resolvers/resolveForestRoll";
import {
  resolveTricksterAoEAttackerRoll,
  resolveTricksterAoEDefenderRoll,
} from "./resolvers/resolveTricksterRoll";
import {
  resolveElCidDuelistChoice,
  resolveElCidKoladaAttackerRoll,
  resolveElCidKoladaDefenderRoll,
  resolveElCidTisonaAttackerRoll,
  resolveElCidTisonaDefenderRoll,
} from "./resolvers/resolveElCidRoll";
import {
  resolveDoraAttackerRoll,
  resolveDoraBerserkerDefenseChoice,
  resolveDoraDefenderRoll,
} from "./resolvers/resolveDoraRoll";
import {
  resolveAttackAttackerRoll,
  resolveAttackDefenderRoll,
  resolveBerserkerDefenseChoiceRoll,
  resolveChikatiloDecoyChoice,
} from "./resolvers/resolveAttackRoll";
import {
  resolveVladForestChoice,
  resolveVladForestTarget,
  resolveVladIntimidateChoice,
  resolveVladPlaceStakes,
} from "./resolvers/resolveVladRoll";
import {
  resolveEnterStealthRoll,
  resolveSearchStealthRoll,
} from "./resolvers/resolveStealthRoll";
import {
  resolveChikatiloFalseTrailPlacement,
  resolveChikatiloFalseTrailRevealChoice,
  resolveFalseTrailExplosionAttackerRoll,
  resolveFalseTrailExplosionDefenderRoll,
} from "./resolvers/resolveChikatiloRoll";
import { resolveLechyGuideTravelerPlacement } from "../actions/heroes/lechy";
import {
  resolveForestMoveCheckRoll,
  resolveForestMoveDestinationChoice,
} from "../actions/movementActions";

export function applyResolvePendingRoll(
  state: GameState,
  action: Extract<GameAction, { type: "resolvePendingRoll" }>,
  rng: RNG
): ApplyResult {
  const pending = state.pendingRoll;
  if (!pending || pending.id !== action.pendingRollId) {
    return { state, events: [] };
  }
  if (pending.player !== action.player) {
    return { state, events: [] };
  }
  const autoRollChoice =
    action.choice === "auto" || action.choice === "roll"
      ? action.choice
      : undefined;

  switch (pending.kind) {
    case "initiativeRoll": {
      return resolveInitiativeRoll(state, pending, rng);
    }
    case "enterBunker": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveEnterBunkerRoll(state, unitId, rng);
    }
    case "enterStealth": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveEnterStealthRoll(state, unitId, rng);
    }
    case "kaiserCarpetStrikeCenter": {
      return resolveCarpetStrikeCenterRoll(state, pending, rng);
    }
    case "kaiserCarpetStrikeAttack": {
      return resolveCarpetStrikeAttackRoll(state, pending, rng);
    }
    case "carpetStrike_defenderRoll": {
      return resolveCarpetStrikeDefenderRoll(state, pending, rng);
    }
    case "carpetStrike_berserkerDefenseChoice": {
      return resolveCarpetStrikeBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    }
    case "searchStealth": {
      const unitId = pending.context.unitId as string | undefined;
      const mode = pending.context.mode as "action" | "move" | undefined;
      if (!unitId || !mode) {
        return { state: clearPendingRoll(state), events: [] };
      }
      return resolveSearchStealthRoll(state, unitId, mode, rng);
    }
    case "moveTrickster": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveTrickster", rng);
    }
    case "moveBerserker": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveBerserker", rng);
    }
    case "attack_attackerRoll":
    case "riderPathAttack_attackerRoll": {
      return resolveAttackAttackerRoll(state, pending, rng);
    }
    case "attack_defenderRoll":
    case "riderPathAttack_defenderRoll": {
      return resolveAttackDefenderRoll(state, pending, rng);
    }
    case "tricksterAoE_attackerRoll": {
      return resolveTricksterAoEAttackerRoll(state, pending, rng);
    }
    case "tricksterAoE_defenderRoll": {
      return resolveTricksterAoEDefenderRoll(state, pending, rng);
    }
    case "elCidTisona_attackerRoll": {
      return resolveElCidTisonaAttackerRoll(state, pending, rng);
    }
    case "elCidTisona_defenderRoll": {
      return resolveElCidTisonaDefenderRoll(state, pending, rng);
    }
    case "elCidKolada_attackerRoll": {
      return resolveElCidKoladaAttackerRoll(state, pending, rng);
    }
    case "elCidKolada_defenderRoll": {
      return resolveElCidKoladaDefenderRoll(state, pending, rng);
    }
    case "dora_attackerRoll": {
      return resolveDoraAttackerRoll(state, pending, rng);
    }
    case "dora_defenderRoll": {
      return resolveDoraDefenderRoll(state, pending, rng);
    }
    case "berserkerDefenseChoice": {
      return resolveBerserkerDefenseChoiceRoll(
        state,
        pending,
        autoRollChoice,
        rng
      );
    }
    case "chikatiloDecoyChoice": {
      return resolveChikatiloDecoyChoice(state, pending, action.choice, rng);
    }
    case "dora_berserkerDefenseChoice": {
      return resolveDoraBerserkerDefenseChoice(state, pending, autoRollChoice, rng);
    }
    case "vladIntimidateChoice": {
      return resolveVladIntimidateChoice(state, pending, action.choice, rng);
    }
    case "vladPlaceStakes": {
      return resolveVladPlaceStakes(state, pending, action.choice);
    }
    case "vladForestChoice": {
      return resolveVladForestChoice(state, pending, action.choice);
    }
    case "vladForestTarget": {
      return resolveVladForestTarget(state, pending, action.choice, rng);
    }
    case "vladForest_attackerRoll": {
      return resolveForestAttackerRoll(state, pending, rng);
    }
    case "vladForest_defenderRoll": {
      return resolveForestDefenderRoll(state, pending, rng);
    }
    case "vladForest_berserkerDefenseChoice": {
      return resolveForestBerserkerDefenseChoice(
        state,
        pending,
        autoRollChoice,
        rng
      );
    }
    case "elCidDuelistChoice": {
      return resolveElCidDuelistChoice(state, pending, action.choice);
    }
    case "chikatiloFalseTrailPlacement": {
      return resolveChikatiloFalseTrailPlacement(state, pending, action.choice);
    }
    case "chikatiloFalseTrailRevealChoice": {
      return resolveChikatiloFalseTrailRevealChoice(state, pending, action.choice);
    }
    case "falseTrailExplosion_attackerRoll": {
      return resolveFalseTrailExplosionAttackerRoll(state, pending, rng);
    }
    case "falseTrailExplosion_defenderRoll": {
      return resolveFalseTrailExplosionDefenderRoll(state, pending, rng);
    }
    case "lechyGuideTravelerPlacement": {
      return resolveLechyGuideTravelerPlacement(state, pending, action.choice as any);
    }
    case "forestMoveCheck": {
      return resolveForestMoveCheckRoll(state, pending, rng);
    }
    case "forestMoveDestination": {
      return resolveForestMoveDestinationChoice(state, pending, action.choice, rng);
    }
    default:
      return { state: clearPendingRoll(state), events: [] };
  }
}
