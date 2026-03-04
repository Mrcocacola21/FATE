import type { Coord, GameState, UnitClass, UnitState } from "../model";
import { isInsideBoard } from "../model";
import { ALL_DIRS, DIAG_DIRS, ORTHO_DIRS, addCoord } from "../board";
import { canUnitEnterCell } from "../visibility";
import { HERO_GENGHIS_KHAN_ID, HERO_GRAND_KAISER_ID } from "../heroes";
import { hasMettatonBerserkerFeature, hasMettatonRiderMovement } from "../mettaton";

function movesSpearman(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const destination = addCoord(unit.position!, dir);
    if (!isInsideBoard(destination, state.boardSize)) continue;
    if (!canUnitEnterCell(state, unit.id, destination)) continue;
    result.push(destination);
  }
  return result;
}

function movesKnight(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const destination = addCoord(unit.position!, dir);
    if (!isInsideBoard(destination, state.boardSize)) continue;
    if (!canUnitEnterCell(state, unit.id, destination)) continue;
    result.push(destination);
  }
  return result;
}

function movesArcher(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const destination = addCoord(unit.position!, dir);
    if (!isInsideBoard(destination, state.boardSize)) continue;
    if (!canUnitEnterCell(state, unit.id, destination)) continue;
    result.push(destination);
  }
  return result;
}

function movesRider(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];

  for (const dir of ORTHO_DIRS) {
    let current = addCoord(unit.position!, dir);
    while (isInsideBoard(current, state.boardSize)) {
      if (canUnitEnterCell(state, unit.id, current)) {
        result.push(current);
      }
      current = addCoord(current, dir);
    }
  }

  const allowDiagonalLines =
    unit.heroId === HERO_GENGHIS_KHAN_ID &&
    unit.genghisKhanDiagonalMoveActive === true;
  if (allowDiagonalLines) {
    for (const dir of DIAG_DIRS) {
      let current = addCoord(unit.position!, dir);
      while (isInsideBoard(current, state.boardSize)) {
        if (canUnitEnterCell(state, unit.id, current)) {
          result.push(current);
        }
        current = addCoord(current, dir);
      }
    }
  }

  for (const dir of DIAG_DIRS) {
    const destination = addCoord(unit.position!, dir);
    if (!isInsideBoard(destination, state.boardSize)) continue;
    if (!canUnitEnterCell(state, unit.id, destination)) continue;
    result.push(destination);
  }

  return result;
}

function movesAssassin(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];
  const seen = new Set<string>();
  const position = unit.position!;

  const tryPush = (destination: Coord) => {
    if (!isInsideBoard(destination, state.boardSize)) return;
    if (!canUnitEnterCell(state, unit.id, destination)) return;
    const key = `${destination.col},${destination.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(destination);
  };

  for (const dir of ALL_DIRS) {
    const first: Coord = {
      col: position.col + dir.col,
      row: position.row + dir.row,
    };
    tryPush(first);

    const second: Coord = {
      col: position.col + dir.col * 2,
      row: position.row + dir.row * 2,
    };
    tryPush(second);
  }

  return result;
}

function movesTrickster(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];

  for (let col = 0; col < state.boardSize; col++) {
    for (let row = 0; row < state.boardSize; row++) {
      const destination: Coord = { col, row };
      if (
        destination.col === unit.position!.col &&
        destination.row === unit.position!.row
      ) {
        continue;
      }
      if (!canUnitEnterCell(state, unit.id, destination)) continue;
      result.push(destination);
    }
  }

  return result;
}

function movesBerserker(state: GameState, unit: UnitState): Coord[] {
  const result: Coord[] = [];
  const seen = new Set<string>();
  const position = unit.position!;

  const push = (destination: Coord) => {
    if (!isInsideBoard(destination, state.boardSize)) return;
    if (!canUnitEnterCell(state, unit.id, destination)) return;
    const key = `${destination.col},${destination.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(destination);
  };

  const neighbors: Coord[] = [
    { col: 0, row: -1 },
    { col: 1, row: -1 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 0, row: 1 },
    { col: -1, row: 1 },
    { col: -1, row: 0 },
    { col: -1, row: -1 },
  ];
  for (const direction of neighbors) {
    push(addCoord(position, direction));
  }

  for (const dir of ORTHO_DIRS) {
    const destination: Coord = {
      col: position.col + dir.col * 2,
      row: position.row + dir.row * 2,
    };
    push(destination);
  }

  return result;
}

export function getLegalMovesForUnitModes(
  state: GameState,
  unitId: string,
  modes: UnitClass[]
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return movesSpearman(state, unit);
  }

  const seen = new Set<string>();
  const result: Coord[] = [];

  for (const mode of modes) {
    let moves: Coord[] = [];
    switch (mode) {
      case "spearman":
        moves = movesSpearman(state, unit);
        break;
      case "rider":
        moves = movesRider(state, unit);
        break;
      case "knight":
        moves = movesKnight(state, unit);
        break;
      case "archer":
        moves = movesArcher(state, unit);
        break;
      case "trickster":
        moves = movesTrickster(state, unit);
        break;
      case "assassin":
        moves = movesAssassin(state, unit);
        break;
      case "berserker":
        moves = movesBerserker(state, unit);
        break;
      default:
        moves = [];
    }

    for (const destination of moves) {
      const key = `${destination.col},${destination.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(destination);
    }
  }

  return result;
}

export function getLegalMovesForUnit(state: GameState, unitId: string): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return movesSpearman(state, unit);
  }

  const modes: UnitClass[] =
    unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed
      ? ["archer", "rider", "berserker"]
      : hasMettatonRiderMovement(unit)
      ? hasMettatonBerserkerFeature(unit)
        ? ["rider", "berserker"]
        : ["rider"]
      : [unit.class];

  return getLegalMovesForUnitModes(state, unitId, modes);
}
