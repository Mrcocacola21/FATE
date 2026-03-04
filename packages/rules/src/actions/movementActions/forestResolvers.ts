import type {
  ApplyResult,
  GameState,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { requestRoll } from "../../core";
import type { MoveActionInternal } from "./types";
import { applyMove } from "./move";
import { parseCoord, parseCoordList } from "./forest";

export function resolveForestMoveCheckRoll(
  state: GameState,
  pending: { player: UnitState["owner"]; context: Record<string, unknown> },
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  const target = parseCoord(pending.context.to);
  if (!unitId || !target) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }

  const roll = 1 + Math.floor(rng.next() * 6);
  if (roll >= 5) {
    return applyMove(
      { ...state, pendingRoll: null },
      {
        type: "move",
        unitId,
        to: target,
        __forestBypass: true,
      } as MoveActionInternal,
      rng
    );
  }

  const fallbackOptions = parseCoordList(pending.context.fallbackOptions);
  if (fallbackOptions.length === 0) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }
  return requestRoll(
    { ...state, pendingRoll: null },
    pending.player,
    "forestMoveDestination",
    {
      unitId,
      options: fallbackOptions,
      originalTo: target,
    },
    unitId
  );
}

export function resolveForestMoveDestinationChoice(
  state: GameState,
  pending: { context: Record<string, unknown> },
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  if (!unitId) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }

  const payload =
    choice && typeof choice === "object" && choice.type === "forestMoveDestination"
      ? choice
      : undefined;
  if (!payload?.position) {
    return { state, events: [] };
  }

  const options = parseCoordList(pending.context.options);
  const key = `${payload.position.col},${payload.position.row}`;
  const allowed = options.some((coord) => `${coord.col},${coord.row}` === key);
  if (!allowed) {
    return { state, events: [] };
  }

  return applyMove(
    { ...state, pendingRoll: null },
    {
      type: "move",
      unitId,
      to: { ...payload.position },
      __forestBypass: true,
    } as MoveActionInternal,
    rng
  );
}
