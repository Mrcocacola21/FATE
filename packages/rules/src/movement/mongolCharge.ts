import type { Coord } from "../model";

function isInsideChargeBoard(cell: Coord, boardSize: number): boolean {
  return (
    cell.col >= 0 &&
    cell.row >= 0 &&
    cell.col < boardSize &&
    cell.row < boardSize
  );
}

/**
 * Returns the three-cell-wide influence corridor for a straight charge path.
 * Cells are ordered by path step, with the traversed cell first and its two
 * side cells following. Duplicate and off-board cells are omitted.
 */
export function getMongolChargeInfluenceCells(
  path: Coord[],
  boardSize: number
): Coord[] {
  if (path.length === 0) return [];

  const start = path[0]!;
  const end = path[path.length - 1]!;
  const stepCol = Math.sign(end.col - start.col);
  const stepRow = Math.sign(end.row - start.row);

  let sideOffsets: Coord[] = [];
  if (stepCol === 0 && stepRow !== 0) {
    sideOffsets = [
      { col: -1, row: 0 },
      { col: 1, row: 0 },
    ];
  } else if (stepRow === 0 && stepCol !== 0) {
    sideOffsets = [
      { col: 0, row: -1 },
      { col: 0, row: 1 },
    ];
  } else if (Math.abs(stepCol) === 1 && Math.abs(stepRow) === 1) {
    sideOffsets = [
      { col: stepCol, row: 0 },
      { col: 0, row: stepRow },
    ];
  }

  const seen = new Set<string>();
  const influence: Coord[] = [];
  const pushCell = (cell: Coord) => {
    if (!isInsideChargeBoard(cell, boardSize)) return;
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    influence.push(cell);
  };

  for (const cell of path) {
    pushCell(cell);
    for (const offset of sideOffsets) {
      pushCell({ col: cell.col + offset.col, row: cell.row + offset.row });
    }
  }

  return influence;
}
