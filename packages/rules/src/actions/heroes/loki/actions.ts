import type { ApplyResult, GameState, UnitState } from "../../../model";
import { requestRoll } from "../../../core";
import { isLoki } from "./effects";
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

export function applyLokiLaught(state: GameState, unit: UnitState): ApplyResult {
  if (!isLoki(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const ctx = buildLokiLaughtChoiceContext(state, unit.id);
  return requestRoll(state, unit.owner, "lokiLaughtChoice", ctx, unit.id);
}
