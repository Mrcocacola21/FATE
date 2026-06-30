// packages/rules/src/visibility.ts
import { Coord, GameState, PlayerId, UnitState } from "./model";
import { getUnitsAt } from "./board";
import { HERO_CHIKATILO_ID, HERO_ODIN_ID } from "./heroes";
import { linePath } from "./path";

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

export function canPlayerKnowUnitExactPosition(
  state: GameState,
  viewerPlayerId: PlayerId,
  unitId: string
): boolean {
  const target = state.units[unitId];
  if (!target || !target.isAlive || !target.position) return false;
  if (target.owner === viewerPlayerId) return true;
  if (!target.isStealthed) return true;

  return Object.values(state.units).some((viewer) => {
    if (!viewer.isAlive || !viewer.position) return false;
    if (viewer.owner !== viewerPlayerId) return false;
    return canSeeStealthedTarget(state, viewer, target);
  });
}

export function canUnitKnowUnitExactPosition(
  state: GameState,
  viewer: UnitState,
  target: UnitState
): boolean {
  if (!viewer.isAlive || !target.isAlive) return false;
  if (!viewer.position || !target.position) return false;
  if (viewer.owner === target.owner) return true;
  if (!target.isStealthed) return true;

  if (
    viewer.heroId === HERO_CHIKATILO_ID &&
    Array.isArray(viewer.chikatiloMarkedTargets) &&
    viewer.chikatiloMarkedTargets.includes(target.id)
  ) {
    return true;
  }

  return canPlayerKnowUnitExactPosition(state, viewer.owner, target.id);
}

export function isUnitHiddenFromPlayer(
  state: GameState,
  viewerPlayerId: PlayerId,
  unitId: string
): boolean {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return false;
  if (unit.owner === viewerPlayerId) return false;
  if (!unit.isStealthed) return false;
  return !canPlayerKnowUnitExactPosition(state, viewerPlayerId, unitId);
}

export function isCellBlockedForPlayer(
  state: GameState,
  actingPlayerId: PlayerId,
  cell: Coord,
  exceptUnitId?: string
): boolean {
  return getUnitsAt(state, cell).some((occupant) => {
    if (occupant.id === exceptUnitId) return false;
    if (occupant.owner === actingPlayerId) return true;
    return canPlayerKnowUnitExactPosition(state, actingPlayerId, occupant.id);
  });
}

export function getLineBlockersForPlayer(
  state: GameState,
  actingPlayerId: PlayerId,
  from: Coord,
  to: Coord,
  exceptUnitId?: string
): string[] {
  const path = linePath(from, to);
  if (!path) return [];

  const blockers: string[] = [];
  for (const cell of path.slice(1)) {
    const cellBlockers = getUnitsAt(state, cell).filter((occupant) => {
      if (occupant.id === exceptUnitId) return false;
      if (occupant.owner === actingPlayerId) return false;
      return canPlayerKnowUnitExactPosition(state, actingPlayerId, occupant.id);
    });
    blockers.push(...cellBlockers.map((unit) => unit.id));
  }
  return blockers;
}

export function concealUnitExactPositionFromOpponents(
  state: GameState,
  unit: UnitState
): GameState {
  if (!unit.position) return state;

  const owner = unit.owner;
  const opponent: PlayerId = owner === "P1" ? "P2" : "P1";
  const knowledge = {
    ...state.knowledge,
    [owner]: {
      ...(state.knowledge?.[owner] ?? {}),
      [unit.id]: true,
    },
    [opponent]: {
      ...(state.knowledge?.[opponent] ?? {}),
    },
  };
  delete knowledge[opponent][unit.id];

  return {
    ...state,
    knowledge,
    lastKnownPositions: {
      ...state.lastKnownPositions,
      [opponent]: {
        ...(state.lastKnownPositions?.[opponent] ?? {}),
        [unit.id]: { ...unit.position },
      },
    },
  };
}

export function canUnitEnterCell(
  state: GameState,
  unitId: string,
  dest: Coord
): boolean {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return false;
  return !isCellBlockedForPlayer(state, unit.owner, dest, unitId);
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
    if (!canUnitKnowUnitExactPosition(state, source, target)) {
      return false;
    }
  }

  return true;
}
