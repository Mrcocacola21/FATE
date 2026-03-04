import type { Coord, GameState, ResolveRollChoice, UnitState } from "../../../model";
import { HERO_RIVER_PERSON_ID } from "../../../heroes";

export const CARDINAL_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

export function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function sortUnitsByReadingOrder(state: GameState, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ua = state.units[a];
    const ub = state.units[b];
    const pa = ua?.position;
    const pb = ub?.position;
    if (!pa || !pb) return a.localeCompare(b);
    if (pa.row !== pb.row) return pa.row - pb.row;
    if (pa.col !== pb.col) return pa.col - pb.col;
    return a.localeCompare(b);
  });
}

export function parseTargetId(choice: ResolveRollChoice | undefined): string | null {
  if (!choice || typeof choice !== "object") return null;
  const payload = choice as { targetId?: unknown };
  return typeof payload.targetId === "string" && payload.targetId.length > 0
    ? payload.targetId
    : null;
}

export function parsePosition(choice: ResolveRollChoice | undefined): Coord | null {
  if (!choice || typeof choice !== "object") return null;
  const payload = choice as { position?: unknown };
  if (!payload.position || typeof payload.position !== "object") return null;
  const raw = payload.position as { col?: unknown; row?: unknown };
  if (typeof raw.col !== "number" || typeof raw.row !== "number") return null;
  return { col: raw.col, row: raw.row };
}

export function parseCoordList(raw: unknown): Coord[] {
  if (!Array.isArray(raw)) return [];
  const coords: Coord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const col = (item as { col?: unknown }).col;
    const row = (item as { row?: unknown }).row;
    if (typeof col !== "number" || typeof row !== "number") continue;
    coords.push({ col, row });
  }
  return coords;
}

export function isRiverPerson(unit: UnitState): boolean {
  return unit.heroId === HERO_RIVER_PERSON_ID;
}
