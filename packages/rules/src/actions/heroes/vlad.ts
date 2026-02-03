import type { Coord, GameEvent, GameState, PlayerId, UnitState } from "../../model";
import { chebyshev, getUnitAt } from "../../board";
import { clearPendingRoll, requestRoll } from "../utils/rollUtils";
import {
  isVlad,
  isElCid,
  isGenghis,
  getAdjacentEmptyCells,
  isUnitVisibleToPlayer,
} from "../shared";
import {
  getLegalStakePositions,
  consumeOldestStakes,
  getStakeMarkersAt,
  hasRevealedStakeAt,
  isStakeBlockedByHiddenUnit,
} from "../utils/stakeUtils";
import type { ApplyResult } from "../../model";
import type { IntimidateResume } from "../types";
import { evForestActivated, evIntimidateTriggered } from "../utils/events";

export function getPolkovodetsSource(
  state: GameState,
  attackerId: string,
  positionOverride?: Coord
): string | null {
  const attacker = state.units[attackerId];
  if (!attacker || !attacker.position) return null;
  if (isVlad(attacker) || isElCid(attacker) || isGenghis(attacker)) return null;

  const origin = positionOverride ?? attacker.position;
  const candidates = Object.values(state.units)
    .filter(
      (unit) =>
        unit.isAlive &&
        unit.position &&
        unit.owner === attacker.owner &&
        (isVlad(unit) || isElCid(unit) || isGenghis(unit)) &&
        unit.id !== attacker.id &&
        chebyshev(origin, unit.position) <= 1
    )
    .map((unit) => unit.id)
    .sort();

  return candidates.length > 0 ? candidates[0] : null;
}

export function requestVladStakesPlacement(
  state: GameState,
  owner: PlayerId,
  reason: "battleStart" | "turnStart",
  queue?: PlayerId[]
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const legalPositions = getLegalStakePositions(state, owner);
  const requested = requestRoll(
    state,
    owner,
    "vladPlaceStakes",
    {
      owner,
      count: 3,
      reason,
      legalPositions,
      queue: queue ?? [],
    },
    undefined
  );
  return requested;
}

export function maybeRequestIntimidate(
  state: GameState,
  attackerId: string,
  defenderId: string,
  baseEvents: GameEvent[],
  resume: IntimidateResume = { kind: "none" }
): { state: GameState; events: GameEvent[]; requested: boolean } {
  const defender = state.units[defenderId];
  const attacker = state.units[attackerId];
  if (!defender || !attacker) {
    return { state, events: baseEvents, requested: false };
  }

  if (!isVlad(defender) || !defender.isAlive || !defender.position) {
    return { state, events: baseEvents, requested: false };
  }

  const attackEvent = baseEvents.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attackerId &&
      event.defenderId === defenderId
  );
  if (!attackEvent || attackEvent.type !== "attackResolved" || attackEvent.hit) {
    return { state, events: baseEvents, requested: false };
  }

  if (!attacker.isAlive || !attacker.position) {
    return { state, events: baseEvents, requested: false };
  }

  const options = getAdjacentEmptyCells(state, attacker.position);
  if (options.length === 0) {
    return { state, events: baseEvents, requested: false };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    defender.owner,
    "vladIntimidateChoice",
    {
      defenderId,
      attackerId,
      options,
      resume,
    },
    defender.id
  );

  const events: GameEvent[] = [
    ...baseEvents,
    evIntimidateTriggered({ defenderId, attackerId, options }),
    ...requested.events,
  ];

  return { state: requested.state, events, requested: true };
}

export function shouldOfferVladStakes(unit: UnitState): boolean {
  return isVlad(unit) && (unit.ownTurnsStarted ?? 0) >= 2;
}

export function activateVladForest(
  state: GameState,
  unitId: string,
  owner: PlayerId
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }

  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === owner
  );
  if (ownedStakes.length < 9) {
    return { state, events: [] };
  }

  const consumed = consumeOldestStakes(state, owner, 9);
  const cleared = clearPendingRoll(consumed.state);

  const activatedEvents: GameEvent[] = [
    evForestActivated({ vladId: unitId, stakesConsumed: 9 }),
  ];

  const requested = requestRoll(
    cleared,
    owner,
    "vladForestTarget",
    {
      unitId,
      owner,
    },
    unitId
  );

  return {
    state: requested.state,
    events: [...activatedEvents, ...requested.events],
  };
}

export function maybeTriggerVladForestChoice(
  state: GameState,
  unitId: string,
  requireStakePlacement = false
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !isVlad(unit)) {
    return { state, events: [] };
  }

  if (requireStakePlacement && !shouldOfferVladStakes(unit)) {
    return { state, events: [] };
  }

  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === unit.owner
  ).length;
  if (ownedStakes < 9) {
    return { state, events: [] };
  }

  return activateVladForest(state, unit.id, unit.owner);
}

export function maybeTriggerVladTurnStakes(
  state: GameState,
  unitId: string
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !shouldOfferVladStakes(unit)) {
    return { state, events: [] };
  }

  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === unit.owner
  ).length;
  if (ownedStakes >= 9) {
    return { state, events: [] };
  }

  return requestVladStakesPlacement(state, unit.owner, "turnStart");
}

