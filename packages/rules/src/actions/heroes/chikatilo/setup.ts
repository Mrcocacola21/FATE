import type { GameEvent, GameState, PlayerId, UnitState } from "../../../model";
import { getUnitDefinition } from "../../../units";
import { evUnitDied, evUnitPlaced } from "../../../core";
import { HERO_CHIKATILO_ID } from "../../../heroes";
import {
  createFalseTrailToken,
  getFalseTrailTokenId,
  insertTokenBefore,
} from "./helpers";

export function setupChikatiloFalseTrailForPlacement(
  state: GameState
): GameState {
  const units = { ...state.units };
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || unit.heroId !== HERO_CHIKATILO_ID) continue;
    const tokenId = getFalseTrailTokenId(unit);
    if (!units[tokenId]) {
      units[tokenId] = createFalseTrailToken(unit, null);
      changed = true;
    }
    if (unit.chikatiloFalseTrailTokenId !== tokenId) {
      units[unit.id] = {
        ...unit,
        chikatiloFalseTrailTokenId: tokenId,
      };
      changed = true;
    }
  }

  if (!changed) return state;
  return { ...state, units };
}

function clearTokenReference(state: GameState, tokenId: string): GameState {
  const owner = Object.values(state.units).find(
    (unit) => unit.chikatiloFalseTrailTokenId === tokenId
  );
  if (!owner) return state;
  const updatedOwner: UnitState = {
    ...owner,
    chikatiloFalseTrailTokenId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [updatedOwner.id]: updatedOwner,
    },
  };
}

export function removeFalseTrailToken(
  state: GameState,
  tokenId: string
): { state: GameState; events: GameEvent[] } {
  const token = state.units[tokenId];
  if (!token) return { state, events: [] };
  if (!token.isAlive) {
    return { state: clearTokenReference(state, tokenId), events: [] };
  }
  const updatedToken: UnitState = {
    ...token,
    isAlive: false,
    position: null,
  };
  const nextState = clearTokenReference(
    {
      ...state,
      units: {
        ...state.units,
        [updatedToken.id]: updatedToken,
      },
    },
    tokenId
  );
  const events: GameEvent[] = [
    evUnitDied({ unitId: updatedToken.id, killerId: null }),
  ];
  return { state: nextState, events };
}

export function setupChikatiloFalseTrailAtBattleStart(
  state: GameState
): { state: GameState; events: GameEvent[]; placementQueue: string[] } {
  const chikatilos = Object.values(state.units)
    .filter((unit) => unit.isAlive && unit.position && unit.heroId === HERO_CHIKATILO_ID)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (chikatilos.length === 0) {
    return { state, events: [], placementQueue: [] };
  }

  let nextState = state;
  const units = { ...state.units };
  let turnQueue = [...state.turnQueue];
  let turnOrder = [...state.turnOrder];
  let knowledge = {
    P1: { ...(state.knowledge?.P1 ?? {}) },
    P2: { ...(state.knowledge?.P2 ?? {}) },
  };
  let lastKnownPositions = {
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  const events: GameEvent[] = [];
  const placementQueue: string[] = [];

  for (const chikatilo of chikatilos) {
    if (!chikatilo.position) continue;
    const tokenId = getFalseTrailTokenId(chikatilo);
    if (units[tokenId]) {
      if (chikatilo.chikatiloFalseTrailTokenId !== tokenId) {
        units[chikatilo.id] = {
          ...chikatilo,
          chikatiloFalseTrailTokenId: tokenId,
        };
      }
      turnQueue = insertTokenBefore(turnQueue, tokenId, chikatilo.id);
      turnOrder = insertTokenBefore(turnOrder, tokenId, chikatilo.id);
      continue;
    }

    const token = createFalseTrailToken(chikatilo, chikatilo.position);
    units[token.id] = token;

    const def = getUnitDefinition("assassin");
    const updatedChikatilo: UnitState = {
      ...chikatilo,
      position: null,
      isStealthed: true,
      stealthTurnsLeft: def.maxStealthTurns ?? 3,
      chikatiloFalseTrailTokenId: token.id,
      chikatiloMarkedTargets: Array.isArray(chikatilo.chikatiloMarkedTargets)
        ? chikatilo.chikatiloMarkedTargets
        : [],
    };
    units[updatedChikatilo.id] = updatedChikatilo;

    turnQueue = insertTokenBefore(turnQueue, token.id, updatedChikatilo.id);
    turnOrder = insertTokenBefore(turnOrder, token.id, updatedChikatilo.id);

    const owner = updatedChikatilo.owner;
    const other: PlayerId = owner === "P1" ? "P2" : "P1";
    knowledge = {
      ...knowledge,
      [owner]: {
        ...knowledge[owner],
        [updatedChikatilo.id]: true,
        [token.id]: true,
      },
      [other]: {
        ...knowledge[other],
        [token.id]: true,
      },
    };
    delete knowledge[other][updatedChikatilo.id];
    delete lastKnownPositions.P1[updatedChikatilo.id];
    delete lastKnownPositions.P2[updatedChikatilo.id];

    events.push(evUnitPlaced({ unitId: token.id, position: token.position! }));
    placementQueue.push(updatedChikatilo.id);
  }

  nextState = {
    ...nextState,
    units,
    turnQueue,
    turnOrder,
    knowledge,
    lastKnownPositions,
    startingUnitId: turnQueue[0] ?? nextState.startingUnitId,
  };

  return { state: nextState, events, placementQueue };
}
