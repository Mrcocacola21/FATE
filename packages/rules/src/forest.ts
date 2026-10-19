import type {
  ArenaEffectState,
  Coord,
  ForestMarker,
  GameState,
  PlayerId,
  UnitState,
} from "./model";
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
  if (state.arenaId !== ARENA_STORM_ID) return false;
  const effects = state.arenaEffects;
  if (!Array.isArray(effects) || effects.length === 0) return true;
  return effects.some((effect) => effect.effectId === ARENA_STORM_ID && effect.remaining > 0);
}

export function getActiveStormEffect(state: GameState): ArenaEffectState | null {
  const effects = state.arenaEffects;
  if (!Array.isArray(effects)) return null;
  return (
    effects.find(
      (effect) => effect.effectId === ARENA_STORM_ID && effect.remaining > 0
    ) ?? null
  );
}

export function upsertStormArenaEffect(
  state: GameState,
  effect: ArenaEffectState
): GameState {
  const existing = Array.isArray(state.arenaEffects) ? state.arenaEffects : [];
  return {
    ...state,
    arenaEffects: [
      ...existing.filter((item) => item.effectId !== ARENA_STORM_ID),
      { ...effect },
    ],
  };
}

export function isStormExempt(state: GameState, unit: UnitState): boolean {
  if (unit.heroId === HERO_LECHY_ID || unit.heroId === HERO_RIVER_PERSON_ID) {
    return true;
  }
  return isUnitInsideForestAura(state, unit);
}

export function advanceStormDurationAfterRound(state: GameState): GameState {
  const effects = state.arenaEffects ?? [];
  if (!effects.some((effect) => effect.effectId === ARENA_STORM_ID)) return state;

  const nextEffects = effects.flatMap((effect) => {
    if (effect.effectId !== ARENA_STORM_ID) return [effect];
    // Casting as the last figure must not immediately consume the new storm.
    if (effect.startedTurnNumber === state.turnNumber) {
      return [{ ...effect, durationUnit: "round" as const }];
    }
    const remaining = Math.max(0, Math.trunc(effect.remaining) - 1);
    return remaining > 0 ? [{ ...effect, remaining, durationUnit: "round" as const }] : [];
  });
  const hasStorm = nextEffects.some((effect) => effect.effectId === ARENA_STORM_ID);
  return {
    ...state,
    arenaId: state.arenaId === ARENA_STORM_ID && !hasStorm ? null : state.arenaId,
    arenaEffects: nextEffects,
  };
}
