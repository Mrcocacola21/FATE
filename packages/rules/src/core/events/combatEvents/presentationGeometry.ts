import type { Coord } from "../../../model/shared";
import type { EffectSegment } from "../../../model/semantic";

/** Presentation metadata from cells already selected by rules; no target/RNG work. */
export function segmentFromCells(cells: readonly Coord[], from?: Coord): EffectSegment[] {
  if (!cells.length) return [];
  return [{ from: { ...(from ?? cells[0]) }, to: { ...cells[cells.length - 1] } }];
}

export function rayEffectSegment(from: Coord, toward: Coord, size: number): EffectSegment[] {
  const dc = Math.sign(toward.col - from.col),
    dr = Math.sign(toward.row - from.row);
  if (!dc && !dr) return [];
  let to = { ...from };
  while (to.col + dc >= 0 && to.row + dr >= 0 && to.col + dc < size && to.row + dr < size)
    to = { col: to.col + dc, row: to.row + dr };
  return [{ from: { ...from }, to }];
}
