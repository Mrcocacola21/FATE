import { EVENT_VISIBILITY, intersectVisibility, movementVisibility } from "../../../model/events/visibility";
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
import {
  canSpendSlots,
  grantMovementActions,
  spendSlots,
} from "../../../turnEconomy";
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

function getBoatOnlyDestinationOptions(state: GameState, riverId: string): Coord[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  return getLegalMovesForUnitModes(state, river.id, getMovementModes(river));
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
    ...grantMovementActions(committed.unit),
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

  return requestRiverBoatCarryChoice(
    state,
    unit,
    "normal",
    getRiverCarryOptions(state, unit.id)
  );
}

export function requestRiverBoatDestinationChoice(
  state: GameState,
  river: UnitState,
  allyId: string | undefined,
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

  if (
    typeof choice === "object" &&
    choice !== null &&
    (choice as { type?: unknown }).type === "riverBoatNoPassenger"
  ) {
    const destinations = getBoatOnlyDestinationOptions(state, river.id);
    if (destinations.length === 0) {
      return { state, events: [] };
    }
    return requestRiverBoatDestinationChoice(
      clearPendingRoll(state),
      river,
      undefined,
      destinations
    );
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
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDestinationChoiceContext;
  const river = state.units[ctx.riverId];
  const ally = ctx.allyId ? state.units[ctx.allyId] : undefined;
  if (
    !river ||
    !river.isAlive ||
    !river.position ||
    !isRiverPerson(river) ||
    (ctx.allyId && (!ally || !ally.isAlive || !ally.position))
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
  const currentOptions = ally
    ? getBoatDestinationOptions(state, river.id, ally.id)
    : getBoatOnlyDestinationOptions(state, river.id);
  if (
    !isCoordAllowed(declaredOptions, destination) ||
    !isCoordAllowed(currentOptions, destination)
  ) {
    return { state, events: [] };
  }

  if (!ally) {
    return resolveBoatMovement(state, river, destination, rng);
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
  riverDestination?: Coord,
  reason?: "movementInterrupted"
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
      phase: reason ? "selectDisembark" : "planDisembark",
      reason,
      interruptionReason: reason ? "stake" : undefined,
      options,
    } satisfies RiverBoatDropDestinationContext,
    river.id
  );
}

function resolveLegacyRiverBoatDropDestination(
  state: GameState,
  ctx: RiverBoatDropDestinationContext,
  choice: ResolveRollChoice | undefined,
  rng: RNG,
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
    ? [evUnitMoved(state, { provenance: { kind: "boat" }, unitId: updatedAlly.id, from: ally.position, to: destination })]
    : [];
  const landing = applyStakeTriggerIfAny(
    nextState, updatedAlly, destination, rng, { entryKind: "landing" },
  );
  return { state: landing.state, events: [...events, ...landing.events] };
}

// Commit movement before checking consequences for the planned passenger drop.
// Planning never consults stakes; traversal and damage use the ordinary movement helpers.
function resolveBoatMovement(
  state: GameState,
  river: UnitState,
  requestedDestination: Coord,
  rng: RNG,
  passengerId?: string,
): ApplyResult & { interrupted: boolean } {
  const from = river.position!;
  const path = linePath(from, requestedDestination);
  const stakeStop = findStakeStopOnPath(
    state,
    river,
    path ? path.slice(1) : [requestedDestination],
  );
  const actualDestination = stakeStop ?? requestedDestination;
  const movedRiver: UnitState = {
    ...spendSlots(river, { move: true }),
    position: { ...actualDestination },
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: passengerId,
  };
  let nextState = clearPendingRoll({
    ...state,
    units: { ...state.units, [river.id]: movedRiver },
  });
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: river.id, abilityId: ABILITY_RIVER_PERSON_BOAT, sourceCell: from,
      recipients: movementVisibility(state, river.id, from).recipients }),
    ...(passengerId ? [{ type: "riverBoatPickup" as const, riverId: river.id, passengerId,
      sourceCell: { ...from }, passengerCell: { ...state.units[passengerId].position! },
      [EVENT_VISIBILITY]: intersectVisibility(movementVisibility(state, river.id, from),
        movementVisibility(state, passengerId, state.units[passengerId].position!)) }] : []),
    evUnitMoved(state, { provenance: { kind: "boat", role: "carrier", phase: "travel", stepIndex: 0 }, unitId: river.id, from, to: actualDestination }),
  ];
  const stakeResult = applyStakeTriggerIfAny(
    nextState,
    movedRiver,
    actualDestination,
    rng,
  );
  if (stakeResult.triggered) {
    nextState = stakeResult.state;
    events.push(...stakeResult.events);
  }
  // A stake on the requested endpoint also changes the outcome and needs confirmation.
  return { state: nextState, events, interrupted: stakeResult.triggered };
}

function failBoatDisembark(
  state: GameState,
  riverId: string,
  passengerId: string,
  reason: "noLegalDestinations" | "carrierDied",
): ApplyResult {
  // There is no forced-placement fallback in the existing Boat rules. Leave the
  // passenger at its original position and terminate only the failed drop phase.
  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [riverId]: { ...state.units[riverId], riverBoatCarryAllyId: undefined },
      },
    }),
    events: [
      { type: "riverBoatDisembarkFailed", riverId, passengerId, reason },
    ],
  };
}

function completeBoatDisembark(
  state: GameState,
  river: UnitState,
  ally: UnitState,
  destination: Coord,
  rng: RNG,
): ApplyResult {
  const events: GameEvent[] = [];
  if (!coordsEqual(ally.position!, destination)) {
    events.push(
      evUnitMoved(state, { provenance: { kind: "boat", role: "passenger", phase: "drop", stepIndex: 1 }, unitId: ally.id, from: ally.position!, to: destination }),
    );
  }
  const landedAlly: UnitState = { ...ally, position: { ...destination } };
  const nextState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [river.id]: { ...river, riverBoatCarryAllyId: undefined },
      [ally.id]: landedAlly,
    },
  });
  const landing = applyStakeTriggerIfAny(
    nextState, landedAlly, destination, rng, { entryKind: "landing" },
  );
  events.push({ type: "riverBoatDisembarked", riverId: river.id, passengerId: ally.id,
    riverDestination: { ...river.position! }, dropDestination: { ...destination },
    [EVENT_VISIBILITY]: intersectVisibility(movementVisibility(state, river.id, river.position!),
      movementVisibility(state, ally.id, ally.position!, destination)) });
  events.push(...landing.events);
  events.push({
    type: "riverBoatResolved",
    [EVENT_VISIBILITY]: intersectVisibility(
      movementVisibility(state, river.id, river.position!),
      movementVisibility(state, ally.id, ally.position!, destination),
    ),
    riverId: river.id,
    passengerId: ally.id,
    riverDestination: { ...river.position! },
    dropDestination: { ...destination },
  });
  return {
    state: landing.state,
    events,
  };
}

export function resolveRiverBoatDropDestination(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG,
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDropDestinationContext;
  if (!ctx.riverDestination) {
    return resolveLegacyRiverBoatDropDestination(state, ctx, choice, rng);
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
  // Movement has already been paid for during interrupted movement. This is a
  // forced continuation of the same ability, with no movement/cost validation.
  if (ctx.phase === "selectDisembark") {
    const destination = parsePosition(choice);
    if (!destination) return { state, events: [] };
    const currentOptions = getRiverDropOptions(state, river.position, ally.id);
    if (
      !isCoordAllowed(parseCoordList(ctx.options), destination) ||
      !isCoordAllowed(currentOptions, destination)
    ) {
      return { state, events: [] };
    }
    return completeBoatDisembark(state, river, ally, destination, rng);
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
  const destinationOptions = getBoatDestinationOptions(
    state,
    river.id,
    ally.id,
  );
  if (!isCoordAllowed(destinationOptions, riverDestination)) {
    return { state, events: [] };
  }

  // Validate the click against the planned destination, before resolving any
  // hidden hazards. A hidden stake must never reject an otherwise legal plan.
  const plannedDropOptions = getRiverDropOptions(
    state,
    riverDestination,
    ally.id,
  );
  if (!isCoordAllowed(plannedDropOptions, selectedDrop)) {
    return { state, events: [] };
  }
  const dropOccupant = getUnitAt(state, selectedDrop);
  if (dropOccupant && dropOccupant.isAlive && dropOccupant.id !== ally.id) {
    return { state, events: [] };
  }

  const movement = resolveBoatMovement(
    state,
    river,
    riverDestination,
    rng,
    ally.id,
  );
  const actualRiver = movement.state.units[river.id];
  let continuation: ApplyResult;
  if (!actualRiver.isAlive || !actualRiver.position) {
    continuation = failBoatDisembark(
      movement.state,
      river.id,
      ally.id,
      "carrierDied",
    );
  } else if (movement.interrupted) {
    const options = getRiverDropOptions(
      movement.state,
      actualRiver.position,
      ally.id,
    );
    continuation =
      options.length > 0
        ? requestRiverBoatDropDestination(
            movement.state,
            river.id,
            ally.id,
            options,
            actualRiver.position,
            "movementInterrupted",
          )
        : failBoatDisembark(
            movement.state,
            river.id,
            ally.id,
            "noLegalDestinations",
          );
  } else {
    continuation = completeBoatDisembark(
      movement.state,
      actualRiver,
      ally,
      selectedDrop,
      rng,
    );
  }
  return {
    state: continuation.state,
    events: [...movement.events, ...continuation.events],
  };
}
