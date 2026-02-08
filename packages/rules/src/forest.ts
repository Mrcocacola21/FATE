import type { Coord, GameState, UnitState } from "./model";
import { chebyshev } from "./board";
import { HERO_LECHY_ID } from "./heroes";

export const FOREST_AURA_RADIUS = 2;
export const ARENA_STORM_ID = "storm";

export function isInsideForestAura(state: GameState, coord: Coord): boolean {
  const marker = state.forestMarker;
  if (!marker) return false;
  return chebyshev(marker.position, coord) <= FOREST_AURA_RADIUS;
}

export function isUnitInsideForestAura(state: GameState, unit: UnitState): boolean {
  if (!unit.position) return false;
  return isInsideForestAura(state, unit.position);
}

export function isStormActive(state: GameState): boolean {
  return state.arenaId === ARENA_STORM_ID;
}

export function isStormExempt(state: GameState, unit: UnitState): boolean {
  if (unit.heroId === HERO_LECHY_ID) return true;
  return isUnitInsideForestAura(state, unit);
}
