import type { Coord, GameState, UnitState } from "../../../model";
import { chebyshev } from "../../../board";

export function isSameRowOrCol(a: Coord, b: Coord): boolean {
  return a.row === b.row || a.col === b.col;
}

export function collectLineTargets(
  state: GameState,
  caster: UnitState,
  target: Coord
): string[] {
  const casterPos = caster.position;
  if (!casterPos) return [];
  if (!isSameRowOrCol(casterPos, target)) return [];

  const isRow = casterPos.row === target.row;
  const isCol = casterPos.col === target.col;
  const dirCol = isRow ? Math.sign(target.col - casterPos.col) : 0;
  const dirRow = isCol ? Math.sign(target.row - casterPos.row) : 0;
  if (dirCol === 0 && dirRow === 0) return [];

  const affected: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === caster.id) continue;
    if (isRow && unit.position.row === casterPos.row) {
      if ((unit.position.col - casterPos.col) * dirCol > 0) {
        affected.push(unit.id);
      }
      continue;
    }
    if (isCol && unit.position.col === casterPos.col) {
      if ((unit.position.row - casterPos.row) * dirRow > 0) {
        affected.push(unit.id);
      }
    }
  }

  return affected;
}

export function collectRadiusTargets(state: GameState, caster: UnitState): string[] {
  if (!caster.position) return [];
  const origin = caster.position;
  const affected: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === caster.id) continue;
    if (chebyshev(origin, unit.position) <= 1) {
      affected.push(unit.id);
    }
  }
  return affected;
}
