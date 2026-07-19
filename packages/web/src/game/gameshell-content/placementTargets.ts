import type { Coord, PendingRoll, PlayerView } from "rules";
import { normalizeCoordList } from "./helpers";

export function getProjectedPlacementCoords(
  view: PlayerView | null,
  unitId: string | null
): Coord[] {
  if (!view || !unitId) return [];
  return view.legal?.placementsByUnitId[unitId] ?? [];
}

export function getPendingChikatiloPlacementCoords(
  pendingRoll: PendingRoll | null | undefined
): Coord[] {
  if (pendingRoll?.kind !== "chikatiloFalseTrailPlacement") return [];
  const context = pendingRoll.context as
    | {
        legalPositions?: unknown;
        legalCells?: unknown;
        legalTargets?: unknown;
      }
    | undefined;
  const fromPositions = normalizeCoordList(context?.legalPositions);
  if (fromPositions.length > 0) return fromPositions;
  const fromCells = normalizeCoordList(context?.legalCells);
  if (fromCells.length > 0) return fromCells;
  return normalizeCoordList(context?.legalTargets);
}
