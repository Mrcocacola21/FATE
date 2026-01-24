// packages/server/src/store.ts

import {
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  SeededRNG,
} from "rules";
import { randomUUID } from "node:crypto";

export interface ActionLogEntry {
  at: number;
  playerId?: PlayerId;
  action: GameAction;
  events: GameEvent[];
}

export interface GameRoom {
  id: string;
  seed: number;
  rng: SeededRNG;
  state: GameState;
  actionLog: ActionLogEntry[];
  createdAt: number;
  hostConnId: string | null;
  hostSeat: PlayerId;
  seats: { P1: string | null; P2: string | null };
  spectators: Set<string>;
}

export interface CreateGameOptions {
  seed?: number;
  arenaId?: string;
  hostSeat?: PlayerId;
  hostConnId?: string | null;
}

export interface ApplyActionResult {
  state: GameState;
  events: GameEvent[];
  logIndex: number;
}

export interface RoomSummary {
  id: string;
  createdAt: number;
  phase: GameState["phase"];
  players: { P1: boolean; P2: boolean };
  spectators: number;
  ready: { P1: boolean; P2: boolean };
  canStart: boolean;
}

// TODO: replace with persistence-backed storage.
const games = new Map<string, GameRoom>();

function nextSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

export function createGameRoomWithId(
  id: string,
  options: CreateGameOptions = {}
): GameRoom {
  const seed = options.seed ?? nextSeed();
  const rng = new SeededRNG(seed);
  const hostSeat: PlayerId = options.hostSeat ?? "P1";
  const hostConnId = options.hostConnId ?? null;

  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  state = applyAction(state, { type: "lobbyInit", host: hostSeat }, rng).state;

  if (options.arenaId) {
    state = { ...state, arenaId: options.arenaId };
  }

  if (!hostConnId) {
    state = {
      ...state,
      seats: { P1: false, P2: false },
    };
  }

  const seats: { P1: string | null; P2: string | null } = {
    P1: null,
    P2: null,
  };
  if (hostConnId) {
    seats[hostSeat] = hostConnId;
    state = {
      ...state,
      seats: { ...state.seats, [hostSeat]: true },
      playersReady: { ...state.playersReady, [hostSeat]: false },
    };
  }

  const room: GameRoom = {
    id,
    seed,
    rng,
    state,
    actionLog: [],
    createdAt: Date.now(),
    hostConnId,
    hostSeat,
    seats,
    spectators: new Set<string>(),
  };

  games.set(room.id, room);
  return room;
}

export function createGameRoom(options: CreateGameOptions = {}): GameRoom {
  return createGameRoomWithId(randomUUID(), options);
}

export function getGameRoom(id: string): GameRoom | undefined {
  return games.get(id);
}

export function getOrCreateGameRoom(
  id: string,
  options: CreateGameOptions = {}
): GameRoom {
  const existing = games.get(id);
  if (existing) return existing;
  return createGameRoomWithId(id, options);
}

export function listGameRooms(): GameRoom[] {
  return Array.from(games.values());
}

export function listRoomSummaries(): RoomSummary[] {
  return listGameRooms().map((room) => {
    const players = {
      P1: !!room.seats.P1,
      P2: !!room.seats.P2,
    };
    const ready = room.state.playersReady;
    const canStart =
      room.state.phase === "lobby" &&
      players.P1 &&
      players.P2 &&
      ready.P1 &&
      ready.P2 &&
      !room.state.pendingRoll;

    return {
      id: room.id,
      createdAt: room.createdAt,
      phase: room.state.phase,
      players,
      spectators: room.spectators.size,
      ready,
      canStart,
    };
  });
}

export function applyGameAction(
  room: GameRoom,
  action: GameAction,
  playerId?: PlayerId
): ApplyActionResult {
  const result = applyAction(room.state, action, room.rng);

  room.state = result.state;
  room.actionLog.push({
    at: Date.now(),
    playerId,
    action,
    events: result.events,
  });

  return {
    state: room.state,
    events: result.events,
    logIndex: room.actionLog.length - 1,
  };
}
