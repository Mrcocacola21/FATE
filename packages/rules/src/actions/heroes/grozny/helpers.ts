import type { Coord, GameState, UnitState } from "../../../model";
import { canAttackTarget } from "../../../combat";
import { HERO_GROZNY_ID } from "../../../heroes";

export function isGrozny(unit: UnitState): boolean {
  return unit.heroId === HERO_GROZNY_ID;
}

export function coordSort(a: Coord, b: Coord): number {
  if (a.col !== b.col) return a.col - b.col;
  return a.row - b.row;
}

export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function canAttackAllyFrom(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  from: Coord
): boolean {
  const attackerAt: UnitState = { ...attacker, position: from };
  const fakeDefender: UnitState = {
    ...defender,
    owner: attacker.owner === "P1" ? "P2" : "P1",
    isStealthed: false,
  };
  return canAttackTarget(state, attackerAt, fakeDefender);
}
