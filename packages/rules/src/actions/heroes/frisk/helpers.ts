import type { Coord, GameState, UnitState } from "../../../model";
import { chebyshev } from "../../../board";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_FRISK_ID } from "../../../heroes";

export function isFrisk(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_FRISK_ID;
}

export function canFriskUsePacifism(unit: UnitState | undefined): boolean {
  return !!unit && isFrisk(unit) && !unit.friskPacifismDisabled;
}

export function getFriskPacifismTargetIds(
  state: GameState,
  friskId: string
): string[] {
  const frisk = state.units[friskId];
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) {
    return [];
  }
  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === frisk.id) return false;
      return chebyshev(frisk.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getFriskWarmWordsTargetIds(
  state: GameState,
  friskId: string
): string[] {
  return getFriskPacifismTargetIds(state, friskId);
}

export function getFriskKeenEyeTargetIds(
  state: GameState,
  friskId: string
): string[] {
  const frisk = state.units[friskId];
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) {
    return [];
  }
  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === frisk.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return true;
    })
    .map((unit) => unit.id)
    .sort();
}

export function findUnitByIdWithPosition(
  state: GameState,
  unitId: string
): UnitState | null {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return null;
  return unit;
}

export function isWithinDistance(
  from: Coord,
  to: Coord,
  distance: number
): boolean {
  return chebyshev(from, to) <= distance;
}
