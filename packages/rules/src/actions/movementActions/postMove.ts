import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { makeAttackContext, requestRoll } from "../../core";
import { getPolkovodetsSource } from "../heroes/vlad";
import { HERO_LECHY_ID } from "../../heroes";
import {
  getRiverDropOptions,
  isRiverPerson,
  requestRiverBoatDropDestination,
} from "../heroes/riverPerson";
import { requestLechyGuideTravelerPlacement } from "../heroes/lechy";
import { evMoveBlocked } from "../../core";
import { collectRiderPathTargets } from "./rider";

export function maybeRequestRiderPathAttacks(
  originalState: GameState,
  currentState: GameState,
  unit: UnitState,
  from: Coord,
  finalTo: Coord,
  events: GameEvent[],
  riderMovementMode: boolean,
  riderPathFeatureEnabled: boolean
): ApplyResult | null {
  if (!riderMovementMode || !riderPathFeatureEnabled) {
    return null;
  }

  const auraSource =
    getPolkovodetsSource(originalState, unit.id, from) ??
    getPolkovodetsSource(originalState, unit.id, finalTo);
  const targetIds = collectRiderPathTargets(originalState, unit, from, finalTo);
  if (targetIds.length === 0) {
    return null;
  }

  const queue = targetIds.map((defenderId) => ({
    attackerId: unit.id,
    defenderId,
    ignoreRange: true,
    ignoreStealth: true,
    damageBonusSourceId: auraSource ?? undefined,
    kind: "riderPath" as const,
  }));

  const queuedState: GameState = {
    ...currentState,
    pendingCombatQueue: queue,
  };

  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: queue[0].defenderId,
    ignoreRange: true,
    ignoreStealth: true,
    damageBonusSourceId: auraSource ?? undefined,
    consumeSlots: false,
    queueKind: "riderPath",
  });

  const requested = requestRoll(
    queuedState,
    unit.owner,
    "riderPathAttack_attackerRoll",
    ctx,
    unit.id
  );

  return {
    state: requested.state,
    events: [...events, ...requested.events],
  };
}

export function maybeHandleRiverCarryDrop(
  state: GameState,
  updatedUnit: UnitState,
  events: GameEvent[]
): ApplyResult | null {
  if (
    !isRiverPerson(updatedUnit) ||
    !updatedUnit.riverBoatCarryAllyId ||
    !updatedUnit.position
  ) {
    return null;
  }

  const allyId = updatedUnit.riverBoatCarryAllyId;
  const ally = state.units[allyId];
  if (!ally || !ally.isAlive || !ally.position || ally.owner !== updatedUnit.owner) {
    const clearedRiver: UnitState = {
      ...updatedUnit,
      riverBoatCarryAllyId: undefined,
    };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [clearedRiver.id]: clearedRiver,
        },
      },
      events,
    };
  }

  const dropOptions = getRiverDropOptions(state, updatedUnit.position, allyId);
  if (dropOptions.length === 0) {
    return {
      state,
      events: [
        ...events,
        evMoveBlocked({ unitId: updatedUnit.id, reason: "noLegalDestinations" }),
      ],
    };
  }

  const requestedDrop = requestRiverBoatDropDestination(
    state,
    updatedUnit.id,
    allyId,
    dropOptions
  );
  return {
    state: requestedDrop.state,
    events: [...events, ...requestedDrop.events],
  };
}

export function maybeHandleLechyGuideTraveler(
  state: GameState,
  updatedUnit: UnitState,
  events: GameEvent[]
): ApplyResult | null {
  if (
    updatedUnit.heroId !== HERO_LECHY_ID ||
    !updatedUnit.lechyGuideTravelerTargetId
  ) {
    return null;
  }

  const guideResult = requestLechyGuideTravelerPlacement(
    state,
    updatedUnit.id,
    updatedUnit.lechyGuideTravelerTargetId
  );
  if (guideResult.state === state && guideResult.events.length === 0) {
    return null;
  }
  return {
    state: guideResult.state,
    events: [...events, ...guideResult.events],
  };
}
