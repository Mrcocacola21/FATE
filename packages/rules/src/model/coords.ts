import type { Coord } from "./shared";

const COLS = "abcdefghi";

export function coord(col: number, row: number): Coord {
  return { col, row };
}

export function isInsideBoard(c: Coord, size = 9): boolean {
  return c.col >= 0 && c.col < size && c.row >= 0 && c.row < size;
}

export function coordFromNotation(notation: string): Coord {
  if (notation.length !== 2) {
    throw new Error(`Invalid coord notation: ${notation}`);
  }
  const colChar = notation[0].toLowerCase();
  const rowChar = notation[1];
  const col = COLS.indexOf(colChar);
  const row = parseInt(rowChar, 10);
  if (col === -1 || isNaN(row)) {
    throw new Error(`Invalid coord notation: ${notation}`);
  }
  return { col, row };
}

export function coordToNotation(c: Coord): string {
  return `${COLS[c.col]}${c.row}`;
}
