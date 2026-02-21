import { getUnitAt } from "./board";
import type { Coord, GameEvent, GameState, UnitState } from "./model";
import { isInsideBoard } from "./model";
import { HERO_METTATON_ID } from "./heroes";

export type MettatonRatingReason =
  | "attackHit"
  | "defenseSuccess"
  | "defenseRoll"
  | "stagePhenomenon"
  | "abilitySpend";

const METTATON_LINE_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

function toInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value);
}

function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) {
      return a.localeCompare(b);
    }
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}

function isAttackLineDirection(from: Coord, target: Coord): boolean {
  const dx = target.col - from.col;
  const dy = target.row - from.row;
  if (dx === 0 && dy === 0) return false;
  return from.row === target.row || from.col === target.col || Math.abs(dx) === Math.abs(dy);
}

export function isMettaton(unit: UnitState | null | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_METTATON_ID;
}

export function getMettatonRating(unit: UnitState): number {
  return Math.max(0, toInt(unit.mettatonRating ?? 0));
}

export function setMettatonRating(unit: UnitState, rating: number): UnitState {
  const next = Math.max(0, toInt(rating));
  if (next === getMettatonRating(unit)) {
    return unit;
  }
  return {
    ...unit,
    mettatonRating: next,
  };
}

export function addMettatonRating(
  unit: UnitState,
  delta: number
): { unit: UnitState; applied: number } {
  if (!isMettaton(unit)) {
    return { unit, applied: 0 };
  }
  const amount = toInt(delta);
  if (amount === 0) {
    return { unit, applied: 0 };
  }
  const current = getMettatonRating(unit);
  const next = Math.max(0, current + amount);
  const applied = next - current;
  if (applied === 0) {
    return { unit, applied: 0 };
  }
  return { unit: setMettatonRating(unit, next), applied };
}

export function spendMettatonRating(
  unit: UnitState,
  amount: number
): { unit: UnitState; ok: boolean; spent: number } {
  if (!isMettaton(unit)) {
    return { unit, ok: false, spent: 0 };
  }
  const need = Math.max(0, toInt(amount));
  if (need === 0) {
    return { unit, ok: true, spent: 0 };
  }
  const current = getMettatonRating(unit);
  if (current < need) {
    return { unit, ok: false, spent: 0 };
  }
  const updated = setMettatonRating(unit, current - need);
  return { unit: updated, ok: true, spent: need };
}

export function buildMettatonRatingChangedEvent(params: {
  unitId: string;
  delta: number;
  now: number;
  reason: MettatonRatingReason;
}): GameEvent {
  return {
    type: "mettatonRatingChanged",
    unitId: params.unitId,
    delta: params.delta,
    now: params.now,
    reason: params.reason,
  };
}

export function hasMettatonExUnlocked(unit: UnitState): boolean {
  return isMettaton(unit) && unit.mettatonExUnlocked === true;
}

export function hasMettatonNeoUnlocked(unit: UnitState): boolean {
  return isMettaton(unit) && unit.mettatonNeoUnlocked === true;
}

export function hasMettatonStagePhenomenon(unit: UnitState): boolean {
  return hasMettatonExUnlocked(unit);
}

export function hasMettatonGrace(unit: UnitState): boolean {
  return hasMettatonNeoUnlocked(unit);
}

export function hasMettatonRiderMovement(unit: UnitState): boolean {
  return isMettaton(unit);
}

export function hasMettatonRiderPathFeature(unit: UnitState): boolean {
  return hasMettatonNeoUnlocked(unit);
}

export function hasMettatonBerserkerFeature(unit: UnitState): boolean {
  return hasMettatonNeoUnlocked(unit);
}

export function unlockMettatonEx(unit: UnitState): UnitState {
  if (!isMettaton(unit) || unit.mettatonExUnlocked) {
    return unit;
  }
  return {
    ...unit,
    mettatonExUnlocked: true,
  };
}

export function unlockMettatonNeo(unit: UnitState): UnitState {
  if (!isMettaton(unit) || unit.mettatonNeoUnlocked) {
    return unit;
  }
  return {
    ...unit,
    mettatonNeoUnlocked: true,
  };
}

export function getMettatonAttackLineCenters(
  state: GameState,
  caster: UnitState
): Coord[] {
  if (!caster.position) return [];
  const origin = caster.position;
  const centers: Coord[] = [];

  for (const dir of METTATON_LINE_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (isInsideBoard({ col, row }, state.boardSize)) {
      const cell = { col, row };
      centers.push(cell);
      const occupant = getUnitAt(state, cell);
      if (occupant && occupant.owner !== caster.owner) {
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return centers;
}

export function getMettatonAttackLineCells(
  state: GameState,
  caster: UnitState,
  target: Coord
): Coord[] {
  if (!caster.position) return [];
  const origin = caster.position;
  if (!isAttackLineDirection(origin, target)) {
    return [];
  }

  const stepCol = Math.sign(target.col - origin.col);
  const stepRow = Math.sign(target.row - origin.row);
  if (stepCol === 0 && stepRow === 0) {
    return [];
  }

  const cells: Coord[] = [];
  let col = origin.col + stepCol;
  let row = origin.row + stepRow;
  while (isInsideBoard({ col, row }, state.boardSize)) {
    const cell = { col, row };
    cells.push(cell);
    const occupant = getUnitAt(state, cell);
    if (occupant && occupant.owner !== caster.owner) {
      break;
    }
    col += stepCol;
    row += stepRow;
  }

  return cells;
}

export function isMettatonCenterOnAttackLine(
  state: GameState,
  caster: UnitState,
  center: Coord
): boolean {
  return getMettatonAttackLineCenters(state, caster).some(
    (cell) => cell.col === center.col && cell.row === center.row
  );
}

export function collectMettatonLineTargetIds(
  state: GameState,
  caster: UnitState,
  target: Coord
): string[] {
  const lineCells = getMettatonAttackLineCells(state, caster, target);
  const ids: string[] = [];
  for (const cell of lineCells) {
    const unit = getUnitAt(state, cell);
    if (!unit || !unit.isAlive || unit.id === caster.id) continue;
    ids.push(unit.id);
  }
  return sortUnitIdsByReadingOrder(state, Array.from(new Set(ids)));
}

export function collectMettatonFinalChordTargetIds(
  state: GameState,
  caster: UnitState
): string[] {
  if (!caster.position) return [];
  const ids = new Set<string>();
  for (const center of getMettatonAttackLineCenters(state, caster)) {
    const lineCells = getMettatonAttackLineCells(state, caster, center);
    for (const cell of lineCells) {
      const unit = getUnitAt(state, cell);
      if (!unit || !unit.isAlive || unit.owner === caster.owner) continue;
      ids.add(unit.id);
    }
  }
  return sortUnitIdsByReadingOrder(state, Array.from(ids));
}
