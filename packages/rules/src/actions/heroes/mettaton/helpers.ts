import type { Coord, GameState } from "../../../model";

export function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

export function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
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
