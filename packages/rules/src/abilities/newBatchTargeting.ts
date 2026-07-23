import type { AbilityTargetingView, Coord, GameState, UnitState } from "../model";
import { chebyshev, coordsEqual, isCellOccupied } from "../board";
import { isInsideBoard } from "../model";
import { linePath } from "../path";
import { canDirectlyTargetUnit } from "../visibility";

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

function directionFrom(from: Coord, toward: Coord): Coord | null {
  const path = linePath(from, toward);
  if (!path || path.length < 2) return null;
  return { col: path[1].col - from.col, row: path[1].row - from.row };
}

export function getLucheLightRayCells(state: GameState, unit: UnitState): Coord[] {
  if (!unit.position) return [];
  const cells: Coord[] = [];
  for (let dc = -1; dc <= 1; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (dc === 0 && dr === 0) continue;
      let cell = { col: unit.position.col + dc, row: unit.position.row + dr };
      while (isInsideBoard(cell, state.boardSize)) {
        if (!unit.blindUntilOwnTurnStart || chebyshev(unit.position, cell) <= 1) {
          cells.push(cell);
        }
        cell = { col: cell.col + dc, row: cell.row + dr };
      }
    }
  }
  return cells;
}

export function getLucheLightRayLine(
  state: GameState,
  unit: UnitState,
  target: Coord,
): Coord[] {
  if (!unit.position || !getLucheLightRayCells(state, unit).some((cell) => coordKey(cell) === coordKey(target))) {
    return [];
  }
  const direction = directionFrom(unit.position, target);
  if (!direction) return [];
  const cells: Coord[] = [];
  let cell = { col: unit.position.col + direction.col, row: unit.position.row + direction.row };
  while (isInsideBoard(cell, state.boardSize)) {
    cells.push(cell);
    cell = { col: cell.col + direction.col, row: cell.row + direction.row };
  }
  return cells;
}

export function getLucheLightRayAroundSelfCells(
  state: GameState,
  unit: UnitState,
): Coord[] {
  if (!unit.position) return [];
  const cells: Coord[] = [];
  for (let dc = -1; dc <= 1; dc += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (dc === 0 && dr === 0) continue;
      const cell = {
        col: unit.position.col + dc,
        row: unit.position.row + dr,
      };
      if (isInsideBoard(cell, state.boardSize)) cells.push(cell);
    }
  }
  return cells;
}

export function getLucheLightRayTargeting(
  state: GameState,
  unit: UnitState,
): AbilityTargetingView {
  const line = getLucheLightRayCells(state, unit);
  const aroundSelf = getLucheLightRayAroundSelfCells(state, unit);
  return {
    // Retained for older clients; mode-aware clients use modes.
    cells: line,
    modes: {
      line: { cells: line },
      aroundSelf: { cells: aroundSelf },
    },
  };
}

export function getDuolingoPushDestinations(
  state: GameState,
  unit: UnitState,
  target: UnitState,
): Coord[] {
  if (!unit.position || !target.isAlive || !target.position || !canDirectlyTargetUnit(state, unit.id, target.id)) {
    return [];
  }
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const cell = { col, row };
      if (chebyshev(cell, target.position) <= 2 && !isCellOccupied(state, cell)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

export function getDuolingoPushTargeting(state: GameState, unit: UnitState): AbilityTargetingView {
  const destinationsByTargetId: Record<string, Coord[]> = {};
  for (const target of Object.values(state.units)) {
    const destinations = getDuolingoPushDestinations(state, unit, target);
    if (destinations.length > 0) destinationsByTargetId[target.id] = destinations;
  }
  return {
    targetIds: Object.keys(destinationsByTargetId),
    destinationsByTargetId,
  };
}

export function getZoroOniGiriDestinations(
  state: GameState,
  unit: UnitState,
  target: UnitState,
): Coord[] {
  if (
    !unit.position ||
    !target.isAlive ||
    !target.position ||
    target.owner === unit.owner ||
    !canDirectlyTargetUnit(state, unit.id, target.id) ||
    (unit.blindUntilOwnTurnStart && chebyshev(unit.position, target.position) > 1)
  ) return [];
  const direction = directionFrom(unit.position, target.position);
  if (!direction) return [];
  return [
    { col: target.position.col - direction.col, row: target.position.row - direction.row },
    { col: target.position.col + direction.col, row: target.position.row + direction.row },
  ].filter((cell) => isInsideBoard(cell, state.boardSize) && !isCellOccupied(state, cell));
}

export function getZoroOniGiriTargeting(state: GameState, unit: UnitState): AbilityTargetingView {
  const destinationsByTargetId: Record<string, Coord[]> = {};
  for (const target of Object.values(state.units)) {
    const destinations = getZoroOniGiriDestinations(state, unit, target);
    if (destinations.length > 0) destinationsByTargetId[target.id] = destinations;
  }
  return {
    targetIds: Object.keys(destinationsByTargetId),
    destinationsByTargetId,
  };
}

export function isAdjacent8(from: Coord, to: Coord): boolean {
  return chebyshev(from, to) === 1;
}

export function getDonWindmillsPath(
  state: GameState,
  unit: UnitState,
  target: UnitState,
): Coord[] | null {
  if (
    !unit.position ||
    !target.isAlive ||
    !target.position ||
    !target.heroId ||
    target.owner === unit.owner ||
    !canDirectlyTargetUnit(state, unit.id, target.id) ||
    (unit.blindUntilOwnTurnStart && !isAdjacent8(unit.position, target.position))
  ) {
    return null;
  }

  const path = linePath(unit.position, target.position);
  if (!path || path.length < 2) return null;

  // When the Giant is adjacent, the cell immediately before it is Don's own
  // cell. That is a legal no-distance dash, not a blocked destination.
  const destination = path[path.length - 2];
  if (
    !coordsEqual(destination, unit.position) &&
    isCellOccupied(state, destination)
  ) {
    return null;
  }
  return path;
}

export function getDonWindmillsTargeting(
  state: GameState,
  unit: UnitState,
): AbilityTargetingView {
  return {
    targetIds: Object.values(state.units)
      .filter((target) => !!getDonWindmillsPath(state, unit, target))
      .map((target) => target.id),
  };
}
