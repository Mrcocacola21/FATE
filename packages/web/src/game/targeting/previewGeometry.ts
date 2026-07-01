import type { Coord, PlayerView, UnitClass, UnitState } from "rules";

const DIRECTIONS_8: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

const CARDINAL_DIRECTIONS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

export function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function boardSize(view: Pick<PlayerView, "boardSize"> | null | undefined): number {
  return view?.boardSize ?? 9;
}

export function isInsideBoard(coord: Coord, size: number): boolean {
  return coord.col >= 0 && coord.row >= 0 && coord.col < size && coord.row < size;
}

export function cellsInRadius(
  size: number,
  center: Coord,
  radius: number,
  includeCenter = true,
): Coord[] {
  const cells: Coord[] = [];
  for (let col = center.col - radius; col <= center.col + radius; col += 1) {
    for (let row = center.row - radius; row <= center.row + radius; row += 1) {
      const coord = { col, row };
      if (!isInsideBoard(coord, size)) continue;
      if (!includeCenter && sameCoord(coord, center)) continue;
      if (chebyshevDistance(center, coord) <= radius) {
        cells.push(coord);
      }
    }
  }
  return cells;
}

export function adjacentCells(size: number, center: Coord): Coord[] {
  return cellsInRadius(size, center, 1, false);
}

export function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dx === 0 && dy === 0) {
    return [{ col: start.col, row: start.row }];
  }
  if (!(dx === 0 || dy === 0 || absDx === absDy)) {
    return null;
  }
  const steps = Math.max(absDx, absDy);
  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const path: Coord[] = [];
  for (let index = 0; index <= steps; index += 1) {
    path.push({
      col: start.col + stepCol * index,
      row: start.row + stepRow * index,
    });
  }
  return path;
}

export function getVisibleUnitAt(view: PlayerView, coord: Coord): UnitState | null {
  return (
    Object.values(view.units).find(
      (unit) =>
        unit.isAlive &&
        !!unit.position &&
        unit.position.col === coord.col &&
        unit.position.row === coord.row,
    ) ?? null
  );
}

export function visiblePositionedUnits(view: PlayerView): UnitState[] {
  return Object.values(view.units).filter(
    (unit) => unit.isAlive && !!unit.position,
  );
}

export function cellsFromTargetIds(view: PlayerView, targetIds: string[]): Coord[] {
  return targetIds
    .map((targetId) => view.units[targetId]?.position)
    .filter((coord): coord is Coord => !!coord);
}

export function archerLineCells(view: PlayerView, sourceUnitId: string): Coord[] {
  const source = view.units[sourceUnitId];
  if (!source?.position) return [];
  const size = boardSize(view);
  const cells: Coord[] = [];
  const seen = new Set<string>();

  for (const direction of DIRECTIONS_8) {
    let cursor = {
      col: source.position.col + direction.col,
      row: source.position.row + direction.row,
    };
    while (isInsideBoard(cursor, size)) {
      const key = coordKey(cursor);
      if (!seen.has(key)) {
        cells.push({ ...cursor });
        seen.add(key);
      }
      const occupant = getVisibleUnitAt(view, cursor);
      if (occupant && occupant.owner !== source.owner) {
        break;
      }
      cursor = {
        col: cursor.col + direction.col,
        row: cursor.row + direction.row,
      };
    }
  }

  return cells;
}

export function firstVisibleArcherTargets(view: PlayerView, sourceUnitId: string): string[] {
  const source = view.units[sourceUnitId];
  if (!source?.position) return [];
  const size = boardSize(view);
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const direction of DIRECTIONS_8) {
    let cursor = {
      col: source.position.col + direction.col,
      row: source.position.row + direction.row,
    };
    while (isInsideBoard(cursor, size)) {
      const occupant = getVisibleUnitAt(view, cursor);
      if (occupant && occupant.owner !== source.owner) {
        if (!seen.has(occupant.id)) {
          targets.push(occupant.id);
          seen.add(occupant.id);
        }
        break;
      }
      cursor = {
        col: cursor.col + direction.col,
        row: cursor.row + direction.row,
      };
    }
  }

  return targets;
}

function pushUnique(cells: Coord[], seen: Set<string>, coord: Coord, size: number, origin: Coord) {
  if (!isInsideBoard(coord, size)) return;
  if (sameCoord(coord, origin)) return;
  const key = coordKey(coord);
  if (seen.has(key)) return;
  seen.add(key);
  cells.push(coord);
}

export function attackRangeCells(
  view: PlayerView,
  unitId: string,
  overrideClass?: UnitClass,
): Coord[] {
  const unit = view.units[unitId];
  if (!unit?.position) return [];
  const size = boardSize(view);
  const origin = unit.position;
  const unitClass = overrideClass ?? unit.class;
  const cells: Coord[] = [];
  const seen = new Set<string>();

  if (unitClass === "archer") {
    return archerLineCells(view, unitId);
  }

  if (unitClass === "trickster") {
    return cellsInRadius(size, origin, 2, false);
  }

  if (unitClass === "spearman") {
    for (const cell of cellsInRadius(size, origin, 1, false)) {
      pushUnique(cells, seen, cell, size, origin);
    }
    for (const offset of DIRECTIONS_8) {
      pushUnique(
        cells,
        seen,
        {
          col: origin.col + offset.col * 2,
          row: origin.row + offset.row * 2,
        },
        size,
        origin,
      );
    }
    return cells;
  }

  return cellsInRadius(size, origin, 1, false);
}

export function lineCellsToTargets(
  source: Coord,
  targetCells: Coord[],
  includeSource = false,
): Coord[] {
  const cells: Coord[] = [];
  const seen = new Set<string>();
  for (const targetCell of targetCells) {
    const path = linePath(source, targetCell);
    if (!path) continue;
    const pathCells = includeSource ? path : path.slice(1);
    for (const cell of pathCells) {
      const key = coordKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

export function openCells(view: PlayerView): Coord[] {
  const size = boardSize(view);
  const occupied = new Set(
    visiblePositionedUnits(view)
      .map((unit) => unit.position)
      .filter((coord): coord is Coord => !!coord)
      .map(coordKey),
  );
  const cells: Coord[] = [];
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size; row += 1) {
      const coord = { col, row };
      if (!occupied.has(coordKey(coord))) {
        cells.push(coord);
      }
    }
  }
  return cells;
}

export function straightLineDestinations(view: PlayerView, source: Coord): Coord[] {
  const size = boardSize(view);
  const destinations: Coord[] = [];
  for (const direction of CARDINAL_DIRECTIONS) {
    let cursor = { col: source.col + direction.col, row: source.row + direction.row };
    while (isInsideBoard(cursor, size)) {
      if (getVisibleUnitAt(view, cursor)) break;
      destinations.push({ ...cursor });
      cursor = { col: cursor.col + direction.col, row: cursor.row + direction.row };
    }
  }
  return destinations;
}

export function diagonalDestinations(view: PlayerView, source: Coord): Coord[] {
  const size = boardSize(view);
  const destinations: Coord[] = [];
  for (const direction of DIRECTIONS_8.filter((dir) => dir.col !== 0 && dir.row !== 0)) {
    let cursor = { col: source.col + direction.col, row: source.row + direction.row };
    while (isInsideBoard(cursor, size)) {
      if (getVisibleUnitAt(view, cursor)) break;
      destinations.push({ ...cursor });
      cursor = { col: cursor.col + direction.col, row: cursor.row + direction.row };
    }
  }
  return destinations;
}
