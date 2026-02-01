import type { Coord, GameState, PlayerId, UnitState } from "../model";
import { isInsideBoard } from "../model";
import { getUnitDefinition } from "../units";
import { addCoord, ALL_DIRS, isCellOccupied } from "../board";
import {
  HERO_GRAND_KAISER_ID,
  HERO_VLAD_TEPES_ID,
  getHeroDefinition,
} from "../heroes";
import type { RNG } from "../rng";
import { rollD6 } from "../rng";

export function roll2D6Sum(rng: RNG): number {
  const d1 = rollD6(rng);
  const d2 = rollD6(rng);
  return d1 + d2;
}

export function isKaiser(unit: UnitState): boolean {
  return unit.heroId === HERO_GRAND_KAISER_ID;
}

export function isVlad(unit: UnitState): boolean {
  return unit.heroId === HERO_VLAD_TEPES_ID;
}

export function isKaiserTransformed(unit: UnitState): boolean {
  return isKaiser(unit) && unit.transformed === true;
}

export function getUnitBaseMaxHp(unit: UnitState): number {
  const def = getUnitDefinition(unit.class);
  const hero = getHeroDefinition(unit.heroId);
  return hero?.baseHpOverride ?? def.maxHp;
}

export function getUnitBaseAttack(unit: UnitState): number {
  const def = getUnitDefinition(unit.class);
  const hero = getHeroDefinition(unit.heroId);
  return hero?.baseAttackOverride ?? def.baseAttack;
}

export function isUnitVisibleToPlayer(
  state: GameState,
  unit: UnitState,
  player: PlayerId
): boolean {
  if (unit.owner === player) return true;
  if (!unit.isStealthed) return true;
  return !!state.knowledge?.[player]?.[unit.id];
}

export function getAdjacentEmptyCells(state: GameState, origin: Coord): Coord[] {
  const options: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const dest = addCoord(origin, dir);
    if (!isInsideBoard(dest, state.boardSize)) continue;
    if (isCellOccupied(state, dest)) continue;
    options.push(dest);
  }
  return options;
}

export function getMovementModes(unit: UnitState): UnitState["class"][] {
  if (isKaiserTransformed(unit)) {
    return ["archer", "rider", "berserker"];
  }
  return [unit.class];
}

export function unitHasMovementMode(
  unit: UnitState,
  mode: UnitState["class"]
): boolean {
  return getMovementModes(unit).includes(mode);
}

export function rollD9(rng: RNG): number {
  return 1 + Math.floor(rng.next() * 9);
}

export function map2d9ToCoord(
  state: GameState,
  d1: number,
  d2: number
): Coord {
  const max = Math.max(0, state.boardSize - 1);
  const col = Math.min(max, Math.max(0, d1 - 1));
  const row = Math.min(max, Math.max(0, d2 - 1));
  return { col, row };
}
