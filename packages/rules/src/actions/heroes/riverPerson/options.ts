import type { Coord, GameState } from "../../../model";
import { isInsideBoard } from "../../../model";
import { addCoord, ALL_DIRS, getUnitAt } from "../../../board";
import { canDirectlyTargetUnit } from "../../../visibility";
import { chebyshev, isRiverPerson, sortUnitsByReadingOrder } from "./helpers";

export function getRiverCarryOptions(state: GameState, riverId: string): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const options = Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === river.id) return false;
      if (unit.owner !== river.owner) return false;
      return chebyshev(unit.position, river.position!) <= 1;
    })
    .map((unit) => unit.id);
  return sortUnitsByReadingOrder(state, options);
}

export function getRiverDropOptions(
  state: GameState,
  finalPosition: Coord,
  carriedAllyId: string
): Coord[] {
  const options: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const cell = addCoord(finalPosition, dir);
    if (!isInsideBoard(cell, state.boardSize)) continue;
    const occupant = getUnitAt(state, cell);
    if (occupant && occupant.isAlive && occupant.id !== carriedAllyId) {
      continue;
    }
    options.push(cell);
  }
  return options;
}

export function getRiverTraLaLaTargetOptions(
  state: GameState,
  riverId: string
): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const targets = Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === river.owner) return false;
      if (!canDirectlyTargetUnit(state, river.id, unit.id)) return false;
      return chebyshev(unit.position, river.position!) <= 1;
    })
    .map((unit) => unit.id);
  return sortUnitsByReadingOrder(state, targets);
}

export function getRiverTraLaLaDestinations(
  state: GameState,
  riverId: string,
  draggedTargetId?: string
): Coord[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const options: Coord[] = [];
  for (const dir of ALL_DIRS) {
    let cursor = addCoord(river.position, dir);
    while (isInsideBoard(cursor, state.boardSize)) {
      const occupant = getUnitAt(state, cursor);
      const finalCellAvailable =
        !occupant || occupant.id === draggedTargetId || !occupant.isAlive;
      if (
        finalCellAvailable &&
        (!draggedTargetId ||
          getRiverDropOptions(state, cursor, draggedTargetId).length > 0)
      ) {
        options.push({ ...cursor });
      }
      cursor = addCoord(cursor, dir);
    }
  }
  return options;
}
