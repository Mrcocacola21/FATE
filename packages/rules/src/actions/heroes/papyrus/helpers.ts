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
