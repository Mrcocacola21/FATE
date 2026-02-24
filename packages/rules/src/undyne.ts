import { getUnitAt } from "./board";
import { isInsideBoard } from "./model";
import type { Coord, GameState, UnitState } from "./model";
import { HERO_UNDYNE_ID } from "./heroes";

export type UndyneLineAxis = "row" | "col";

function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) return a.localeCompare(b);
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}

export function isUndyne(unit: UnitState | null | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_UNDYNE_ID;
}

export function hasUndyneImmortalActive(unit: UnitState): boolean {
  return isUndyne(unit) && unit.undyneImmortalActive === true;
}

export function hasUndyneImmortalUsed(unit: UnitState): boolean {
  return isUndyne(unit) && unit.undyneImmortalUsed === true;
}

export function isUndyneLineAxis(value: unknown): value is UndyneLineAxis {
  return value === "row" || value === "col";
}

export function getUndyneEnergySpearLineCells(
  state: GameState,
  axis: UndyneLineAxis,
  target: Coord
): Coord[] {
  if (!isInsideBoard(target, state.boardSize)) {
    return [];
  }
  const cells: Coord[] = [];
  if (axis === "row") {
    for (let col = 0; col < state.boardSize; col += 1) {
      cells.push({ col, row: target.row });
    }
    return cells;
  }
  for (let row = 0; row < state.boardSize; row += 1) {
    cells.push({ col: target.col, row });
  }
  return cells;
}

export function collectUndyneEnergySpearTargetIds(
  state: GameState,
  casterId: string,
  axis: UndyneLineAxis,
  target: Coord
): string[] {
  const ids: string[] = [];
  for (const cell of getUndyneEnergySpearLineCells(state, axis, target)) {
    const unit = getUnitAt(state, cell);
    if (!unit || !unit.isAlive || unit.id === casterId) continue;
    ids.push(unit.id);
  }
  return sortUnitIdsByReadingOrder(state, Array.from(new Set(ids)));
}
