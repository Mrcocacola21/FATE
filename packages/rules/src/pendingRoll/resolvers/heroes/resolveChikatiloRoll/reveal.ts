import type { ApplyResult, GameEvent, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import { clearPendingRoll } from "../../../../core";
import {
  applyFalseTrailExplosion,
  removeFalseTrailToken,
  requestChikatiloRevealChoice,
} from "../../../../actions/heroes/chikatilo";

export function resolveChikatiloFalseTrailRevealChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    chikatiloId?: string;
    tokenId?: string;
    queue?: string[];
  };
  const tokenId = ctx.tokenId;
  if (!tokenId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection =
    choice === "falseTrailExplode"
      ? "explode"
      : choice === "falseTrailRemove"
      ? "remove"
      : "remove";

  const cleared = clearPendingRoll(state);
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];

  if (selection === "explode") {
    const token = cleared.units[tokenId];
    if (!token || !token.isAlive) {
      if (queue.length > 0) {
        const [nextId, ...rest] = queue;
        const requested = requestChikatiloRevealChoice(cleared, nextId, rest);
        return { state: requested.state, events: requested.events };
      }
      return { state: cleared, events: [] };
    }
    return applyFalseTrailExplosion(cleared, token, {
      ignoreEconomy: true,
      revealQueue: queue,
    });
  }

  const removed = removeFalseTrailToken(cleared, tokenId);
  let nextState = removed.state;
  let events: GameEvent[] = [...removed.events];

  if (queue.length > 0) {
    const [nextId, ...rest] = queue;
    const requested = requestChikatiloRevealChoice(nextState, nextId, rest);
    nextState = requested.state;
    events = [...events, ...requested.events];
  }

  return { state: nextState, events };
}
