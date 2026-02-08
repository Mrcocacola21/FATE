// packages/rules/src/visibility.ts
import { GameState, UnitState, Coord } from "./model";
import { getUnitAt } from "./board";
import { HERO_CHIKATILO_ID } from "./heroes";

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
    // Если юнит пассивно видит невидимых — он знает, что там враг → нельзя.
    if (unitCanSeeStealthed(state, unit)) {
      return false;
    }

    // Если движок уже знает об этом враге (knowledge), то блокируем как видимого
    const known = state.knowledge?.[unit.owner]?.[occupant.id];
    if (known) return false;

    // Правило: скрытый герой не может делить клетку с другим скрытым.
    if (unit.isStealthed) {
      return false;
    }

    // Иначе: враг невидим и неизвестен — можно наступить на его клетку.
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
  if (target.isStealthed) {
    if (
      source.heroId === HERO_CHIKATILO_ID &&
      Array.isArray(source.chikatiloMarkedTargets) &&
      source.chikatiloMarkedTargets.includes(target.id)
    ) {
      return true;
    }
    const known = state.knowledge?.[source.owner]?.[target.id];
    if (!unitCanSeeStealthed(state, source) && !known) {
      return false;
    }
  }

  return true;
}
