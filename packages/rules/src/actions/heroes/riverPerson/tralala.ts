import type {
  ApplyResult,
  Coord,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { coordsEqual, getUnitAt } from "../../../board";
import { canDirectlyTargetUnit } from "../../../visibility";
import {
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  getAbilitySpec,
} from "../../../abilities";
import { canCommitAbilityCost, commitAbilityCost } from "../../abilityCosts";
import {
  clearPendingRoll,
  requestRoll,
} from "../../../core";
import { linePath } from "../../../path";
import type {
  RiverTraLaLaDestinationChoiceContext,
  RiverTraLaLaDropDestinationChoiceContext,
  RiverTraLaLaTargetChoiceContext,
} from "../../../pendingRoll/types";
import {
  chebyshev,
  isRiverPerson,
  parseCoordList,
  parsePosition,
  parseTargetId,
} from "./helpers";
import {
  getRiverDropOptions,
  getRiverTraLaLaDestinations,
  getRiverTraLaLaTargetOptions,
} from "./options";

function isCoordAllowed(options: Coord[], coord: Coord): boolean {
  return options.some((option) => coordsEqual(option, coord));
}

export function applyRiverTraLaLa(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (state.pendingRoll || state.pendingMove || !isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_TRA_LA_LA);
  if (!spec) return { state, events: [] };
  if (!canCommitAbilityCost(state, unit.id, spec.id)) {
    return { state, events: [] };
  }

  const targetOptions = getRiverTraLaLaTargetOptions(state, unit.id);
  if (targetOptions.length === 0) {
    return { state, events: [] };
  }

  const updatedRiver: UnitState = {
    ...unit,
    riverBoatCarryAllyId: undefined,
    riverBoatmanMovePending: false,
  };
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
    },
  };
  const requested = requestRoll(
    nextState,
    updatedRiver.owner,
    "riverTraLaLaTargetChoice",
    {
      riverId: updatedRiver.id,
      options: targetOptions,
    } satisfies RiverTraLaLaTargetChoiceContext,
    updatedRiver.id
  );
  return { state: requested.state, events: requested.events };
}

export function resolveRiverTraLaLaTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverTraLaLaTargetChoiceContext;
  const river = state.units[ctx.riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canCommitAbilityCost(state, river.id, ABILITY_RIVER_PERSON_TRA_LA_LA)) {
    return { state, events: [] };
  }

  const targetId = parseTargetId(choice);
  if (!targetId) return { state, events: [] };
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) return { state, events: [] };

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (target.owner === river.owner) {
    return { state, events: [] };
  }
  if (!canDirectlyTargetUnit(state, river.id, target.id)) {
    return { state, events: [] };
  }
  if (chebyshev(target.position, river.position) > 1) {
    return { state, events: [] };
  }

  const destinations = getRiverTraLaLaDestinations(state, river.id, target.id);
  if (destinations.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  return requestRoll(
    clearPendingRoll(state),
    river.owner,
    "riverTraLaLaDestinationChoice",
    {
      riverId: river.id,
      targetId,
      options: destinations,
    } satisfies RiverTraLaLaDestinationChoiceContext,
    river.id
  );
}

export function resolveRiverTraLaLaDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverTraLaLaDestinationChoiceContext;
  const river = state.units[ctx.riverId];
  const target = state.units[ctx.targetId];
  if (
    !river ||
    !river.isAlive ||
    !river.position ||
    !isRiverPerson(river) ||
    !target ||
    !target.isAlive ||
    !target.position
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canCommitAbilityCost(state, river.id, ABILITY_RIVER_PERSON_TRA_LA_LA)) {
    return { state, events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const declaredOptions = parseCoordList(ctx.options);
  const currentOptions = getRiverTraLaLaDestinations(
    state,
    river.id,
    target.id
  );
  if (
    !isCoordAllowed(declaredOptions, destination) ||
    !isCoordAllowed(currentOptions, destination)
  ) {
    return { state, events: [] };
  }
  const path = linePath(river.position, destination);
  if (!path) return { state, events: [] };
  const occupant = getUnitAt(state, destination);
  if (occupant && occupant.isAlive && occupant.id !== target.id) {
    return { state, events: [] };
  }

  const dropOptions = getRiverDropOptions(state, destination, target.id);
  if (dropOptions.length === 0) {
    return { state, events: [] };
  }
  return requestRoll(
    clearPendingRoll(state),
    river.owner,
    "riverTraLaLaDropDestinationChoice",
    {
      riverId: river.id,
      targetId: target.id,
      riverDestination: destination,
      options: dropOptions,
    } satisfies RiverTraLaLaDropDestinationChoiceContext,
    river.id
  );
}

export function resolveRiverTraLaLaDropDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  _rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as RiverTraLaLaDropDestinationChoiceContext;
  const river = state.units[ctx.riverId];
  const target = state.units[ctx.targetId];
  if (
    !river ||
    !river.isAlive ||
    !river.position ||
    !isRiverPerson(river) ||
    !target ||
    !target.isAlive ||
    !target.position ||
    target.owner === river.owner
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canCommitAbilityCost(state, river.id, ABILITY_RIVER_PERSON_TRA_LA_LA)) {
    return { state, events: [] };
  }
  if (!canDirectlyTargetUnit(state, river.id, target.id)) {
    return { state, events: [] };
  }
  if (chebyshev(target.position, river.position) > 1) {
    return { state, events: [] };
  }

  const riverDestination = ctx.riverDestination;
  const destinationOptions = getRiverTraLaLaDestinations(
    state,
    river.id,
    target.id
  );
  if (!isCoordAllowed(destinationOptions, riverDestination)) {
    return { state, events: [] };
  }

  const selectedDrop = parsePosition(choice);
  if (!selectedDrop) return { state, events: [] };
  const declaredDropOptions = parseCoordList(ctx.options);
  if (!isCoordAllowed(declaredDropOptions, selectedDrop)) {
    return { state, events: [] };
  }

  const path = linePath(river.position, riverDestination);
  if (!path) return { state, events: [] };
  const currentDropOptions = getRiverDropOptions(state, riverDestination, target.id);
  if (!isCoordAllowed(currentDropOptions, selectedDrop)) return { state, events: [] };

  const committed = commitAbilityCost(
    state,
    river.id,
    ABILITY_RIVER_PERSON_TRA_LA_LA
  );
  if (!committed.ok) {
    return { state, events: [] };
  }

  const updatedRiver: UnitState = {
    ...committed.unit,
    riverBoatCarryAllyId: undefined,
    riverBoatmanMovePending: false,
  };
  return {
    state: clearPendingRoll({
      ...committed.state,
      units: { ...committed.state.units, [updatedRiver.id]: updatedRiver },
      pendingReactionMovement: {
        source: "tralala", controllerUnitId: river.id, targetUnitId: target.id,
        path, stepIndex: 0, stepReached: false, stopped: false,
        processedReactorIds: [], touchedReactorIds: [], reactionQueue: [],
        dropDestination: selectedDrop,
      },
    }),
    events: committed.events,
  };
}
