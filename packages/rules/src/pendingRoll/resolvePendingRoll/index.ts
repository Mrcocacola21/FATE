import type { ApplyResult, GameState } from "../../model";
import type { RNG } from "../../rng";
import { resolveCorePendingRollCase } from "./coreCases";
import { resolveHeroPendingRollCase } from "./heroCases";
import type { ResolvePendingRollAction } from "./types";
import { manualRollRecorder } from "../manualRoll";
import { correlateAbilityResult } from "../../core/abilityUse";

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
  const recorded = manualRollRecorder(state, pending, rng);
  rng = recorded.rng;
  const finish = (result: ApplyResult): ApplyResult => {
    if (result.rejectionReason) return result;
    // Compatibility events describe initiative state/area geometry. Their rollId
    // identifies the same evidence; rollResolved is the single dice-result signal.
    const events = result.events.map(event => recorded.events.length &&
      (event.type === "initiativeRolled" || event.type === "carpetStrikeCenter" || event.type === "carpetStrikeAttackRolled")
      ? { ...event, rollId: pending.id } : event);
    return correlateAbilityResult(state, { ...result, events: [...recorded.events, ...events] });
  };

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
    return finish(coreResult);
  }

  const heroResult = resolveHeroPendingRollCase(
    state,
    pending,
    action,
    rng,
    autoRollChoice
  );
  if (heroResult) {
    return finish(heroResult);
  }

  return {
    state,
    events: [
      {
        type: "pendingRollUnhandled",
        rollId: pending.id,
        kind: String(pending.kind),
        player: pending.player,
      },
    ],
  };
}
