// packages/rules/src/actions.ts

import {
  GameState,
  GameAction,
  ApplyResult,
  UnitState,
  PlayerId,
  GameEvent,
  Coord,
  isInsideBoard
} from "./model";
import { getUnitDefinition } from "./units";
import { RNG, rollD6 } from "./rng";
import { resolveAttack } from "./combat";
import { 
  getLegalMovesForUnit,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
 } from "./movement";
import { coordsEqual, chebyshev, isCellOccupied, getUnitAt} from "./board";
import {
  attemptEnterStealth,
  performSearchStealth,
  processStartOfTurnStealth,
} from "./stealth";
import {
  initUnitAbilities,
  processUnitStartOfTurn,
  getAbilitySpec,
  spendCharges,
} from "./abilities";
import { unitCanSeeStealthed } from "./visibility";

function roll2D6Sum(rng: RNG): number {
  const d1 = rollD6(rng);
  const d2 = rollD6(rng);
  return d1 + d2;
}

function applyRollInitiative(
  state: GameState,
  rng: RNG
): ApplyResult {
  // Бросаем инициативу только в фазе расстановки
  if (state.phase !== "placement") {
    return { state, events: [] };
  }

  // Уже бросали — второй раз не даём
  if (state.initiative.P1 !== null || state.initiative.P2 !== null) {
    return { state, events: [] };
  }

  let p1: number;
  let p2: number;

  // Перебрасываем, пока не будет разницы
  do {
    p1 = roll2D6Sum(rng);
    p2 = roll2D6Sum(rng);
  } while (p1 === p2);

  const placementFirstPlayer: PlayerId = p1 > p2 ? "P1" : "P2";

  const newState: GameState = {
    ...state,
    initiative: {
      P1: p1,
      P2: p2,
    },
    placementFirstPlayer,
    // важное: тот, кто ставит первым, становится currentPlayer
    currentPlayer: placementFirstPlayer,
  };

  const events: GameEvent[] = [
    {
      type: "initiativeRolled",
      rolls: { P1: p1, P2: p2 },
      placementFirstPlayer,
    },
  ];

  return { state: newState, events };
}

function applyChooseArena(
  state: GameState,
  action: Extract<GameAction, { type: "chooseArena" }>
): ApplyResult {
  // Выбор арены имеет смысл только до боя
  if (state.phase !== "placement") {
    return { state, events: [] };
  }

  // Уже выбрали арену — повтор не нужен
  if (state.arenaId !== null) {
    return { state, events: [] };
  }

  // По-хорошему, арену выбирают ПОСЛЕ броска инициативы
  if (state.initiative.P1 === null || state.initiative.P2 === null) {
    return { state, events: [] };
  }

  const newState: GameState = {
    ...state,
    arenaId: action.arenaId,
  };

  const events: GameEvent[] = [
    {
      type: "arenaChosen",
      arenaId: action.arenaId,
    },
  ];

  return { state: newState, events };
}


function applyUseAbility(
  state: GameState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(action.abilityId);
  if (!spec) {
    return { state, events: [] };
  }

  const cost = spec.actionCost;

  // Проверяем экономику
  if (cost?.consumesAction && unit.hasActedThisTurn) {
    return { state, events: [] };
  }
  if (cost?.consumesMove && unit.hasMovedThisTurn) {
    return { state, events: [] };
  }
  if (cost?.consumesStealthSlot && unit.stealthAttemptedThisTurn) {
    return { state, events: [] };
  }

  // Сколько зарядов надо на использование
  const chargeAmount =
    spec.chargesPerUse ?? spec.chargeCost ?? 0;

  // Платим зарядами
  const { unit: afterCharges, ok } = spendCharges(
    unit,
    spec.id,
    chargeAmount
  );
  if (!ok || !afterCharges) {
    return { state, events: [] };
  }

  // Обновляем экономику
  const updatedUnit: UnitState = {
    ...afterCharges,
    hasActedThisTurn:
      unit.hasActedThisTurn || !!cost?.consumesAction,
    hasMovedThisTurn:
      unit.hasMovedThisTurn || !!cost?.consumesMove,
    stealthAttemptedThisTurn:
      unit.stealthAttemptedThisTurn || !!cost?.consumesStealthSlot,
  };

  // TODO: сюда потом добавим реальный эффект способности (урон/баф/телепорт)

  const newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    {
      type: "abilityUsed",
      unitId: updatedUnit.id,
      abilityId: spec.id,
    },
  ];

  return { state: newState, events };
}




export function createEmptyGame(): GameState {
  return {
    boardSize: 9,
    phase: "placement",
    currentPlayer: "P1",
    turnNumber: 1,
    roundNumber: 1,

    activeUnitId: null,
    turnOrder: [],
    turnOrderIndex: 0,

    units: {},
    events: [],

    initiative: { P1: null, P2: null },
    placementFirstPlayer: null,
    arenaId: null,
    startingUnitId: null,
    unitsPlaced: { P1: 0, P2: 0 },
  };
}



export function rollInitiativeForMatch(
  state: GameState,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  // просто делегируем в applyRollInitiative
  return applyRollInitiative(state, rng);
}

export function setArena(
  state: GameState,
  arenaId: string
): { state: GameState; events: GameEvent[] } {
  // просто делегируем в applyChooseArena
  return applyChooseArena(state, { type: "chooseArena", arenaId });
}



// Создаём 7 фигур игрока с дефолтными статами и ещё без позиции
export function createDefaultArmy(player: PlayerId): UnitState[] {
  const classesOrder = [
    "rider",
    "spearman",
    "trickster",
    "assassin",
    "berserker",
    "archer",
    "knight",
  ] as const;

  return classesOrder.map((cls, index) => {
    const def = getUnitDefinition(cls);
    const id = `${player}-${cls}-${index + 1}`;

    let unit: UnitState = {
      id,
      owner: player,
      class: def.class,
      hp: def.maxHp,
      attack: def.baseAttack,
      position: null,
      isStealthed: false,
      stealthTurnsLeft: 0,
      stealthAttemptedThisTurn: false,
      charges: {},
      cooldowns: {},
      lastChargedTurn: undefined,
    
      hasMovedThisTurn: false,
      hasActedThisTurn: false,
    
      isAlive: true,
    };

    unit = initUnitAbilities(unit);

    return unit;
  });
}




// Добавить армию в GameState
export function attachArmy(
  state: GameState,
  army: UnitState[]
): GameState {
  const units = { ...state.units };
  for (const u of army) {
    units[u.id] = u;
  }
  return { ...state, units };
}

function nextPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

// Применяем действие к состоянию игры
export function applyAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
  switch (action.type) {
    case "rollInitiative":
      return applyRollInitiative(state, rng);

    case "chooseArena":
      return applyChooseArena(state, action);

    case "unitStartTurn":
      return applyUnitStartTurn(state, action, rng);

    case "placeUnit":
      return applyPlaceUnit(state, action);

    case "move":
      return applyMove(state, action, rng);

    case "attack":
      return applyAttack(state, action, rng);

    case "enterStealth":
      return applyEnterStealth(state, action, rng);

    case "searchStealth":
      return applySearchStealth(state, action, rng);

    case "useAbility":
      return applyUseAbility(state, action, rng);

    case "endTurn":
      return applyEndTurn(state, rng);

    default:
      return { state, events: [] };
  }
}


function getOwnerOfStartingUnit(
  state: GameState,
  startingUnitId: string,
  justPlaced: UnitState
): PlayerId {
  if (startingUnitId === justPlaced.id) {
    return justPlaced.owner;
  }
  const u = state.units[startingUnitId];
  return u ? u.owner : justPlaced.owner;
}

function getNextAliveUnitIndex(
  state: GameState,
  fromIndex: number
): number | null {
  const order = state.turnOrder;
  const len = order.length;
  if (len === 0) return null;

  for (let step = 1; step <= len; step++) {
    const idx = (fromIndex + step) % len;
    const unitId = order[idx];
    const u = state.units[unitId];
    if (u && u.isAlive && u.position) {
      return idx;
    }
  }

  // Нет живых фигур вообще
  return null;
}


function applyPlaceUnit(
  state: GameState,
  action: Extract<GameAction, { type: "placeUnit" }>
): ApplyResult {
  if (state.phase !== "placement") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  // Нельзя выставлять фигуру не своего игрока
  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  // Нельзя повторно "выставлять" уже поставленную фигуру
  if (unit.position) {
    return { state, events: [] };
  }

  const pos = action.position;

  // Координата должна быть на доске
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }

  // Клетка должна быть свободна
  if (isCellOccupied(state, pos)) {
    return { state, events: [] };
  }

  // Ограничение: только b–h (колонки 1..7) задней линии своего игрока
  const backRow = unit.owner === "P1" ? 0 : state.boardSize - 1;
  if (pos.row !== backRow) {
    return { state, events: [] };
  }
  if (pos.col < 1 || pos.col > state.boardSize - 2) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...unit,
    position: { ...pos },
  };

  const owner = unit.owner;

  // Обновляем счётчик выставленных фигур
  const unitsPlaced = {
    ...state.unitsPlaced,
    [owner]: state.unitsPlaced[owner] + 1,
  };

  // Первая поставленная фигура — кандидат на «ходит первой»
  const startingUnitId = state.startingUnitId ?? updatedUnit.id;

  // Глобальная очередь ходов: просто складываем id по фактическому порядку placement
  const turnOrder = [...state.turnOrder, updatedUnit.id];

  // По умолчанию — переключаем право расстановки
  const otherPlayer: PlayerId = owner === "P1" ? "P2" : "P1";
  let phase: GameState["phase"] = state.phase;
  let currentPlayer: PlayerId = otherPlayer;
  let turnNumber = state.turnNumber;
  let roundNumber = state.roundNumber;
  let activeUnitId = state.activeUnitId;
  let turnOrderIndex = state.turnOrderIndex;

  let extraEvents: GameEvent[] = [];

  // Проверяем, закончилась ли расстановка у ОБОИХ
  if (unitsPlaced.P1 >= 7 && unitsPlaced.P2 >= 7) {
    // Переходим в бой
    phase = "battle";
    turnNumber = 1;
    roundNumber = 1;
    activeUnitId = null;

    const startingOwner = getOwnerOfStartingUnit(
      state,
      startingUnitId,
      updatedUnit
    );

    // Кто владеет первой поставленной фигурой — тот «первый ходит»
    currentPlayer = startingOwner;

    // Смещаем указатель очереди так, чтобы первым в очереди был именно startingUnitId
    const idx = turnOrder.indexOf(startingUnitId);
    turnOrderIndex = idx >= 0 ? idx : 0;

    extraEvents.push({
      type: "battleStarted",
      startingUnitId,
      startingPlayer: startingOwner,
    });
  }

  const newState: GameState = {
    ...state,
    phase,
    currentPlayer,
    turnNumber,
    roundNumber,
    activeUnitId,
    startingUnitId,
    unitsPlaced,
    turnOrder,
    turnOrderIndex,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    {
      type: "unitPlaced",
      unitId: updatedUnit.id,
      position: updatedUnit.position!,
    },
    ...extraEvents,
  ];

  return { state: newState, events };
}


function applyAttack(
  state: GameState,
  action: Extract<GameAction, { type: "attack" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const attacker = state.units[action.attackerId];
  const defender = state.units[action.defenderId];
  if (!attacker || !defender) {
    return { state, events: [] };
  }

  if (attacker.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== attacker.id) {
    return { state, events: [] };
  }

  // 🚫 уже тратил действие (атака / поиск / активка)
  if (attacker.hasActedThisTurn) {
    return { state, events: [] };
  }

  const { nextState, events } = resolveAttack(
    state,
    {
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: action.defenderUseBerserkAutoDefense,
    },
    rng
  );

  const attackerAfter = nextState.units[attacker.id];
  if (!attackerAfter) {
    return { state: nextState, events };
  }

  const updatedAttacker: UnitState = {
    ...attackerAfter,
    hasActedThisTurn: true, // ✅ потратили действие
  };

  const finalState: GameState = {
    ...nextState,
    units: {
      ...nextState.units,
      [updatedAttacker.id]: updatedAttacker,
    },
  };

  return { state: finalState, events };
}

function collectRiderPathTargets(
  state: GameState,
  rider: UnitState,
  from: Coord,
  to: Coord
): string[] {
  const targets: string[] = [];

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  // Нас интересует только чисто ортогональное движение (как ладья).
  const isOrthogonal =
    (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return targets;
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  // Идём от клетки после старта до клетки назначения включительно
  for (let i = 1; i <= steps; i++) {
    const cell: Coord = {
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    };

    const u = getUnitAt(state, cell);
    if (!u || !u.isAlive) continue;

    // Союзников не бьём "по пути"
    if (u.owner === rider.owner) continue;

    // Скрытого врага бить нельзя, если его не "видим"
    if (u.isStealthed && !unitCanSeeStealthed(state, rider)) {
      continue;
    }

    targets.push(u.id);
  }

  return targets;
}


function applyMove(
  state: GameState,
  action: Extract<GameAction, { type: "move" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  // начальная позиция — пригодится для спец-правила наездника
  const from = unit.position;

  // 🚫 уже ходил в этом ходу
  if (unit.hasMovedThisTurn) {
    return { state, events: [] };
  }

  let legalMoves: Coord[] = [];

  if (unit.class === "trickster") {
    const roll = rollD6(rng);
    legalMoves = getTricksterMovesForRoll(state, unit.id, roll);
  } else if (unit.class === "berserker") {
    const roll = rollD6(rng);
    legalMoves = getBerserkerMovesForRoll(state, unit.id, roll);
  } else {
    legalMoves = getLegalMovesForUnit(state, unit.id);
  }

  const isLegal = legalMoves.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...unit,
    position: { ...action.to },
    hasMovedThisTurn: true, // ✅ потратили перемещение
  };

  let newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    {
      type: "unitMoved",
      unitId: updatedUnit.id,
      from,
      to: updatedUnit.position!,
    },
  ];

  // ---- Спец-правило наездника: атакует всех врагов, через которых проехал ----
  if (unit.class === "rider" && from) {
    // ВАЖНО: путь считаем по старому state и старому положению,
    // а урон применяем уже к состоянию после перемещения (newState)
    const targetIds = collectRiderPathTargets(state, unit, from, action.to);

    let tmpState = newState;

    for (const defenderId of targetIds) {
      const { nextState, events: attackEvents } = resolveAttack(
        tmpState,
        {
          attackerId: unit.id,
          defenderId,
          // ignoreRange: true → для этой спец-атаки игнорируем дистанцию
          ignoreRange: true,
        },
        rng
      );

      tmpState = nextState;
      events.push(...attackEvents);
    }

    newState = tmpState;
  }

  return { state: newState, events };
}




function applyEnterStealth(
  state: GameState,
  action: Extract<GameAction, { type: "enterStealth" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  // Уже пытался войти в стелс в этот ход
  if (unit.stealthAttemptedThisTurn) {
    return { state, events: [] };
  }

  // Уже в стелсе — считаем, что попытка всё равно потрачена
  if (unit.isStealthed) {
    const updated: UnitState = {
      ...unit,
      stealthAttemptedThisTurn: true,
    };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [updated.id]: updated,
        },
      },
      events: [],
    };
  }

  // Только ассасин и лучник могут в скрытность
  const canStealth =
    unit.class === "assassin" || unit.class === "archer";

  let success = false;

  if (canStealth) {
    const roll = rollD6(rng);
    if (unit.class === "archer") {
      success = roll === 6;
    } else if (unit.class === "assassin") {
      success = roll >= 5; // 5–6
    }
  }

  let updatedUnit: UnitState = {
    ...unit,
    stealthAttemptedThisTurn: true,
  };

  if (success) {
    updatedUnit = {
      ...updatedUnit,
      isStealthed: true,
      stealthTurnsLeft: 3,
    };
  }

  const events: GameEvent[] = [
    {
      type: "stealthEntered",
      unitId: updatedUnit.id,
      success,
    },
  ];

  const newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  return { state: newState, events };
}



function applySearchStealth(
  state: GameState,
  action: Extract<GameAction, { type: "searchStealth" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  // 🚫 проверяем, чем платим за поиск
  if (action.mode === "action" && unit.hasActedThisTurn) {
    return { state, events: [] };
  }
  if (action.mode === "move" && unit.hasMovedThisTurn) {
    return { state, events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  const events: GameEvent[] = [];
  let anyRevealed = false;

  const searcherBefore = units[unit.id]!;

  for (const candidate of Object.values(units)) {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      continue;
    }
    if (candidate.owner === unit.owner) {
      continue;
    }

    const dist = chebyshev(searcherBefore.position!, candidate.position);
    if (dist > 1) continue;

    const roll = rollD6(rng);
    if (roll < 5) continue;

    const updatedHidden: UnitState = {
      ...candidate,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };

    units[updatedHidden.id] = updatedHidden;
    anyRevealed = true;

    events.push({
      type: "stealthRevealed",
      unitId: updatedHidden.id,
      reason: "search",
    });
  }

  // обновляем экономику хода для ищущего
  const updatedSearcher: UnitState = {
    ...searcherBefore,
    hasActedThisTurn:
      searcherBefore.hasActedThisTurn || action.mode === "action",
    hasMovedThisTurn:
      searcherBefore.hasMovedThisTurn || action.mode === "move",
  };

  units[updatedSearcher.id] = updatedSearcher;

  const newState: GameState = {
    ...state,
    units,
  };

  events.unshift({
    type: "searchStealth",
    unitId: updatedSearcher.id,
    mode: action.mode,
  });

  return { state: newState, events };
}

function getNextTurnIndexForPlayer(
  state: GameState,
  fromIndex: number,
  player: PlayerId
): number {
  const order = state.turnOrder;
  if (order.length === 0) return fromIndex;

  const len = order.length;

  // Ищем вперёд по кругу следующую живую фигуру нужного игрока
  for (let step = 1; step <= len; step++) {
    const idx = (fromIndex + step) % len;
    const unitId = order[idx];
    const u = state.units[unitId];
    if (!u || !u.isAlive) continue;
    if (u.owner !== player) continue;
    return idx;
  }

  // Если живых фигур игрока нет — пока просто оставляем индекс как есть.
  // (Позже здесь можно будет завершать игру.)
  return fromIndex;
}



function applyEndTurn(state: GameState, rng: RNG): ApplyResult {
  if (state.phase === "ended") {
    return { state, events: [] };
  }

  // -----------------------------
  // 1) Фаза расстановки: просто меняем игрока
  // -----------------------------
  if (state.phase === "placement") {
    const prevPlayer = state.currentPlayer;
    const next: PlayerId = prevPlayer === "P1" ? "P2" : "P1";

    const baseState: GameState = {
      ...state,
      currentPlayer: next,
      turnNumber: state.turnNumber + 1,
      // roundNumber можно не трогать, он важен в бою
      activeUnitId: null,
    };

    const events: GameEvent[] = [
      {
        type: "turnStarted",
        player: next,
        turnNumber: baseState.turnNumber,
      },
    ];

    // В placement стелса ещё нет, поэтому processStartOfTurnStealth не вызываем
    return { state: baseState, events };
  }

  // -----------------------------
  // 2) Фаза боя: крутим очередь юнитов
  // -----------------------------
  if (state.phase === "battle") {
    const prevIndex = state.turnOrderIndex;

    const nextIndex = getNextAliveUnitIndex(state, prevIndex);
    if (nextIndex === null) {
      // Никто жив не остался — игра окончена
      const ended: GameState = {
        ...state,
        phase: "ended",
        activeUnitId: null,
      };
      return { state: ended, events: [] };
    }

    const order = state.turnOrder;
    const nextUnitId = order[nextIndex];
    const nextUnit = state.units[nextUnitId]!;
    const nextPlayer = nextUnit.owner;

    // Новый раунд, если вернулись "назад" по индексу
    const isNewRound = nextIndex <= prevIndex;

    let baseState: GameState = {
      ...state,
      currentPlayer: nextPlayer,
      turnNumber: state.turnNumber + 1,
      roundNumber: state.roundNumber + (isNewRound ? 1 : 0),
      activeUnitId: null,
      turnOrderIndex: nextIndex,
    };

    const events: GameEvent[] = [];

    if (isNewRound) {
      events.push({
        type: "roundStarted",
        roundNumber: baseState.roundNumber,
      });
    }

    events.push({
      type: "turnStarted",
      player: nextPlayer,
      turnNumber: baseState.turnNumber,
    });

    // Здесь тикают таймеры стелса и т.п.
    let workingState = baseState;
    const { state: afterStealth, events: stealthEvents } =
      processStartOfTurnStealth(workingState, nextPlayer, rng);
    workingState = afterStealth;
    events.push(...stealthEvents);

    return { state: workingState, events };
  }

  // На всякий случай, если окажемся в другой фазе
  return { state, events: [] };
}


function applyUnitStartTurn(
  state: GameState,
  action: Extract<GameAction, { type: "unitStartTurn" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  // Может ходить только владелец currentPlayer
  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  // Нельзя в середине хода перехватывать активную фигуру
  if (state.activeUnitId && state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  // Жёстко: сейчас может начать ход только фигура, стоящая в очереди
  const order = state.turnOrder;
  if (order.length > 0) {
    const scheduledId = order[state.turnOrderIndex];
    if (scheduledId !== unit.id) {
      return { state, events: [] };
    }
  }

  const { state: afterStart, events: startEvents } = processUnitStartOfTurn(
    state,
    unit.id,
    rng
  );

  const unitAfter = afterStart.units[unit.id];
  if (!unitAfter) {
    return { state: afterStart, events: startEvents };
  }

  const resetUnit: UnitState = {
    ...unitAfter,
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  };

  const newState: GameState = {
    ...afterStart,
    units: {
      ...afterStart.units,
      [resetUnit.id]: resetUnit,
    },
    activeUnitId: resetUnit.id,
  };

  return { state: newState, events: startEvents };
}



