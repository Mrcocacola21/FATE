import type {
  ApplyResult,
  Coord,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import { getUnitAt } from "../../../../board";
import { clearPendingRoll, evUnitMoved } from "../../../../core";
import type {
  AsgoreSoulParadeIntegrityDestinationContext,
  AsgoreSoulParadeTargetChoiceContext,
} from "../../../types";
import {
  commitAsgoreSoulParadeCost,
  getAsgore,
  parseTargetChoice,
  requestAsgoreAttack,
} from "./helpers";

export function resolveAsgoreSoulParadePatienceTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(choice, "asgoreSoulParadePatienceTarget");
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const committed = commitAsgoreSoulParadeCost(state, asgore.id);
  if (!committed.ok) return { state, events: [] };
  const updatedAsgore: UnitState = {
    ...committed.unit,
    asgorePatienceStealthActive: true,
  };
  const stateAfterCommit: GameState = {
    ...committed.state,
    units: {
      ...committed.state.units,
      [updatedAsgore.id]: updatedAsgore,
    },
  };
  const requested = requestAsgoreAttack(stateAfterCommit, updatedAsgore, targetId);
  return { state: requested.state, events: [...committed.events, ...requested.events] };
}

export function resolveAsgoreSoulParadePerseveranceTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(
    choice,
    "asgoreSoulParadePerseveranceTarget"
  );
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const committed = commitAsgoreSoulParadeCost(state, asgore.id);
  if (!committed.ok) return { state, events: [] };
  const check = rollD6(rng);
  if (check >= 5) {
    return { state: clearPendingRoll(committed.state), events: committed.events };
  }

  return {
    state: clearPendingRoll({
      ...committed.state,
      units: {
        ...committed.state.units,
        [target.id]: {
          ...committed.state.units[target.id],
          movementDisabledNextTurn: true,
        },
      },
    }),
    events: committed.events,
  };
}

export function resolveAsgoreSoulParadeJusticeTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as AsgoreSoulParadeTargetChoiceContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetChoice(choice, "asgoreSoulParadeJusticeTarget");
  if (!targetId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) {
    return { state, events: [] };
  }
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const committed = commitAsgoreSoulParadeCost(state, asgore.id);
  if (!committed.ok) return { state, events: [] };
  const requested = requestAsgoreAttack(committed.state, committed.unit, targetId);
  return { state: requested.state, events: [...committed.events, ...requested.events] };
}

export function resolveAsgoreSoulParadeIntegrityDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx =
    pending.context as unknown as AsgoreSoulParadeIntegrityDestinationContext;
  const asgore = getAsgore(state, ctx.asgoreId);
  if (!asgore || !asgore.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; position?: Coord })
      : undefined;
  if (
    !payload ||
    payload.type !== "asgoreSoulParadeIntegrityDestination" ||
    !payload.position
  ) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const key = `${payload.position.col},${payload.position.row}`;
  if (!options.some((coord) => `${coord.col},${coord.row}` === key)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, payload.position)) {
    return { state, events: [] };
  }

  const committed = commitAsgoreSoulParadeCost(state, asgore.id);
  if (!committed.ok) return { state, events: [] };
  const committedAsgore = committed.unit;
  const movedAsgore: UnitState = {
    ...committedAsgore,
    position: { ...payload.position },
  };
  return {
    state: clearPendingRoll({
      ...committed.state,
      units: {
        ...committed.state.units,
        [movedAsgore.id]: movedAsgore,
      },
    }),
    events: [
      ...committed.events,
      evUnitMoved({
        unitId: movedAsgore.id,
        from: { ...asgore.position },
        to: { ...movedAsgore.position! },
      }),
    ],
  };
}
