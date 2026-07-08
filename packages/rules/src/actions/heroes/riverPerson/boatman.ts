import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { coordsEqual, getUnitAt } from "../../../board";
import {
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  getAbilitySpec,
} from "../../../abilities";
import { getLegalMovesForUnitModes } from "../../../movement";
import { linePath } from "../../../path";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import {
  applyStakeTriggerIfAny,
  clearPendingRoll,
  evAbilityUsed,
  evUnitMoved,
  findStakeStopOnPath,
  requestRoll,
} from "../../../core";
import type {
  RiverBoatCarryChoiceContext,
  RiverBoatDestinationChoiceContext,
  RiverBoatDropDestinationContext,
} from "../../../pendingRoll/types";
import { getMovementModes } from "../../shared";
import { canCommitAbilityCost, commitAbilityCost } from "../../abilityCosts";
import {
  chebyshev,
  isRiverPerson,
  parseCoordList,
  parsePosition,
  parseTargetId,
} from "./helpers";
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

function getBoatDestinationOptions(
  state: GameState,
  riverId: string,
  allyId: string
): Coord[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const ally = state.units[allyId];
  if (!ally || !ally.isAlive || !ally.position || ally.owner !== river.owner) {
    return [];
  }
  if (chebyshev(ally.position, river.position) > 1) {
    return [];
  }
  const modes = getMovementModes(river);
  return filterRiverMovesByCarryDrop(
    state,
    getLegalMovesForUnitModes(state, river.id, modes),
    ally.id
  );
}

function isCoordAllowed(options: Coord[], coord: Coord): boolean {
  return options.some((option) => coordsEqual(option, coord));
}

export function applyRiverBoatman(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (state.pendingRoll || state.pendingMove || !isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_BOATMAN);
  if (!spec) {
    return { state, events: [] };
  }
  if (!canCommitAbilityCost(state, unit.id, spec.id)) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) {
    return { state, events: [] };
  }

  const updatedRiver: UnitState = {
    ...committed.unit,
    riverBoatmanExtraMoves: (committed.unit.riverBoatmanExtraMoves ?? 0) + 1,
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: undefined,
  };
  return {
    state: {
      ...committed.state,
      units: {
        ...committed.state.units,
        [updatedRiver.id]: updatedRiver,
      },
    },
    events: [
      ...committed.events,
      {
        type: "riverBoatmanGranted" as const,
        riverId: updatedRiver.id,
        extraMoves: updatedRiver.riverBoatmanExtraMoves ?? 0,
      },
    ],
  };
}

export function applyRiverBoat(state: GameState, unit: UnitState): ApplyResult {
  if (state.pendingRoll || state.pendingMove || !isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  if (!canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }
  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const carryOptions = getRiverCarryOptions(state, unit.id);
  if (carryOptions.length === 0) {
    return { state, events: [] };
  }
  return requestRiverBoatCarryChoice(state, unit, "normal", carryOptions);
}

export function requestRiverBoatDestinationChoice(
  state: GameState,
  river: UnitState,
  allyId: string,
  options: Coord[]
): ApplyResult {
  return requestRoll(
    state,
    river.owner,
    "riverBoatDestinationChoice",
    {
      riverId: river.id,
      allyId,
      options,
    } satisfies RiverBoatDestinationChoiceContext,
    river.id
  );
}

export function resolveRiverBoatCarryChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatCarryChoiceContext;
  const river = state.units[ctx.riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(river, { move: true })) {
    return { state, events: [] };
  }

  const selectedAllyId = parseTargetId(choice);
  if (!selectedAllyId) {
    return { state, events: [] };
  }
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(selectedAllyId)) {
    return { state, events: [] };
  }
  const ally = state.units[selectedAllyId];
  if (!ally || !ally.isAlive || !ally.position || ally.owner !== river.owner) {
    return { state, events: [] };
  }
  if (chebyshev(ally.position, river.position) > 1) {
    return { state, events: [] };
  }

  const destinations = getBoatDestinationOptions(state, river.id, ally.id);
  if (destinations.length === 0) {
    return { state, events: [] };
  }
  return requestRiverBoatDestinationChoice(
    clearPendingRoll(state),
    river,
    ally.id,
    destinations
  );
}

export function resolveRiverBoatDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDestinationChoiceContext;
  const river = state.units[ctx.riverId];
  const ally = state.units[ctx.allyId];
  if (
    !river ||
    !river.isAlive ||
    !river.position ||
    !isRiverPerson(river) ||
    !ally ||
    !ally.isAlive ||
    !ally.position
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(river, { move: true })) {
    return { state, events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const declaredOptions = parseCoordList(ctx.options);
  const currentOptions = getBoatDestinationOptions(state, river.id, ally.id);
  if (
    !isCoordAllowed(declaredOptions, destination) ||
    !isCoordAllowed(currentOptions, destination)
  ) {
    return { state, events: [] };
  }

  const dropOptions = getRiverDropOptions(state, destination, ally.id);
  if (dropOptions.length === 0) {
    return { state, events: [] };
  }
  return requestRiverBoatDropDestination(
    clearPendingRoll(state),
    river.id,
    ally.id,
    dropOptions,
    destination
  );
}

export function requestRiverBoatDropDestination(
  state: GameState,
  riverId: string,
  allyId: string,
  options: Coord[],
  riverDestination?: Coord
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
      riverDestination,
      options,
    } satisfies RiverBoatDropDestinationContext,
    river.id
  );
}

function resolveLegacyRiverBoatDropDestination(
  state: GameState,
  ctx: RiverBoatDropDestinationContext,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const river = state.units[ctx.riverId];
  const ally = state.units[ctx.allyId];
  if (!river || !ally || !ally.isAlive || !ally.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const options = parseCoordList(ctx.options);
  if (!isCoordAllowed(options, destination)) {
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

export function resolveRiverBoatDropDestination(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng?: RNG
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDropDestinationContext;
  if (!ctx.riverDestination) {
    return resolveLegacyRiverBoatDropDestination(state, ctx, choice);
  }

  const river = state.units[ctx.riverId];
  const ally = state.units[ctx.allyId];
  if (
    !river ||
    !river.isAlive ||
    !river.position ||
    !isRiverPerson(river) ||
    !ally ||
    !ally.isAlive ||
    !ally.position ||
    ally.owner !== river.owner
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(river, { move: true })) {
    return { state, events: [] };
  }
  if (chebyshev(ally.position, river.position) > 1) {
    return { state, events: [] };
  }

  const selectedDrop = parsePosition(choice);
  if (!selectedDrop) return { state, events: [] };
  const declaredDropOptions = parseCoordList(ctx.options);
  if (!isCoordAllowed(declaredDropOptions, selectedDrop)) {
    return { state, events: [] };
  }

  const riverDestination = ctx.riverDestination;
  const destinationOptions = getBoatDestinationOptions(state, river.id, ally.id);
  if (!isCoordAllowed(destinationOptions, riverDestination)) {
    return { state, events: [] };
  }

  const path = linePath(river.position, riverDestination);
  const stakePath = path ? path.slice(1) : [riverDestination];
  const stakeStop = rng ? findStakeStopOnPath(state, river, stakePath) : null;
  const finalRiverPosition = stakeStop ?? riverDestination;
  const currentDropOptions = getRiverDropOptions(state, finalRiverPosition, ally.id);
  if (!isCoordAllowed(currentDropOptions, selectedDrop)) {
    return { state, events: [] };
  }
  const dropOccupant = getUnitAt(state, selectedDrop);
  if (dropOccupant && dropOccupant.isAlive && dropOccupant.id !== ally.id) {
    return { state, events: [] };
  }

  const riverAfterCost = spendSlots(river, { move: true });
  const movedRiver: UnitState = {
    ...riverAfterCost,
    position: { ...finalRiverPosition },
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: undefined,
  };
  const movedAlly: UnitState = {
    ...ally,
    position: { ...selectedDrop },
  };
  let nextState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [movedRiver.id]: movedRiver,
      [movedAlly.id]: movedAlly,
    },
  });
  let events: GameEvent[] = [evAbilityUsed({ unitId: river.id, abilityId: ABILITY_RIVER_PERSON_BOAT })];
  if (!coordsEqual(river.position, movedRiver.position!)) {
    events.push(
      evUnitMoved({ unitId: river.id, from: river.position, to: movedRiver.position! })
    );
  }
  if (!coordsEqual(ally.position, movedAlly.position!)) {
    events.push(
      evUnitMoved({ unitId: ally.id, from: ally.position, to: movedAlly.position! })
    );
  }

  if (rng && !coordsEqual(river.position, movedRiver.position!)) {
    const stakeResult = applyStakeTriggerIfAny(
      nextState,
      movedRiver,
      movedRiver.position!,
      rng
    );
    if (stakeResult.triggered) {
      nextState = stakeResult.state;
      events = [...events, ...stakeResult.events];
    }
  }

  events.push({
    type: "riverBoatResolved" as const,
    riverId: river.id,
    passengerId: ally.id,
    riverDestination: movedRiver.position!,
    dropDestination: movedAlly.position!,
  });

  return { state: nextState, events };
}
