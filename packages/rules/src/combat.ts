// packages/rules/src/combat.ts

import {
  GameState,
  GameEvent,
  UnitState,
  DiceRoll,
  Coord,
  StealthRevealReason,
} from "./model";
import { getUnitAt } from "./board";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  canUseAbility,
  consumeAbilityCharges,
  getAbilitySpec,
  getCharges,
} from "./abilities";
import { canDirectlyTargetUnit } from "./visibility";


// --- Вспомогательные функции кубов ---

function buildDiceRoll(base: number[], tieBreak: number[]): DiceRoll {
  const dice = [...base, ...tieBreak];
  const sum = dice.reduce((acc, v) => acc + v, 0);
  const isDouble = base.length >= 2 && base[0] === base[1];
  return { dice, sum, isDouble };
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
      // ????? ?????: ?????? ? ????????? (8 ???????????)
      // ????? ????? ???????? ????? ?????????, ?? ?? ????? ??????:
      // ???????? ??????? ????? ?? ????.
      const isStraight = sameRow || sameCol;
      const isDiagonal = dx === dy;
      if (!isStraight && !isDiagonal) return false;

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
          // ???? ? ?????? ????? ??????
        }

        col += stepCol;
        row += stepRow;
      }

      // ????? ???????? ?????? ? ??????? ????? ?? ????
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
    /** Для AoE/path attacks: игнорировать стелс и при атаке раскрывать цель */
    ignoreStealth?: boolean;
    /** Разрешить раскрывать стелс союзников при ignoreStealth (например, Trickster AoE). */
    revealStealthedAllies?: boolean;
    /** Причина раскрытия стелса при ignoreStealth. */
    revealReason?: StealthRevealReason;
    rolls?: {
      attackerDice: number[];
      defenderDice: number[];
      tieBreakAttacker?: number[];
      tieBreakDefender?: number[];
    };
  }
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
  if (!params.ignoreStealth && !canDirectlyTargetUnit(state, attacker.id, defender.id)) {
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
    const spec = getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE);
    const currentCharges = getCharges(
      defenderAfter,
      ABILITY_BERSERK_AUTO_DEFENSE
    );
    const requiredCharges =
      spec?.maxCharges ?? spec?.chargesPerUse ?? spec?.chargeCost ?? 0;

    // Срабатывает только при полных зарядах (6) и при явном выборе игрока
    if (
      spec &&
      currentCharges === requiredCharges &&
      canUseAbility(defenderAfter, ABILITY_BERSERK_AUTO_DEFENSE)
    ) {
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
      const rollInput = params.rolls;
      const attackerRoll = rollInput
        ? buildDiceRoll(
            rollInput.attackerDice ?? [],
            rollInput.tieBreakAttacker ?? []
          )
        : {
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
  const rollInput = params.rolls;
  if (!rollInput) {
    return { nextState: state, events: [] };
  }

  const attackerDice = rollInput.attackerDice ?? [];
  const defenderDice = rollInput.defenderDice ?? [];
  if (attackerDice.length < 2 || defenderDice.length < 2) {
    return { nextState: state, events: [] };
  }

  const tieBreakAttacker = rollInput.tieBreakAttacker ?? [];
  const tieBreakDefender = rollInput.tieBreakDefender ?? [];

  const attackerRoll = buildDiceRoll(attackerDice, tieBreakAttacker);
  const defenderRoll = buildDiceRoll(defenderDice, tieBreakDefender);

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

  // --- Урон / выход из стелса ассасина ---
  let damage = 0;
  let attackerRevealedToDefender = false;
  let revealedDefenderPos: Coord | null = null;
  let revealedAttackerPos: Coord | null = null;

  // Если цель была в стелсе и мы специально атакуем (AoE/path), раскрываем её для атакующего
  if (defenderAfter.isStealthed && params.ignoreStealth) {
    const shouldReveal =
      params.revealStealthedAllies || attackerAfter.owner !== defenderAfter.owner;
    if (shouldReveal) {
      defenderAfter = {
        ...defenderAfter,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      revealedDefenderPos = defenderAfter.position ?? null;

      // Обновляем knowledge: атакующий владелец теперь знает цель
      const attackerOwner = attackerAfter.owner;
      const nextKnowledge = {
        ...state.knowledge,
        [attackerOwner]: {
          ...(state.knowledge?.[attackerOwner] ?? {}),
          [defenderAfter.id]: true,
        },
      };

      const tmpUnits = { ...units, [defenderAfter.id]: defenderAfter };
      const tmpState: GameState = { ...state, units: tmpUnits, knowledge: nextKnowledge };

      // push reveal event
      events.push({
        type: "stealthRevealed",
        unitId: defenderAfter.id,
        reason: params.revealReason ?? "attacked",
      });

      // update working copies
      units[defenderAfter.id] = defenderAfter;
      state = tmpState;
    }
  }

  if (hit) {
    if (attackerAfter.class === "assassin" && attackerAfter.isStealthed) {
      // Атака из скрытности: 2 урона и выход из стелса
      damage = 2;
      attackerAfter = {
        ...attackerAfter,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      revealedAttackerPos = attackerAfter.position ?? null;
      attackerRevealedToDefender = true;
    } else {
      damage = attackerAfter.attack;
    }

    if (defenderAfter.bunker?.active) {
      damage = Math.min(1, damage);
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

  const updatedLastKnown = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  if (revealedDefenderPos) {
    delete updatedLastKnown.P1[defenderAfter.id];
    delete updatedLastKnown.P2[defenderAfter.id];
  }
  if (revealedAttackerPos) {
    delete updatedLastKnown.P1[attackerAfter.id];
    delete updatedLastKnown.P2[attackerAfter.id];
  }

  const nextState: GameState = {
    ...state,
    units,
    knowledge: attackerRevealedToDefender
      ? {
          ...state.knowledge,
          [defenderAfter.owner]: {
            ...(state.knowledge?.[defenderAfter.owner] ?? {}),
            [attackerAfter.id]: true,
          },
        }
      : state.knowledge,
    lastKnownPositions: updatedLastKnown,
  };

  events.push({
    type: "attackResolved",
    attackerId: attackerAfter.id,
    defenderId: defenderAfter.id,
    attackerRoll,
    defenderRoll,
    tieBreakDice:
      tieBreakAttacker.length > 0
        ? { attacker: tieBreakAttacker, defender: tieBreakDefender }
        : undefined,
    hit,
    damage,
    defenderHpAfter: defenderAfter.hp,
  });

  return { nextState, events };
}

