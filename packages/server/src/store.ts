import { validateMatchType, type MatchType } from "./matches/matchType";
// packages/server/src/store.ts

import {
  GameAction,
  GameEvent,
  GameState,
  GameModeId,
  PlayerId,
  HeroSelection,
  applyAction,
  createDebugSandboxState,
  DebugDiceRNG,
  type RNG,
  SeededRNG,
  type DebugStateCommand,
  type DraftState,
} from "rules";
import { randomUUID } from "node:crypto";
import type { ConnectionIdentity } from "./auth/connectionIdentity";
import { accepted, rejected, type CommandResult } from "./commandResult";
import { createInitialMatchState } from "./replay/initialState";
import { captureReplaySetup, type ReplaySetup } from "./replay/actionSetup";
import { withAcceptedRevision } from "./replay/stateRevision";

export interface ActionLogEntry {
  at: number;
  playerId?: PlayerId;
  action: GameAction | DebugStateCommand | { type: string; [key: string]: unknown };
  events: GameEvent[];
  revision: number;
  debugDiceConsumed?: number[];
  replaySetup?: ReplaySetup;
}

export interface GameRoom {
  id: string;
  matchId: string | null;
  readonly matchType: MatchType;
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
  seatIdentities: Record<PlayerId, ConnectionIdentity | null>;
  participantsLocked: boolean;
  /** Immutable competitor ownership, independent of transport/grace tokens. */
  reservedUserIds?: Record<PlayerId, string>;
  spectators: Set<string>;
  figureSets: Partial<Record<PlayerId, HeroSelection>>;
}

export interface CreateGameOptions {
  /** Stage a room privately until its durable Match has been created. */
  publish?: boolean;
  seed?: number;
  arenaId?: string;
  hostSeat?: PlayerId;
  hostConnId?: string | null;
  roomMode?: "normal" | "test";
  gameMode?: GameModeId;
  matchType?: MatchType;
}

export interface RoomSummary {
  matchType: MatchType;
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

// Authoritative realtime storage stays in memory. Match metadata lives separately.
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

function isExplicitlyAcceptedNoop(action: GameAction, previousState: GameState): boolean {
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

export function createGameRoomWithId(id: string, options: CreateGameOptions = {}): GameRoom {
  const seed = options.seed ?? nextSeed();
  const rng = new SeededRNG(seed);
  const roomMode = options.roomMode ?? "normal";
  const matchType = validateMatchType(options.matchType, roomMode);
  const gameMode = options.gameMode ?? "standard";
  const hostSeat: PlayerId = options.hostSeat ?? "P1";
  const hostConnId = options.hostConnId ?? null;

  let state = roomMode === "test" ? createDebugSandboxState() : createInitialMatchState({
    formatVersion: 1, rngAlgorithm: "lcg32-numerical-recipes-v1", gameMode,
    hostSeat, hostOccupied: !!hostConnId, arenaId: options.arenaId || null,
  }, rng);
  if (roomMode === "test") {
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
        roomMode === "test" ? state.playersReady : { ...state.playersReady, [hostSeat]: false },
    };
  }

  const now = Date.now();
  const room: GameRoom = {
    id,
    matchId: null,
    matchType,
    seed,
    rng: roomMode === "test" ? new DebugDiceRNG(rng) : rng,
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
    seatIdentities: { P1: null, P2: null },
    participantsLocked: false,
    spectators: new Set<string>(),
    figureSets: {},
  };
  Object.defineProperty(room, "matchType", { value: matchType, writable: false, configurable: false, enumerable: true });
  if (roomMode === "test") {
    room.testDiceRng = room.rng as DebugDiceRNG;
  }

  if (options.publish !== false) publishGameRoom(room);
  return room;
}

export function publishGameRoom(room: GameRoom): void {
  if (games.has(room.id)) throw new Error("Room already exists");
  games.set(room.id, room);
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

export function getOrCreateGameRoom(id: string, options: CreateGameOptions = {}): GameRoom {
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
    onRemoved?: (room: GameRoom) => void;
  } = {},
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
      options.onRemoved?.(room);
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
    options.onRemoved?.(room);
  }

  return removed;
}

export function listRoomSummaries(): RoomSummary[] {
  return listGameRooms().map((room) => {
    const players = {
      P1: !!room.seats.P1 || !!room.reservedUserIds?.P1,
      P2: !!room.seats.P2 || !!room.reservedUserIds?.P2,
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
      matchType: room.matchType,
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

type AuthenticatedGameAction =
  | Exclude<GameAction, { type: "resolvePendingRoll" }>
  | (Omit<Extract<GameAction, { type: "resolvePendingRoll" }>, "player"> & { player?: PlayerId });

export function applyGameAction(
  room: GameRoom,
  action: GameAction,
  playerId?: PlayerId,
): CommandResult;
// At the server boundary, the authenticated player supplies an omitted roll player.
export function applyGameAction(
  room: GameRoom,
  action: AuthenticatedGameAction,
  playerId: PlayerId,
): CommandResult;
export function applyGameAction(
  room: GameRoom,
  action: AuthenticatedGameAction,
  playerId?: PlayerId,
): CommandResult {
  const previousState = room.state;
  const replaySetup = room.roomMode === "normal" && previousState.phase === "lobby"
    ? captureReplaySetup(room.state, room.gameMode, room.draftState) : undefined;
  const authoritativeAction: GameAction =
    action.type === "resolvePendingRoll" && playerId
      ? { ...action, player: playerId }
      : (action as GameAction);
  const diceQueueBefore = room.testDiceRng?.getQueue() ?? [];
  const result = applyAction(previousState, authoritativeAction, room.rng);
  const diceQueueAfter = room.testDiceRng?.getQueue() ?? [];
  const debugDiceConsumed =
    diceQueueBefore.length > diceQueueAfter.length
      ? diceQueueBefore.slice(0, diceQueueBefore.length - diceQueueAfter.length)
      : [];
  const stateChanged = result.state !== previousState;

  if (!stateChanged && result.events.length === 0) {
    // TODO: Temporary heuristic until rules return explicit accepted/rejected
    // outcomes. Keep rejecting by default, but whitelist valid idempotent no-ops.
    if (isExplicitlyAcceptedNoop(authoritativeAction, previousState)) {
      return accepted({
        stateChanged: false,
        events: [],
      });
    }
    if (result.rejectionReason) {
      return rejected(result.rejectionReason, result.rejectionReason);
    }
    return rejected("RULES_REJECTED", "Action rejected by rules");
  }

  const nextRevision = room.revision + 1;
  room.state = withAcceptedRevision(previousState, result.state, nextRevision);
  touchGameRoom(room);
  room.revision = nextRevision;
  room.actionLog.push({
    at: Date.now(),
    playerId,
    action: authoritativeAction,
    events: result.events,
    revision: room.revision,
    debugDiceConsumed: debugDiceConsumed.length > 0 ? debugDiceConsumed : undefined,
    replaySetup,
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
