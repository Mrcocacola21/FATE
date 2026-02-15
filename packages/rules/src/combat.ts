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
  ABILITY_ODIN_MUNINN,
  canUseAbility,
  consumeAbilityCharges,
  getAbilitySpec,
  getCharges,
} from "./abilities";
import {
  HERO_CHIKATILO_ID,
  HERO_FEMTO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_GRIFFITH_ID,
  HERO_GUTS_ID,
  HERO_JEBE_ID,
  HERO_KALADIN_ID,
  HERO_ODIN_ID,
} from "./heroes";
import { isStormActive, isStormExempt } from "./forest";
import { canDirectlyTargetUnit, canSeeStealthedTarget } from "./visibility";
import { applyGriffithFemtoRebirth } from "./actions/heroes/griffith";


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

function isSpearmanReachTarget(attPos: Coord, defPos: Coord): boolean {
  const { dx, dy, cheb, sameRow, sameCol } = distanceInfo(attPos, defPos);
  if (cheb === 1) return true;
  if (cheb !== 2) return false;
  const isStraight = sameRow || sameCol;
  const isDiagonal = dx === dy;
  return isStraight || isDiagonal;
}

function isTricksterReachTarget(attPos: Coord, defPos: Coord): boolean {
  const { cheb } = distanceInfo(attPos, defPos);
  return cheb > 0 && cheb <= 2;
}

function recordGenghisAttack(attacker: UnitState, defenderId: string): UnitState {
  if (
    attacker.heroId !== HERO_GENGHIS_KHAN_ID &&
    attacker.heroId !== HERO_JEBE_ID
  ) {
    return attacker;
  }
  const existing = Array.isArray(attacker.genghisKhanAttackedThisTurn)
    ? attacker.genghisKhanAttackedThisTurn
    : [];
  if (existing.includes(defenderId)) {
    return attacker;
  }
  return {
    ...attacker,
    genghisKhanAttackedThisTurn: [...existing, defenderId],
  };
}

function hasLegendOfTheSteppesBonus(
  attacker: UnitState,
  defenderId: string
): boolean {
  if (
    attacker.heroId !== HERO_GENGHIS_KHAN_ID &&
    attacker.heroId !== HERO_JEBE_ID
  ) {
    return false;
  }
  const lastTurn = Array.isArray(attacker.genghisKhanAttackedLastTurn)
    ? attacker.genghisKhanAttackedLastTurn
    : [];
  return lastTurn.includes(defenderId);
}

function getChikatiloMarkBonus(attacker: UnitState, defenderId: string): number {
  if (attacker.heroId !== HERO_CHIKATILO_ID) {
    return 0;
  }
  const marked = attacker.chikatiloMarkedTargets;
  if (!Array.isArray(marked)) {
    return 0;
  }
  return marked.includes(defenderId) ? 1 : 0;
}

// --- Проверка цели атаки (дистанция / тип) ---

export function canAttackTarget(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  options?: { allowFriendlyTarget?: boolean }
): boolean {
  if (!attacker.isAlive || !defender.isAlive) return false;
  if (!attacker.position || !defender.position) return false;
  if (attacker.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;

  // Нельзя бить союзников обычной атакой
  if (!options?.allowFriendlyTarget && attacker.owner === defender.owner) {
    return false;
  }

  // Нельзя прямой таргет по скрытому (его надо сначала найти / снять AoE)
  if (defender.isStealthed) {
    const marked =
      attacker.heroId === HERO_CHIKATILO_ID &&
      Array.isArray(attacker.chikatiloMarkedTargets) &&
      attacker.chikatiloMarkedTargets.includes(defender.id);
    if (!marked && !canSeeStealthedTarget(state, attacker, defender)) {
      return false;
    }
  }

  const attPos = attacker.position;
  const defPos = defender.position;
  const { dx, dy, cheb, sameRow, sameCol } = distanceInfo(attPos, defPos);
  const attackerClass =
    attacker.heroId === HERO_FEMTO_ID ||
    (attacker.heroId === HERO_GUTS_ID &&
      attacker.gutsBerserkModeActive &&
      attacker.class !== "archer")
      ? "spearman"
      : attacker.class;

  if (isStormActive(state) && !isStormExempt(state, attacker)) {
    if (cheb > 1) return false;
  }

  switch (attackerClass) {
    case "spearman": {
      // 1 клетка вокруг + ровно 2 по прямой или диагонали
      if (isSpearmanReachTarget(attPos, defPos)) return true;
      if (attacker.heroId === HERO_KALADIN_ID) {
        return isTricksterReachTarget(attPos, defPos);
      }
      return false;
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
    allowFriendlyTarget?: boolean;
    rangedAttack?: boolean;
    // на будущее: защитник может решить, хочет ли он тратить заряд авто-защиты берсерка
    defenderUseBerserkAutoDefense?: boolean;
    defenderUseMuninnAutoDefense?: boolean;
    /** Для спец-кейсов (наездник по пути): не проверять дистанцию/тип атаки */
    ignoreRange?: boolean;
    /** Для AoE/path attacks: игнорировать стелс и при атаке раскрывать цель */
    ignoreStealth?: boolean;
    /** Разрешить раскрывать стелс союзников при ignoreStealth (например, Trickster AoE). */
    revealStealthedAllies?: boolean;
    /** Причина раскрытия стелса при ignoreStealth. */
    revealReason?: StealthRevealReason;
    damageBonus?: number;
    damageOverride?: number;
    ignoreBonuses?: boolean;
    autoHit?: boolean;
    forceMiss?: boolean;
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
  if (
    !params.ignoreRange &&
    !canAttackTarget(state, attacker, defender, {
      allowFriendlyTarget: params.allowFriendlyTarget,
    })
  ) {
    // Невалидная цель по дистанции / типу — игнорируем
    return { nextState: state, events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  let attackerAfter: UnitState = { ...attacker };
  let defenderAfter: UnitState = { ...defender };
  const events: GameEvent[] = [];

  // ---- Берсерк: авто-уклонение ДО бросков, тратит все заряды Заряд(6) ----
  const wantsBerserkAutoDefense =
    params.defenderUseBerserkAutoDefense === true;
  const wantsMuninnAutoDefense = params.defenderUseMuninnAutoDefense === true;

  let autoDefenseAbilityId: string | null = null;
  if (
    wantsBerserkAutoDefense &&
    (defenderAfter.class === "berserker" ||
      defenderAfter.heroId === HERO_FEMTO_ID)
  ) {
    autoDefenseAbilityId = ABILITY_BERSERK_AUTO_DEFENSE;
  } else if (wantsMuninnAutoDefense && defenderAfter.heroId === HERO_ODIN_ID) {
    autoDefenseAbilityId = ABILITY_ODIN_MUNINN;
  }

  if (autoDefenseAbilityId) {
    const spec = getAbilitySpec(autoDefenseAbilityId);
    const currentCharges = getCharges(
      defenderAfter,
      autoDefenseAbilityId
    );
    const requiredCharges =
      spec?.maxCharges ?? spec?.chargesPerUse ?? spec?.chargeCost ?? 0;

    // Срабатывает только при полных зарядах (6) и при явном выборе игрока
    if (
      spec &&
      currentCharges === requiredCharges &&
      canUseAbility(defenderAfter, autoDefenseAbilityId)
    ) {
      defenderAfter = consumeAbilityCharges(
        defenderAfter,
        autoDefenseAbilityId
      );

      units[attackerAfter.id] = attackerAfter;
      units[defenderAfter.id] = defenderAfter;

      events.push({
        type: "abilityUsed",
        unitId: defenderAfter.id,
        abilityId: autoDefenseAbilityId,
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

      attackerAfter = recordGenghisAttack(attackerAfter, defenderAfter.id);
      units[attackerAfter.id] = attackerAfter;

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
  if (
    attackerDice.length < 2 ||
    (!params.autoHit && !params.forceMiss && defenderDice.length < 2)
  ) {
    return { nextState: state, events: [] };
  }

  const tieBreakAttacker = rollInput.tieBreakAttacker ?? [];
  const tieBreakDefender = rollInput.tieBreakDefender ?? [];

  const attackerRoll = buildDiceRoll(attackerDice, tieBreakAttacker);
  const defenderRoll = params.forceMiss
    ? {
        dice: [],
        sum: 0,
        isDouble: false,
      }
    : buildDiceRoll(defenderDice, tieBreakDefender);

  let hit = params.forceMiss
    ? false
    : params.autoHit
    ? true
    : attackerRoll.sum > defenderRoll.sum;

  // --- Пассивки классов ---

  // Копейщик на защите: при дубле на защите — авто-уклонение
  // (дубль проверяется только по первым двум кубам).
  if (
    !params.autoHit &&
    !params.forceMiss &&
    (defenderAfter.class === "spearman" ||
      defenderAfter.heroId === HERO_FEMTO_ID ||
      defenderAfter.heroId === HERO_ODIN_ID) &&
    defenderRoll.isDouble
  ) {
    hit = false;
  }

  // Рыцарь в атаке: при дубле на атаке — авто-попадание.
  // Защитник всё равно кидал защиту, но дубль рыцаря перетирает результат.
  if (
    !params.forceMiss &&
    (attackerAfter.class === "knight" ||
      attackerAfter.heroId === HERO_GUTS_ID ||
      attackerAfter.heroId === HERO_ODIN_ID) &&
    attackerRoll.isDouble
  ) {
    hit = true;
  }

  // --- Урон / выход из стелса ассасина ---
  let damage = 0;
  let defenderHpAfterEvent = defenderAfter.hp;
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
        revealerId: attackerAfter.id,
      });

      // update working copies
      units[defenderAfter.id] = defenderAfter;
      state = tmpState;
    }
  }

  if (hit) {
    const attackerWasStealthed =
      attackerAfter.class === "assassin" && attackerAfter.isStealthed;

    if (attackerWasStealthed) {
      attackerAfter = {
        ...attackerAfter,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      revealedAttackerPos = attackerAfter.position ?? null;
      attackerRevealedToDefender = true;
    }

    if (params.damageOverride !== undefined) {
      damage = params.damageOverride;
    } else if (attackerWasStealthed) {
      // ?????????? ???? ????????????????????: 2 ?????????? ?? ?????????? ???? ????????????
      damage = 2;
    } else {
      damage = attackerAfter.attack;
    }

    if (!params.ignoreBonuses) {
      if (params.damageBonus) {
        damage += params.damageBonus;
      }
      const markBonus = getChikatiloMarkBonus(attackerAfter, defenderAfter.id);
      if (markBonus) {
        damage += markBonus;
      }
      if (hasLegendOfTheSteppesBonus(attackerAfter, defenderAfter.id)) {
        damage += 1;
      }
      if (
        attackerAfter.heroId === HERO_GUTS_ID &&
        attackerAfter.gutsBerserkModeActive &&
        !params.rangedAttack
      ) {
        damage += 1;
      }
      if (
        attackerAfter.heroId === HERO_KALADIN_ID &&
        !params.rangedAttack &&
        !params.ignoreRange &&
        attackerAfter.position &&
        defenderAfter.position &&
        isSpearmanReachTarget(attackerAfter.position, defenderAfter.position)
      ) {
        damage += 1;
      }
    }

    if (attackerAfter.heroId === HERO_GRIFFITH_ID) {
      damage = Math.max(0, damage - 1);
    }

    if (defenderAfter.bunker?.active) {
      damage = Math.min(1, damage);
    }

    if (
      defenderAfter.heroId === HERO_GUTS_ID &&
      defenderAfter.gutsBerserkModeActive
    ) {
      damage = Math.min(1, damage);
    }

    const newHp = Math.max(0, defenderAfter.hp - damage);
    defenderAfter = {
      ...defenderAfter,
      hp: newHp,
    };
    defenderHpAfterEvent = newHp;

    if (newHp <= 0) {
      const deathPosition = defenderAfter.position ? { ...defenderAfter.position } : null;
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
      const rebirth = applyGriffithFemtoRebirth(defenderAfter, deathPosition);
      if (rebirth.transformed) {
        defenderAfter = rebirth.unit;
        events.push(...rebirth.events);
      }
    }
  }

  units[attackerAfter.id] = attackerAfter;
  units[defenderAfter.id] = defenderAfter;

  attackerAfter = recordGenghisAttack(attackerAfter, defenderAfter.id);
  units[attackerAfter.id] = attackerAfter;

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

  if (attackerRevealedToDefender) {
    events.push({
      type: "stealthRevealed",
      unitId: attackerAfter.id,
      reason: "attacked",
      revealerId: attackerAfter.id,
    });
  }

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
    defenderHpAfter: defenderHpAfterEvent,
  });

  return { nextState, events };
}

