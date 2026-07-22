import type { Coord } from "rules";

function readCoord(value: unknown): Coord | null {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isInteger((value as Coord).col) ||
    !Number.isInteger((value as Coord).row)
  ) {
    return null;
  }
  return { col: (value as Coord).col, row: (value as Coord).row };
}

function isDirection(value: Coord): boolean {
  return (
    value.col >= -1 &&
    value.col <= 1 &&
    value.row >= -1 &&
    value.row <= 1 &&
    (value.col !== 0 || value.row !== 0)
  );
}

function directionsFromContext(context: Record<string, unknown>): Coord[] {
  if (!Array.isArray(context.options)) return [];
  return context.options
    .map(readCoord)
    .filter((direction): direction is Coord => !!direction && isDirection(direction));
}

export function getDonMadnessRayCells(
  context: Record<string, unknown>,
  boardSize: number,
): Coord[] {
  const origin = readCoord(context.origin);
  if (!origin || boardSize <= 0) return [];
  const cells: Coord[] = [];
  const seen = new Set<string>();
  for (const direction of directionsFromContext(context)) {
    let cell = {
      col: origin.col + direction.col,
      row: origin.row + direction.row,
    };
    while (
      cell.col >= 0 &&
      cell.row >= 0 &&
      cell.col < boardSize &&
      cell.row < boardSize
    ) {
      const key = `${cell.col},${cell.row}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push(cell);
      }
      cell = {
        col: cell.col + direction.col,
        row: cell.row + direction.row,
      };
    }
  }
  return cells;
}

export function getDonMadnessDirectionForCell(
  context: Record<string, unknown>,
  cell: Coord,
): Coord | null {
  const origin = readCoord(context.origin);
  if (!origin) return null;
  const deltaCol = cell.col - origin.col;
  const deltaRow = cell.row - origin.row;
  if (
    (deltaCol === 0 && deltaRow === 0) ||
    (deltaCol !== 0 && deltaRow !== 0 && Math.abs(deltaCol) !== Math.abs(deltaRow))
  ) {
    return null;
  }
  const direction = {
    col: Math.sign(deltaCol),
    row: Math.sign(deltaRow),
  };
  return directionsFromContext(context).some(
    (option) => option.col === direction.col && option.row === direction.row,
  )
    ? direction
    : null;
}
