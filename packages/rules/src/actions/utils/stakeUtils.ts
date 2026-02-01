import type { Coord, GameEvent, GameState, StakeMarker, UnitState } from "../../model";
import { coordsEqual, getUnitAt } from "../../board";
import { revealUnit } from "../../stealth";
import type { RNG } from "../../rng";
import { isUnitVisibleToPlayer } from "../shared";
import { evStakeTriggered, evUnitDied } from "./events";

export function getLegalStakePositions(
  state: GameState,
  owner: "P1" | "P2"
): Coord[] {
  const positions: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const pos = { col, row };
      if (hasRevealedStakeAt(state, pos)) {
        continue;
      }
      const unit = getUnitAt(state, pos);
      if (unit && !unit.isStealthed) {
        continue;
      }
      positions.push(pos);
    }
  }
  return positions;
}

export function getStakeMarkersAt(
  state: GameState,
  position: Coord
): StakeMarker[] {
  return state.stakeMarkers.filter((marker) =>
    coordsEqual(marker.position, position)
  );
}

export function hasRevealedStakeAt(state: GameState, position: Coord): boolean {
  return getStakeMarkersAt(state, position).some((marker) => marker.isRevealed);
}

export function isStakeBlockedByHiddenUnit(
  state: GameState,
  position: Coord,
  ignoreUnitId?: string
): boolean {
  const occupant = getUnitAt(state, position);
  if (!occupant || !occupant.isAlive || !occupant.isStealthed) {
    return false;
  }
  if (ignoreUnitId && occupant.id === ignoreUnitId) {
    return false;
  }
  return true;
}

export function findStakeStopOnPath(
  state: GameState,
  unit: UnitState,
  path: Coord[]
): Coord | null {
  for (const cell of path) {
    const markers = getStakeMarkersAt(state, cell);
    if (markers.length === 0) continue;
    if (isStakeBlockedByHiddenUnit(state, cell)) continue;
    const canSeeMover = markers.some((marker) =>
      isUnitVisibleToPlayer(state, unit, marker.owner)
    );
    if (!canSeeMover) continue;
    return cell;
  }
  return null;
}

export function applyStakeTriggerIfAny(
  state: GameState,
  unit: UnitState,
  destination: Coord,
  rng: RNG
): { state: GameState; events: GameEvent[]; unit: UnitState; triggered: boolean } {
  const markers = getStakeMarkersAt(state, destination);
  if (markers.length === 0) {
    return { state, events: [], unit, triggered: false };
  }
  if (isStakeBlockedByHiddenUnit(state, destination, unit.id)) {
    return { state, events: [], unit, triggered: false };
  }

  const canSeeMover = markers.some((marker) =>
    isUnitVisibleToPlayer(state, unit, marker.owner)
  );
  if (!canSeeMover) {
    return { state, events: [], unit, triggered: false };
  }

  const revealedIds = markers.map((marker) => marker.id);
  let nextState: GameState = {
    ...state,
    stakeMarkers: state.stakeMarkers.map((marker) =>
      coordsEqual(marker.position, destination)
        ? { ...marker, isRevealed: true }
        : marker
    ),
    units: {
      ...state.units,
      [unit.id]: unit,
    },
  };
  let updatedUnit = unit;
  const events: GameEvent[] = [];

  const newHp = Math.max(0, updatedUnit.hp - 1);
  updatedUnit = {
    ...updatedUnit,
    hp: newHp,
  };

  if (newHp <= 0) {
    updatedUnit = {
      ...updatedUnit,
      isAlive: false,
      position: null,
    };
    events.push(
      evUnitDied({
        unitId: updatedUnit.id,
        killerId: null,
      })
    );
  }

  nextState = {
    ...nextState,
    units: {
      ...nextState.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  if (updatedUnit.isAlive && updatedUnit.isStealthed) {
    const revealed = revealUnit(nextState, updatedUnit.id, "stakeTriggered", rng);
    nextState = revealed.state;
    events.push(...revealed.events);
    updatedUnit = nextState.units[updatedUnit.id] ?? updatedUnit;
  }

  events.push(
    evStakeTriggered({
      markerPos: destination,
      unitId: unit.id,
      damage: 1,
      stopped: true,
      stakeIdsRevealed: revealedIds,
    })
  );

  return { state: nextState, events, unit: updatedUnit, triggered: true };
}

export function consumeOldestStakes(
  state: GameState,
  owner: "P1" | "P2",
  count: number
): { state: GameState; removed: StakeMarker[] } {
  const owned = state.stakeMarkers
    .filter((marker) => marker.owner === owner)
    .sort((a, b) => a.createdAt - b.createdAt);
  const removed = owned.slice(0, count);
  const removedIds = new Set(removed.map((marker) => marker.id));
  const remaining = state.stakeMarkers.filter(
    (marker) => !removedIds.has(marker.id)
  );
  return {
    state: { ...state, stakeMarkers: remaining },
    removed,
  };
}
