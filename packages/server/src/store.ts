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
}

export interface CreateGameOptions {
  seed?: number;
  arenaId?: string;
}

export interface ApplyActionResult {
  state: GameState;
  events: GameEvent[];
  logIndex: number;
}

// TODO: replace with persistence-backed storage.
const games = new Map<string, GameRoom>();

function nextSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

function createGameRoomWithId(
  id: string,
  options: CreateGameOptions = {}
): GameRoom {
  const seed = options.seed ?? nextSeed();
  const rng = new SeededRNG(seed);

  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  if (options.arenaId) {
    state = applyAction(state, { type: "rollInitiative" }, rng).state;
    state = applyAction(
      state,
      { type: "chooseArena", arenaId: options.arenaId },
      rng
    ).state;
  }

  const room: GameRoom = {
    id,
    seed,
    rng,
    state,
    actionLog: [],
    createdAt: Date.now(),
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
