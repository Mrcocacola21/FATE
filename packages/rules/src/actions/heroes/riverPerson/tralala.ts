import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingCombatQueueEntry,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { coordsEqual, getUnitAt } from "../../../board";
import { canAttackTarget } from "../../../combat";
import { canDirectlyTargetUnit } from "../../../visibility";
import {
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  getAbilitySpec,
} from "../../../abilities";
import { canCommitAbilityCost, commitAbilityCost } from "../../abilityCosts";
import {
  applyStakeTriggerIfAny,
  clearPendingRoll,
  evUnitMoved,
  findStakeStopOnPath,
  makeAttackContext,
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

interface TouchedAlly {
  allyId: string;
  contactIndex: number;
  contactCell: Coord;
}

function getRiverTraLaLaTouchedAllies(
  state: GameState,
  riverId: string,
  draggedTargetId: string,
  from: Coord,
  to: Coord
): TouchedAlly[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position) return [];
  const path = linePath(from, to);
  if (!path || path.length === 0) return [];

  const touched = new Map<string, TouchedAlly>();
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === river.id || unit.id === draggedTargetId) continue;
    if (unit.owner !== river.owner) continue;
    if (river.riverBoatCarryAllyId && unit.id === river.riverBoatCarryAllyId) {
      continue;
    }
    for (let index = 0; index < path.length; index += 1) {
      const step = path[index]!;
      if (chebyshev(unit.position, step) <= 1) {
        touched.set(unit.id, {
          allyId: unit.id,
          contactIndex: index,
          contactCell: { ...step },
        });
        break;
      }
    }
  }

  return Array.from(touched.values()).sort((a, b) => {
    if (a.contactIndex !== b.contactIndex) {
      return a.contactIndex - b.contactIndex;
    }
    const unitA = state.units[a.allyId];
    const unitB = state.units[b.allyId];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (posA && posB) {
      if (posA.row !== posB.row) return posA.row - posB.row;
      if (posA.col !== posB.col) return posA.col - posB.col;
    }
    return a.allyId.localeCompare(b.allyId);
  });
}

function isCoordAllowed(options: Coord[], coord: Coord): boolean {
  return options.some((option) => coordsEqual(option, coord));
}

function canTouchedAllyAttackDraggedTarget(
  state: GameState,
  ally: UnitState,
  target: UnitState,
  contactCell: Coord
): boolean {
  if (!ally.isAlive || !ally.position || !target.isAlive) return false;
  if (!canDirectlyTargetUnit(state, ally.id, target.id)) return false;
  const targetAtContact: UnitState = {
    ...target,
    position: { ...contactCell },
  };
  const stateAtContact: GameState = {
    ...state,
    units: {
      ...state.units,
      [targetAtContact.id]: targetAtContact,
    },
  };
  return canAttackTarget(stateAtContact, ally, targetAtContact);
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

function buildTraLaLaAttackQueue(
  originalState: GameState,
  currentState: GameState,
  riverId: string,
  targetId: string,
  from: Coord,
  to: Coord
): PendingCombatQueueEntry[] {
  const target = currentState.units[targetId];
  if (!target || !target.isAlive || !target.position) return [];
  const touchedAllies = getRiverTraLaLaTouchedAllies(
    originalState,
    riverId,
    targetId,
    from,
    to
  );
  const queue: PendingCombatQueueEntry[] = [];
  for (const touched of touchedAllies) {
    const ally = currentState.units[touched.allyId];
    if (!ally || !ally.isAlive || !ally.position) continue;
    if (
      !canTouchedAllyAttackDraggedTarget(
        currentState,
        ally,
        target,
        touched.contactCell
      )
    ) {
      continue;
    }
    queue.push({
      attackerId: ally.id,
      defenderId: target.id,
      ignoreRange: true,
      consumeSlots: false,
      kind: "aoe",
    });
  }
  return queue;
}

export function resolveRiverTraLaLaDropDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
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
  const stakeStop = findStakeStopOnPath(state, river, path.slice(1));
  const finalRiverPosition = stakeStop ?? riverDestination;
  const currentDropOptions = getRiverDropOptions(state, finalRiverPosition, target.id);
  if (!isCoordAllowed(currentDropOptions, selectedDrop)) {
    return { state, events: [] };
  }
  const dropOccupant = getUnitAt(state, selectedDrop);
  if (dropOccupant && dropOccupant.isAlive && dropOccupant.id !== target.id) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(
    state,
    river.id,
    ABILITY_RIVER_PERSON_TRA_LA_LA
  );
  if (!committed.ok) {
    return { state, events: [] };
  }

  const movedRiver: UnitState = {
    ...committed.unit,
    position: { ...finalRiverPosition },
    riverBoatCarryAllyId: undefined,
    riverBoatmanMovePending: false,
  };
  const movedTarget: UnitState = {
    ...target,
    position: { ...selectedDrop },
  };

  let nextState = clearPendingRoll({
    ...committed.state,
    units: {
      ...committed.state.units,
      [movedRiver.id]: movedRiver,
      [movedTarget.id]: movedTarget,
    },
  });
  let events: GameEvent[] = [...committed.events];
  if (!coordsEqual(river.position, movedRiver.position!)) {
    events.push(
      evUnitMoved({ unitId: river.id, from: river.position, to: movedRiver.position! })
    );
  }
  if (!coordsEqual(target.position, movedTarget.position!)) {
    events.push(
      evUnitMoved({
        unitId: target.id,
        from: target.position,
        to: movedTarget.position!,
      })
    );
  }

  if (!coordsEqual(river.position, movedRiver.position!)) {
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

  const queue = buildTraLaLaAttackQueue(
    state,
    nextState,
    movedRiver.id,
    movedTarget.id,
    river.position,
    movedRiver.position ?? finalRiverPosition
  );
  if (queue.length === 0) {
    return { state: nextState, events };
  }

  nextState = {
    ...nextState,
    pendingCombatQueue: queue,
  };

  const first = queue[0]!;
  const requested = requestRoll(
    nextState,
    nextState.units[first.attackerId].owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: first.attackerId,
      defenderId: first.defenderId,
      ignoreRange: true,
      consumeSlots: false,
      queueKind: "aoe",
    }),
    first.attackerId
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}
