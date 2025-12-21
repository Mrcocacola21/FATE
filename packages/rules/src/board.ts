// packages/rules/src/board.ts
import { Coord, GameState, UnitState } from "./model";

export const ORTHO_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

export const DIAG_DIRS: Coord[] = [
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

export const ALL_DIRS: Coord[] = [...ORTHO_DIRS, ...DIAG_DIRS];

export function coordsEqual(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function addCoord(a: Coord, b: Coord): Coord {
  return { col: a.col + b.col, row: a.row + b.row };
}

export function getUnitAt(
  state: GameState,
  coord: Coord
): UnitState | null {
  for (const u of Object.values(state.units)) {
    if (!u.isAlive || !u.position) continue;
    if (u.position.col === coord.col && u.position.row === coord.row) {
      return u;
    }
  }
  return null;
}

export function isCellOccupied(
  state: GameState,
  coord: Coord
): boolean {
  return getUnitAt(state, coord) !== null;
}

export function isEnemyAt(
  state: GameState,
  coord: Coord,
  owner: string
): boolean {
  const u = getUnitAt(state, coord);
  return !!u && u.owner !== owner;
}

export function isAllyAt(
  state: GameState,
  coord: Coord,
  owner: string
): boolean {
  const u = getUnitAt(state, coord);
  return !!u && u.owner === owner;
}

// Метрики расстояния (можем использовать позже)
export function manhattan(a: Coord, b: Coord): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(
    Math.abs(a.col - b.col),
    Math.abs(a.row - b.row)
  );
}
