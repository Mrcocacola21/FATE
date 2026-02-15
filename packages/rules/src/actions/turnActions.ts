import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
} from "../model";
import type { RNG } from "../rng";
import { processUnitStartOfTurn } from "../abilities";
import { processUnitStartOfTurnStealth } from "../stealth";
import { resetTurnEconomy } from "../turnEconomy";
import {
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_KALADIN_ID,
  HERO_LOKI_ID,
} from "../heroes";
import {
  maybeTriggerCarpetStrike,
  maybeTriggerEngineeringMiracle,
  processUnitStartOfTurnBunker,
} from "./heroes/kaiser";
import { applyGutsEndTurnDrain } from "./heroes/guts";
import { tryApplyFriskPowerOfFriendship } from "./heroes/frisk";
import { clearKaladinMoveLocksForCaster } from "./heroes/kaladin";
import { clearLokiEffectsForCaster } from "./heroes/loki";
import { maybeTriggerElCidKolada } from "./heroes/elCid";
import { maybeTriggerGroznyTyrant } from "./heroes/grozny";
import {
  applyStormStartOfTurn,
  maybeTriggerLechyConfuseTerrain,
} from "./heroes/lechy";
import {
  maybeTriggerVladForestChoice,
  maybeTriggerVladTurnStakes,
} from "./heroes/vlad";
import { evGameEnded, evRoundStarted, evTurnStarted } from "../core";

function nextPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

function clearGenghisTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit) return state;
  if (
    unit.genghisKhanDiagonalMoveActive !== true &&
    unit.genghisKhanDecreeMovePending !== true &&
    unit.genghisKhanMongolChargeActive !== true
  ) {
    return state;
  }
  const cleared: UnitState = {
    ...unit,
    genghisKhanDiagonalMoveActive: false,
    genghisKhanDecreeMovePending: false,
    genghisKhanMongolChargeActive: false,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: cleared,
    },
  };
}

function clearLechyGuideTravelerTarget(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !unit.lechyGuideTravelerTargetId) return state;
  const cleared: UnitState = {
    ...unit,
    lechyGuideTravelerTargetId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: cleared,
    },
  };
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

export function applyEndTurn(state: GameState, rng: RNG): ApplyResult {
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
      evTurnStarted({ player: next, turnNumber: baseState.turnNumber }),
    ];

    // В placement стелса ещё нет, только переключаем игрока
    return { state: baseState, events };
  }

  // -----------------------------
  // 2) Р¤Р°Р·Р° Р±РѕСЏ: РєСЂСѓС‚РёРј РѕС‡РµСЂРµРґСЊ СЋРЅРёС‚РѕРІ
  // -----------------------------
  if (state.phase === "battle") {
    const drained = applyGutsEndTurnDrain(state, state.activeUnitId);
    const stateAfterDrain = drained.state;
    const stateAfterGenghis = clearGenghisTurnFlags(
      stateAfterDrain,
      stateAfterDrain.activeUnitId
    );
    const stateAfterTurn = clearLechyGuideTravelerTarget(
      stateAfterGenghis,
      stateAfterGenghis.activeUnitId
    );
    // Р•СЃР»Рё Сѓ РѕРґРЅРѕРіРѕ РёР· РёРіСЂРѕРєРѕРІ РЅРµС‚ Р¶РёРІС‹С… С„РёРіСѓСЂ вЂ” Р·Р°РІРµСЂС€Р°РµРј РёРіСЂСѓ
    const p1Alive = Object.values(stateAfterTurn.units).some(
      (u) =>
        u.owner === "P1" &&
        u.isAlive &&
        u.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    );
    const p2Alive = Object.values(stateAfterTurn.units).some(
      (u) =>
        u.owner === "P2" &&
        u.isAlive &&
        u.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    );
    if (!p1Alive || !p2Alive) {
      const winner: PlayerId | null = !p1Alive && p2Alive ? "P2" : p1Alive && !p2Alive ? "P1" : null;
      const endedState: GameState = {
        ...stateAfterTurn,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      };
      const events: GameEvent[] = [...drained.events];
      if (winner) {
        events.push(evGameEnded({ winner }));
      }
      return { state: endedState, events };
    }

    const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
    if (queue.length === 0) {
      return { state: stateAfterTurn, events: drained.events };
    }
    const prevIndex = state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;

    const nextIndex = getNextAliveUnitIndex(stateAfterTurn, prevIndex, queue);
    if (nextIndex === null) {
      // РќРёРєС‚Рѕ Р¶РёРІ РЅРµ РѕСЃС‚Р°Р»СЃСЏ вЂ” РёРіСЂР° РѕРєРѕРЅС‡РµРЅР°
      const ended: GameState = {
        ...stateAfterTurn,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      };
      return { state: ended, events: drained.events };
    }

    const order = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
    const nextUnitId = order[nextIndex];
    const nextUnit = stateAfterTurn.units[nextUnitId]!;
    const nextPlayer = nextUnit.owner;

    // РќРѕРІС‹Р№ СЂР°СѓРЅРґ, РµСЃР»Рё РІРµСЂРЅСѓР»РёСЃСЊ "РЅР°Р·Р°Рґ" РїРѕ РёРЅРґРµРєСЃСѓ
    const isNewRound = nextIndex <= prevIndex;

    let baseState: GameState = {
      ...stateAfterTurn,
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
      events.push(evRoundStarted({ roundNumber: baseState.roundNumber }));
    }

    events.push(
      evTurnStarted({ player: nextPlayer, turnNumber: baseState.turnNumber })
    );

    return { state: baseState, events: [...drained.events, ...events] };
  }

  // РќР° РІСЃСЏРєРёР№ СЃР»СѓС‡Р°Р№, РµСЃР»Рё РѕРєР°Р¶РµРјСЃСЏ РІ РґСЂСѓРіРѕР№ С„Р°Р·Рµ
  return { state, events: [] };
}

export function applyUnitStartTurn(
  state: GameState,
  action: Extract<GameAction, { type: "unitStartTurn" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const initialUnit = state.units[action.unitId];
  if (!initialUnit || !initialUnit.isAlive || !initialUnit.position) {
    return { state, events: [] };
  }

  const unit = initialUnit;

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
  const queueIndex =
    state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;
  if (queue.length > 0) {
    const scheduledId = queue[queueIndex];
    if (scheduledId !== unit.id) {
      return { state, events: [] };
    }
  }

  const stateAfterKaladinCleanup =
    unit.heroId === HERO_KALADIN_ID
      ? clearKaladinMoveLocksForCaster(state, unit.id)
      : state;
  const stateAfterStatusCleanup =
    unit.heroId === HERO_LOKI_ID
      ? clearLokiEffectsForCaster(stateAfterKaladinCleanup, unit.id)
      : stateAfterKaladinCleanup;

  const { state: afterStealth, events: stealthEvents } =
    processUnitStartOfTurnStealth(stateAfterStatusCleanup, unit.id, rng);

  const unitAfterStealth = afterStealth.units[unit.id];
  if (!unitAfterStealth || !unitAfterStealth.isAlive || !unitAfterStealth.position) {
    return { state: afterStealth, events: stealthEvents };
  }

  const { state: afterBunker, events: bunkerEvents } =
    processUnitStartOfTurnBunker(afterStealth, unit.id);

  const unitAfterBunker = afterBunker.units[unit.id];
  if (!unitAfterBunker) {
    return { state: afterBunker, events: [...stealthEvents, ...bunkerEvents] };
  }

  const { state: afterStorm, events: stormEvents } = applyStormStartOfTurn(
    afterBunker,
    unit.id,
    rng
  );

  const unitAfterStorm = afterStorm.units[unit.id];
  if (!unitAfterStorm || !unitAfterStorm.isAlive || !unitAfterStorm.position) {
    return {
      state: afterStorm,
      events: [...stealthEvents, ...bunkerEvents, ...stormEvents],
    };
  }

  const { state: afterStart, events: startEvents } = processUnitStartOfTurn(
    afterStorm,
    unit.id,
    rng
  );

  const unitAfterStart = afterStart.units[unit.id];
  if (!unitAfterStart) {
    return {
      state: afterStart,
      events: [...stealthEvents, ...bunkerEvents, ...stormEvents, ...startEvents],
    };
  }

  const updatedForTurnCount: UnitState = {
    ...unitAfterStart,
    ownTurnsStarted: (unitAfterStart.ownTurnsStarted ?? 0) + 1,
  };

  const stateAfterTurnCount: GameState = {
    ...afterStart,
    units: {
      ...afterStart.units,
      [updatedForTurnCount.id]: updatedForTurnCount,
    },
  };

  const engineeringResult = maybeTriggerEngineeringMiracle(
    stateAfterTurnCount,
    unit.id
  );
  const carpetResult = maybeTriggerCarpetStrike(engineeringResult.state, unit.id);
  const koladaResult = carpetResult.state.pendingRoll
    ? carpetResult
    : maybeTriggerElCidKolada(carpetResult.state, unit.id, rng);
  const tyrantResult = koladaResult.state.pendingRoll
    ? { state: koladaResult.state, events: [] }
    : maybeTriggerGroznyTyrant(koladaResult.state, unit.id, rng);
  const confuseTerrainResult = tyrantResult.state.pendingRoll
    ? { state: tyrantResult.state, events: [] }
    : maybeTriggerLechyConfuseTerrain(tyrantResult.state, unit.id);
  const forestResult = maybeTriggerVladForestChoice(
    confuseTerrainResult.state,
    unit.id,
    true
  );
  const stakesResult = forestResult.state.pendingRoll
    ? forestResult
    : maybeTriggerVladTurnStakes(forestResult.state, unit.id);
  const vladEvents =
    stakesResult === forestResult
      ? forestResult.events
      : [...forestResult.events, ...stakesResult.events];

  const unitAfter = stakesResult.state.units[unit.id];
  if (!unitAfter) {
    return {
      state: stakesResult.state,
      events: [
        ...stealthEvents,
        ...bunkerEvents,
        ...stormEvents,
        ...startEvents,
        ...engineeringResult.events,
        ...carpetResult.events,
        ...koladaResult.events,
        ...tyrantResult.events,
        ...confuseTerrainResult.events,
        ...vladEvents,
      ],
    };
  }

  let resetUnit: UnitState = resetTurnEconomy(unitAfter);
  if (resetUnit.movementDisabledNextTurn) {
    resetUnit = {
      ...resetUnit,
      movementDisabledNextTurn: false,
      turn: {
        ...resetUnit.turn,
        moveUsed: true,
      },
    };
  }

  const newState: GameState = {
    ...stakesResult.state,
    units: {
      ...stakesResult.state.units,
      [resetUnit.id]: resetUnit,
    },
    activeUnitId: resetUnit.id,
  };

  const baseEvents: GameEvent[] = [
    ...stealthEvents,
    ...bunkerEvents,
    ...stormEvents,
    ...startEvents,
    ...engineeringResult.events,
    ...carpetResult.events,
    ...koladaResult.events,
    ...tyrantResult.events,
    ...confuseTerrainResult.events,
    ...vladEvents,
  ];
  const friendship = tryApplyFriskPowerOfFriendship(newState);
  if (friendship) {
    return {
      state: friendship.state,
      events: [...baseEvents, ...friendship.events],
    };
  }

  return {
    state: newState,
    events: baseEvents,
  };
}








