// packages/rules/src/combat.ts

import {
  GameState,
  GameEvent,
  UnitState,
  DiceRoll,
  Coord,
} from "./model";
import { RNG, rollD6 } from "./rng";
import { getUnitAt } from "./board";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  canUseAbility,
  consumeAbilityCharges,
} from "./abilities";
import { canDirectlyTargetUnit } from "./visibility";


// --- Вспомогательные функции кубов ---

function roll2D6(rng: RNG): DiceRoll {
  const d1 = rollD6(rng);
  const d2 = rollD6(rng);
  const sum = d1 + d2;
  return {
    dice: [d1, d2],
    sum,
    isDouble: d1 === d2,
  };
}

function distanceInfo(attPos: Coord, defPos: Coord) {
  const dx = Math.abs(defPos.col - attPos.col);
  const dy = Math.abs(defPos.row - attPos.row);
  const cheb = Math.max(dx, dy);
  const sameRow = attPos.row === defPos.row;
  const sameCol = attPos.col === defPos.col;
  return { dx, dy, cheb, sameRow, sameCol };
}

// --- Проверка цели атаки (дистанция / тип) ---

export function canAttackTarget(
  state: GameState,
  attacker: UnitState,
  defender: UnitState
): boolean {
  if (!attacker.isAlive || !defender.isAlive) return false;
  if (!attacker.position || !defender.position) return false;

  // Нельзя бить союзников обычной атакой
  if (attacker.owner === defender.owner) return false;

  // Нельзя прямой таргет по скрытому (его надо сначала найти / снять AoE)
  if (defender.isStealthed) return false;

  const attPos = attacker.position;
  const defPos = defender.position;
  const { dx, dy, cheb, sameRow, sameCol } = distanceInfo(attPos, defPos);

  switch (attacker.class) {
    case "spearman": {
      // ровно на 2 клетки по прямой или диагонали
      if (cheb !== 2) return false;
      const isStraight = sameRow || sameCol;
      const isDiagonal = dx === dy;
      return isStraight || isDiagonal;
    }

    case "rider":
    case "knight":
    case "assassin":
    case "berserker": {
      // мили на 1 клетку
      return cheb === 1;
    }

    case "archer": {
      // любая дистанция по прямой
      // Арчер может стрелять ЧЕРЕЗ своих, но не через чужих:
      // он поражает ПЕРВОГО врага по линии.
      if (!sameRow && !sameCol) return false;

      const stepCol = Math.sign(defPos.col - attPos.col);
      const stepRow = Math.sign(defPos.row - attPos.row);
      if (stepCol === 0 && stepRow === 0) return false;

      let col = attPos.col + stepCol;
      let row = attPos.row + stepRow;

      let firstEnemy: UnitState | null = null;

      while (
        col >= 0 &&
        col < state.boardSize &&
        row >= 0 &&
        row < state.boardSize
      ) {
        const u = getUnitAt(state, { col, row });
        if (u) {
          if (u.owner !== attacker.owner) {
            firstEnemy = u;
            break;
          }
          // свой — стрела летит дальше
        }

        col += stepCol;
        row += stepRow;
      }

      // Можно целиться только в первого врага по линии
      return !!firstEnemy && firstEnemy.id === defender.id;
    }

    case "trickster": {
      // цель в радиусе 2 (Chebyshev)
      return cheb > 0 && cheb <= 2;
    }

    default:
      return false;
  }
}

// --- Основное разрешение атаки ---
// --- Основное разрешение атаки ---
export function resolveAttack(
  state: GameState,
  params: {
    attackerId: string;
    defenderId: string;
    // на будущее: защитник может решить, хочет ли он тратить заряд авто-защиты берсерка
    defenderUseBerserkAutoDefense?: boolean;
    /** Для спец-кейсов (наездник по пути): не проверять дистанцию/тип атаки */
    ignoreRange?: boolean;
  },
  rng: RNG
): { nextState: GameState; events: GameEvent[] } {
  const attacker = state.units[params.attackerId];
  const defender = state.units[params.defenderId];

  // базовые проверки существования
  if (!attacker || !defender) {
    return { nextState: state, events: [] };
  }
  if (!attacker.isAlive || !defender.isAlive) {
    return { nextState: state, events: [] };
  }
  if (!attacker.position || !defender.position) {
    return { nextState: state, events: [] };
  }

  // Нельзя напрямую таргетить невидимого врага (стелс).
  // AoE-атаки должны резолвиться отдельной логикой, а не через resolveAttack.
  if (!canDirectlyTargetUnit(state, attacker.id, defender.id)) {
    return { nextState: state, events: [] };
  }

  // Проверка дистанции / типа атаки / линии выстрела и т.п.
  if (!params.ignoreRange && !canAttackTarget(state, attacker, defender)) {
    // Невалидная цель по дистанции / типу — игнорируем
    return { nextState: state, events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  let attackerAfter: UnitState = { ...attacker };
  let defenderAfter: UnitState = { ...defender };
  const events: GameEvent[] = [];

  // ---- Берсерк: авто-уклонение ДО бросков, тратит все заряды Заряд(6) ----
  const wantsAutoDefense =
    params.defenderUseBerserkAutoDefense === true;

  if (defenderAfter.class === "berserker" && wantsAutoDefense) {
    // проверяем, хватает ли зарядов на способность
    if (canUseAbility(defenderAfter, ABILITY_BERSERK_AUTO_DEFENSE)) {
      defenderAfter = consumeAbilityCharges(
        defenderAfter,
        ABILITY_BERSERK_AUTO_DEFENSE
      );

      units[attackerAfter.id] = attackerAfter;
      units[defenderAfter.id] = defenderAfter;

      events.push({
        type: "abilityUsed",
        unitId: defenderAfter.id,
        abilityId: ABILITY_BERSERK_AUTO_DEFENSE,
      });

      // Логируем "атаку без бросков" — просто авто-додж
      const attackerRoll: DiceRoll = {
        dice: [],
        sum: 0,
        isDouble: false,
      };
      const defenderRoll: DiceRoll = {
        dice: [],
        sum: 0,
        isDouble: false,
      };

      events.push({
        type: "attackResolved",
        attackerId: attackerAfter.id,
        defenderId: defenderAfter.id,
        attackerRoll,
        defenderRoll,
        hit: false,
        damage: 0,
        defenderHpAfter: defenderAfter.hp,
      });

      const nextState: GameState = {
        ...state,
        units,
      };

      return { nextState, events };
    }
  }

  // дальше — обычная боёвка (2к6, дубль рыцаря, копейщика, ассасин и т.д.)

  // --- Броски 2к6 обеим сторонам ---
  const attackerRoll = roll2D6(rng);
  const defenderRoll = roll2D6(rng);

  // При ничьей докидываем по 1к6 до определения результата — ОБЩЕЕ правило.
  // ВАЖНО: isDouble остаётся про первые 2 куба; доп.кубы только увеличивают dice[] и sum.
  while (attackerRoll.sum === defenderRoll.sum) {
    const a = rollD6(rng);
    const d = rollD6(rng);

    attackerRoll.dice.push(a);
    defenderRoll.dice.push(d);

    attackerRoll.sum += a;
    defenderRoll.sum += d;
  }

  // Базовый исход: у кого итоговая сумма больше — тот выигрывает
  let hit = attackerRoll.sum > defenderRoll.sum;

  // --- Пассивки классов ---

  // Копейщик на защите: при дубле на защите — авто-уклонение
  // (дубль проверяется только по первым двум кубам).
  if (defenderAfter.class === "spearman" && defenderRoll.isDouble) {
    hit = false;
  }

  // Рыцарь в атаке: при дубле на атаке — авто-попадание.
  // Защитник всё равно кидал защиту, но дубль рыцаря перетирает результат.
  if (attackerAfter.class === "knight" && attackerRoll.isDouble) {
    hit = true;
  }

  // Берсерк: простая версия авто-защиты через счётчик зарядов
  // (если не сработала ability-версия выше).
  const useBerserkerAutoDefense =
    params.defenderUseBerserkAutoDefense ?? true;

  if (
    defenderAfter.class === "berserker" &&
    useBerserkerAutoDefense
  ) {
    const currentCharges =
      defenderAfter.charges["berserkAutoDefense"] ?? 0;
    if (currentCharges > 0) {
      hit = false;
      defenderAfter = {
        ...defenderAfter,
        charges: {
          ...defenderAfter.charges,
          berserkAutoDefense: currentCharges - 1,
        },
      };
      events.push({
        type: "abilityUsed",
        unitId: defenderAfter.id,
        abilityId: "berserkAutoDefense",
      });
    }
  }

  // --- Урон / выход из стелса ассасина ---
  let damage = 0;

  if (hit) {
    if (attackerAfter.class === "assassin" && attackerAfter.isStealthed) {
      // Атака из скрытности: 2 урона и выход из стелса
      damage = 2;
      attackerAfter = {
        ...attackerAfter,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
    } else {
      damage = attackerAfter.attack;
    }

    const newHp = Math.max(0, defenderAfter.hp - damage);
    defenderAfter = {
      ...defenderAfter,
      hp: newHp,
    };

    if (newHp <= 0) {
      defenderAfter = {
        ...defenderAfter,
        isAlive: false,
        position: null,
      };
      events.push({
        type: "unitDied",
        unitId: defenderAfter.id,
        killerId: attackerAfter.id,
      });
    }
  }

  units[attackerAfter.id] = attackerAfter;
  units[defenderAfter.id] = defenderAfter;

  const nextState: GameState = {
    ...state,
    units,
  };

  events.push({
    type: "attackResolved",
    attackerId: attackerAfter.id,
    defenderId: defenderAfter.id,
    attackerRoll,
    defenderRoll,
    hit,
    damage,
    defenderHpAfter: defenderAfter.hp,
  });

  return { nextState, events };
}

