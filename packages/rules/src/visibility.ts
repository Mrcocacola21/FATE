// packages/rules/src/visibility.ts
import { GameState, UnitState, Coord } from "./model";
import { getUnitAt } from "./board";

/**
 * Может ли конкретный юнит видеть стелс-цели.
 * Сейчас — всегда false, позже можно завязать на способности/флаг.
 */
export function unitCanSeeStealthed(
  state: GameState,
  viewer: UnitState
): boolean {
  // TODO: сюда повесим пассивки типа "вижу невидимых"
  return false;
}

/**
 * Можно ли юниту unitId ЗАКОНЧИТЬ ход в клетке dest
 * с учётом стелса, союзников и правила "hidden+hidden нельзя".
 */
export function canUnitEnterCell(
  state: GameState,
  unitId: string,
  dest: Coord
): boolean {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return false;

  const occupant = getUnitAt(state, dest);
  if (!occupant || !occupant.isAlive) {
    // Клетка пустая — ок
    return true;
  }

  // Союзников (видимых и скрытых) топтать нельзя.
  if (occupant.owner === unit.owner) {
    return false;
  }

  // Здесь occupant — враг.
  if (occupant.isStealthed) {
    // Если юнит умеет видеть невидимых — он "знает", что там враг → нельзя.
    if (unitCanSeeStealthed(state, unit)) {
      return false;
    }

    // Правило: скрытый герой не может делить клетку с другим скрытым.
    if (unit.isStealthed) {
      return false;
    }

    // Иначе: враг невидим, можно наступить на его клетку.
    return true;
  }

  // Видимый враг — на него нельзя наступить (для обычных ходов).
  return false;
}

/**
 * Проверка: можно ли НАПРЯМУЮ нацелиться на targetId с sourceId
 * (атака/таргет-абилки).
 *
 * Союзников можно таргетить всегда (включая стелс),
 * врагов в стелсе — только если их видно (unitCanSeeStealthed).
 */
export function canDirectlyTargetUnit(
  state: GameState,
  sourceId: string,
  targetId: string
): boolean {
  const source = state.units[sourceId];
  const target = state.units[targetId];

  if (!source || !source.isAlive) return false;
  if (!target || !target.isAlive) return false;

  // Союзник — можно таргетить даже в стелсе (бафы/хилы и т.п.)
  if (source.owner === target.owner) {
    return true;
  }

  // Враг в стелсе и мы его не "видим" → нельзя нацелиться
  if (target.isStealthed && !unitCanSeeStealthed(state, source)) {
    return false;
  }

  return true;
}
