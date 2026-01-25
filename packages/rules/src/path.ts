// packages/rules/src/path.ts

import { Coord } from "./model";

export function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (dx === 0 && dy === 0) {
    return [{ col: start.col, row: start.row }];
  }

  const aligned = dx === 0 || dy === 0 || absDx === absDy;
  if (!aligned) {
    return null;
  }

  const steps = Math.max(absDx, absDy);
  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  const path: Coord[] = [];
  for (let i = 0; i <= steps; i += 1) {
    path.push({
      col: start.col + stepCol * i,
      row: start.row + stepRow * i,
    });
  }

  return path;
}
