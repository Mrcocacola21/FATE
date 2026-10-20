import type { PlayerId, UnitState } from "../model";

/** Only already-projected source units may authorize thematic status identity. */
export function filterStatusSources(units: Record<string, UnitState>, recipient: PlayerId | "spectator"): void {
  for (const unit of Object.values(units)) {
    for (const field of ["blindSourceId", "immobilizedSourceId", "movementDisabledSourceId"] as const) {
      const id = unit[field], source = id ? units[id] : undefined;
      if (!source?.isAlive || !source.position || (source.isStealthed && source.owner !== recipient)) delete unit[field];
    }
  }
}
