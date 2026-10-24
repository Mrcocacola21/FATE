import type {
  Coord,
  GameAction,
  GameState,
  PapyrusBoneStatus,
  PapyrusLineAxis,
  UnitState,
} from "../../../model";
import { getUnitAt } from "../../../board";
import { HERO_PAPYRUS_ID } from "../../../heroes";

export function isPapyrus(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_PAPYRUS_ID;
}

export function isLineAxis(value: unknown): value is PapyrusLineAxis {
  return (
    value === "row" ||
    value === "col" ||
    value === "diagMain" ||
    value === "diagAnti"
  );
}

export function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

export function getPapyrusLineCells(
  boardSize: number,
  axis: PapyrusLineAxis,
  target: Coord
): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < boardSize; col += 1) {
    for (let row = 0; row < boardSize; row += 1) {
      let matches = false;
      if (axis === "row") {
        matches = row === target.row;
      } else if (axis === "col") {
        matches = col === target.col;
      } else if (axis === "diagMain") {
        matches = col - row === target.col - target.row;
      } else if (axis === "diagAnti") {
        matches = col + row === target.col + target.row;
      }
      if (matches) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

export function getUnitsOnPapyrusLine(
  state: GameState,
  casterId: string,
  axis: PapyrusLineAxis,
  target: Coord
): string[] {
  const ids: string[] = [];
  for (const cell of getPapyrusLineCells(state.boardSize, axis, target)) {
    const unit = getUnitAt(state, cell);
    if (!unit || !unit.isAlive || unit.id === casterId) continue;
    ids.push(unit.id);
  }
  return ids.sort((a, b) => {
    const aUnit = state.units[a];
    const bUnit = state.units[b];
    const aPos = aUnit?.position;
    const bPos = bUnit?.position;
    if (!aPos || !bPos) return a.localeCompare(b);
    if (aPos.row !== bPos.row) return aPos.row - bPos.row;
    if (aPos.col !== bPos.col) return aPos.col - bPos.col;
    return a.localeCompare(b);
  });
}

export function getPapyrusCoolGuyCost(unit: UnitState): number {
  return unit.papyrusUnbelieverActive ? 3 : 5;
}

export function isPapyrusBoneStatusActive(
  state: GameState,
  status: PapyrusBoneStatus | undefined
): status is PapyrusBoneStatus {
  if (!status) return false;
  const source = state.units[status.sourceUnitId];
  if (!source || !source.isAlive || source.heroId !== HERO_PAPYRUS_ID) {
    return false;
  }
  const sourceOwnTurns = source.ownTurnsStarted ?? 0;
  return sourceOwnTurns < status.expiresOnSourceOwnTurn;
}

export function getActionActorId(
  prevState: GameState,
  action: GameAction
): string | undefined {
  if (
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return action.unitId;
  }
  if (action.type === "attack") {
    return action.attackerId;
  }
  if (action.type === "resolvePendingRoll") {
    const pending = prevState.pendingRoll;
    const unitId = pending?.context?.unitId;
    return typeof unitId === "string" ? unitId : undefined;
  }
  return undefined;
}

/** Unit step from Papyrus toward `to` when both share a row, column or diagonal. */
export function getPapyrusLongBoneStep(from: Coord, to: Coord): Coord | null {
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  if (dc === 0 && dr === 0) return null;
  if (dc !== 0 && dr !== 0 && Math.abs(dc) !== Math.abs(dr)) return null;
  return { col: Math.sign(dc), row: Math.sign(dr) };
}

export function isPapyrusLongBoneActive(unit: UnitState | undefined): unit is UnitState {
  return isPapyrus(unit) && !!unit.papyrusUnbelieverActive && !!unit.papyrusLongBoneMode;
}

/** Long Bone ray: from the cell after Papyrus through the target to the board edge. */
export function getPapyrusLongBoneRayCells(boardSize: number, from: Coord, to: Coord): Coord[] {
  const step = getPapyrusLongBoneStep(from, to);
  if (!step) return [];
  const cells: Coord[] = [];
  let cell = { col: from.col + step.col, row: from.row + step.row };
  while (cell.col >= 0 && cell.row >= 0 && cell.col < boardSize && cell.row < boardSize) {
    cells.push(cell);
    cell = { col: cell.col + step.col, row: cell.row + step.row };
  }
  return cells;
}

/** Every living unit on the ray, nearest first; allies on the ray are hit too. */
export function getUnitsOnPapyrusLongBoneRay(
  state: GameState,
  caster: UnitState,
  target: Coord,
): string[] {
  if (!caster.position) return [];
  const ids: string[] = [];
  for (const cell of getPapyrusLongBoneRayCells(state.boardSize, caster.position, target)) {
    const unit = getUnitAt(state, cell);
    if (!unit || !unit.isAlive || unit.id === caster.id) continue;
    ids.push(unit.id);
  }
  return ids;
}
