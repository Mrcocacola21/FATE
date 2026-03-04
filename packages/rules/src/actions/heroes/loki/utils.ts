import type { UnitState } from "../../../model";
import { ABILITY_LOKI_LAUGHT, getCharges } from "../../../abilities";

export function getLokiLaughter(unit: UnitState): number {
  return getCharges(unit, ABILITY_LOKI_LAUGHT);
}

export function pickRandomFromIds(
  ids: string[],
  next01: () => number
): string | null {
  if (ids.length === 0) return null;
  const idx = Math.min(ids.length - 1, Math.floor(next01() * ids.length));
  return ids[idx] ?? null;
}
