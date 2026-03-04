import type {
  ApplyResult,
  GameState,
  MoveMode,
  PendingMove,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import { evMoveOptionsGenerated } from "../../core";
import { getLegalMovesForUnitModes } from "../../movement";
import type { RiverBoatCarryChoiceContext } from "../../pendingRoll/types";
import {
  filterRiverMovesByCarryDrop,
  isRiverPerson,
} from "../heroes/riverPerson";

function parseTargetIdChoice(choice: ResolveRollChoice | undefined): string | null {
  if (!choice || typeof choice !== "object") return null;
  const payload = choice as { targetId?: unknown };
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) {
    return null;
  }
  return payload.targetId;
}

export function buildRiverMoveOptionsResult(
  state: GameState,
  river: UnitState,
  requestedMode: MoveMode | undefined
): ApplyResult {
  const mode = requestedMode ?? "normal";
  if (mode !== "normal" && mode !== river.class) {
    return { state, events: [] };
  }
  const chosenMode = mode === "normal" ? river.class : mode;
  let legalTo = getLegalMovesForUnitModes(state, river.id, [chosenMode]);
  if (river.riverBoatCarryAllyId) {
    legalTo = filterRiverMovesByCarryDrop(
      state,
      legalTo,
      river.riverBoatCarryAllyId
    );
  }
  const pendingMove: PendingMove = {
    unitId: river.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode,
  };
  return {
    state: {
      ...state,
      pendingMove,
    },
    events: [
      evMoveOptionsGenerated({
        unitId: river.id,
        roll: undefined,
        legalTo,
        mode,
      }),
    ],
  };
}

function parseMoveMode(mode: unknown): MoveMode | undefined {
  return mode === "normal" ||
    mode === "spearman" ||
    mode === "rider" ||
    mode === "knight" ||
    mode === "archer" ||
    mode === "trickster" ||
    mode === "assassin" ||
    mode === "berserker"
    ? mode
    : undefined;
}

export function resolveRiverBoatCarryChoice(
  state: GameState,
  pending: { context: Record<string, unknown> },
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as RiverBoatCarryChoiceContext;
  const river = state.units[ctx.riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const mode = parseMoveMode(ctx.mode);
  let selectedAllyId: string | undefined;
  if (choice === "skip") {
    selectedAllyId = undefined;
  } else {
    const parsed = parseTargetIdChoice(choice);
    if (!parsed) {
      return { state, events: [] };
    }
    if (!options.includes(parsed)) {
      return { state, events: [] };
    }
    const ally = state.units[parsed];
    if (!ally || !ally.isAlive || !ally.position || ally.owner !== river.owner) {
      return { state, events: [] };
    }
    const dist = Math.max(
      Math.abs(ally.position.col - river.position.col),
      Math.abs(ally.position.row - river.position.row)
    );
    if (dist > 1) {
      return { state, events: [] };
    }
    selectedAllyId = parsed;
  }

  if (selectedAllyId) {
    const chosenMode = mode && mode !== "normal" ? mode : river.class;
    let legalTo = getLegalMovesForUnitModes(state, river.id, [chosenMode]);
    legalTo = filterRiverMovesByCarryDrop(state, legalTo, selectedAllyId);
    if (legalTo.length === 0) {
      return { state, events: [] };
    }
  }

  const updatedRiver: UnitState = {
    ...river,
    riverBoatCarryAllyId: selectedAllyId,
  };
  const nextState: GameState = {
    ...state,
    pendingRoll: null,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
    },
  };

  return buildRiverMoveOptionsResult(nextState, updatedRiver, mode);
}
