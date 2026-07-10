import type { Coord, PlayerView } from "rules";
import type { VisibleUnitPositions } from "./vfxTypes";

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LineGeometry {
  left: number;
  top: number;
  width: number;
  angleDeg: number;
  transform: string;
}

function toViewCoord(coord: Coord, boardSize: number, isFlipped: boolean): Coord {
  const maxIndex = boardSize - 1;
  return isFlipped
    ? { col: maxIndex - coord.col, row: maxIndex - coord.row }
    : coord;
}

export function isCoord(value: unknown): value is Coord {
  if (!value || typeof value !== "object") return false;
  const coord = value as Partial<Coord>;
  return (
    Number.isFinite(coord.col) &&
    Number.isFinite(coord.row) &&
    Number.isInteger(coord.col) &&
    Number.isInteger(coord.row)
  );
}

export function cellToBoardPoint(
  coord: Coord,
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
): BoardPoint {
  const viewCoord = toViewCoord(coord, boardSize, isFlipped);
  return {
    x: viewCoord.col * cellSize + cellSize / 2,
    y: (boardSize - 1 - viewCoord.row) * cellSize + cellSize / 2,
  };
}

export function cellToBoardRect(
  coord: Coord,
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
): BoardRect {
  const viewCoord = toViewCoord(coord, boardSize, isFlipped);
  return {
    left: viewCoord.col * cellSize,
    top: (boardSize - 1 - viewCoord.row) * cellSize,
    width: cellSize,
    height: cellSize,
  };
}

export function cellsToBoundingBox(
  cells: Coord[],
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
): BoardRect | null {
  if (cells.length === 0) return null;
  const rects = cells.map((cell) => cellToBoardRect(cell, boardSize, cellSize, isFlipped));
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

export function lineBetweenCellsToCssTransform(
  from: Coord,
  to: Coord,
  boardSize: number,
  cellSize: number,
  isFlipped: boolean,
): LineGeometry {
  const start = cellToBoardPoint(from, boardSize, cellSize, isFlipped);
  const end = cellToBoardPoint(to, boardSize, cellSize, isFlipped);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const width = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    left: start.x,
    top: start.y,
    width,
    angleDeg,
    transform: `rotate(${angleDeg}deg)`,
  };
}

export function radiusCellsToOverlay(
  center: Coord,
  radius: number,
  boardSize: number,
): Coord[] {
  const safeRadius = Math.max(0, Math.trunc(radius));
  const cells: Coord[] = [];
  for (let col = center.col - safeRadius; col <= center.col + safeRadius; col += 1) {
    for (let row = center.row - safeRadius; row <= center.row + safeRadius; row += 1) {
      if (col < 0 || row < 0 || col >= boardSize || row >= boardSize) continue;
      cells.push({ col, row });
    }
  }
  return cells;
}

export function pathCellsToSegments(path: Coord[]): Array<{ from: Coord; to: Coord }> {
  const segments: Array<{ from: Coord; to: Coord }> = [];
  for (let index = 1; index < path.length; index += 1) {
    segments.push({ from: path[index - 1], to: path[index] });
  }
  return segments;
}

export function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dx === 0 && dy === 0) return [{ ...start }];
  if (!(dx === 0 || dy === 0 || absDx === absDy)) return null;

  const steps = Math.max(absDx, absDy);
  const stepCol = Math.sign(dx);
  const stepRow = Math.sign(dy);
  return Array.from({ length: steps + 1 }, (_, index) => ({
    col: start.col + stepCol * index,
    row: start.row + stepRow * index,
  }));
}

export function visibleUnitPositions(view: PlayerView): VisibleUnitPositions {
  return Object.fromEntries(
    Object.values(view.units)
      .filter((unit) => unit.position)
      .map((unit) => [unit.id, { ...unit.position! }]),
  );
}

export function visibleUnitCoord(view: PlayerView, unitId: unknown): Coord | null {
  if (typeof unitId !== "string") return null;
  const position = view.units[unitId]?.position;
  return position ? { ...position } : null;
}

export function previousVisibleUnitCoord(
  view: PlayerView,
  previousPositions: VisibleUnitPositions,
  unitId: unknown,
): Coord | null {
  if (typeof unitId !== "string") return null;
  if (!view.units[unitId]) return null;
  const current = visibleUnitCoord(view, unitId);
  if (current) return current;
  return previousPositions[unitId] ? { ...previousPositions[unitId] } : null;
}
