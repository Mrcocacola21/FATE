import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
} from "../../../../model";
import { clearPendingRoll, getLegalStakePositions } from "../../../../core";
import { requestVladStakesPlacement } from "../../../../actions/heroes/vlad";
import { evStakesPlaced } from "../../../../core";
import { coordKey } from "./helpers";
import type { VladPlaceStakesContext } from "./types";

export function resolveVladPlaceStakes(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as VladPlaceStakesContext;
  const owner = ctx.owner;
  if (!owner) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const request = choice as { type?: string; positions?: Coord[] } | undefined;
  if (!request || request.type !== "placeStakes") {
    return { state, events: [] };
  }

  const positions = Array.isArray(request.positions) ? request.positions : [];
  if (positions.length !== 3) {
    return { state, events: [] };
  }

  const legalPositions =
    Array.isArray(ctx.legalPositions) && ctx.legalPositions.length > 0
      ? ctx.legalPositions
      : getLegalStakePositions(state, owner);
  const legalSet = new Set(legalPositions.map(coordKey));

  const unique = new Set(positions.map(coordKey));
  if (unique.size !== positions.length) {
    return { state, events: [] };
  }

  for (const pos of positions) {
    if (!legalSet.has(coordKey(pos))) {
      return { state, events: [] };
    }
  }

  const baseCounter = state.stakeCounter ?? 0;
  const created = positions.map((pos, index) => ({
    id: `stake-${owner}-${baseCounter + index + 1}`,
    owner,
    position: { ...pos },
    createdAt: baseCounter + index + 1,
    isRevealed: false,
  }));

  const nextState: GameState = {
    ...state,
    stakeMarkers: [...state.stakeMarkers, ...created],
    stakeCounter: baseCounter + created.length,
  };

  const events: GameEvent[] = [
    evStakesPlaced({
      owner,
      positions: positions.map((pos) => ({ ...pos })),
      hiddenFromOpponent: true,
    }),
  ];

  const cleared = clearPendingRoll(nextState);
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextOwner, ...rest] = queue;
    const requested = requestVladStakesPlacement(
      cleared,
      nextOwner,
      ctx.reason ?? "battleStart",
      rest
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  return { state: cleared, events };
}
