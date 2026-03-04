import type { ApplyResult, GameState } from "../../model";
import type { RNG } from "../../rng";
import { clearPendingRoll } from "../../core";
import { resolveCorePendingRollCase } from "./coreCases";
import { resolveHeroPendingRollCase } from "./heroCases";
import type { ResolvePendingRollAction } from "./types";

export function applyResolvePendingRoll(
  state: GameState,
  action: ResolvePendingRollAction,
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

  const coreResult = resolveCorePendingRollCase(
    state,
    pending,
    action,
    rng,
    autoRollChoice
  );
  if (coreResult) {
    return coreResult;
  }

  const heroResult = resolveHeroPendingRollCase(
    state,
    pending,
    action,
    rng,
    autoRollChoice
  );
  if (heroResult) {
    return heroResult;
  }

  return { state: clearPendingRoll(state), events: [] };
}
