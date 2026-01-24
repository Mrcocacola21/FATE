// packages/rules/src/actions.ts

import {
  GameState,
  GameAction,
  ApplyResult,
  UnitState,
  PlayerId,
  GameEvent,
  Coord,
  isInsideBoard,
  makeEmptyTurnEconomy,
  PendingMove,
  PendingRoll,
  RollKind,
  StealthRevealReason
} from "./model";
import { getUnitDefinition } from "./units";
import { RNG, rollD6, roll2D6 } from "./rng";
import { resolveAttack } from "./combat";
import { 
  getLegalMovesForUnit,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
 } from "./movement";
import { coordsEqual, chebyshev, isCellOccupied, getUnitAt} from "./board";
import { processUnitStartOfTurnStealth } from "./stealth";
import { resolveAoE } from "./aoe";
import { canSpendSlots, spendSlots, resetTurnEconomy } from "./turnEconomy";
import {
  initUnitAbilities,
  processUnitStartOfTurn,
  getAbilitySpec,
  spendCharges,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_TRICKSTER_AOE,
  TRICKSTER_AOE_RADIUS,
} from "./abilities";
import { unitCanSeeStealthed } from "./visibility";

function roll2D6Sum(rng: RNG): number {
  const d1 = rollD6(rng);
  const d2 = rollD6(rng);
  return d1 + d2;
}

function requestRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: Record<string, unknown>,
  actorUnitId?: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const nextCounter = (state.rollCounter ?? 0) + 1;
  const rollId = `roll-${nextCounter}`;
  const pendingRoll: PendingRoll = {
    id: rollId,
    player,
    kind,
    context,
  };
  const nextState: GameState = {
    ...state,
    pendingRoll,
    rollCounter: nextCounter,
  };
  const events: GameEvent[] = [
    {
      type: "rollRequested",
      rollId,
      kind,
      player,
      actorUnitId,
    },
  ];
  return { state: nextState, events };
}

function clearPendingRoll(state: GameState): GameState {
  if (!state.pendingRoll) return state;
  return { ...state, pendingRoll: null };
}

function requestInitiativeRoll(
  state: GameState,
  player: PlayerId
): ApplyResult {
  const requested = requestRoll(
    state,
    player,
    "initiativeRoll",
    { step: player },
    undefined
  );

  const rollId = requested.state.pendingRoll?.id ?? "";
  const events: GameEvent[] = [
    ...requested.events,
    {
      type: "initiativeRollRequested",
      rollId,
      player,
    },
  ];

  return { state: requested.state, events };
}

function applyRollInitiative(
  state: GameState,
  rng: RNG
): ApplyResult {
  // Р‘СЂРѕСЃР°РµРј РёРЅРёС†РёР°С‚РёРІСѓ С‚РѕР»СЊРєРѕ РІ С„Р°Р·Рµ СЂР°СЃСЃС‚Р°РЅРѕРІРєРё
  if (state.phase !== "placement") {
    return { state, events: [] };
  }

  // РЈР¶Рµ Р±СЂРѕСЃР°Р»Рё вЂ” РІС‚РѕСЂРѕР№ СЂР°Р· РЅРµ РґР°С‘Рј
  if (state.initiative.P1 !== null || state.initiative.P2 !== null) {
    return { state, events: [] };
  }

  let p1: number;
  let p2: number;

  // РџРµСЂРµР±СЂР°СЃС‹РІР°РµРј, РїРѕРєР° РЅРµ Р±СѓРґРµС‚ СЂР°Р·РЅРёС†С‹
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
      winner: placementFirstPlayer,
    },
    placementFirstPlayer,
    // РІР°Р¶РЅРѕРµ: С‚РѕС‚, РєС‚Рѕ СЃС‚Р°РІРёС‚ РїРµСЂРІС‹Рј, СЃС‚Р°РЅРѕРІРёС‚СЃСЏ currentPlayer
    currentPlayer: placementFirstPlayer,
  };

  const events: GameEvent[] = [
    {
      type: "initiativeResolved",
      winner: placementFirstPlayer,
      P1sum: p1,
      P2sum: p2,
    },
    {
      type: "placementStarted",
      placementFirstPlayer,
    },
  ];

  
  return { state: newState, events };
}

function applyChooseArena(
  state: GameState,
  action: Extract<GameAction, { type: "chooseArena" }>
): ApplyResult {
  // Р’С‹Р±РѕСЂ Р°СЂРµРЅС‹ РёРјРµРµС‚ СЃРјС‹СЃР» С‚РѕР»СЊРєРѕ РґРѕ Р±РѕСЏ
  if (state.phase !== "placement") {
    return { state, events: [] };
  }

  // РЈР¶Рµ РІС‹Р±СЂР°Р»Рё Р°СЂРµРЅСѓ вЂ” РїРѕРІС‚РѕСЂ РЅРµ РЅСѓР¶РµРЅ
  if (state.arenaId !== null) {
    return { state, events: [] };
  }

  // РџРѕ-С…РѕСЂРѕС€РµРјСѓ, Р°СЂРµРЅСѓ РІС‹Р±РёСЂР°СЋС‚ РџРћРЎР›Р• Р±СЂРѕСЃРєР° РёРЅРёС†РёР°С‚РёРІС‹
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

function applyLobbyInit(
  state: GameState,
  action: Extract<GameAction, { type: "lobbyInit" }>
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state, events: [] };
  }

  const nextState: GameState = {
    ...state,
    hostPlayerId: action.host,
    playersReady: { P1: false, P2: false },
    seats: {
      P1: action.host === "P1",
      P2: action.host === "P2",
    },
    initiative: { P1: null, P2: null, winner: null },
    placementFirstPlayer: null,
    pendingRoll: null,
    pendingMove: null,
    activeUnitId: null,
  };

  return { state: nextState, events: [] };
}

function applySetReady(
  state: GameState,
  action: Extract<GameAction, { type: "setReady" }>
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state, events: [] };
  }

  if (state.seats && !state.seats[action.player]) {
    return { state, events: [] };
  }

  const nextState: GameState = {
    ...state,
    playersReady: {
      ...state.playersReady,
      [action.player]: action.ready,
    },
  };

  return { state: nextState, events: [] };
}

function applyStartGame(
  state: GameState,
  _action: Extract<GameAction, { type: "startGame" }>
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state, events: [] };
  }

  if (!state.playersReady.P1 || !state.playersReady.P2) {
    return { state, events: [] };
  }

  const resetState: GameState = {
    ...state,
    initiative: { P1: null, P2: null, winner: null },
    placementFirstPlayer: null,
    pendingMove: null,
    activeUnitId: null,
  };

  return requestInitiativeRoll(resetState, "P1");
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

  const isTricksterAoE = spec.id === ABILITY_TRICKSTER_AOE;
  const aoeCenter = isTricksterAoE ? unit.position : null;

  if (isTricksterAoE) {
    if (unit.class !== "trickster") {
      return { state, events: [] };
    }
    if (!aoeCenter || !isInsideBoard(aoeCenter, state.boardSize)) {
      return { state, events: [] };
    }
  }

  const cost = spec.actionCost;
  const costs = cost?.consumes ?? {};

  // Проверяем экономику
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  // РЎРєРѕР»СЊРєРѕ Р·Р°СЂСЏРґРѕРІ РЅР°РґРѕ РЅР° РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ
  const chargeAmount =
    spec.chargesPerUse ?? spec.chargeCost ?? 0;

  // РџР»Р°С‚РёРј Р·Р°СЂСЏРґР°РјРё
  const { unit: afterCharges, ok } = spendCharges(
    unit,
    spec.id,
    chargeAmount
  );
  if (!ok || !afterCharges) {
    return { state, events: [] };
  }

  // Обновляем экономику
  const updatedUnit: UnitState = spendSlots(afterCharges, costs);

  // TODO: СЃСЋРґР° РїРѕС‚РѕРј РґРѕР±Р°РІРёРј СЂРµР°Р»СЊРЅС‹Р№ СЌС„С„РµРєС‚ СЃРїРѕСЃРѕР±РЅРѕСЃС‚Рё (СѓСЂРѕРЅ/Р±Р°С„/С‚РµР»РµРїРѕСЂС‚)

  let nextState: GameState = {
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

  if (isTricksterAoE && aoeCenter) {
    const res = resolveAoE(
      nextState,
      updatedUnit.id,
      aoeCenter,
      {
        radius: TRICKSTER_AOE_RADIUS,
        shape: "chebyshev",
        revealHidden: false,
        targetFilter: (u, caster) => u.id !== caster.id,
        abilityId: spec.id,
        emitEvent: false,
      },
      rng
    );
    nextState = res.nextState;
    events.push(...res.events);

    const affectedUnitIds = res.affectedUnitIds.filter(
      (id) => id !== updatedUnit.id
    );
    const revealedUnitIds: string[] = [];

    if (affectedUnitIds.length === 0) {
      events.push({
        type: "aoeResolved",
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: aoeCenter,
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      });
      return { state: nextState, events };
    }

    const queuedState: GameState = {
      ...nextState,
      pendingCombatQueue: [],
      pendingAoE: {
        casterId: updatedUnit.id,
        abilityId: spec.id,
        center: aoeCenter,
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      },
    };

    const ctx: TricksterAoEContext = {
      casterId: updatedUnit.id,
      targetsQueue: affectedUnitIds,
      currentTargetIndex: 0,
    };

    const requested = requestRoll(
      queuedState,
      updatedUnit.owner,
      "tricksterAoE_attackerRoll",
      ctx,
      updatedUnit.id
    );

    return {
      state: requested.state,
      events: [...events, ...requested.events],
    };
  }

  return { state: nextState, events };
}




export function createEmptyGame(): GameState {
  return {
    boardSize: 9,
    phase: "lobby",
    hostPlayerId: null,
    playersReady: { P1: false, P2: false },
    seats: { P1: false, P2: false },
    currentPlayer: "P1",
    turnNumber: 1,
    roundNumber: 1,

    activeUnitId: null,
    pendingMove: null,
    pendingRoll: null,
    pendingCombatQueue: [],
    pendingAoE: null,
    rollCounter: 0,
    turnOrder: [],
    turnOrderIndex: 0,
    placementOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,

    units: {},
    events: [],

    initiative: { P1: null, P2: null, winner: null },
    placementFirstPlayer: null,
    arenaId: null,
    startingUnitId: null,
    unitsPlaced: { P1: 0, P2: 0 },
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: { P1: {}, P2: {} },
  };
}



export function rollInitiativeForMatch(
  state: GameState,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  // РїСЂРѕСЃС‚Рѕ РґРµР»РµРіРёСЂСѓРµРј РІ applyRollInitiative
  return applyRollInitiative(state, rng);
}

export function setArena(
  state: GameState,
  arenaId: string
): { state: GameState; events: GameEvent[] } {
  // РїСЂРѕСЃС‚Рѕ РґРµР»РµРіРёСЂСѓРµРј РІ applyChooseArena
  return applyChooseArena(state, { type: "chooseArena", arenaId });
}



// РЎРѕР·РґР°С‘Рј 7 С„РёРіСѓСЂ РёРіСЂРѕРєР° СЃ РґРµС„РѕР»С‚РЅС‹РјРё СЃС‚Р°С‚Р°РјРё Рё РµС‰С‘ Р±РµР· РїРѕР·РёС†РёРё
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
      turn: makeEmptyTurnEconomy(),
      charges: {},
      cooldowns: {},
      lastChargedTurn: undefined,
    
      hasMovedThisTurn: false,
      hasAttackedThisTurn: false,
      hasActedThisTurn: false,
    
      isAlive: true,
    };

    unit = initUnitAbilities(unit);

    return unit;
  });
}




// Р”РѕР±Р°РІРёС‚СЊ Р°СЂРјРёСЋ РІ GameState
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

// РџСЂРёРјРµРЅСЏРµРј РґРµР№СЃС‚РІРёРµ Рє СЃРѕСЃС‚РѕСЏРЅРёСЋ РёРіСЂС‹
export function applyAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
  if (state.pendingRoll && action.type !== "resolvePendingRoll") {
    return { state, events: [] };
  }

  switch (action.type) {
    case "rollInitiative":
      return applyRollInitiative(state, rng);

    case "chooseArena":
      return applyChooseArena(state, action);

    case "lobbyInit":
      return applyLobbyInit(state, action);

    case "setReady":
      return applySetReady(state, action);

    case "startGame":
      return applyStartGame(state, action);

    case "unitStartTurn":
      return applyUnitStartTurn(state, action, rng);

    case "placeUnit":
      return applyPlaceUnit(state, action);

    case "move":
      return applyMove(state, action, rng);

    case "requestMoveOptions":
      return applyRequestMoveOptions(state, action, rng);

    case "attack":
      return applyAttack(state, action, rng);

    case "enterStealth":
      return applyEnterStealth(state, action, rng);

    case "searchStealth":
      return applySearchStealth(state, action, rng);

    case "useAbility":
      return applyUseAbility(state, action, rng);

    case "resolvePendingRoll":
      return applyResolvePendingRoll(state, action, rng);

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
  fromIndex: number,
  queue: string[]
): number | null {
  const len = queue.length;
  if (len === 0) return null;

  for (let step = 1; step <= len; step++) {
    const idx = (fromIndex + step) % len;
    const unitId = queue[idx];
    const u = state.units[unitId];
    if (u && u.isAlive && u.position) {
      return idx;
    }
  }

  // РќРµС‚ Р¶РёРІС‹С… С„РёРіСѓСЂ РІРѕРѕР±С‰Рµ
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

  // РќРµР»СЊР·СЏ РІС‹СЃС‚Р°РІР»СЏС‚СЊ С„РёРіСѓСЂСѓ РЅРµ СЃРІРѕРµРіРѕ РёРіСЂРѕРєР°
  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  // РќРµР»СЊР·СЏ РїРѕРІС‚РѕСЂРЅРѕ "РІС‹СЃС‚Р°РІР»СЏС‚СЊ" СѓР¶Рµ РїРѕСЃС‚Р°РІР»РµРЅРЅСѓСЋ С„РёРіСѓСЂСѓ
  if (unit.position) {
    return { state, events: [] };
  }

  const pos = action.position;

  // РљРѕРѕСЂРґРёРЅР°С‚Р° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РЅР° РґРѕСЃРєРµ
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }

  // РљР»РµС‚РєР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ СЃРІРѕР±РѕРґРЅР°
  if (isCellOccupied(state, pos)) {
    return { state, events: [] };
  }

  // РћРіСЂР°РЅРёС‡РµРЅРёРµ: С‚РѕР»СЊРєРѕ bвЂ“h (РєРѕР»РѕРЅРєРё 1..7) Р·Р°РґРЅРµР№ Р»РёРЅРёРё СЃРІРѕРµРіРѕ РёРіСЂРѕРєР°
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

  // РћР±РЅРѕРІР»СЏРµРј СЃС‡С‘С‚С‡РёРє РІС‹СЃС‚Р°РІР»РµРЅРЅС‹С… С„РёРіСѓСЂ
  const unitsPlaced = {
    ...state.unitsPlaced,
    [owner]: state.unitsPlaced[owner] + 1,
  };

  const placementOrder = [...state.placementOrder, updatedUnit.id];
  let startingUnitId = placementOrder[0] ?? updatedUnit.id;

  // Backward compat: keep turnOrder in sync with placementOrder
  const turnOrder = [...placementOrder];

  // РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ вЂ” РїРµСЂРµРєР»СЋС‡Р°РµРј РїСЂР°РІРѕ СЂР°СЃСЃС‚Р°РЅРѕРІРєРё
  const otherPlayer: PlayerId = owner === "P1" ? "P2" : "P1";
  let phase: GameState["phase"] = state.phase;
  let currentPlayer: PlayerId = otherPlayer;
  let turnNumber = state.turnNumber;
  let roundNumber = state.roundNumber;
  let activeUnitId = state.activeUnitId;
  let turnOrderIndex = state.turnOrderIndex;
  let turnQueue = state.turnQueue;
  let turnQueueIndex = state.turnQueueIndex;

  let extraEvents: GameEvent[] = [];
  let initialKnowledge: GameState["knowledge"] | undefined = undefined;

  // РџСЂРѕРІРµСЂСЏРµРј, Р·Р°РєРѕРЅС‡РёР»Р°СЃСЊ Р»Рё СЂР°СЃСЃС‚Р°РЅРѕРІРєР° Сѓ РћР‘РћРРҐ
  if (unitsPlaced.P1 >= 7 && unitsPlaced.P2 >= 7) {
    // РџРµСЂРµС…РѕРґРёРј РІ Р±РѕР№
    phase = "battle";
    turnNumber = 1;
    roundNumber = 1;
    activeUnitId = null;

    // Инициализируем очередь хода из placementOrder
    turnQueue = [...placementOrder];
    turnQueueIndex = 0;

    const queueHead = turnQueue[0] ?? startingUnitId;
    startingUnitId = queueHead ?? startingUnitId;

    const startingOwner = queueHead
      ? (state.units[queueHead] ??
          (queueHead === updatedUnit.id ? updatedUnit : null)
        )?.owner ?? updatedUnit.owner
      : updatedUnit.owner;

    // Владелец первого в очереди ходит первым
    currentPlayer = startingOwner;

    // Backward compat: keep turnOrderIndex in sync
    turnOrderIndex = turnQueueIndex;

    // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј knowledge: РєР°Р¶РґС‹Р№ РёРіСЂРѕРє Р·РЅР°РµС‚ РІСЃРµС… СЃРІРѕРёС… С„РёРіСѓСЂ,
    // Рё РІРёРґРёРјС‹С… РІСЂР°Р¶РµСЃРєРёС… (РЅРµ РІ СЃС‚РµР»СЃРµ).
    const knowledge: GameState["knowledge"] = { P1: {}, P2: {} };
    for (const u of turnQueue) {
      const uu = state.units[u] || (u === updatedUnit.id ? updatedUnit : null);
      if (!uu) continue;
      knowledge[uu.owner][uu.id] = true; // friendly always known
    }
    for (const uid of Object.keys(state.units)) {
      const uu = state.units[uid];
      if (!uu) continue;
      const owner = uu.owner;
      const other: PlayerId = owner === "P1" ? "P2" : "P1";
      // enemy visible -> known to other
      if (!uu.isStealthed) {
        knowledge[other][uu.id] = true;
      }
    }

    extraEvents.push({
      type: "battleStarted",
      startingUnitId,
      startingPlayer: startingOwner,
    });

    // Attach knowledge to newState below
    initialKnowledge = knowledge;
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
    placementOrder,
    turnQueue,
    turnQueueIndex,
    turnOrder,
    turnOrderIndex,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    knowledge: phase === "battle" ? initialKnowledge ?? state.knowledge : state.knowledge,
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

  // рџљ« РўСЂР°С‚РёР» СЃР»РѕС‚ Р°С‚Р°РєРё
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state, events: [] };
  }
  const context = makeAttackContext({
    attackerId: attacker.id,
    defenderId: defender.id,
    consumeSlots: true,
    queueKind: "normal",
  });

  return requestRoll(
    state,
    attacker.owner,
    "attack_attackerRoll",
    context,
    attacker.id
  );
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

  // РќР°СЃ РёРЅС‚РµСЂРµСЃСѓРµС‚ С‚РѕР»СЊРєРѕ С‡РёСЃС‚Рѕ РѕСЂС‚РѕРіРѕРЅР°Р»СЊРЅРѕРµ РґРІРёР¶РµРЅРёРµ (РєР°Рє Р»Р°РґСЊСЏ).
  const isOrthogonal =
    (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return targets;
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  // РРґС‘Рј РѕС‚ РєР»РµС‚РєРё РїРѕСЃР»Рµ СЃС‚Р°СЂС‚Р° РґРѕ РєР»РµС‚РєРё РЅР°Р·РЅР°С‡РµРЅРёСЏ РІРєР»СЋС‡РёС‚РµР»СЊРЅРѕ
  for (let i = 1; i <= steps; i++) {
    const cell: Coord = {
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    };

    const u = getUnitAt(state, cell);
    if (!u || !u.isAlive) continue;

    // РЎРѕСЋР·РЅРёРєРѕРІ РЅРµ Р±СЊС‘Рј "РїРѕ РїСѓС‚Рё"
    if (u.owner === rider.owner) continue;

    // Path attacks hit enemies passed on the path regardless of stealthed state
    targets.push(u.id);
  }

  return targets;
}

function applyRequestMoveOptions(
  state: GameState,
  action: Extract<GameAction, { type: "requestMoveOptions" }>,
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

  if (!canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }

  const existing = state.pendingMove;
  if (
    existing &&
    existing.unitId === unit.id &&
    existing.expiresTurnNumber === state.turnNumber
  ) {
    return {
      state,
      events: [
        {
          type: "moveOptionsGenerated",
          unitId: unit.id,
          roll: existing.roll,
          legalTo: existing.legalTo,
        },
      ],
    };
  }

  let roll: number | undefined = undefined;
  let legalMoves: Coord[] = [];

  if (unit.class === "trickster") {
    return requestRoll(
      state,
      unit.owner,
      "moveTrickster",
      { unitId: unit.id },
      unit.id
    );
  }
  if (unit.class === "berserker") {
    return requestRoll(
      state,
      unit.owner,
      "moveBerserker",
      { unitId: unit.id },
      unit.id
    );
  }

  legalMoves = getLegalMovesForUnit(state, unit.id);

  const pendingMove: PendingMove = {
    unitId: unit.id,
    roll,
    legalTo: legalMoves,
    expiresTurnNumber: state.turnNumber,
  };

  const newState: GameState = {
    ...state,
    pendingMove,
  };

  const events: GameEvent[] = [
    {
      type: "moveOptionsGenerated",
      unitId: unit.id,
      roll,
      legalTo: legalMoves,
    },
  ];

  return { state: newState, events };
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

  // РЅР°С‡Р°Р»СЊРЅР°СЏ РїРѕР·РёС†РёСЏ вЂ” РїСЂРёРіРѕРґРёС‚СЃСЏ РґР»СЏ СЃРїРµС†-РїСЂР°РІРёР»Р° РЅР°РµР·РґРЅРёРєР°
  const from = unit.position;

  // рџљ« СѓР¶Рµ С‚СЂР°С‚РёР» СЃР»РѕС‚ РїРµСЂРµРјРµС‰РµРЅРёСЏ
  if (!canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }

  let legalMoves: Coord[] = [];
  const pending = state.pendingMove;
  const pendingValid =
    pending &&
    pending.unitId === unit.id &&
    pending.expiresTurnNumber === state.turnNumber;

  if (pendingValid) {
    legalMoves = pending!.legalTo;
  } else if (unit.class === "trickster" || unit.class === "berserker") {
    return { state, events: [] };
  } else {
    legalMoves = getLegalMovesForUnit(state, unit.id);
  }

  const isLegal = legalMoves.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const hiddenAtDest = getUnitAt(state, action.to);
  if (
    hiddenAtDest &&
    hiddenAtDest.isAlive &&
    hiddenAtDest.owner !== unit.owner &&
    hiddenAtDest.isStealthed
  ) {
    const known = state.knowledge?.[unit.owner]?.[hiddenAtDest.id];
    const canSee = unitCanSeeStealthed(state, unit);
    if (!known && !canSee) {
      const revealed: UnitState = {
        ...hiddenAtDest,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      const movedUnit: UnitState = spendSlots(unit, { move: true });
      const updatedLastKnown = {
        ...state.lastKnownPositions,
        P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
        P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
      };
      delete updatedLastKnown.P1[revealed.id];
      delete updatedLastKnown.P2[revealed.id];
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [revealed.id]: revealed,
          [movedUnit.id]: movedUnit,
        },
        knowledge: {
          ...state.knowledge,
          [unit.owner]: {
            ...(state.knowledge?.[unit.owner] ?? {}),
            [revealed.id]: true,
          },
        },
        lastKnownPositions: updatedLastKnown,
        pendingMove: pendingValid ? null : state.pendingMove,
      };
      const events: GameEvent[] = [
        { type: "stealthRevealed", unitId: revealed.id, reason: "steppedOnHidden" },
      ];
      return { state: newState, events };
    }
  }

  const movedUnit: UnitState = spendSlots(unit, { move: true });
  const updatedUnit: UnitState = {
    ...movedUnit,
    position: { ...action.to },
  };

  let newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove:
      pendingValid && pending?.unitId === updatedUnit.id ? null : state.pendingMove,
  };

  const events: GameEvent[] = [
    {
      type: "unitMoved",
      unitId: updatedUnit.id,
      from,
      to: updatedUnit.position!,
    },
  ];

  // ---- РЎРїРµС†-РїСЂР°РІРёР»Рѕ РЅР°РµР·РґРЅРёРєР°: Р°С‚Р°РєСѓРµС‚ РІСЃРµС… РІСЂР°РіРѕРІ, С‡РµСЂРµР· РєРѕС‚РѕСЂС‹С… РїСЂРѕРµС…Р°Р» ----
  // ---- Reveal by adjacency: ending move next to hidden enemies reveals them to mover ----
  // РћР±С…РѕРґРёРј СЋРЅРёС‚РѕРІ Рё СЂР°СЃРєСЂС‹РІР°РµРј С‚Рµ, РєС‚Рѕ РІ СЂР°РґРёСѓСЃРµ 1 (Chebyshev) РѕС‚ РєРѕРЅРµС‡РЅРѕР№ РїРѕР·РёС†РёРё
  const moverOwner = updatedUnit.owner;
  const moverPos = updatedUnit.position!;
  for (const other of Object.values(newState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.owner === moverOwner) continue;
    if (!other.isStealthed) continue;

    const dx = Math.abs(other.position.col - moverPos.col);
    const dy = Math.abs(other.position.row - moverPos.row);
    const dist = Math.max(dx, dy);
    if (dist <= 1) {
      const revealed: UnitState = {
        ...other,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      const updatedLastKnown = {
        ...newState.lastKnownPositions,
        P1: { ...(newState.lastKnownPositions?.P1 ?? {}) },
        P2: { ...(newState.lastKnownPositions?.P2 ?? {}) },
      };
      delete updatedLastKnown.P1[revealed.id];
      delete updatedLastKnown.P2[revealed.id];

      newState = {
        ...newState,
        units: {
          ...newState.units,
          [revealed.id]: revealed,
        },
        knowledge: {
          ...newState.knowledge,
          [moverOwner]: {
            ...(newState.knowledge?.[moverOwner] ?? {}),
            [revealed.id]: true,
          },
        },
        lastKnownPositions: updatedLastKnown,
      };

      events.push({ type: "stealthRevealed", unitId: revealed.id, reason: "adjacency" });
    }
  }

  // ---- Rider path attacks: enqueue pending sequential rolls ----
  if (unit.class === "rider" && from) {
    const targetIds = collectRiderPathTargets(state, unit, from, action.to);
    if (targetIds.length > 0) {
      const queue = targetIds.map((defenderId) => ({
        attackerId: unit.id,
        defenderId,
        ignoreRange: true,
        ignoreStealth: true,
        kind: "riderPath" as const,
      }));

      const queuedState: GameState = {
        ...newState,
        pendingCombatQueue: queue,
      };

      const ctx = makeAttackContext({
        attackerId: unit.id,
        defenderId: queue[0].defenderId,
        ignoreRange: true,
        ignoreStealth: true,
        consumeSlots: false,
        queueKind: "riderPath",
      });

      const requested = requestRoll(
        queuedState,
        unit.owner,
        "riderPathAttack_attackerRoll",
        ctx,
        unit.id
      );

      return {
        state: requested.state,
        events: [...events, ...requested.events],
      };
    }
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

  // Уже тратил слот скрытности
  if (!canSpendSlots(unit, { stealth: true })) {
    return { state, events: [] };
  }

  // Уже в стелсе — попытка всё равно потрачена
  if (unit.isStealthed) {
    const baseUnit: UnitState = spendSlots(unit, { stealth: true });
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      },
      events: [],
    };
  }

  // Только ассасин и лучник могут в скрытность
  const canStealth =
    unit.class === "assassin" || unit.class === "archer";

  if (canStealth) {
    const pos = unit.position!;
    const hasStealthedOverlap = Object.values(state.units).some((u) => {
      if (!u.isAlive || !u.isStealthed || !u.position) return false;
      if (u.id === unit.id) return false;
      return u.position.col === pos.col && u.position.row === pos.row;
    });
    if (hasStealthedOverlap) {
      const baseUnit: UnitState = spendSlots(unit, { stealth: true });
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      };
      const events: GameEvent[] = [
        { type: "stealthEntered", unitId: baseUnit.id, success: false },
      ];
      return { state: newState, events };
    }

    return requestRoll(
      state,
      unit.owner,
      "enterStealth",
      { unitId: unit.id },
      unit.id
    );
  }
  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [baseUnit.id]: baseUnit,
    },
  };
  const events: GameEvent[] = [
    {
      type: "stealthEntered",
      unitId: baseUnit.id,
      success: false,
    },
  ];
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

  const searchCosts =
    action.mode === "action" ? { action: true } : { move: true };
  // рџљ« РїСЂРѕРІРµСЂСЏРµРј, С‡РµРј РїР»Р°С‚РёРј Р·Р° РїРѕРёСЃРє
  if (!canSpendSlots(unit, searchCosts)) {
    return { state, events: [] };
  }

  const searcher = unit;
  const candidates = Object.values(state.units).filter((candidate) => {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      return false;
    }
    if (candidate.owner === unit.owner) {
      return false;
    }
    const dist = chebyshev(searcher.position!, candidate.position);
    return dist <= 1;
  });

  if (candidates.length === 0) {
    const updatedSearcher: UnitState = spendSlots(unit, searchCosts);
    const newState: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedSearcher.id]: updatedSearcher,
      },
    };
    const events: GameEvent[] = [
      { type: "searchStealth", unitId: updatedSearcher.id, mode: action.mode, rolls: [] },
    ];
    return { state: newState, events };
  }

  return requestRoll(
    state,
    unit.owner,
    "searchStealth",
    { unitId: unit.id, mode: action.mode },
    unit.id
  );
}

function resolveEnterStealthRoll(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const def = getUnitDefinition(unit.class);
  let success = false;

  if (unit.class === "archer") {
    success = roll === 6;
  } else if (unit.class === "assassin") {
    success = roll >= 5;
  }

  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const updated: UnitState = success
    ? {
        ...baseUnit,
        isStealthed: true,
        stealthTurnsLeft: def.maxStealthTurns ?? 3,
      }
    : {
        ...baseUnit,
      };

  const otherPlayer: PlayerId = unit.owner === "P1" ? "P2" : "P1";
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
    lastKnownPositions:
      success && updated.position
        ? {
            ...state.lastKnownPositions,
            [otherPlayer]: {
              ...(state.lastKnownPositions?.[otherPlayer] ?? {}),
              [updated.id]: { ...updated.position },
            },
          }
        : state.lastKnownPositions,
  };

  const events: GameEvent[] = [
    {
      type: "stealthEntered",
      unitId: updated.id,
      success,
      roll,
    },
  ];

  return { state: clearPendingRoll(nextState), events };
}

function resolveSearchStealthRoll(
  state: GameState,
  unitId: string,
  mode: "action" | "move",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const searchCosts = mode === "action" ? { action: true } : { move: true };
  if (!canSpendSlots(unit, searchCosts)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  const events: GameEvent[] = [];
  const rollResults: { targetId: string; roll: number; success: boolean }[] = [];
  const lastKnownPositions = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };

  const candidates = Object.values(units).filter((candidate) => {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      return false;
    }
    if (candidate.owner === unit.owner) {
      return false;
    }
    const dist = chebyshev(unit.position!, candidate.position);
    return dist <= 1;
  });

  if (candidates.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  for (const candidate of candidates) {
    const roll = rollD6(rng);
    const success = roll >= 5;
    rollResults.push({ targetId: candidate.id, roll, success });
    if (!success) continue;

    const updatedHidden: UnitState = {
      ...candidate,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };

    units[updatedHidden.id] = updatedHidden;
    delete lastKnownPositions.P1[updatedHidden.id];
    delete lastKnownPositions.P2[updatedHidden.id];

    events.push({
      type: "stealthRevealed",
      unitId: updatedHidden.id,
      reason: "search",
    });
  }

  const updatedSearcher: UnitState = spendSlots(unit, searchCosts);
  units[updatedSearcher.id] = updatedSearcher;

  const newState: GameState = {
    ...state,
    units,
    knowledge: {
      ...state.knowledge,
      [unit.owner]: {
        ...(state.knowledge?.[unit.owner] ?? {}),
        ...(Object.values(units)
          .filter((u) => !u.isStealthed && u.owner !== unit.owner)
          .reduce<Record<string, boolean>>((acc, u) => {
            if (state.knowledge?.[unit.owner]?.[u.id]) return acc;
            acc[u.id] = true;
            return acc;
          }, {})),
      },
    },
    lastKnownPositions,
  };

  events.unshift({
    type: "searchStealth",
    unitId: updatedSearcher.id,
    mode,
    rolls: rollResults,
  });

  return { state: clearPendingRoll(newState), events };
}

function resolveMoveOptionsRoll(
  state: GameState,
  unitId: string,
  kind: "moveTrickster" | "moveBerserker",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { move: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const legalMoves =
    kind === "moveTrickster"
      ? getTricksterMovesForRoll(state, unit.id, roll)
      : getBerserkerMovesForRoll(state, unit.id, roll);

  const pendingMove: PendingMove = {
    unitId: unit.id,
    roll,
    legalTo: legalMoves,
    expiresTurnNumber: state.turnNumber,
  };

  const newState: GameState = {
    ...state,
    pendingMove,
  };

  const events: GameEvent[] = [
    {
      type: "moveOptionsGenerated",
      unitId: unit.id,
      roll,
      legalTo: legalMoves,
    },
  ];

  if (legalMoves.length === 0) {
    events.push({
      type: "moveBlocked",
      unitId: unit.id,
      reason: "noLegalDestinations",
    });
  }

  return { state: clearPendingRoll(newState), events };
}

function resolveInitiativeRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = roll2D6(rng);
  const nextInitiative = {
    ...state.initiative,
    [pending.player]: roll.sum,
  } as GameState["initiative"];

  const nextState: GameState = {
    ...state,
    initiative: nextInitiative,
  };

  const events: GameEvent[] = [
    {
      type: "initiativeRolled",
      player: pending.player,
      dice: roll.dice,
      sum: roll.sum,
    },
  ];

  if (pending.player === "P1") {
    const requested = requestInitiativeRoll(clearPendingRoll(nextState), "P2");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const p1 = nextInitiative.P1;
  const p2 = nextInitiative.P2;
  if (p1 === null || p2 === null) {
    return { state: clearPendingRoll(nextState), events };
  }

  if (p1 === p2) {
    const resetState: GameState = {
      ...nextState,
      initiative: { P1: null, P2: null, winner: null },
    };
    const requested = requestInitiativeRoll(clearPendingRoll(resetState), "P1");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const winner: PlayerId = p1 > p2 ? "P1" : "P2";
  const placementState: GameState = {
    ...nextState,
    phase: "placement",
    currentPlayer: winner,
    placementFirstPlayer: winner,
    initiative: { ...nextInitiative, winner },
    pendingRoll: null,
    pendingMove: null,
    activeUnitId: null,
    placementOrder: [],
    turnOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrderIndex: 0,
    unitsPlaced: { P1: 0, P2: 0 },
  };

  const resolvedEvents: GameEvent[] = [
    ...events,
    {
      type: "initiativeResolved",
      winner,
      P1sum: p1,
      P2sum: p2,
    },
    {
      type: "placementStarted",
      placementFirstPlayer: winner,
    },
  ];

  return { state: placementState, events: resolvedEvents };
}

interface AttackRollContext extends Record<string, unknown> {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  revealStealthedAllies?: boolean;
  revealReason?: StealthRevealReason;
  attackerDice?: number[];
  defenderDice?: number[];
  tieBreakAttacker?: number[];
  tieBreakDefender?: number[];
  stage?: "initial" | "tieBreak";
  berserkerChoiceMade?: boolean;
  consumeSlots?: boolean;
  queueKind?: "normal" | "riderPath" | "aoe";
}

interface TricksterAoEContext extends Record<string, unknown> {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
}

function rollDice(rng: RNG, count: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(rollD6(rng));
  }
  return rolls;
}

function sumDice(dice: number[]): number {
  return dice.reduce((acc, v) => acc + v, 0);
}

function replacePendingRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: AttackRollContext,
  actorUnitId?: string
): ApplyResult {
  const baseState = clearPendingRoll(state);
  return requestRoll(baseState, player, kind, context, actorUnitId);
}

function makeAttackContext(params: {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  consumeSlots: boolean;
  queueKind: "normal" | "riderPath" | "aoe";
}): AttackRollContext {
  return {
    attackerId: params.attackerId,
    defenderId: params.defenderId,
    ignoreRange: params.ignoreRange,
    ignoreStealth: params.ignoreStealth,
    attackerDice: [],
    defenderDice: [],
    tieBreakAttacker: [],
    tieBreakDefender: [],
    stage: "initial",
    berserkerChoiceMade: false,
    consumeSlots: params.consumeSlots,
    queueKind: params.queueKind,
  };
}

function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  useAutoDefense: boolean
): ApplyResult {
  const rolls = {
    attackerDice: context.attackerDice ?? [],
    defenderDice: context.defenderDice ?? [],
    tieBreakAttacker: context.tieBreakAttacker ?? [],
    tieBreakDefender: context.tieBreakDefender ?? [],
  };

  const { nextState, events } = resolveAttack(state, {
    attackerId: context.attackerId,
    defenderId: context.defenderId,
    defenderUseBerserkAutoDefense: useAutoDefense,
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    rolls,
  });

  const attackResolved = events.some((e) => e.type === "attackResolved");
  let updatedState = nextState;

  if (attackResolved && context.consumeSlots) {
    const attackerAfter = updatedState.units[context.attackerId];
    if (attackerAfter) {
      const updatedAttacker: UnitState = spendSlots(attackerAfter, {
        attack: true,
        action: true,
      });
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [updatedAttacker.id]: updatedAttacker,
        },
      };
    }
  }

  if (attackResolved && context.queueKind === "aoe" && updatedState.pendingAoE) {
    const attackEvent = events.find(
      (e) =>
        e.type === "attackResolved" &&
        e.attackerId === context.attackerId &&
        e.defenderId === context.defenderId
    );
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent && attackEvent.type === "attackResolved") {
      const shouldRecord = attackEvent.damage > 0;
      if (shouldRecord) {
        const damaged = nextPendingAoE.damagedUnitIds.includes(
          attackEvent.defenderId
        )
          ? nextPendingAoE.damagedUnitIds
          : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
        const damageByUnitId = {
          ...nextPendingAoE.damageByUnitId,
          [attackEvent.defenderId]: attackEvent.damage,
        };
        nextPendingAoE = {
          ...nextPendingAoE,
          damagedUnitIds: damaged,
          damageByUnitId,
        };
      }
    }

    const revealedIds = events
      .filter((e) => e.type === "stealthRevealed")
      .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
      .filter((id) => id.length > 0);
    if (revealedIds.length > 0) {
      const merged = Array.from(
        new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
      );
      nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
    }

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  return { state: clearPendingRoll(updatedState), events };
}

function advanceCombatQueue(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const queue = state.pendingCombatQueue ?? [];
  if (queue.length === 0) {
    if (state.pendingAoE) {
      const aoe = state.pendingAoE;
      const nextState: GameState = { ...state, pendingAoE: null };
      return {
        state: nextState,
        events: [
          ...events,
          {
            type: "aoeResolved",
            sourceUnitId: aoe.casterId,
            abilityId: aoe.abilityId,
            casterId: aoe.casterId,
            center: aoe.center,
            radius: aoe.radius,
            affectedUnitIds: aoe.affectedUnitIds,
            revealedUnitIds: aoe.revealedUnitIds,
            damagedUnitIds: aoe.damagedUnitIds,
            damageByUnitId: aoe.damageByUnitId,
          },
        ],
      };
    }
    return { state, events };
  }

  const [, ...rest] = queue;
  let nextState: GameState = { ...state, pendingCombatQueue: rest };
  let nextEvents = [...events];

  if (rest.length === 0) {
    if (nextState.pendingAoE) {
      const aoe = nextState.pendingAoE;
      nextState = { ...nextState, pendingAoE: null };
      nextEvents.push({
        type: "aoeResolved",
        sourceUnitId: aoe.casterId,
        abilityId: aoe.abilityId,
        casterId: aoe.casterId,
        center: aoe.center,
        radius: aoe.radius,
        affectedUnitIds: aoe.affectedUnitIds,
        revealedUnitIds: aoe.revealedUnitIds,
        damagedUnitIds: aoe.damagedUnitIds,
        damageByUnitId: aoe.damageByUnitId,
      });
    }
    return { state: nextState, events: nextEvents };
  }

  const nextEntry = rest[0];
  const attacker = nextState.units[nextEntry.attackerId];
  const defender = nextState.units[nextEntry.defenderId];
  if (!attacker || !defender) {
    return advanceCombatQueue(nextState, nextEvents);
  }

  const ctx = makeAttackContext({
    attackerId: nextEntry.attackerId,
    defenderId: nextEntry.defenderId,
    ignoreRange: nextEntry.ignoreRange,
    ignoreStealth: nextEntry.ignoreStealth,
    consumeSlots: false,
    queueKind: nextEntry.kind,
  });

  const rollKind: RollKind =
    nextEntry.kind === "riderPath"
      ? "riderPathAttack_attackerRoll"
      : "attack_attackerRoll";

  const requested = replacePendingRoll(
    nextState,
    attacker.owner,
    rollKind,
    ctx,
    attacker.id
  );

  nextEvents = [...nextEvents, ...requested.events];
  return { state: requested.state, events: nextEvents };
}

function finalizeTricksterAoE(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  if (!state.pendingAoE) {
    return { state: clearPendingRoll(state), events };
  }

  const aoe = state.pendingAoE;
  const nextState: GameState = { ...state, pendingAoE: null };
  return {
    state: clearPendingRoll(nextState),
    events: [
      ...events,
      {
        type: "aoeResolved",
        sourceUnitId: aoe.casterId,
        abilityId: aoe.abilityId,
        casterId: aoe.casterId,
        center: aoe.center,
        radius: aoe.radius,
        affectedUnitIds: aoe.affectedUnitIds,
        revealedUnitIds: aoe.revealedUnitIds,
        damagedUnitIds: aoe.damagedUnitIds,
        damageByUnitId: aoe.damageByUnitId,
      },
    ],
  };
}

function advanceTricksterAoEQueue(
  state: GameState,
  context: TricksterAoEContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = baseState.units[targetId];
    if (target && target.isAlive) {
      const nextCtx: TricksterAoEContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        "tricksterAoE_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeTricksterAoE(baseState, events);
}

function resolveTricksterAoEAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as TricksterAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: TricksterAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceTricksterAoEQueue(state, nextCtx, []);
}

function resolveTricksterAoEDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as TricksterAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = Array.isArray(ctx.attackerDice) ? ctx.attackerDice : [];
  if (attackerDice.length < 2) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
  const idx = ctx.currentTargetIndex ?? 0;
  const targetId = targets[idx];
  if (!targetId) {
    return finalizeTricksterAoE(clearPendingRoll(state), []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: TricksterAoEContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceTricksterAoEQueue(state, nextCtx, []);
  }

  const defenderDice = rollDice(rng, 2);
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

  let updatedState = nextState;
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === caster.id &&
      e.defenderId === targetId
  );
  if (attackEvent && attackEvent.type === "attackResolved" && updatedState.pendingAoE) {
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent.damage > 0) {
      const damaged = nextPendingAoE.damagedUnitIds.includes(attackEvent.defenderId)
        ? nextPendingAoE.damagedUnitIds
        : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
      const damageByUnitId = {
        ...nextPendingAoE.damageByUnitId,
        [attackEvent.defenderId]: attackEvent.damage,
      };
      nextPendingAoE = {
        ...nextPendingAoE,
        damagedUnitIds: damaged,
        damageByUnitId,
      };
    }

    const revealedIds = events
      .filter((e) => e.type === "stealthRevealed")
      .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
      .filter((id) => id.length > 0);
    if (revealedIds.length > 0) {
      const merged = Array.from(
        new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
      );
      nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
    }

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  const nextCtx: TricksterAoEContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  return advanceTricksterAoEQueue(updatedState, nextCtx, events);
}

function resolveAttackAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const stage = ctx.stage ?? "initial";
  const dice = rollDice(rng, stage === "tieBreak" ? 1 : 2);
  const nextCtx: AttackRollContext = { ...ctx, stage };

  if (stage === "tieBreak") {
    nextCtx.tieBreakAttacker = [...(ctx.tieBreakAttacker ?? []), ...dice];
  } else {
    nextCtx.attackerDice = dice;
  }

  const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  if (defender.class === "berserker" && charges === 6 && !nextCtx.berserkerChoiceMade) {
    return replacePendingRoll(
      state,
      defender.owner,
      "berserkerDefenseChoice",
      nextCtx,
      defender.id
    );
  }

  const defenderRollKind: RollKind =
    pending.kind === "riderPathAttack_attackerRoll"
      ? "riderPathAttack_defenderRoll"
      : "attack_defenderRoll";

  return replacePendingRoll(
    state,
    defender.owner,
    defenderRollKind,
    nextCtx,
    defender.id
  );
}

function resolveAttackDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const stage = ctx.stage ?? "initial";
  const dice = rollDice(rng, stage === "tieBreak" ? 1 : 2);
  const nextCtx: AttackRollContext = {
    ...ctx,
    stage,
    berserkerChoiceMade: true,
  };

  if (stage === "tieBreak") {
    nextCtx.tieBreakDefender = [...(ctx.tieBreakDefender ?? []), ...dice];
  } else {
    nextCtx.defenderDice = dice;
  }

  const attackerTotal =
    sumDice(nextCtx.attackerDice ?? []) +
    sumDice(nextCtx.tieBreakAttacker ?? []);
  const defenderTotal =
    sumDice(nextCtx.defenderDice ?? []) +
    sumDice(nextCtx.tieBreakDefender ?? []);

  if (attackerTotal === defenderTotal) {
    nextCtx.stage = "tieBreak";
    const attackerRollKind: RollKind =
      pending.kind === "riderPathAttack_defenderRoll"
        ? "riderPathAttack_attackerRoll"
        : "attack_attackerRoll";

    return replacePendingRoll(
      state,
      attacker.owner,
      attackerRollKind,
      nextCtx,
      attacker.id
    );
  }

  const resolved = finalizeAttackFromContext(state, nextCtx, false);
  return advanceCombatQueue(resolved.state, resolved.events);
}

function resolveBerserkerDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selected = choice;
  if (selected === "auto") {
    const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "auto") {
    const resolved = finalizeAttackFromContext(state, ctx, true);
    const choiceEvents: GameEvent[] = [
      { type: "berserkerDefenseChosen", defenderId: defender.id, choice: "auto" },
      ...resolved.events,
    ];
    return advanceCombatQueue(resolved.state, choiceEvents);
  }

  if (selected === "roll") {
    const nextCtx: AttackRollContext = { ...ctx, berserkerChoiceMade: true };
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";

    const requested = replacePendingRoll(
      state,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
    const choiceEvents: GameEvent[] = [
      { type: "berserkerDefenseChosen", defenderId: defender.id, choice: "roll" },
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

  return { state: clearPendingRoll(state), events: [] };
}

function applyResolvePendingRoll(
  state: GameState,
  action: Extract<GameAction, { type: "resolvePendingRoll" }>,
  rng: RNG
): ApplyResult {
  const pending = state.pendingRoll;
  if (!pending || pending.id !== action.pendingRollId) {
    return { state, events: [] };
  }
  if (pending.player !== action.player) {
    return { state, events: [] };
  }

  switch (pending.kind) {
    case "initiativeRoll": {
      return resolveInitiativeRoll(state, pending, rng);
    }
    case "enterStealth": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveEnterStealthRoll(state, unitId, rng);
    }
    case "searchStealth": {
      const unitId = pending.context.unitId as string | undefined;
      const mode = pending.context.mode as "action" | "move" | undefined;
      if (!unitId || !mode) {
        return { state: clearPendingRoll(state), events: [] };
      }
      return resolveSearchStealthRoll(state, unitId, mode, rng);
    }
    case "moveTrickster": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveTrickster", rng);
    }
    case "moveBerserker": {
      const unitId = pending.context.unitId as string | undefined;
      if (!unitId) return { state: clearPendingRoll(state), events: [] };
      return resolveMoveOptionsRoll(state, unitId, "moveBerserker", rng);
    }
    case "attack_attackerRoll":
    case "riderPathAttack_attackerRoll": {
      return resolveAttackAttackerRoll(state, pending, rng);
    }
    case "attack_defenderRoll":
    case "riderPathAttack_defenderRoll": {
      return resolveAttackDefenderRoll(state, pending, rng);
    }
    case "tricksterAoE_attackerRoll": {
      return resolveTricksterAoEAttackerRoll(state, pending, rng);
    }
    case "tricksterAoE_defenderRoll": {
      return resolveTricksterAoEDefenderRoll(state, pending, rng);
    }
    case "berserkerDefenseChoice": {
      return resolveBerserkerDefenseChoiceRoll(state, pending, action.choice);
    }
    default:
      return { state: clearPendingRoll(state), events: [] };
  }
}

function getNextTurnIndexForPlayer(
  state: GameState,
  fromIndex: number,
  player: PlayerId
): number {
  const order = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  if (order.length === 0) return fromIndex;

  const len = order.length;

  // РС‰РµРј РІРїРµСЂС‘Рґ РїРѕ РєСЂСѓРіСѓ СЃР»РµРґСѓСЋС‰СѓСЋ Р¶РёРІСѓСЋ С„РёРіСѓСЂСѓ РЅСѓР¶РЅРѕРіРѕ РёРіСЂРѕРєР°
  for (let step = 1; step <= len; step++) {
    const idx = (fromIndex + step) % len;
    const unitId = order[idx];
    const u = state.units[unitId];
    if (!u || !u.isAlive) continue;
    if (u.owner !== player) continue;
    return idx;
  }

  // Р•СЃР»Рё Р¶РёРІС‹С… С„РёРіСѓСЂ РёРіСЂРѕРєР° РЅРµС‚ вЂ” РїРѕРєР° РїСЂРѕСЃС‚Рѕ РѕСЃС‚Р°РІР»СЏРµРј РёРЅРґРµРєСЃ РєР°Рє РµСЃС‚СЊ.
  // (РџРѕР·Р¶Рµ Р·РґРµСЃСЊ РјРѕР¶РЅРѕ Р±СѓРґРµС‚ Р·Р°РІРµСЂС€Р°С‚СЊ РёРіСЂСѓ.)
  return fromIndex;
}



function applyEndTurn(state: GameState, rng: RNG): ApplyResult {
  if (state.phase === "ended") {
    return { state, events: [] };
  }

  // -----------------------------
  // 1) Р¤Р°Р·Р° СЂР°СЃСЃС‚Р°РЅРѕРІРєРё: РїСЂРѕСЃС‚Рѕ РјРµРЅСЏРµРј РёРіСЂРѕРєР°
  // -----------------------------
  if (state.phase === "placement") {
    const prevPlayer = state.currentPlayer;
    const next: PlayerId = prevPlayer === "P1" ? "P2" : "P1";

    const baseState: GameState = {
      ...state,
      currentPlayer: next,
      turnNumber: state.turnNumber + 1,
      // roundNumber РјРѕР¶РЅРѕ РЅРµ С‚СЂРѕРіР°С‚СЊ, РѕРЅ РІР°Р¶РµРЅ РІ Р±РѕСЋ
      activeUnitId: null,
      pendingMove: null,
    };

    const events: GameEvent[] = [
      {
        type: "turnStarted",
        player: next,
        turnNumber: baseState.turnNumber,
      },
    ];

    // В placement стелса ещё нет, только переключаем игрока
    return { state: baseState, events };
  }

  // -----------------------------
  // 2) Р¤Р°Р·Р° Р±РѕСЏ: РєСЂСѓС‚РёРј РѕС‡РµСЂРµРґСЊ СЋРЅРёС‚РѕРІ
  // -----------------------------
  if (state.phase === "battle") {
    // Р•СЃР»Рё Сѓ РѕРґРЅРѕРіРѕ РёР· РёРіСЂРѕРєРѕРІ РЅРµС‚ Р¶РёРІС‹С… С„РёРіСѓСЂ вЂ” Р·Р°РІРµСЂС€Р°РµРј РёРіСЂСѓ
    const p1Alive = Object.values(state.units).some((u) => u.owner === "P1" && u.isAlive);
    const p2Alive = Object.values(state.units).some((u) => u.owner === "P2" && u.isAlive);
    if (!p1Alive || !p2Alive) {
      const winner: PlayerId | null = !p1Alive && p2Alive ? "P2" : p1Alive && !p2Alive ? "P1" : null;
      const endedState: GameState = {
        ...state,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      };
      const events: GameEvent[] = [];
      if (winner) {
        events.push({ type: "gameEnded", winner } as any);
      }
      return { state: endedState, events };
    }

    const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
    if (queue.length === 0) {
      return { state, events: [] };
    }
    const prevIndex = state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;

    const nextIndex = getNextAliveUnitIndex(state, prevIndex, queue);
    if (nextIndex === null) {
      // РќРёРєС‚Рѕ Р¶РёРІ РЅРµ РѕСЃС‚Р°Р»СЃСЏ вЂ” РёРіСЂР° РѕРєРѕРЅС‡РµРЅР°
      const ended: GameState = {
        ...state,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      };
      return { state: ended, events: [] };
    }

    const order = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
    const nextUnitId = order[nextIndex];
    const nextUnit = state.units[nextUnitId]!;
    const nextPlayer = nextUnit.owner;

    // РќРѕРІС‹Р№ СЂР°СѓРЅРґ, РµСЃР»Рё РІРµСЂРЅСѓР»РёСЃСЊ "РЅР°Р·Р°Рґ" РїРѕ РёРЅРґРµРєСЃСѓ
    const isNewRound = nextIndex <= prevIndex;

    let baseState: GameState = {
      ...state,
      currentPlayer: nextPlayer,
      turnNumber: state.turnNumber + 1,
      roundNumber: state.roundNumber + (isNewRound ? 1 : 0),
      activeUnitId: null,
      pendingMove: null,
      turnOrderIndex: nextIndex,
      turnQueueIndex: nextIndex,
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

    return { state: baseState, events };
  }

  // РќР° РІСЃСЏРєРёР№ СЃР»СѓС‡Р°Р№, РµСЃР»Рё РѕРєР°Р¶РµРјСЃСЏ РІ РґСЂСѓРіРѕР№ С„Р°Р·Рµ
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

  // РњРѕР¶РµС‚ С…РѕРґРёС‚СЊ С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»РµС† currentPlayer
  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  // Нельзя начинать ход, если уже есть активная фигура
  if (state.activeUnitId !== null) {
    return { state, events: [] };
  }

  // Жёстко: ходить может только фигура из очереди
  const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  const queueIndex = state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;
  if (queue.length > 0) {
    const scheduledId = queue[queueIndex];
    if (scheduledId !== unit.id) {
      return { state, events: [] };
    }
  }

  const { state: afterStealth, events: stealthEvents } =
    processUnitStartOfTurnStealth(state, unit.id, rng);

  const unitAfterStealth = afterStealth.units[unit.id];
  if (!unitAfterStealth || !unitAfterStealth.isAlive || !unitAfterStealth.position) {
    return { state: afterStealth, events: stealthEvents };
  }

  const { state: afterStart, events: startEvents } = processUnitStartOfTurn(
    afterStealth,
    unit.id,
    rng
  );

  const unitAfter = afterStart.units[unit.id];
  if (!unitAfter) {
    return { state: afterStart, events: startEvents };
  }

  const resetUnit: UnitState = resetTurnEconomy(unitAfter);

  const newState: GameState = {
    ...afterStart,
    units: {
      ...afterStart.units,
      [resetUnit.id]: resetUnit,
    },
    activeUnitId: resetUnit.id,
  };

  return { state: newState, events: [...stealthEvents, ...startEvents] };
}




