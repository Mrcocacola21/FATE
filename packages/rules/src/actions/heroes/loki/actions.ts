import type { ApplyResult, GameState, UnitState } from "../../../model";
import type { RNG } from "../../../rng";
import type { UseAbilityAction } from "../../abilityActions/types";
import { requestRoll } from "../../../core";
import { isLoki } from "./effects";
import {
  LOKI_LAUGHT_OPTION_COSTS,
  LOKI_LAUGHT_OPTION_IDS,
  LOKI_LAUGHT_REJECTIONS,
  type LokiLaughtOption,
} from "./constants";
import { resolveLokiLaughtOption } from "../../../pendingRoll/resolvers/heroes/resolveLokiRoll/menu";
import {
  getLokiChickenTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
  getLokiTricksterAreaTargetIds,
} from "./targets";
import { canCommitAbilityCost } from "../../abilityCosts";
import { ABILITY_LOKI_LAUGHT, getCharges } from "../../../abilities";

export function buildLokiLaughtChoiceContext(
  state: GameState,
  lokiId: string,
): Record<string, unknown> {
  return {
    lokiId,
    chickenOptions: getLokiChickenTargetIds(state, lokiId),
    mindControlEnemyOptions: getLokiMindControlEnemyIds(state, lokiId),
    spinCandidateIds: getLokiSpinCandidateIds(state, lokiId),
  };
}

type RequestedLokiOption =
  | { kind: "menu" }
  | { kind: "invalid" }
  | { kind: "option"; option: LokiLaughtOption };

function getRequestedOption(action: UseAbilityAction): RequestedLokiOption {
  const payload = action.payload;
  if (payload === undefined) return { kind: "menu" };
  if (!payload || typeof payload !== "object") return { kind: "invalid" };
  const optionId = (payload as { optionId?: unknown }).optionId;
  if (
    typeof optionId === "string" &&
    LOKI_LAUGHT_OPTION_IDS.includes(optionId as LokiLaughtOption)
  ) {
    return { kind: "option", option: optionId as LokiLaughtOption };
  }
  return { kind: "invalid" };
}

function hasValidTargets(state: GameState, lokiId: string, option: LokiLaughtOption): boolean {
  switch (option) {
    case "againSomeNonsense":
    case "greatLokiJoke":
      return getLokiTricksterAreaTargetIds(state, lokiId).length > 0;
    case "chicken":
      return getLokiChickenTargetIds(state, lokiId).length > 0;
    case "mindControl":
      return getLokiMindControlEnemyIds(state, lokiId).length > 0;
    case "spinTheDrum":
      return getLokiSpinCandidateIds(state, lokiId).length > 0;
    default:
      return false;
  }
}

export function applyLokiLaught(
  state: GameState,
  unit: UnitState,
  action: UseAbilityAction,
  rng: RNG,
): ApplyResult {
  if (!isLoki(unit) || !unit.isAlive || !unit.position) {
    return {
      state,
      events: [],
      rejectionReason: LOKI_LAUGHT_REJECTIONS.cannotUseNow,
    };
  }
  const requestedOption = getRequestedOption(action);
  if (requestedOption.kind === "invalid") {
    return {
      state,
      events: [],
      rejectionReason: LOKI_LAUGHT_REJECTIONS.invalidOption,
    };
  }
  if (requestedOption.kind === "option") {
    const cost = LOKI_LAUGHT_OPTION_COSTS[requestedOption.option];
    if (getCharges(unit, ABILITY_LOKI_LAUGHT) < cost) {
      return {
        state,
        events: [],
        rejectionReason: LOKI_LAUGHT_REJECTIONS.notEnoughLaugh,
      };
    }
    if (!hasValidTargets(state, unit.id, requestedOption.option)) {
      return {
        state,
        events: [],
        rejectionReason: LOKI_LAUGHT_REJECTIONS.noValidTarget,
      };
    }
    if (
      !canCommitAbilityCost(state, unit.id, ABILITY_LOKI_LAUGHT, {
        costs: { action: true },
        chargeAmount: cost,
      })
    ) {
      return {
        state,
        events: [],
        rejectionReason: LOKI_LAUGHT_REJECTIONS.cannotUseNow,
      };
    }
    return resolveLokiLaughtOption(state, unit.id, requestedOption.option, rng);
  }
  const ctx = buildLokiLaughtChoiceContext(state, unit.id);
  return requestRoll(state, unit.owner, "lokiLaughtChoice", ctx, unit.id);
}
