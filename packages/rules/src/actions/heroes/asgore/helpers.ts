import type { Coord, GameState, UnitState } from "../../../model";
import { coordsEqual, getUnitAt } from "../../../board";
import { canAttackTarget } from "../../../combat";
import { canDirectlyTargetUnit } from "../../../visibility";
import { HERO_ASGORE_ID } from "../../../heroes";

export function isAsgore(unit: UnitState): boolean {
  return unit.heroId === HERO_ASGORE_ID;
}

export function canUseAsClassAttack(
  state: GameState,
  attacker: UnitState,
  target: UnitState,
  unitClass: UnitState["class"]
): boolean {
  const classLikeAttacker: UnitState = {
    ...attacker,
    class: unitClass,
  };
  return canAttackTarget(state, classLikeAttacker, target);
}

function getAsgoreTargetIdsByClass(
  state: GameState,
  asgoreId: string,
  unitClass: UnitState["class"]
): string[] {
  const asgore = state.units[asgoreId];
  if (!asgore || !asgore.isAlive || !asgore.position || !isAsgore(asgore)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === asgore.id) return false;
      if (unit.owner === asgore.owner) return false;
      if (!canDirectlyTargetUnit(state, asgore.id, unit.id)) return false;
      return canUseAsClassAttack(state, asgore, unit, unitClass);
    })
    .map((unit) => unit.id)
    .sort();
}

export function getAsgorePatienceTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "assassin");
}

export function getAsgorePerseveranceTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "trickster");
}

export function getAsgoreJusticeTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "archer");
}

export function getAsgoreIntegrityDestinations(
  state: GameState,
  asgoreId: string
): Coord[] {
  const asgore = state.units[asgoreId];
  if (!asgore || !asgore.isAlive || !asgore.position || !isAsgore(asgore)) {
    return [];
  }

  const options: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const cell = { col, row };
      if (coordsEqual(cell, asgore.position)) continue;
      if (getUnitAt(state, cell)) continue;
      options.push(cell);
    }
  }
  return options;
}
