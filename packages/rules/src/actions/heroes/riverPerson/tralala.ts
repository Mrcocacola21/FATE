import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import { coordsEqual, getUnitAt } from "../../../board";
import { canAttackTarget } from "../../../combat";
import { canDirectlyTargetUnit } from "../../../visibility";
import {
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../core";
import { evAbilityUsed, evUnitMoved } from "../../../core";
import { linePath } from "../../../path";
import type {
  RiverTraLaLaDestinationChoiceContext,
  RiverTraLaLaTargetChoiceContext,
} from "../../../pendingRoll/types";
import { chebyshev, isRiverPerson, parseCoordList, parsePosition, parseTargetId, sortUnitsByReadingOrder } from "./helpers";
import { getRiverTraLaLaDestinations, getRiverTraLaLaTargetOptions } from "./options";

function getRiverTraLaLaTouchedAllies(
  state: GameState,
  riverId: string,
  from: Coord,
  to: Coord
): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position) return [];
  const path = linePath(from, to);
  if (!path || path.length === 0) return [];

  const touched = new Set<string>();
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === river.id) continue;
    if (unit.owner !== river.owner) continue;
    for (const step of path) {
      if (chebyshev(unit.position, step) <= 1) {
        touched.add(unit.id);
        break;
      }
    }
  }

  return sortUnitsByReadingOrder(state, Array.from(touched));
}

export function applyRiverTraLaLa(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_TRA_LA_LA);
  if (!spec) return { state, events: [] };
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const targetOptions = getRiverTraLaLaTargetOptions(state, unit.id);
  if (targetOptions.length === 0) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) return { state, events: [] };

  const updatedRiver: UnitState = {
    ...spendSlots(spent.unit, costs),
    riverBoatCarryAllyId: undefined,
  };
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedRiver.id, abilityId: spec.id }),
  ];
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
  return { state: requested.state, events: [...events, ...requested.events] };
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
  if (chebyshev(target.position, river.position) > 1) {
    return { state, events: [] };
  }

  const destinations = getRiverTraLaLaDestinations(state, river.id);
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
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const target = state.units[ctx.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const allowed = parseCoordList(ctx.options).some((coord) =>
    coordsEqual(coord, destination)
  );
  if (!allowed) return { state, events: [] };
  if (getUnitAt(state, destination)) return { state, events: [] };

  const from = { ...river.position };
  const movedRiver: UnitState = {
    ...river,
    position: { ...destination },
    riverBoatCarryAllyId: undefined,
  };

  let nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [movedRiver.id]: movedRiver,
    },
  });
  const events: GameEvent[] = [
    evUnitMoved({ unitId: movedRiver.id, from, to: movedRiver.position! }),
  ];

  const touchedAllies = getRiverTraLaLaTouchedAllies(
    state,
    movedRiver.id,
    from,
    movedRiver.position!
  );
  const queue = touchedAllies
    .map((allyId) => nextState.units[allyId])
    .filter((ally): ally is UnitState => !!ally && !!ally.position && ally.isAlive)
    .filter((ally) => canDirectlyTargetUnit(nextState, ally.id, target.id))
    .filter((ally) => canAttackTarget(nextState, ally, target))
    .filter((ally) => canSpendSlots(ally, { attack: true, action: true }))
    .map((ally) => ({
      attackerId: ally.id,
      defenderId: target.id,
      consumeSlots: true,
      kind: "aoe" as const,
    }));

  if (queue.length === 0) {
    return { state: nextState, events };
  }

  nextState = {
    ...nextState,
    pendingCombatQueue: queue,
  };

  const first = queue[0];
  const requested = requestRoll(
    nextState,
    nextState.units[first.attackerId].owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: first.attackerId,
      defenderId: first.defenderId,
      consumeSlots: true,
      queueKind: "aoe",
    }),
    first.attackerId
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}
