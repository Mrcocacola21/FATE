import type { Coord, GameState, UnitState } from "./model";
import { HERO_PAPYRUS_ID, HERO_SANS_ID } from "./heroes";
import {
  collectMettatonLineTargetIds,
  isMettatonCenterOnAttackLine,
} from "./mettaton";

export const ARENA_BONE_FIELD_ID = "boneField" as const;

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

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
  target: Coord
): boolean {
  return isMettatonCenterOnAttackLine(state, caster, target);
}

export function collectSansLineTargetIds(
  state: GameState,
  caster: UnitState,
  target: Coord
): string[] {
  return collectMettatonLineTargetIds(state, caster, target);
}

export function pickSansLastAttackTargetId(
  state: GameState,
  sansOwner: UnitState["owner"],
  sansPosition: Coord | null
): string | null {
  const candidates = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      unit.owner !== sansOwner &&
      !!unit.position &&
      unit.hp > 0
  );
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    if (a.hp !== b.hp) return a.hp - b.hp;
    if (sansPosition && a.position && b.position) {
      const da = chebyshevDistance(sansPosition, a.position);
      const db = chebyshevDistance(sansPosition, b.position);
      if (da !== db) return da - db;
    }
    if (a.position && b.position) {
      if (a.position.row !== b.position.row) {
        return a.position.row - b.position.row;
      }
      if (a.position.col !== b.position.col) {
        return a.position.col - b.position.col;
      }
    }
    return a.id.localeCompare(b.id);
  });

  return sorted[0]?.id ?? null;
}
