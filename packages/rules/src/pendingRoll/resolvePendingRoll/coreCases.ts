import type { ApplyResult, GameState, PendingRoll } from "../../model";
import type { RNG } from "../../rng";
import { clearPendingRoll } from "../../core";
import { resolveInitiativeRoll } from "../resolvers/core/resolveInitiativeRoll";
import { resolveMoveOptionsRoll } from "../resolvers/core/resolveMoveOptionsRoll";
import { resolveEnterBunkerRoll } from "../resolvers/heroes/resolveBunkerRoll";
import {
  resolveEnterStealthRoll,
  resolveSearchStealthRoll,
} from "../resolvers/core/resolveStealthRoll";
import {
  resolveAttackAttackerRoll,
  resolveAttackDefenderRoll,
  resolveAsgoreBraveryDefenseChoiceRoll,
  resolveBerserkerDefenseChoiceRoll,
  resolveChikatiloDecoyChoice,
  resolveFriskChildsCryChoiceRoll,
  resolveFriskSubstitutionChoiceRoll,
  resolveOdinMuninnDefenseChoiceRoll,
} from "../resolvers/core/resolveAttackRoll";
import {
  resolveForestMoveCheckRoll,
  resolveForestMoveDestinationChoice,
} from "../../actions/movementActions";
import type { AutoRollChoice, ResolvePendingRollAction } from "./types";

export function resolveCorePendingRollCase(
  state: GameState,
  pending: PendingRoll,
  action: ResolvePendingRollAction,
  rng: RNG,
  autoRollChoice: AutoRollChoice
): ApplyResult | null {
  switch (pending.kind) {
    case "initiativeRoll":
      return resolveInitiativeRoll(state, pending, rng);
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
    case "riderPathAttack_attackerRoll":
      return resolveAttackAttackerRoll(state, pending, rng);
    case "attack_defenderRoll":
    case "riderPathAttack_defenderRoll":
      return resolveAttackDefenderRoll(state, pending, rng);
    case "berserkerDefenseChoice":
      return resolveBerserkerDefenseChoiceRoll(
        state,
        pending,
        autoRollChoice,
        rng
      );
    case "odinMuninnDefenseChoice":
      return resolveOdinMuninnDefenseChoiceRoll(
        state,
        pending,
        autoRollChoice,
        rng
      );
    case "friskSubstitutionChoice":
      return resolveFriskSubstitutionChoiceRoll(state, pending, action.choice, rng);
    case "friskChildsCryChoice":
      return resolveFriskChildsCryChoiceRoll(state, pending, action.choice, rng);
    case "asgoreBraveryDefenseChoice":
      return resolveAsgoreBraveryDefenseChoiceRoll(
        state,
        pending,
        autoRollChoice,
        rng
      );
    case "chikatiloDecoyChoice":
      return resolveChikatiloDecoyChoice(state, pending, action.choice, rng);
    case "forestMoveCheck":
      return resolveForestMoveCheckRoll(state, pending, rng);
    case "forestMoveDestination":
      return resolveForestMoveDestinationChoice(state, pending, action.choice, rng);
    default:
      return null;
  }
}
