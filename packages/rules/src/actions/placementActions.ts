import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
} from "../model";
import { isInsideBoard } from "../model";
import { isCellOccupied } from "../board";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../heroes";
import { canPlaceFalsePromiseToken, isNormalDeploymentCell } from "../legal";
import { isHassan, isVlad } from "./shared";
import { activateVladForest, requestVladStakesPlacement } from "./heroes/vlad";
import { requestHassanAssassinOrderSelection } from "./heroes/hassan";
import {
  requestChikatiloPlacement,
  setupChikatiloFalseTrailAtBattleStart,
} from "./heroes/chikatilo";
import { evBattleStarted, evUnitPlaced } from "../core";

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

export function applyPlaceUnit(
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

  if (unit.heroId === HERO_CHIKATILO_ID) {
    const tokenId =
      unit.chikatiloFalseTrailTokenId ?? `falseTrail-${unit.id}`;
    const token = state.units[tokenId];
    const hasToken =
      (token && token.isAlive && token.owner === unit.owner) ||
      Object.values(state.units).some(
        (u) =>
          u.isAlive &&
          u.owner === unit.owner &&
          u.heroId === HERO_FALSE_TRAIL_TOKEN_ID
      );
    if (hasToken) {
      return { state, events: [] };
    }
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
  const isLegalDeploymentCell =
    unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID
      ? canPlaceFalsePromiseToken(unit.owner, pos, state.boardSize)
      : isNormalDeploymentCell(unit.owner, pos, state.boardSize);
  if (!isLegalDeploymentCell) {
    return unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID
      ? {
          state,
          events: [],
          rejectionReason: "false_promise_token_must_be_in_deployment_zone",
        }
      : { state, events: [] };
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
  let chikatiloPlacementQueue: string[] = [];

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

    // Attach knowledge to newState below
    initialKnowledge = knowledge;
  }

  let newState: GameState = {
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

  let events: GameEvent[] = [
    evUnitPlaced({
      unitId: updatedUnit.id,
      position: updatedUnit.position!,
    }),
  ];

  if (phase === "battle") {
    const setup = setupChikatiloFalseTrailAtBattleStart(newState);
    newState = setup.state;
    chikatiloPlacementQueue = setup.placementQueue;
    if (setup.events.length > 0) {
      extraEvents.push(...setup.events);
    }

    const battleStartingUnitId = newState.startingUnitId ?? startingUnitId;
    const startingUnit =
      battleStartingUnitId && newState.units[battleStartingUnitId]
        ? newState.units[battleStartingUnitId]
        : updatedUnit;
    extraEvents.push(
      evBattleStarted({
        startingUnitId: battleStartingUnitId ?? updatedUnit.id,
        startingPlayer: startingUnit.owner,
      })
    );
  }

  events = [...events, ...extraEvents];

  let finalState = newState;
  let finalEvents = events;

  if (phase === "battle" && chikatiloPlacementQueue.length > 0) {
    const [first, ...rest] = chikatiloPlacementQueue;
    const requested = requestChikatiloPlacement(finalState, first, rest);
    finalState = requested.state;
    finalEvents = [...finalEvents, ...requested.events];
  }

  if (
    unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID &&
    !finalState.pendingRoll
  ) {
    const chikatilo = Object.values(finalState.units).find(
      (u) =>
        u.isAlive &&
        u.owner === unit.owner &&
        u.heroId === HERO_CHIKATILO_ID
    );
    if (chikatilo && !chikatilo.position) {
      const requested = requestChikatiloPlacement(finalState, chikatilo.id);
      finalState = requested.state;
      finalEvents = [...finalEvents, ...requested.events];
    }
  }

  if (phase === "battle" && !finalState.pendingRoll) {
    const hassanOwners = Array.from(
      new Set(
        Object.values(finalState.units)
          .filter((u) => u.isAlive && isHassan(u))
          .map((u) => u.owner)
      )
    ).sort() as PlayerId[];

    if (hassanOwners.length > 0) {
      const [firstOwner, ...queue] = hassanOwners;
      const requested = requestHassanAssassinOrderSelection(
        finalState,
        firstOwner,
        queue
      );
      if (requested.state !== finalState || requested.events.length > 0) {
        finalState = requested.state;
        finalEvents = [...finalEvents, ...requested.events];
      }
    }
  }

  if (phase === "battle" && !finalState.pendingRoll) {
    const vladOwners = Array.from(
      new Set(
        Object.values(finalState.units)
          .filter((u) => u.isAlive && isVlad(u))
          .map((u) => u.owner)
      )
    ).sort() as PlayerId[];

    if (vladOwners.length > 0) {
      const [firstOwner, ...queue] = vladOwners;
      const ownedStakes = finalState.stakeMarkers.filter(
        (marker) => marker.owner === firstOwner
      ).length;
      const vladUnit = Object.values(finalState.units).find(
        (u) => u.isAlive && isVlad(u) && u.owner === firstOwner
      );
      if (ownedStakes >= 9 && vladUnit) {
        const forest = activateVladForest(finalState, vladUnit.id, firstOwner);
        finalState = forest.state;
        finalEvents = [...finalEvents, ...forest.events];
      } else {
        const requested = requestVladStakesPlacement(
          finalState,
          firstOwner,
          "battleStart",
          queue
        );
        finalState = requested.state;
        finalEvents = [...finalEvents, ...requested.events];
      }
    }
  }

  return { state: finalState, events: finalEvents };
}

