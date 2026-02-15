// packages/rules/src/visibility.ts
import { Coord, GameState, UnitState } from "./model";
import { getUnitAt } from "./board";
import { HERO_CHIKATILO_ID, HERO_ODIN_ID } from "./heroes";

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function canSeeStealthedTarget(
  _state: GameState,
  viewer: UnitState,
  target: UnitState
): boolean {
  if (!viewer.isAlive || !target.isAlive) return false;
  if (!viewer.position || !target.position) return false;
  if (!target.isStealthed) return false;

  // Odin (Huginn): adjacent stealthed enemies are visible for Odin.
  if (viewer.heroId === HERO_ODIN_ID) {
    return chebyshevDistance(viewer.position, target.position) <= 1;
  }

  return false;
}

export function unitCanSeeStealthed(
  state: GameState,
  viewer: UnitState,
  target?: UnitState
): boolean {
  if (!target) return false;
  return canSeeStealthedTarget(state, viewer, target);
}

export function canUnitEnterCell(
  state: GameState,
  unitId: string,
  dest: Coord
): boolean {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return false;

  const occupant = getUnitAt(state, dest);
  if (!occupant || !occupant.isAlive) {
    return true;
  }

  if (occupant.owner === unit.owner) {
    return false;
  }

  if (occupant.isStealthed) {
    if (unitCanSeeStealthed(state, unit, occupant)) {
      return false;
    }

    const known = state.knowledge?.[unit.owner]?.[occupant.id];
    if (known) return false;

    if (unit.isStealthed) {
      return false;
    }

    return true;
  }

  return false;
}

export function canDirectlyTargetUnit(
  state: GameState,
  sourceId: string,
  targetId: string
): boolean {
  const source = state.units[sourceId];
  const target = state.units[targetId];

  if (!source || !source.isAlive) return false;
  if (!target || !target.isAlive) return false;

  if (source.owner === target.owner) {
    return true;
  }

  if (target.isStealthed) {
    if (
      source.heroId === HERO_CHIKATILO_ID &&
      Array.isArray(source.chikatiloMarkedTargets) &&
      source.chikatiloMarkedTargets.includes(target.id)
    ) {
      return true;
    }
    const known = state.knowledge?.[source.owner]?.[target.id];
    if (!canSeeStealthedTarget(state, source, target) && !known) {
      return false;
    }
  }

  return true;
}
