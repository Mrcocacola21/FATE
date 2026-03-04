import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingMove,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import { getUnitAt, coordsEqual } from "../../../board";
import {
  ABILITY_RIVER_PERSON_BOATMAN,
  getAbilitySpec,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { getLegalMovesForUnitModes } from "../../../movement";
import { getMovementModes } from "../../shared";
import { clearPendingRoll, requestRoll } from "../../../core";
import { evAbilityUsed, evMoveOptionsGenerated, evUnitMoved } from "../../../core";
import type {
  RiverBoatCarryChoiceContext,
  RiverBoatDropDestinationContext,
} from "../../../pendingRoll/types";
import { isRiverPerson, parseCoordList, parsePosition } from "./helpers";
import { getRiverCarryOptions, getRiverDropOptions } from "./options";

export function requestRiverBoatCarryChoice(
  state: GameState,
  river: UnitState,
  mode: UnitState["class"] | "normal",
  options: string[]
): ApplyResult {
  return requestRoll(
    state,
    river.owner,
    "riverBoatCarryChoice",
    {
      riverId: river.id,
      mode,
      options,
    } satisfies RiverBoatCarryChoiceContext,
    river.id
  );
}

export function filterRiverMovesByCarryDrop(
  state: GameState,
  legalMoves: Coord[],
  carriedAllyId: string
): Coord[] {
  return legalMoves.filter(
    (dest) => getRiverDropOptions(state, dest, carriedAllyId).length > 0
  );
}

export function applyRiverBoatman(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_BOATMAN);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }
  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const movedAsAction: UnitState = {
    ...spendSlots(unit, costs),
    riverBoatmanMovePending: true,
    riverBoatCarryAllyId: undefined,
  };
  const stateAfterAbility: GameState = {
    ...state,
    units: {
      ...state.units,
      [movedAsAction.id]: movedAsAction,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: movedAsAction.id, abilityId: spec.id }),
  ];

  const carryOptions = getRiverCarryOptions(stateAfterAbility, movedAsAction.id);
  if (carryOptions.length > 0) {
    const requested = requestRiverBoatCarryChoice(
      stateAfterAbility,
      movedAsAction,
      "normal",
      carryOptions
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  let legalTo = getLegalMovesForUnitModes(stateAfterAbility, movedAsAction.id, [
    ...getMovementModes(movedAsAction),
  ]);
  if (movedAsAction.riverBoatCarryAllyId) {
    legalTo = filterRiverMovesByCarryDrop(
      stateAfterAbility,
      legalTo,
      movedAsAction.riverBoatCarryAllyId
    );
  }
  const pendingMove: PendingMove = {
    unitId: movedAsAction.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode: "normal",
  };
  return {
    state: {
      ...stateAfterAbility,
      pendingMove,
    },
    events: [
      ...events,
      evMoveOptionsGenerated({
        unitId: movedAsAction.id,
        roll: undefined,
        legalTo,
        mode: "normal",
      }),
    ],
  };
}

export function requestRiverBoatDropDestination(
  state: GameState,
  riverId: string,
  allyId: string,
  options: Coord[]
): ApplyResult {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    river.owner,
    "riverBoatDropDestination",
    {
      riverId,
      allyId,
      options,
    } satisfies RiverBoatDropDestinationContext,
    river.id
  );
}

export function resolveRiverBoatDropDestination(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDropDestinationContext;
  const river = state.units[ctx.riverId];
  const ally = state.units[ctx.allyId];
  if (!river || !ally || !ally.isAlive || !ally.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const options = parseCoordList(ctx.options);
  if (!options.some((coord) => coordsEqual(coord, destination))) {
    return { state, events: [] };
  }
  const occupant = getUnitAt(state, destination);
  if (occupant && occupant.isAlive && occupant.id !== ally.id) {
    return { state, events: [] };
  }

  const moved = !coordsEqual(ally.position, destination);
  const updatedRiver: UnitState =
    river.riverBoatCarryAllyId !== undefined
      ? { ...river, riverBoatCarryAllyId: undefined }
      : river;
  const updatedAlly: UnitState = {
    ...ally,
    position: { ...destination },
  };
  const nextState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
      [updatedAlly.id]: updatedAlly,
    },
  });
  const events: GameEvent[] = moved
    ? [evUnitMoved({ unitId: updatedAlly.id, from: ally.position, to: destination })]
    : [];
  return { state: nextState, events };
}
