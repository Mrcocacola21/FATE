import type { Coord, ForestMarker, GameState, PlayerId, UnitState } from "./model";
import { chebyshev } from "./board";
import { HERO_LECHY_ID, HERO_RIVER_PERSON_ID } from "./heroes";

export const FOREST_AURA_RADIUS = 2;
export const ARENA_STORM_ID = "storm";

export function getForestMarkers(state: GameState): ForestMarker[] {
  const markers = Array.isArray(state.forestMarkers)
    ? state.forestMarkers.map((marker) => ({
        owner: marker.owner,
        position: { ...marker.position },
      }))
    : [];
  if (!state.forestMarker) {
    return markers;
  }
  const idx = markers.findIndex((marker) => marker.owner === state.forestMarker!.owner);
  if (idx >= 0) {
    markers[idx] = {
      owner: state.forestMarker.owner,
      position: { ...state.forestMarker.position },
    };
    return markers;
  }
  markers.push({
    owner: state.forestMarker.owner,
    position: { ...state.forestMarker.position },
  });
  return markers;
}

export function getForestMarkerForOwner(
  state: GameState,
  owner: PlayerId
): ForestMarker | null {
  const marker = getForestMarkers(state).find((item) => item.owner === owner);
  return marker ?? null;
}

export function isInsideForestAura(
  state: GameState,
  coord: Coord,
  owner?: PlayerId
): boolean {
  const markers = getForestMarkers(state);
  if (markers.length === 0) return false;
  for (const marker of markers) {
    if (owner && marker.owner !== owner) continue;
    if (chebyshev(marker.position, coord) <= FOREST_AURA_RADIUS) {
      return true;
    }
  }
  return false;
}

export function isUnitInsideForestAura(state: GameState, unit: UnitState): boolean {
  if (!unit.position) return false;
  return isInsideForestAura(state, unit.position);
}

export function isStormActive(state: GameState): boolean {
  return state.arenaId === ARENA_STORM_ID;
}

export function isStormExempt(state: GameState, unit: UnitState): boolean {
  if (unit.heroId === HERO_LECHY_ID || unit.heroId === HERO_RIVER_PERSON_ID) {
    return true;
  }
  return isUnitInsideForestAura(state, unit);
}
