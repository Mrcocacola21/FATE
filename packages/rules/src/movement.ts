// packages/rules/src/movement.ts
import {
  Coord,
  GameState,
  UnitState,
  UnitClass,
  isInsideBoard,
} from "./model";
import {
    ALL_DIRS,
    ORTHO_DIRS,
    DIAG_DIRS,
    addCoord,
    isCellOccupied,
  } from "./board";
  import { canUnitEnterCell } from "./visibility";
import { HERO_GRAND_KAISER_ID } from "./heroes";



export function getLegalMovesForUnitModes(
  state: GameState,
  unitId: string,
  modes: UnitClass[]
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];

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

    for (const dest of moves) {
      const key = `${dest.col},${dest.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(dest);
    }
  }

  return result;
}

export function getLegalMovesForUnit(
  state: GameState,
  unitId: string
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];

  const modes: UnitClass[] =
    unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed
      ? ["archer", "rider", "berserker"]
      : [unit.class];

  return getLegalMovesForUnitModes(state, unitId, modes);
}
  
  // ---------- КОПЕЙЩИК: 1 клетка в любом направлении ----------
  function movesSpearman(
    state: GameState,
    unit: UnitState
  ): Coord[] {
    const res: Coord[] = [];
    for (const dir of ALL_DIRS) {
      const dest = addCoord(unit.position!, dir);
      if (!isInsideBoard(dest, state.boardSize)) continue;
      if (!canUnitEnterCell(state, unit.id, dest)) continue;
      res.push(dest);
    }
    return res;
  }
  
  // ---------- РЫЦАРЬ: 1 клетка в любом направлении ----------
  function movesKnight(
    state: GameState,
    unit: UnitState
  ): Coord[] {
    const res: Coord[] = [];
    for (const dir of ALL_DIRS) {
      const dest = addCoord(unit.position!, dir);
      if (!isInsideBoard(dest, state.boardSize)) continue;
      if (!canUnitEnterCell(state, unit.id, dest)) continue;
      res.push(dest);
    }
    return res;
  }
  
  // ---------- ЛУЧНИК: 1 клетка (тоже в любую сторону) ----------
  function movesArcher(
    state: GameState,
    unit: UnitState
  ): Coord[] {
    const res: Coord[] = [];
    for (const dir of ALL_DIRS) {
      const dest = addCoord(unit.position!, dir);
      if (!isInsideBoard(dest, state.boardSize)) continue;
      if (!canUnitEnterCell(state, unit.id, dest)) continue;
      res.push(dest);
    }
    return res;
  }
  
  // ---------- НАЕЗДНИК: как ладья + 1 по диагонали ----------
  function movesRider(
    state: GameState,
    unit: UnitState
  ): Coord[] {
    const res: Coord[] = [];
  
    // Ладья: по прямой, можно проходить сквозь фигуры,
    // но финишировать на занятой клетке нельзя.
    // Ладья: можно проходить сквозь фигуры, но финишировать — по нашим правилам.
    for (const dir of ORTHO_DIRS) {
      let cur = addCoord(unit.position!, dir);
      while (isInsideBoard(cur, state.boardSize)) {
        if (canUnitEnterCell(state, unit.id, cur)) {
          res.push(cur);
        }
        // Наездник всё равно продолжает дальше
        cur = addCoord(cur, dir);
      }
    }

    // +1 по диагонали
    for (const dir of DIAG_DIRS) {
      const dest = addCoord(unit.position!, dir);
      if (!isInsideBoard(dest, state.boardSize)) continue;
      if (!canUnitEnterCell(state, unit.id, dest)) continue;
      res.push(dest);
    }

  
    return res;
  }
  

// ---------- УБИЙЦА: до 2 клеток по любой прямой (ортогональ + диагональ) ----------
function movesAssassin(
  state: GameState,
  unit: UnitState
): Coord[] {
  const res: Coord[] = [];
  const seen = new Set<string>();
  const pos = unit.position!;
  
  const tryPush = (dest: Coord) => {
    if (!isInsideBoard(dest, state.boardSize)) return;
    if (!canUnitEnterCell(state, unit.id, dest)) return;
    const key = `${dest.col},${dest.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    res.push(dest);
  };

  // идём по всем 8 направлениям
  for (const dir of ALL_DIRS) {
    // шаг на 1 клетку
    const dest1: Coord = {
      col: pos.col + dir.col,
      row: pos.row + dir.row,
    };
    tryPush(dest1);

    // шаг на 2 клетки (джамп)
    const dest2: Coord = {
      col: pos.col + dir.col * 2,
      row: pos.row + dir.row * 2,
    };
    tryPush(dest2);
  }

  return res;
}

  
  // ---------- ТРЮКАЧ: радиус 2 / любое поле (по к6) ----------
  // getLegalMoves возвращает супермножество всех возможных клеток,
  // а уже при applyAction + броске кубика будем проверять,
  // можно ли реально туда переместиться в этот ход.
  function movesTrickster(
    state: GameState,
    unit: UnitState
  ): Coord[] {
    const res: Coord[] = [];
  
    for (let col = 0; col < state.boardSize; col++) {
      for (let row = 0; row < state.boardSize; row++) {
        const dest: Coord = { col, row };
        if (dest.col === unit.position!.col && dest.row === unit.position!.row) {
          continue;
        }
        if (!canUnitEnterCell(state, unit.id, dest)) continue;
        res.push(dest);
      }
    }
  
    return res;
  }
  
// ---------- БЕРСЕРК: дуги + 1/2 клетки ----------
function movesBerserker(
  state: GameState,
  unit: UnitState
): Coord[] {
  const res: Coord[] = [];
  const seen = new Set<string>();
  const pos = unit.position!;
  
  const push = (dest: Coord) => {
    if (!isInsideBoard(dest, state.boardSize)) return;
    if (!canUnitEnterCell(state, unit.id, dest)) return;
    const key = `${dest.col},${dest.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    res.push(dest);
  };

  // Определяем глобальные направления (ряд растёт вниз):
  // N  = (0, -1), S = (0, 1), W = (-1, 0), E = (1, 0)
  const N: Coord  = { col:  0, row: -1 };
  const S: Coord  = { col:  0, row:  1 };
  const W: Coord  = { col: -1, row:  0 };
  const E: Coord  = { col:  1, row:  0 };
  const NW: Coord = { col: -1, row: -1 };
  const NE: Coord = { col:  1, row: -1 };
  const SW: Coord = { col: -1, row:  1 };
  const SE: Coord = { col:  1, row:  1 };

  // По твоим правилам:
  // 1 — одна из "передних": N, NE, NW
  // 2 — одна из "задних":  S, SE, SW
  // 3 — одна из "левых":  W, NW, SW
  // 4 — одна из "правых": E, NE, SE
  //
  // С точки зрения супермножества достижимых клеток
  // объединение 1–4 даёт те же самые 8 соседей, что и "1 клетка в любом направлении".
  // Поэтому для superset’а достаточно добавить все 8 соседей.

  const neighbors = [N, NE, E, SE, S, SW, W, NW];

  // Результаты 1–5 всегда дают шаг на 1 клетку:
  // 1–4 — по дугам, 5 — любая. Супермножество — все 8 соседей.
  for (const d of neighbors) {
    push(addCoord(pos, d));
  }

  // 6 — 2 клетки по прямой (ортогонально)
  for (const dir of ORTHO_DIRS) {
    const dest2: Coord = {
      col: pos.col + dir.col * 2,
      row: pos.row + dir.row * 2,
    };
    push(dest2);
  }

  return res;
}

// ---------- TRICKSTER: движение с учётом броска k6 ----------
// ---------- TRICKSTER: движение с учётом броска k6 ----------
export function getTricksterMovesForRoll(
  state: GameState,
  unitId: string,
  roll: number
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if (roll < 1 || roll > 6) return [];

  const res: Coord[] = [];
  const pos = unit.position;

  const canLand = (dest: Coord) =>
    isInsideBoard(dest, state.boardSize) &&
    canUnitEnterCell(state, unitId, dest);

  if (roll >= 1 && roll <= 4) {
    // 1–4: любая свободная клетка в радиусе 2 (Chebyshev)
    for (let col = 0; col < state.boardSize; col++) {
      for (let row = 0; row < state.boardSize; row++) {
        const dest: Coord = { col, row };
        if (dest.col === pos.col && dest.row === pos.row) continue;

        const dx = Math.abs(dest.col - pos.col);
        const dy = Math.abs(dest.row - pos.row);
        const cheb = Math.max(dx, dy);

        if (cheb === 0 || cheb > 2) continue;
        if (!canLand(dest)) continue;

        res.push(dest);
      }
    }
  } else {
    // 5–6: любая свободная клетка поля
    for (let col = 0; col < state.boardSize; col++) {
      for (let row = 0; row < state.boardSize; row++) {
        const dest: Coord = { col, row };
        if (dest.col === pos.col && dest.row === pos.row) continue;
        if (!canLand(dest)) continue;
        res.push(dest);
      }
    }
  }

  return res;
}


// ---------- BERSERKER: движение с учётом броска k6 ----------
export function getBerserkerMovesForRoll(
  state: GameState,
  unitId: string,
  roll: number
): Coord[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return [];
  if (roll < 1 || roll > 6) return [];

  const res: Coord[] = [];
  const seen = new Set<string>();
  const pos = unit.position;

  const push = (dest: Coord) => {
    if (!isInsideBoard(dest, state.boardSize)) return;
    if (!canUnitEnterCell(state, unitId, dest)) return;  // 👈 вместо isCellOccupied
    const key = `${dest.col},${dest.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    res.push(dest);
  };

  const N: Coord  = { col:  0, row: -1 };
  const S: Coord  = { col:  0, row:  1 };
  const W: Coord  = { col: -1, row:  0 };
  const E: Coord  = { col:  1, row:  0 };
  const NW: Coord = { col: -1, row: -1 };
  const NE: Coord = { col:  1, row: -1 };
  const SW: Coord = { col: -1, row:  1 };
  const SE: Coord = { col:  1, row:  1 };

  switch (roll) {
    case 1: {
      const dirs = [N, NE, NW];
      for (const d of dirs) push(addCoord(pos, d));
      break;
    }
    case 2: {
      const dirs = [S, SE, SW];
      for (const d of dirs) push(addCoord(pos, d));
      break;
    }
    case 3: {
      const dirs = [W, NW, SW];
      for (const d of dirs) push(addCoord(pos, d));
      break;
    }
    case 4: {
      const dirs = [E, NE, SE];
      for (const d of dirs) push(addCoord(pos, d));
      break;
    }
    case 5: {
      const neighbors = [N, NE, E, SE, S, SW, W, NW];
      for (const d of neighbors) push(addCoord(pos, d));
      break;
    }
    case 6: {
      const neighbors = [N, NE, E, SE, S, SW, W, NW];
      for (const d of neighbors) push(addCoord(pos, d));
      for (const dir of ALL_DIRS) {
        const dest: Coord = {
          col: pos.col + dir.col * 2,
          row: pos.row + dir.row * 2,
        };
        push(dest);
      }
      break;
    }
  }

  return res;
}
