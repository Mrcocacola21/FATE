import type { ApplyResult, GameState, UnitState } from "../../../model";
import type { RNG } from "../../../rng";
import type { UseAbilityAction } from "../../abilityActions/types";
import { requestRoll } from "../../../core";
import { isLoki } from "./effects";
import type { LokiLaughtOption } from "./constants";
import { resolveLokiLaughtOption } from "../../../pendingRoll/resolvers/heroes/resolveLokiRoll/menu";
import {
  getLokiChickenTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
} from "./targets";

export function buildLokiLaughtChoiceContext(
  state: GameState,
  lokiId: string
): Record<string, unknown> {
  return {
    lokiId,
    chickenOptions: getLokiChickenTargetIds(state, lokiId),
    mindControlEnemyOptions: getLokiMindControlEnemyIds(state, lokiId),
    spinCandidateIds: getLokiSpinCandidateIds(state, lokiId),
  };
}

function getRequestedOption(action: UseAbilityAction): LokiLaughtOption | null {
  const payload = action.payload;
  if (!payload || typeof payload !== "object") return null;
  const optionId = (payload as { optionId?: unknown }).optionId;
  switch (optionId) {
    case "againSomeNonsense":
    case "chicken":
    case "mindControl":
    case "spinTheDrum":
    case "greatLokiJoke":
      return optionId;
    default:
      return null;
  }
}

export function applyLokiLaught(
  state: GameState,
  unit: UnitState,
  action: UseAbilityAction,
  rng: RNG
): ApplyResult {
  if (!isLoki(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const requestedOption = getRequestedOption(action);
  if (requestedOption) {
    return resolveLokiLaughtOption(state, unit.id, requestedOption, rng);
  }
  const ctx = buildLokiLaughtChoiceContext(state, unit.id);
  return requestRoll(state, unit.owner, "lokiLaughtChoice", ctx, unit.id);
}
