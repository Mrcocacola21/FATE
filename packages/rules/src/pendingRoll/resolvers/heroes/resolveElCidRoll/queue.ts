import type { ApplyResult, GameEvent, GameState, RollKind } from "../../../../model";
import { clearPendingRoll, requestRoll } from "../../../../core";
import type { ElCidAoEContext } from "../../../types";
import { finalizeElCidAoE } from "./helpers";

export function advanceElCidAoEQueue(
  state: GameState,
  context: ElCidAoEContext,
  events: GameEvent[],
  defenderRollKind: RollKind
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = baseState.units[targetId];
    if (target && target.isAlive) {
      const nextCtx: ElCidAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        defenderRollKind,
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeElCidAoE(baseState, events);
}
