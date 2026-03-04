import type { Coord, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import { getUnitAt } from "../../board";

export function collectRiderPathTargets(
  state: GameState,
  rider: UnitState,
  from: Coord,
  to: Coord
): string[] {
  const targets: string[] = [];

  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const isOrthogonal = (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return targets;
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  for (let i = 1; i <= steps; i++) {
    const cell: Coord = {
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    };

    const unitOnCell = getUnitAt(state, cell);
    if (!unitOnCell || !unitOnCell.isAlive) continue;
    if (unitOnCell.owner === rider.owner) continue;

    // Path attacks hit enemies passed on the path regardless of stealthed state.
    targets.push(unitOnCell.id);
  }

  return targets;
}

export function getRiderPathCells(from: Coord, to: Coord): Coord[] {
  const dx = to.col - from.col;
  const dy = to.row - from.row;

  const isOrthogonal = (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return [];
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  const path: Coord[] = [];
  for (let i = 1; i <= steps; i++) {
    path.push({
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    });
  }

  return path;
}

export function getMongolChargeCorridor(
  path: Coord[],
  boardSize: number
): Coord[] {
  if (path.length === 0) return [];
  const start = path[0];
  const end = path[path.length - 1];
  const stepCol = Math.sign(end.col - start.col);
  const stepRow = Math.sign(end.row - start.row);

  let offsets: Coord[] = [];
  if (stepCol === 0 && stepRow !== 0) {
    offsets = [
      { col: -1, row: 0 },
      { col: 1, row: 0 },
    ];
  } else if (stepRow === 0 && stepCol !== 0) {
    offsets = [
      { col: 0, row: -1 },
      { col: 0, row: 1 },
    ];
  } else if (Math.abs(stepCol) === 1 && Math.abs(stepRow) === 1) {
    offsets = [
      { col: stepCol, row: 0 },
      { col: 0, row: stepRow },
    ];
  }

  const seen = new Set<string>();
  const corridor: Coord[] = [];
  const pushCell = (cell: Coord) => {
    if (!isInsideBoard(cell, boardSize)) return;
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    corridor.push(cell);
  };

  for (const cell of path) {
    pushCell(cell);
    for (const offset of offsets) {
      pushCell({ col: cell.col + offset.col, row: cell.row + offset.row });
    }
  }

  return corridor;
}

export function sortUnitIdsByReadingOrder(
  state: GameState,
  unitIds: string[]
): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) {
      return a.localeCompare(b);
    }
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}
