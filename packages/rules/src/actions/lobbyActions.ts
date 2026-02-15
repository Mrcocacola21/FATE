import type { ApplyResult, GameAction, GameEvent, GameState } from "../model";
import type { RNG } from "../rng";
import { roll2D6Sum } from "./shared";
import { requestInitiativeRoll } from "../core";
import { evInitiativeResolved, evPlacementStarted } from "../core";

type LobbyInitPayload = Extract<GameAction, { type: "lobbyInit" }> & {
  seats?: GameState["seats"];
  playersReady?: GameState["playersReady"];
};

function applyRollInitiative(state: GameState, rng: RNG): ApplyResult {
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

  const placementFirstPlayer = p1 > p2 ? "P1" : "P2";

  const newState: GameState = {
    ...state,
    initiative: {
      P1: p1,
      P2: p2,
      winner: placementFirstPlayer,
    },
    placementFirstPlayer,
    // важное: тот, кто ставит первым, становится currentPlayer
    currentPlayer: placementFirstPlayer,
  };

  const events: GameEvent[] = [
    evInitiativeResolved({
      winner: placementFirstPlayer,
      P1sum: p1,
      P2sum: p2,
    }),
    evPlacementStarted({ placementFirstPlayer }),
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

  const newState: GameState = {
    ...state,
    arenaId: action.arenaId,
  };
  return { state: newState, events: [] };
}

function applyLobbyInit(
  state: GameState,
  action: Extract<GameAction, { type: "lobbyInit" }>
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state, events: [] };
  }

  const host = action.host;
  const payload = action as LobbyInitPayload;
  const nextState: GameState = {
    ...state,
    hostPlayerId: host,
    seats: payload.seats ?? state.seats,
    playersReady: payload.playersReady ?? state.playersReady,
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

export const lobbyHandlers = {
  applyRollInitiative,
  applyChooseArena,
  applyLobbyInit,
  applySetReady,
  applyStartGame,
};


