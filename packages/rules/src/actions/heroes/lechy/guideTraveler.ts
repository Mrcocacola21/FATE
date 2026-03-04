import type { ApplyResult, Coord, GameEvent, GameState, UnitState } from "../../../model";
import { isInsideBoard } from "../../../model";
import { getUnitAt } from "../../../board";
import { clearPendingRoll, requestRoll } from "../../../core";
import { evUnitMoved } from "../../../core";
import { getEmptyCellsInAura } from "./helpers";

export function requestLechyGuideTravelerPlacement(
  state: GameState,
  lechyId: string,
  allyId: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const lechy = state.units[lechyId];
  const ally = state.units[allyId];
  if (!lechy || !lechy.isAlive || !lechy.position) {
    return { state, events: [] };
  }
  if (!ally || !ally.isAlive || !ally.position) {
    return { state, events: [] };
  }

  const legalPositions = getEmptyCellsInAura(state, lechy.position);
  const requested = requestRoll(
    clearPendingRoll(state),
    lechy.owner,
    "lechyGuideTravelerPlacement",
    { lechyId, allyId, legalPositions },
    lechy.id
  );

  return requested;
}

export function resolveLechyGuideTravelerPlacement(
  state: GameState,
  pending: { context: Record<string, unknown> },
  choice: { type?: string; position?: Coord } | undefined
): ApplyResult {
  const ctx = pending.context as {
    lechyId?: string;
    allyId?: string;
    legalPositions?: Coord[];
  };
  const lechyId = ctx.lechyId;
  const allyId = ctx.allyId;
  if (!lechyId || !allyId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload = choice && choice.type === "lechyGuideTravelerPlace" ? choice : undefined;
  if (!payload?.position) {
    return { state, events: [] };
  }

  const pos = payload.position;
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, pos)) {
    return { state, events: [] };
  }

  const rawLegal = Array.isArray(ctx.legalPositions) ? ctx.legalPositions : null;
  const legalPositions =
    rawLegal && rawLegal.length > 0
      ? rawLegal
      : getEmptyCellsInAura(state, state.units[lechyId]?.position ?? pos);
  const legalSet = new Set(legalPositions.map((c) => `${c.col},${c.row}`));
  if (!legalSet.has(`${pos.col},${pos.row}`)) {
    return { state, events: [] };
  }

  const ally = state.units[allyId];
  if (!ally || !ally.isAlive || !ally.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const lechy = state.units[lechyId];
  const updatedLechy =
    lechy && lechy.lechyGuideTravelerTargetId
      ? { ...lechy, lechyGuideTravelerTargetId: undefined }
      : lechy;

  const updatedAlly: UnitState = {
    ...ally,
    position: { ...pos },
  };

  const nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      ...(updatedLechy ? { [updatedLechy.id]: updatedLechy } : {}),
      [updatedAlly.id]: updatedAlly,
    },
  });

  const events: GameEvent[] = [
    evUnitMoved({ unitId: updatedAlly.id, from: ally.position, to: updatedAlly.position! }),
  ];

  return { state: nextState, events };
}
