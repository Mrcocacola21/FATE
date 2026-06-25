import type { Coord, PlayerView } from "rules";
import type {
  BoardEffect,
  QueuedBoardEffect,
  VisibleUnitPositions,
} from "./types";

export function isCoord(value: unknown): value is Coord {
  if (!value || typeof value !== "object") return false;
  const coord = value as { col?: unknown; row?: unknown };
  return (
    typeof coord.col === "number" &&
    Number.isFinite(coord.col) &&
    typeof coord.row === "number" &&
    Number.isFinite(coord.row)
  );
}

export function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export function uniqueCoords(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  return coords.filter((coord) => {
    const key = coordKey(coord);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function squareArea(center: Coord, radius: number, boardSize: number): Coord[] {
  const cells: Coord[] = [];
  const safeRadius = Math.max(0, Math.trunc(radius));
  for (let col = center.col - safeRadius; col <= center.col + safeRadius; col += 1) {
    for (let row = center.row - safeRadius; row <= center.row + safeRadius; row += 1) {
      if (col < 0 || row < 0 || col >= boardSize || row >= boardSize) continue;
      cells.push({ col, row });
    }
  }
  return cells;
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
      .filter((unit) => isCoord(unit.position))
      .map((unit) => [unit.id, { ...unit.position! }]),
  );
}

export function visibleUnitCoord(
  unitId: unknown,
  view: PlayerView,
  previousPositions: VisibleUnitPositions,
): Coord | null {
  if (typeof unitId !== "string") return null;
  const unit = view.units[unitId];
  if (!unit) return null;
  if (isCoord(unit.position)) return { ...unit.position };
  if (!unit.isAlive && previousPositions[unitId]) {
    return { ...previousPositions[unitId] };
  }
  return null;
}

export function simplifyEffectsForReducedMotion(effects: BoardEffect[]): BoardEffect[] {
  return effects.map((effect) => {
    const durationMs = Math.min(effect.durationMs ?? 850, 550);
    if (effect.kind === "beam") {
      return {
        kind: "cellPulse",
        cells: uniqueCoords([effect.from, effect.to]),
        tone: effect.tone === "attack" ? "attack" : "status",
        durationMs,
        delayMs: effect.delayMs,
      };
    }
    if (effect.kind === "movementTrail") {
      const last = effect.path[effect.path.length - 1];
      return {
        kind: "cellPulse",
        cells: uniqueCoords([effect.path[0], last].filter(isCoord)),
        tone: "move",
        durationMs,
        delayMs: effect.delayMs,
      };
    }
    return { ...effect, durationMs };
  });
}

export function activeQueuedEffects(
  effects: QueuedBoardEffect[],
  now: number,
): QueuedBoardEffect[] {
  return effects.filter((effect) => effect.expiresAt > now);
}
