import type { Coord, GameState } from "../model";
import { isInsideBoard } from "../model";
import { ALL_DIRS, addCoord } from "../board";
import { canUnitEnterCell } from "../visibility";

export function getTricksterMovesForRoll(
  state: GameState,
  unitId: string,
  roll: number
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if (roll < 1 || roll > 6) return [];

  const result: Coord[] = [];
  const position = unit.position;

  const canLand = (destination: Coord) =>
    isInsideBoard(destination, state.boardSize) &&
    canUnitEnterCell(state, unitId, destination);

  if (roll >= 1 && roll <= 4) {
    for (let col = 0; col < state.boardSize; col++) {
      for (let row = 0; row < state.boardSize; row++) {
        const destination: Coord = { col, row };
        if (destination.col === position.col && destination.row === position.row) {
          continue;
        }

        const dx = Math.abs(destination.col - position.col);
        const dy = Math.abs(destination.row - position.row);
        const chebyshevDistance = Math.max(dx, dy);

        if (chebyshevDistance === 0 || chebyshevDistance > 2) continue;
        if (!canLand(destination)) continue;
        result.push(destination);
      }
    }
  } else {
    for (let col = 0; col < state.boardSize; col++) {
      for (let row = 0; row < state.boardSize; row++) {
        const destination: Coord = { col, row };
        if (destination.col === position.col && destination.row === position.row) {
          continue;
        }
        if (!canLand(destination)) continue;
        result.push(destination);
      }
    }
  }

  return result;
}

export function getBerserkerMovesForRoll(
  state: GameState,
  unitId: string,
  roll: number
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if (roll < 1 || roll > 6) return [];

  const result: Coord[] = [];
  const seen = new Set<string>();
  const position = unit.position;

  const push = (destination: Coord) => {
    if (!isInsideBoard(destination, state.boardSize)) return;
    if (!canUnitEnterCell(state, unitId, destination)) return;
    const key = `${destination.col},${destination.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(destination);
  };

  const north: Coord = { col: 0, row: -1 };
  const south: Coord = { col: 0, row: 1 };
  const west: Coord = { col: -1, row: 0 };
  const east: Coord = { col: 1, row: 0 };
  const northWest: Coord = { col: -1, row: -1 };
  const northEast: Coord = { col: 1, row: -1 };
  const southWest: Coord = { col: -1, row: 1 };
  const southEast: Coord = { col: 1, row: 1 };

  switch (roll) {
    case 1: {
      for (const direction of [north, northEast, northWest]) {
        push(addCoord(position, direction));
      }
      break;
    }
    case 2: {
      for (const direction of [south, southEast, southWest]) {
        push(addCoord(position, direction));
      }
      break;
    }
    case 3: {
      for (const direction of [west, northWest, southWest]) {
        push(addCoord(position, direction));
      }
      break;
    }
    case 4: {
      for (const direction of [east, northEast, southEast]) {
        push(addCoord(position, direction));
      }
      break;
    }
    case 5: {
      for (const direction of [
        north,
        northEast,
        east,
        southEast,
        south,
        southWest,
        west,
        northWest,
      ]) {
        push(addCoord(position, direction));
      }
      break;
    }
    case 6: {
      for (const direction of [
        north,
        northEast,
        east,
        southEast,
        south,
        southWest,
        west,
        northWest,
      ]) {
        push(addCoord(position, direction));
      }
      for (const direction of ALL_DIRS) {
        const destination: Coord = {
          col: position.col + direction.col * 2,
          row: position.row + direction.row * 2,
        };
        push(destination);
      }
      break;
    }
  }

  return result;
}
