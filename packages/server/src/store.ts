// packages/server/src/store.ts

import {
  GameAction,
  GameEvent,
  GameState,
  GameModeId,
  PlayerId,
  HeroSelection,
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  createDebugSandboxState,
  DebugDiceRNG,
  type RNG,
  SeededRNG,
  type DebugStateCommand,
  type DraftState,
} from "rules";
import { randomUUID } from "node:crypto";
import { accepted, rejected, type CommandResult } from "./commandResult";

export interface ActionLogEntry {
  at: number;
  playerId?: PlayerId;
  action: GameAction | DebugStateCommand | { type: string; [key: string]: unknown };
  events: GameEvent[];
  revision: number;
  debugDiceConsumed?: number[];
}

export interface GameRoom {
  id: string;
  seed: number;
  rng: RNG;
  testDiceRng: DebugDiceRNG | null;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
  draftState: DraftState | null;
  testControllerConnId: string | null;
  state: GameState;
  actionLog: ActionLogEntry[];
  revision: number;
  createdAt: number;
  lastActivityAt: number;
  hostConnId: string | null;
  hostSeat: PlayerId;
  seats: { P1: string | null; P2: string | null };
  seatTokens: { P1: string | null; P2: string | null };
  spectators: Set<string>;
  figureSets: Partial<Record<PlayerId, HeroSelection>>;
}

export interface CreateGameOptions {
  seed?: number;
  arenaId?: string;
  hostSeat?: PlayerId;
  hostConnId?: string | null;
  roomMode?: "normal" | "test";
  gameMode?: GameModeId;
}

export interface RoomSummary {
  id: string;
  createdAt: number;
  phase: GameState["phase"];
  players: { P1: boolean; P2: boolean };
  spectators: number;
  ready: { P1: boolean; P2: boolean };
  canStart: boolean;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
}

// TODO: replace with persistence-backed storage.
const games = new Map<string, GameRoom>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getRoomTtlMs(): number {
  return readPositiveIntEnv("ROOM_TTL_MS", 24 * 60 * 60 * 1000);
}

export function getMaxRooms(): number {
  return readPositiveIntEnv("MAX_ROOMS", 100);
}

export function getMaxLogEvents(): number {
  return readPositiveIntEnv("MAX_LOG_EVENTS", 5000);
}

function isExplicitlyAcceptedNoop(
  action: GameAction,
  previousState: GameState
): boolean {
  // Explicitly allow known idempotent commands so they are not misclassified as
  // rejections when they intentionally produce no state delta and no events.
  switch (action.type) {
    case "setReady":
      return (
        previousState.phase === "lobby" &&
        previousState.playersReady[action.player] === action.ready
      );
    default:
      return false;
  }
}

function nextSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000) + 1;
}

export function createGameRoomWithId(
  id: string,
  options: CreateGameOptions = {}
): GameRoom {
  const seed = options.seed ?? nextSeed();
  const rng = new SeededRNG(seed);
  const roomMode = options.roomMode ?? "normal";
  const gameMode = options.gameMode ?? "standard";
  const hostSeat: PlayerId = options.hostSeat ?? "P1";
  const hostConnId = options.hostConnId ?? null;

  let state =
    roomMode === "test" ? createDebugSandboxState() : createEmptyGame();
  if (roomMode === "normal") {
    state = attachArmy(state, createDefaultArmy("P1"));
    state = attachArmy(state, createDefaultArmy("P2"));
    state = applyAction(state, { type: "lobbyInit", host: hostSeat }, rng).state;
  } else {
    state = {
      ...state,
      seats: { P1: false, P2: false },
      playersReady: { P1: true, P2: true },
      hostPlayerId: hostSeat,
    };
  }

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
      playersReady:
        roomMode === "test"
          ? state.playersReady
          : { ...state.playersReady, [hostSeat]: false },
    };
  }

  const now = Date.now();
  const room: GameRoom = {
    id,
    seed,
    rng:
      roomMode === "test" ? new DebugDiceRNG(rng) : rng,
    testDiceRng: null,
    roomMode,
    gameMode,
    draftState: null,
    testControllerConnId: roomMode === "test" ? hostConnId : null,
    state,
    actionLog: [],
    revision: 0,
    createdAt: now,
    lastActivityAt: now,
    hostConnId,
    hostSeat,
    seats,
    seatTokens: { P1: null, P2: null },
    spectators: new Set<string>(),
    figureSets: {},
  };
  if (roomMode === "test") {
    room.testDiceRng = room.rng as DebugDiceRNG;
  }

  games.set(room.id, room);
  return room;
}

export function createGameRoom(options: CreateGameOptions = {}): GameRoom {
  return createGameRoomWithId(randomUUID(), options);
}

export function getGameRoom(id: string): GameRoom | undefined {
  return games.get(id);
}

export function touchGameRoom(room: GameRoom, now = Date.now()) {
  room.lastActivityAt = now;
}

export function deleteGameRoom(id: string): boolean {
  return games.delete(id);
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

export function cleanupGameRooms(
  options: {
    now?: number;
    roomTtlMs?: number;
    maxRooms?: number;
    activeRoomIds?: Set<string>;
  } = {}
): string[] {
  const now = options.now ?? Date.now();
  const roomTtlMs = options.roomTtlMs ?? getRoomTtlMs();
  const maxRooms = options.maxRooms ?? getMaxRooms();
  const activeRoomIds = options.activeRoomIds ?? new Set<string>();
  const removed: string[] = [];

  for (const room of games.values()) {
    if (activeRoomIds.has(room.id)) continue;
    if (now - room.lastActivityAt > roomTtlMs) {
      games.delete(room.id);
      removed.push(room.id);
    }
  }

  if (games.size <= maxRooms) return removed;

  const inactiveRooms = Array.from(games.values())
    .filter((room) => !activeRoomIds.has(room.id))
    .sort((a, b) => a.lastActivityAt - b.lastActivityAt);

  for (const room of inactiveRooms) {
    if (games.size <= maxRooms) break;
    games.delete(room.id);
    removed.push(room.id);
  }

  return removed;
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
      !room.draftState &&
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
      roomMode: room.roomMode,
      gameMode: room.gameMode,
    };
  });
}

export function applyGameAction(
  room: GameRoom,
  action: GameAction,
  playerId?: PlayerId
): CommandResult {
  const previousState = room.state;
  const diceQueueBefore = room.testDiceRng?.getQueue() ?? [];
  const result = applyAction(previousState, action, room.rng);
  const diceQueueAfter = room.testDiceRng?.getQueue() ?? [];
  const debugDiceConsumed =
    diceQueueBefore.length > diceQueueAfter.length
      ? diceQueueBefore.slice(0, diceQueueBefore.length - diceQueueAfter.length)
      : [];
  const stateChanged = result.state !== previousState;

  if (!stateChanged && result.events.length === 0) {
    // TODO: Temporary heuristic until rules return explicit accepted/rejected
    // outcomes. Keep rejecting by default, but whitelist valid idempotent no-ops.
    if (isExplicitlyAcceptedNoop(action, previousState)) {
      return accepted({
        stateChanged: false,
        events: [],
      });
    }
    return rejected("RULES_REJECTED", "Action rejected by rules");
  }

  room.state = result.state;
  touchGameRoom(room);
  room.revision += 1;
  room.actionLog.push({
    at: Date.now(),
    playerId,
    action,
    events: result.events,
    revision: room.revision,
    debugDiceConsumed:
      debugDiceConsumed.length > 0 ? debugDiceConsumed : undefined,
  });
  const maxLogEvents = getMaxLogEvents();
  if (room.actionLog.length > maxLogEvents) {
    room.actionLog.splice(0, room.actionLog.length - maxLogEvents);
  }

  return accepted({
    stateChanged,
    events: result.events,
    revision: room.revision,
    logIndex: room.actionLog.length - 1,
  });
}

export const storeTestHooks = {
  reset: () => games.clear(),
};
