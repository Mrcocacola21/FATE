import type { Coord, GameState, UnitState } from "./model";
import { HERO_PAPYRUS_ID, HERO_SANS_ID } from "./heroes";
import { getUnitsAt } from "./board";
import { getMettatonFullLineCells, isMettatonFullLineEndpoint } from "./mettaton";

export const ARENA_BONE_FIELD_ID = "boneField" as const;

export function isSans(unit: UnitState | null | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_SANS_ID;
}

export function hasSansUnbelieverUnlocked(unit: UnitState): boolean {
  return isSans(unit) && unit.sansUnbelieverUnlocked === true;
}

export function unlockSansUnbeliever(unit: UnitState): UnitState {
  if (!isSans(unit) || unit.sansUnbelieverUnlocked) {
    return unit;
  }
  return {
    ...unit,
    sansUnbelieverUnlocked: true,
  };
}

export function isBoneFieldActive(state: GameState): boolean {
  return state.arenaId === ARENA_BONE_FIELD_ID && (state.boneFieldTurnsLeft ?? 0) > 0;
}

export function isSansOrPapyrus(unit: UnitState | null | undefined): boolean {
  if (!unit) return false;
  return unit.heroId === HERO_SANS_ID || unit.heroId === HERO_PAPYRUS_ID;
}

export function isSansCenterOnAttackLine(
  state: GameState,
  caster: UnitState,
  target: Coord,
): boolean {
  return isMettatonFullLineEndpoint(state, caster, target);
}

export function collectSansLineTargetIds(
  state: GameState,
  caster: UnitState,
  target: Coord,
): string[] {
  return getMettatonFullLineCells(state, caster, target).flatMap((cell) =>
    getUnitsAt(state, cell)
      .filter((unit) => unit.isAlive && unit.hp > 0 && unit.owner !== caster.owner)
      .map((unit) => unit.id),
  );
}
