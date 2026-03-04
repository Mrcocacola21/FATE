import type { Coord, GameState } from "../../../../model";
import { getUnitAt } from "../../../../board";

export type FalseTrailExplosionContext = {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
  revealQueue?: string[];
};

export function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

export function insertAfter(
  queue: string[],
  anchorId: string | null,
  unitId: string
): string[] {
  const filtered = queue.filter((id) => id !== unitId);
  if (!anchorId) {
    return [...filtered, unitId];
  }
  const anchorIndex = filtered.indexOf(anchorId);
  if (anchorIndex < 0) {
    return [...filtered, unitId];
  }
  return [
    ...filtered.slice(0, anchorIndex + 1),
    unitId,
    ...filtered.slice(anchorIndex + 1),
  ];
}

export function isCoordLike(value: unknown): value is Coord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { col?: unknown }).col === "number" &&
    typeof (value as { row?: unknown }).row === "number"
  );
}

export function getLegalEmptyCells(state: GameState): Coord[] {
  const legal: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (getUnitAt(state, coord)) continue;
      legal.push(coord);
    }
  }
  return legal;
}
