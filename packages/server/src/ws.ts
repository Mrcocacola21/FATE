import type { MatchmakingService } from "./services/matchmakingService";
import type { MatchmakingEvent } from "./matchmaking/types";
import { MatchTypeError, type MatchType } from "./matches/matchType";
// packages/server/src/ws.ts

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type {
  Coord,
  GameAction,
  GameEvent,
  GameModeId,
  GameState,
  HeroSelection,
  MoveMode,
  PlayerId,
  PlayerView,
  PendingRollContext,
  RollKind,
  DraftState,
  HeroDraftMeta,
} from "rules";
import {
  DRAFT_HERO_POOL,
  isGameModeId,
  makePlayerView,
  makeSpectatorView,
  makeTestRoomView,
  projectEventsForRecipient,
  projectPendingRollPresentation,
} from "rules";
import { ClientMessageSchema } from "./schemas";
import { isAllowedOrigin } from "./origin";
import { isActionAllowedByPlayer } from "./permissions";
import { deleteGameRoom, getGameRoom, touchGameRoom, type GameRoom } from "./store";
import type { MatchLifecycle } from "./persistence/matchLifecycle";
import {
  assertSeatIdentity, hasDistinctPlayerIdentities, identityDisplayName,
  MultiplayerIdentityError, type ConnectionIdentity, type ConnectionIdentityService,
} from "./auth/connectionIdentity";
import { logFate } from "./fateLogger";
import { rejected, type CommandResult } from "./commandResult";
import { enqueueRoomCommand, fateRoomKey } from "./roomQueue";
import type { z } from "zod";
import { applyTestRoomCommand, canCreateTestRoom, getTestRoomCapabilities } from "./testRoom";
import { applyDraftBan, applyDraftPick, startDraftSession } from "./modes/draftSession";
import {
  isGameModeLocked,
  rebuildDraftedArmies,
  rebuildLobbyArmiesForMode,
  setRoomGameMode,
} from "./modes/roomModes";

let serverLogger: FastifyInstance["log"] | null = null;
import { createPongRoom, getPongRoom } from "./pong/rooms";
import { logPong } from "./pong/logger";

export type PlayerRole = PlayerId | "spectator";

type RoomMeta = {
  gameModeLocked?: boolean;
  matchType: MatchType;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
  draftState: DraftState | null;
  draftPool: HeroDraftMeta[];
  revision: number;
  diceQueue: number[];
  debugLog: Array<{
    revision: number;
    type: string;
    at: number;
    diceConsumed?: number[];
  }>;
  ready: { P1: boolean; P2: boolean };
  players: { P1: boolean; P2: boolean };
  playerNames: { P1: string | null; P2: string | null };
  spectators: number;
  phase: GameState["phase"];
  pendingRoll: {
    id: string;
    kind: RollKind;
    player: PlayerId;
    presentation?: PendingRollContext;
  } | null;
  initiative: {
    P1: number | null;
    P2: number | null;
    winner: PlayerId | null;
  };
  placementFirstPlayer: PlayerId | null;
};

export type RoomStateMessage = {
  type: "roomState";
  roomId: string;
  you: {
    role: PlayerRole;
    seat?: PlayerId;
    isHost: boolean;
    canControlTestRoom: boolean;
  };
  view: PlayerView;
  meta: RoomMeta;
};

type JoinAckMessage = {
  type: "joinAck";
  matchType?: MatchType;
  roomMode?: "normal" | "test";
  roomId: string;
  role: PlayerRole;
  seat?: PlayerId;
  isHost: boolean;
  resumeToken?: string;
};

type JoinRejectedMessage = {
  type: "joinRejected";
  reason: "room_not_found" | "role_taken" | "room_exists" | "test_room_disabled";
  message: string;
};

type ActionResultMessage = {
  type: "actionResult";
  ok: boolean;
  events: GameEvent[];
  error?: string;
  logIndex?: number;
};

type MoveOptionsMessage = {
  type: "moveOptions";
  unitId: string;
  roll: number | null;
  legalTo: Coord[];
  mode?: MoveMode;
  modes?: MoveMode[];
};

type ErrorMessage = {
  type: "error";
  message: string;
  code?: string;
};

type LeftRoomMessage = {
  type: "leftRoom";
  roomId: string | null;
};

type TestRoomSnapshotMessage = {
  type: "testRoomSnapshot";
  snapshot: unknown;
};

export type ServerMessage =
  | MatchmakingEvent
  | { type: "matchmakingSubscribed"; requestId: string }
  | RoomStateMessage
  | JoinAckMessage
  | JoinRejectedMessage
  | ActionResultMessage
  | MoveOptionsMessage
  | ErrorMessage
  | LeftRoomMessage
  | TestRoomSnapshotMessage;

interface ConnectionMeta {
  channel: "fate" | "pong";
  roomId: string;
  role: PlayerRole;
  seat: PlayerId | null;
  connId: string;
  resumeToken: string;
  name?: string;
  authIdentity?: ConnectionIdentity | null;
}

const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new Map<WebSocket, ConnectionMeta>();
const socketRateState = new Map<WebSocket, { windowStartMs: number; messageCount: number }>();

interface SeatGraceRecord {
  roomId: string;
  seat: PlayerId;
  connId: string;
  resumeToken: string;
  timer: NodeJS.Timeout;
  expiresAt: number;
}

const graceByToken = new Map<string, SeatGraceRecord>();
const graceBySeat = new Map<string, SeatGraceRecord>();

const MAX_WS_PAYLOAD_BYTES = Number(process.env.WS_MAX_PAYLOAD_BYTES ?? 64 * 1024);
const WS_RATE_LIMIT_WINDOW_MS = Number(process.env.WS_RATE_LIMIT_WINDOW_MS ?? 1000);
const WS_RATE_LIMIT_MAX_MESSAGES = Number(process.env.WS_RATE_LIMIT_MAX_MESSAGES ?? 60);
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 45_000);
type ClientMessage = z.infer<typeof ClientMessageSchema>;

type SwitchRoleTransition =
  | {
      ok: true;
      nextRoom: GameRoom;
      nextMeta: ConnectionMeta;
      previousResumeToken: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

function sendMessage(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function sendStructuredError(socket: WebSocket, code: string, message: string) {
  sendMessage(socket, {
    type: "error",
    code,
    message,
  });
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString();
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data).toString();
}

function computePayloadBytes(data: RawData): number {
  if (typeof data === "string") return Buffer.byteLength(data);
  if (Buffer.isBuffer(data)) return data.byteLength;
  if (Array.isArray(data)) {
    return data.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  }
  return Buffer.from(data).byteLength;
}

function consumeSocketRateBudget(socket: WebSocket): boolean {
  const now = Date.now();
  const current = socketRateState.get(socket);
  if (!current || now - current.windowStartMs >= WS_RATE_LIMIT_WINDOW_MS) {
    socketRateState.set(socket, { windowStartMs: now, messageCount: 1 });
    return true;
  }

  if (current.messageCount >= WS_RATE_LIMIT_MAX_MESSAGES) {
    return false;
  }

  current.messageCount += 1;
  socketRateState.set(socket, current);
  return true;
}

function queueKey(channel: "fate" | "pong", roomId: string): string {
  return `${channel}:${roomId}`;
}

function seatGraceKey(roomId: string, seat: PlayerId): string {
  return `${roomId}:${seat}`;
}

function viewForRole(state: GameState, role: PlayerRole): PlayerView {
  if (role === "spectator") {
    return makeSpectatorView(state);
  }
  return makePlayerView(state, role);
}

function addSocketToRoom(roomId: string, socket: WebSocket) {
  let sockets = roomSockets.get(roomId);
  if (!sockets) {
    sockets = new Set<WebSocket>();
    roomSockets.set(roomId, sockets);
  }
  sockets.add(socket);
}

function removeSocketFromRoom(roomId: string, socket: WebSocket) {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) {
    roomSockets.delete(roomId);
  }
}

function canAssignSeat(
  room: GameRoom,
  seat: PlayerId,
  connId: string,
  resumeToken: string,
): boolean {
  const currentConnId = room.seats[seat];
  if (!currentConnId) return true;
  if (currentConnId === connId) return true;
  return room.seatTokens[seat] === resumeToken;
}

function assignSeat(room: GameRoom, seat: PlayerId, connId: string, resumeToken: string): boolean {
  if (!canAssignSeat(room, seat, connId, resumeToken)) return false;
  const wasSameOccupant = room.seatTokens[seat] === resumeToken && room.seats[seat] !== null;

  room.seats[seat] = connId;
  room.seatTokens[seat] = resumeToken;
  room.state = {
    ...room.state,
    seats: { ...room.state.seats, [seat]: true },
    playersReady: {
      ...room.state.playersReady,
      [seat]: wasSameOccupant ? room.state.playersReady[seat] : false,
    },
  };
  if (room.hostSeat === seat) {
    room.hostConnId = connId;
  }
  return true;
}

function applyFigureSetToRoom(room: GameRoom, seat: PlayerId, figureSet?: HeroSelection) {
  if (!figureSet) return;
  room.figureSets[seat] = figureSet;
  if (room.state.phase !== "lobby" || room.draftState) return;
  if (room.gameMode !== "standard") return;
  rebuildLobbyArmiesForMode(room);
}

function vacateSeat(room: GameRoom, seat: PlayerId, connId: string) {
  if (room.seats[seat] !== connId) return;
  room.seats[seat] = null;
  if (!room.participantsLocked && !room.reservedUserIds) {
    room.seatTokens[seat] = null;
    room.seatIdentities[seat] = null;
  }
  room.state = {
    ...room.state,
    seats: { ...room.state.seats, [seat]: false },
    playersReady: { ...room.state.playersReady, [seat]: false },
  };
}

function cloneRoomForSeatMutation(room: GameRoom): GameRoom {
  return {
    ...room,
    state: {
      ...room.state,
      seats: { ...room.state.seats },
      playersReady: { ...room.state.playersReady },
    },
    seats: { ...room.seats },
    seatTokens: { ...room.seatTokens },
    seatIdentities: { ...room.seatIdentities },
    spectators: new Set(room.spectators),
  };
}

function applySeatMutationSnapshot(room: GameRoom, nextRoom: GameRoom) {
  room.state = nextRoom.state;
  room.seats = nextRoom.seats;
  room.seatTokens = nextRoom.seatTokens;
  room.seatIdentities = nextRoom.seatIdentities;
  room.spectators = nextRoom.spectators;
  room.hostConnId = nextRoom.hostConnId;
  room.hostSeat = nextRoom.hostSeat;
}

function buildSwitchRoleTransition(
  room: GameRoom,
  current: ConnectionMeta,
  requestedRole: PlayerRole,
): SwitchRoleTransition {
  if (current.role === requestedRole) {
    return {
      ok: false,
      code: "ALREADY_IN_ROLE",
      message: "Already in requested role",
    };
  }

  const targetSeat =
    requestedRole === "P1" || requestedRole === "P2" ? (requestedRole as PlayerId) : null;

  if (room.roomMode === "normal") {
    if (room.participantsLocked || room.draftState)
      return { ok: false, code: "MATCH_IDENTITY_LOCKED", message: "Player roles are locked after start" };
    try {
      if (targetSeat) assertSeatIdentity(room, targetSeat, current.authIdentity, current.resumeToken);
    } catch (error) {
      if (error instanceof MultiplayerIdentityError)
        return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  if (targetSeat && !canAssignSeat(room, targetSeat, current.connId, current.resumeToken)) {
    return {
      ok: false,
      code: "role_taken",
      message: "Requested role is already taken",
    };
  }

  const nextRoom = cloneRoomForSeatMutation(room);
  const previousSeat = current.seat;
  const previousResumeToken = current.resumeToken;
  const nextResumeToken = randomUUID();

  if (previousSeat && previousSeat !== targetSeat) {
    vacateSeat(nextRoom, previousSeat, current.connId);
  }

  if (targetSeat) {
    const keepReadyForSeat =
      room.seats[targetSeat] === current.connId &&
      room.seatTokens[targetSeat] === previousResumeToken;
    nextRoom.seats[targetSeat] = current.connId;
    nextRoom.seatTokens[targetSeat] = nextResumeToken;
    nextRoom.seatIdentities[targetSeat] = current.authIdentity ?? null;
    nextRoom.state = {
      ...nextRoom.state,
      seats: { ...nextRoom.state.seats, [targetSeat]: true },
      playersReady: {
        ...nextRoom.state.playersReady,
        [targetSeat]: keepReadyForSeat ? room.state.playersReady[targetSeat] : false,
      },
    };
    if (nextRoom.hostSeat === targetSeat) {
      nextRoom.hostConnId = current.connId;
    }
    nextRoom.spectators.delete(current.connId);
  } else {
    nextRoom.spectators.add(current.connId);
  }

  updateHost(nextRoom);

  return {
    ok: true,
    nextRoom,
    nextMeta: {
      ...current,
      role: targetSeat ?? "spectator",
      seat: targetSeat,
      resumeToken: nextResumeToken,
    },
    previousResumeToken,
  };
}

function updateHost(room: GameRoom) {
  if (room.reservedUserIds) {
    room.hostConnId = room.seats[room.hostSeat];
    return;
  }
  const hostConnId = room.hostConnId;
  if (!hostConnId) return;
  const stillConnected =
    room.seats.P1 === hostConnId || room.seats.P2 === hostConnId || room.spectators.has(hostConnId);
  if (stillConnected) return;

  if (room.seats.P1) {
    room.hostConnId = room.seats.P1;
    room.hostSeat = "P1";
  } else if (room.seats.P2) {
    room.hostConnId = room.seats.P2;
    room.hostSeat = "P2";
  } else {
    const nextSpectator = room.spectators.values().next().value as string | undefined;
    room.hostConnId = nextSpectator ?? null;
  }

  room.state = {
    ...room.state,
    hostPlayerId: room.hostSeat,
  };
  if (room.roomMode === "test") {
    room.testControllerConnId = room.hostConnId;
  }
}

function clearSeatGraceByToken(resumeToken: string) {
  const record = graceByToken.get(resumeToken);
  if (!record) return;
  clearTimeout(record.timer);
  graceByToken.delete(resumeToken);
  graceBySeat.delete(seatGraceKey(record.roomId, record.seat));
}

function clearSeatGrace(roomId: string, seat: PlayerId) {
  const key = seatGraceKey(roomId, seat);
  const record = graceBySeat.get(key);
  if (!record) return;
  clearTimeout(record.timer);
  graceBySeat.delete(key);
  graceByToken.delete(record.resumeToken);
}

function scheduleSeatGrace(room: GameRoom, meta: ConnectionMeta, lifecycle?: MatchLifecycle) {
  if (!meta.seat || meta.channel !== "fate") return;
  const roomId = room.id;
  const seat = meta.seat;
  const connId = meta.connId;
  const resumeToken = meta.resumeToken;
  clearSeatGraceByToken(resumeToken);

  const expiresAt = Date.now() + RECONNECT_GRACE_MS;
  const timer = setTimeout(() => {
    graceByToken.delete(resumeToken);
    graceBySeat.delete(seatGraceKey(roomId, seat));
    void enqueueRoomCommand(fateRoomKey(roomId), async () => {
      const current = getGameRoom(roomId);
      if (!current) return;

      const stillReserved =
        current.seats[seat] === connId && current.seatTokens[seat] === resumeToken;
      if (!stillReserved) return;

      vacateSeat(current, seat, connId);
      await lifecycle?.syncVacantSeats(current);
      updateHost(current);
      broadcastRoomState(current);
      logFate(serverLogger!, {
        tag: "fate:seat:grace_expired",
        roomId,
        seat,
      });
    }).catch((err) => {
      logFate(serverLogger!, {
        tag: "fate:error",
        roomId,
        code: "grace_expiry_failed",
        message: String(err),
      });
    });
  }, RECONNECT_GRACE_MS);
  timer.unref?.();

  const record: SeatGraceRecord = {
    roomId,
    seat,
    connId,
    resumeToken,
    expiresAt,
    timer,
  };

  graceByToken.set(resumeToken, record);
  graceBySeat.set(seatGraceKey(roomId, seat), record);
}

function clearAllSeatGraceTimers() {
  for (const record of graceByToken.values()) {
    clearTimeout(record.timer);
  }
  graceByToken.clear();
  graceBySeat.clear();
}

function resetWsStateForTests() {
  clearAllSeatGraceTimers();
  roomSockets.clear();
  socketMeta.clear();
  socketRateState.clear();
}

export const wsTestHooks = {
  getRoomConnectionIdentities: (roomId: string) => Array.from(socketMeta.values())
    .filter((meta) => meta.roomId === roomId).map((meta) => meta.authIdentity ?? null),
  canAssignSeat,
  assignSeat,
  clearSeatGraceByToken,
  clearSeatGrace,
  scheduleSeatGrace,
  buildSwitchRoleTransition,
  applySeatMutationSnapshot,
  consumeSocketRateBudget,
  resetWsStateForTests,
  hasSeatGraceToken: (resumeToken: string) => graceByToken.has(resumeToken),
  getActiveFateRoomIds: () => getActiveFateRoomIds(),
};

export function getActiveFateRoomIds(): Set<string> {
  const active = new Set<string>();
  for (const [roomId, sockets] of roomSockets) {
    if (sockets.size > 0) active.add(roomId);
  }
  return active;
}

function buildRoomMeta(
  room: GameRoom,
  canControlTestRoom = false,
  viewerRole: PlayerRole = "spectator",
): RoomMeta {
  const ready = room.state.playersReady ?? { P1: false, P2: false };
  const initiative = room.state.initiative ?? {
    P1: null,
    P2: null,
    winner: null,
  };
  return {
    roomMode: room.roomMode,
    matchType: room.matchType,
    gameMode: room.gameMode,
    gameModeLocked: isGameModeLocked(room),
    draftState: room.draftState,
    draftPool: room.gameMode === "draft" ? DRAFT_HERO_POOL : [],
    revision: room.revision,
    diceQueue: canControlTestRoom && room.testDiceRng ? room.testDiceRng.getQueue() : [],
    debugLog: canControlTestRoom
      ? room.actionLog.slice(-25).map((entry) => ({
          revision: entry.revision,
          type: entry.action.type,
          at: entry.at,
          diceConsumed: entry.debugDiceConsumed,
        }))
      : [],
    ready: {
      P1: ready.P1 ?? false,
      P2: ready.P2 ?? false,
    },
    players: { P1: !!room.seats.P1, P2: !!room.seats.P2 },
    playerNames: {
      P1:
        (room.seatIdentities.P1 ? identityDisplayName(room.seatIdentities.P1) : null) ??
        Array.from(socketMeta.values()).find((meta) => meta.connId === room.seats.P1)?.name ?? null,
      P2:
        (room.seatIdentities.P2 ? identityDisplayName(room.seatIdentities.P2) : null) ??
        Array.from(socketMeta.values()).find((meta) => meta.connId === room.seats.P2)?.name ?? null,
    },
    spectators: room.spectators.size,
    phase: room.state.phase ?? "lobby",
    pendingRoll: room.state.pendingRoll
      ? {
          id: room.state.pendingRoll.id,
          kind: room.state.pendingRoll.kind,
          player: room.state.pendingRoll.player,
          presentation: (() => {
            const projected = projectPendingRollPresentation(
              room.state,
              room.state.pendingRoll?.presentation,
              viewerRole === "P1" || viewerRole === "P2" ? viewerRole : null,
            );
            if (!projected) return undefined;
            const requestedConnectionId = room.seats[room.state.pendingRoll!.player];
            const requestedPlayerLabel =
              (room.seatIdentities[room.state.pendingRoll!.player]
                ? identityDisplayName(room.seatIdentities[room.state.pendingRoll!.player]!) : null) ??
              Array.from(socketMeta.values()).find(
                (entry) => entry.connId === requestedConnectionId,
              )?.name ?? room.state.pendingRoll!.player;
            return { ...projected, requestedPlayerLabel };
          })(),
        }
      : null,
    initiative: {
      P1: initiative.P1 ?? null,
      P2: initiative.P2 ?? null,
      winner: initiative.winner ?? null,
    },
    placementFirstPlayer: room.state.placementFirstPlayer ?? null,
  };
}

function sendRoomState(socket: WebSocket, room: GameRoom) {
  const meta = socketMeta.get(socket);
  if (!meta) return;
  const canControlTestRoom = room.roomMode === "test" && room.testControllerConnId === meta.connId;
  const view = canControlTestRoom
    ? makeTestRoomView(room.state)
    : viewForRole(room.state, meta.role);
  const you = {
    role: meta.role,
    seat: meta.seat ?? undefined,
    isHost: room.hostConnId === meta.connId,
    canControlTestRoom,
  };
  sendMessage(socket, {
    type: "roomState",
    roomId: room.id,
    you,
    view,
    meta: buildRoomMeta(room, canControlTestRoom, meta.role),
  });
}

export function broadcastRoomState(room: GameRoom) {
  const sockets = roomSockets.get(room.id);
  if (!sockets || sockets.size === 0) return;
  for (const socket of sockets) {
    sendRoomState(socket, room);
  }
}

export function broadcastActionResult(payload: {
  gameId: string;
  ok: boolean;
  events: GameEvent[];
  logIndex?: number;
  error?: string;
}) {
  const sockets = roomSockets.get(payload.gameId);
  if (!sockets || sockets.size === 0) return;
  const room = getGameRoom(payload.gameId);
  for (const socket of sockets) {
    const meta = socketMeta.get(socket);
    const recipient = meta?.role === "P1" || meta?.role === "P2" ? meta.role : "spectator";
    const filteredEvents = room
      ? projectEventsForRecipient(room.state, payload.events, recipient)
      : [];
    sendMessage(socket, {
      type: "actionResult",
      ok: payload.ok,
      events: filteredEvents,
      error: payload.error,
      logIndex: payload.logIndex,
    });
  }
}

function sendMoveOptionsIfAny(socket: WebSocket, events: GameEvent[]) {
  const moveEvent = events.find((item) => item.type === "moveOptionsGenerated");
  if (!moveEvent || moveEvent.type !== "moveOptionsGenerated") return;
  sendMessage(socket, {
    type: "moveOptions",
    unitId: moveEvent.unitId,
    roll: moveEvent.roll ?? null,
    legalTo: moveEvent.legalTo,
    mode: moveEvent.mode,
    modes: moveEvent.modes,
  });
}

function sendActionRejected(socket: WebSocket, result: CommandResult) {
  const message = result.ok ? undefined : (result.message ?? "Action rejected");
  sendMessage(socket, {
    type: "actionResult",
    ok: false,
    events: [],
    error: message,
  });
}

async function applyRoomAction(
  lifecycle: MatchLifecycle,
  socket: WebSocket,
  room: GameRoom,
  meta: ConnectionMeta,
  action: GameAction,
): Promise<CommandResult> {
  const isTestController = room.roomMode === "test" && room.testControllerConnId === meta.connId;
  if (meta.role === "spectator" || !meta.seat) {
    const result = rejected("NOT_SEATED", "Spectators cannot act");
    sendActionRejected(socket, result);
    return result;
  }
  if (room.seats[meta.seat] !== meta.connId || (room.roomMode === "normal" &&
    room.seatIdentities[meta.seat]?.userId !== meta.authIdentity?.userId)) {
    const result = rejected("FORBIDDEN", "Connection does not own this player seat");
    sendActionRejected(socket, result);
    return result;
  }

  if (room.state.phase === "ended") {
    const result = rejected("GAME_ENDED", "Game is already over.");
    sendActionRejected(socket, result);
    return result;
  }

  if (room.state.pendingRoll && action.type !== "resolvePendingRoll") {
    const result = rejected("PENDING_ROLL_REQUIRED", "Pending roll must be resolved");
    sendActionRejected(socket, result);
    return result;
  }

  if (!isTestController && !isActionAllowedByPlayer(room.state, action, meta.seat)) {
    const result = rejected("FORBIDDEN", "Action not allowed for this player");
    sendActionRejected(socket, result);
    return result;
  }

  const actingPlayer = isTestController
    ? getTestActionPlayer(room.state, action, meta.seat)
    : meta.seat;
  const command = await applyAndBroadcast(lifecycle, room, action, actingPlayer, socket, true);
  if (!command.ok) return command;

  try {
    for (const ev of command.events) {
      const summary: Record<string, unknown> & { tag: string } = {
        tag: "fate:event",
        roomId: room.id,
        eventType: ev.type,
      };
      if (ev.attackerId) summary.playerId = ev.attackerId;
      if (ev.defenderId) summary.unitId = ev.defenderId;
      logFate(serverLogger!, summary);
    }
  } catch (e) {
    logFate(serverLogger!, {
      tag: "fate:error",
      roomId: room.id,
      code: "log_error",
      message: String(e),
      err: e,
    });
  }
  return command;
}

function getTestActionPlayer(state: GameState, action: GameAction, fallback: PlayerId): PlayerId {
  if (action.type === "resolvePendingRoll") {
    return state.pendingRoll?.player ?? fallback;
  }
  if (
    action.type === "placeUnit" ||
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return state.units[action.unitId]?.owner ?? fallback;
  }
  if (action.type === "attack") {
    return state.units[action.attackerId]?.owner ?? fallback;
  }
  return state.currentPlayer ?? fallback;
}

async function applyAndBroadcast(
  lifecycle: MatchLifecycle,
  room: GameRoom,
  action: GameAction,
  playerId: PlayerId,
  socketForErrors?: WebSocket,
  sendMoveOptions = false,
): Promise<CommandResult> {
  const command = await lifecycle.applyAction(room, action, playerId);
  if (!command.ok) {
    if (socketForErrors) {
      sendActionRejected(socketForErrors, command);
    }
    logFate(serverLogger!, {
      tag: "fate:commandRejected",
      roomId: room.id,
      actionType: action.type,
      code: command.code,
      message: command.message,
      seat: playerId,
    });
    return command;
  }

  broadcastRoomState(room);
  broadcastActionResult({
    gameId: room.id,
    ok: true,
    events: command.events,
    logIndex: command.logIndex,
  });
  if (sendMoveOptions && socketForErrors) {
    sendMoveOptionsIfAny(socketForErrors, command.events);
  }
  logFate(serverLogger!, {
    tag: "fate:commandAccepted",
    roomId: room.id,
    actionType: action.type,
    revision: command.revision,
    events: command.events.map((event) => event.type),
    seat: playerId,
  });
  return command;
}

async function detachFromFateRoom(
  lifecycle: MatchLifecycle,
  meta: ConnectionMeta,
  options: { useGrace: boolean; reason: "leave" | "disconnect" | "switch_room" },
) {
  const room = getGameRoom(meta.roomId);
  if (!room) {
    if (meta.seat) {
      clearSeatGraceByToken(meta.resumeToken);
    }
    return;
  }

  if (meta.seat) {
    if (options.useGrace) {
      scheduleSeatGrace(room, meta, lifecycle);
      logFate(serverLogger!, {
        tag: "fate:seat:grace_started",
        roomId: room.id,
        seat: meta.seat,
        ttlMs: RECONNECT_GRACE_MS,
      });
      return;
    }
    clearSeatGraceByToken(meta.resumeToken);
    vacateSeat(room, meta.seat, meta.connId);
  } else {
    room.spectators.delete(meta.connId);
  }

  updateHost(room);
  await lifecycle.syncVacantSeats(room);
  broadcastRoomState(room);
}

function detachFromPongRoom(meta: ConnectionMeta, reason: "leave" | "disconnect") {
  const pongRoom = getPongRoom(meta.roomId);
  if (!pongRoom) return;
  logPong(serverLogger!, {
    tag: "pong:leave",
    roomId: meta.roomId,
    role: meta.role,
    socketId: meta.connId,
    reason,
  });
  pongRoom.stop();
  logPong(serverLogger!, {
    tag: "pong:pause",
    roomId: meta.roomId,
    reason: "player_left",
  });
}

export function registerGameWebSocket(
  server: FastifyInstance, lifecycle: MatchLifecycle,
  identityService: Pick<ConnectionIdentityService, "verify">,
  matchmaking?: MatchmakingService,
) {
  serverLogger = server.log;
  server.get("/ws", { websocket: true }, (socket, request) => {
    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    if (!isAllowedOrigin(origin)) {
      socket.close(1008, "Origin not allowed");
      return;
    }

    const matchmakingConnectionId = randomUUID();
    let matchmakingUserId: string | undefined;

    async function detachExistingConnection(
      existing: ConnectionMeta,
      reason: "leave" | "switch_room" | "disconnect",
    ) {
      const key = queueKey(existing.channel, existing.roomId);
      await enqueueRoomCommand(key, async () => {
        const current = socketMeta.get(socket);
        if (!current || current.connId !== existing.connId) return;

        if (current.channel === "fate") {
          await detachFromFateRoom(lifecycle, current, {
            useGrace: reason === "disconnect" && !!current.seat,
            reason:
              reason === "switch_room"
                ? "switch_room"
                : reason === "disconnect"
                  ? "disconnect"
                  : "leave",
          });
          logFate(serverLogger!, {
            tag: "fate:leave",
            roomId: current.roomId,
            role: current.role,
            socketId: current.connId,
            reason,
          });
        } else {
          detachFromPongRoom(current, reason === "disconnect" ? "disconnect" : "leave");
        }

        removeSocketFromRoom(current.roomId, socket);
        socketMeta.delete(socket);
        socketRateState.delete(socket);
      });
    }

    async function handleParsedMessage(msg: ClientMessage) {
      switch (msg.type) {
        case "matchmakingSubscribe": {
          const identity = await identityService.verify(msg.accessToken);
          if (!identity || !matchmaking) throw new MultiplayerIdentityError("AUTH_REQUIRED", "Sign in to find a Rated match");
          if (socket.readyState !== WebSocket.OPEN) return;
          if (matchmakingUserId && matchmakingUserId !== identity.userId)
            matchmaking.disconnect(matchmakingUserId, matchmakingConnectionId);
          matchmakingUserId = identity.userId;
          matchmaking.connect(identity, matchmakingConnectionId, event => sendMessage(socket, event));
          sendMessage(socket, { type: "matchmakingSubscribed", requestId: msg.requestId });
          return;
        }
        case "matchmakingUnsubscribe": {
          if (matchmakingUserId) {
            matchmaking?.cancel(matchmakingUserId);
            matchmaking?.disconnect(matchmakingUserId, matchmakingConnectionId);
            matchmakingUserId = undefined;
          }
          return;
        }
        case "pongJoin": {
          const existing = socketMeta.get(socket);
          if (existing) {
            await detachExistingConnection(existing, "switch_room");
          }

          await enqueueRoomCommand(queueKey("pong", msg.roomId), () => {
            const connId = randomUUID();
            const roomId = msg.roomId;
            const room = createPongRoom(
              roomId,
              (id, payload) => {
                const sockets = roomSockets.get(id);
                if (!sockets) return;
                for (const s of sockets) {
                  if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify(payload));
                }
              },
              server.log,
            );
            addSocketToRoom(roomId, socket);
            socketMeta.set(socket, {
              channel: "pong",
              roomId,
              role: msg.role,
              seat: msg.role === "P1" || msg.role === "P2" ? msg.role : null,
              connId,
              resumeToken: randomUUID(),
              name: msg.name,
            });
            logPong(server.log, {
              tag: "pong:join",
              roomId,
              role: msg.role,
              socketId: connId,
              name: msg.name,
            });
            sendMessage(socket, {
              type: "joinAck",
              roomId,
              role: msg.role,
              seat: msg.role === "P1" || msg.role === "P2" ? msg.role : undefined,
              isHost: false,
            });
            try {
              room.start();
            } catch {
              // no-op
            }
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "pongState", state: room.snapshot() }));
            }
          });
          return;
        }
        case "pongInput": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "pong") {
            sendMessage(socket, { type: "error", message: "Join a room first" });
            return;
          }
          await enqueueRoomCommand(queueKey("pong", meta.roomId), () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "pong") {
              sendMessage(socket, { type: "error", message: "Join a room first" });
              return;
            }
            const room = getPongRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Pong room not found" });
              return;
            }
            if (current.seat !== "P1" && current.seat !== "P2") {
              sendMessage(socket, {
                type: "error",
                message: "Only players may send inputs",
              });
              return;
            }
            room.setInput(current.seat, msg.dir);
          });
          return;
        }
        case "pongStart": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "pong") {
            sendMessage(socket, { type: "error", message: "Join a room first" });
            return;
          }
          await enqueueRoomCommand(queueKey("pong", meta.roomId), () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "pong") {
              sendMessage(socket, { type: "error", message: "Join a room first" });
              return;
            }
            const room = getPongRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Pong room not found" });
              return;
            }
            room.start();
            const sockets = roomSockets.get(current.roomId);
            if (sockets) {
              for (const s of sockets) {
                if (s.readyState === WebSocket.OPEN) {
                  s.send(JSON.stringify({ type: "pongEvent", event: { kind: "start" } }));
                }
              }
            }
            logPong(server.log, {
              tag: "pong:start",
              roomId: current.roomId,
            });
          });
          return;
        }
        case "pongReset": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "pong") return;
          await enqueueRoomCommand(queueKey("pong", meta.roomId), () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "pong") return;
            const room = getPongRoom(current.roomId);
            if (!room) return;
            room.serve(null);
            logPong(server.log, { tag: "pong:reset", roomId: current.roomId });
          });
          return;
        }
        case "joinRoom": {
          if (msg.mode === "join" && msg.matchType !== undefined)
            throw new MultiplayerIdentityError("MATCH_TYPE_IMMUTABLE", "Match type is fixed at creation");
          if (msg.mode === "create" && msg.roomMode === "test" && msg.matchType === "RATED")
            throw new MultiplayerIdentityError("INVALID_MATCH_TYPE", "Test rooms are always Casual");
          const identity = await identityService.verify(msg.accessToken);
          if (msg.mode === "create" && msg.matchType === "RATED" && !identity)
            throw new MultiplayerIdentityError("RATED_MATCH_REQUIRES_AUTHENTICATION", "Rated matches require authenticated players");
          const targetRoom = getGameRoom(msg.roomId ?? "");
          const targetMode = msg.mode === "create" ? msg.roomMode ?? "normal"
            : getGameRoom(msg.roomId ?? "")?.roomMode;
          if (targetMode === "normal" && msg.role !== "spectator" && !identity)
            throw new MultiplayerIdentityError((targetRoom?.matchType ?? msg.matchType) === "RATED" ? "RATED_MATCH_REQUIRES_AUTHENTICATION" : "AUTH_REQUIRED", "Sign in to occupy a player seat");
          if (targetRoom && (msg.role === "P1" || msg.role === "P2"))
            assertSeatIdentity(targetRoom, msg.role, identity, msg.resumeToken ?? "");
          const targetRoomId = msg.mode === "create" ? (msg.roomId ?? randomUUID()) : msg.roomId;
          if (!targetRoomId) {
            sendMessage(socket, {
              type: "joinRejected",
              reason: "test_room_disabled",
              message: "Room not found",
            });
            return;
          }
          const requestedRoomMode = msg.roomMode ?? "normal";
          if (
            msg.mode === "create" &&
            requestedRoomMode === "test" &&
            !canCreateTestRoom(msg.debugToken)
          ) {
            sendMessage(socket, {
              type: "joinRejected",
              reason: "room_not_found",
              message: "Test rooms are disabled or require a valid debug token",
            });
            return;
          }

          const enter = async () => {
          const existing = socketMeta.get(socket);
          if (existing) {
            await detachExistingConnection(existing, "switch_room");
          }

          await enqueueRoomCommand(fateRoomKey(targetRoomId), async () => {
            if (socket.readyState !== WebSocket.OPEN) return;
            const connId = randomUUID();
            const matchedRoom = getGameRoom(targetRoomId);
            const matchedSeat = msg.role === "P1" || msg.role === "P2" ? msg.role : null;
            const resumeToken = matchedSeat && identity && matchedRoom?.reservedUserIds?.[matchedSeat] === identity.userId
              ? matchedRoom.seatTokens[matchedSeat] ?? randomUUID() : msg.resumeToken ?? randomUUID();

            const requestedSeat =
              msg.role === "P1" || msg.role === "P2" ? (msg.role as PlayerId) : null;
            let room: GameRoom | undefined;
            let seat: PlayerId | null = null;
            let resumed = false;

            if (msg.mode === "create") {
              if (getGameRoom(targetRoomId)) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "room_exists",
                  message: "Room already exists",
                });
                return;
              }
              const hostSeat: PlayerId = requestedSeat ?? "P1";
              const hostConnForState = requestedSeat ? connId : null;
              await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
              if (socket.readyState !== WebSocket.OPEN) return;
              try {
                room = await lifecycle.createRoom(
                  {
                    hostSeat,
                    hostConnId: hostConnForState,
                    roomMode: requestedRoomMode,
                    matchType: msg.matchType,
                  },
                  targetRoomId,
                  identity?.userId ?? null,
                );
              } catch (error) {
                if (error instanceof MatchTypeError) {
                  sendStructuredError(socket, error.code, error.message);
                  return;
                }
                sendStructuredError(
                  socket,
                  "MATCH_PERSISTENCE_UNAVAILABLE",
                  "Unable to create persistent room",
                );
                return;
              }
              if (socket.readyState !== WebSocket.OPEN) {
                await lifecycle.removeRoom(room);
                return;
              }
              room.hostConnId = connId;
              room.hostSeat = hostSeat;
              if (requestedRoomMode === "test") {
                room.testControllerConnId = connId;
              }
              room.state = {
                ...room.state,
                hostPlayerId: hostSeat,
                seats: requestedSeat ? room.state.seats : { P1: false, P2: false },
              };
            } else {
              room = getGameRoom(targetRoomId);
              if (!room) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "room_not_found",
                  message: "Room not found",
                });
                return;
              }
            }

            if (!room) {
              sendMessage(socket, {
                type: "joinRejected",
                reason: "room_not_found",
                message: "Room not found",
              });
              return;
            }

            if (
              msg.mode === "join" &&
              room.roomMode === "test" &&
              !room.testControllerConnId &&
              requestedSeat === room.hostSeat &&
              !canCreateTestRoom(msg.debugToken)
            ) {
              sendMessage(socket, {
                type: "joinRejected",
                reason: "test_room_disabled",
                message: "A valid debug token is required to claim this test room",
              });
              return;
            }

            if (requestedSeat) {
              seat = requestedSeat;
              assertSeatIdentity(room, seat, identity, resumeToken);
              resumed = room.seatTokens[seat] === resumeToken;
              if (!canAssignSeat(room, seat, connId, resumeToken)) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "role_taken",
                  message: "Requested role is already taken",
                });
                return;
              }
              // A successful resume replaces transport ownership, including a still-live old socket.
              for (const [oldSocket, oldMeta] of socketMeta) {
                if (oldMeta.channel === "fate" && oldMeta.roomId === room.id && oldMeta.seat === seat) {
                  socketMeta.delete(oldSocket);
                  removeSocketFromRoom(room.id, oldSocket);
                  sendStructuredError(oldSocket, "SEAT_CONNECTION_REPLACED", "Seat resumed on another connection");
                }
              }
              clearSeatGrace(room.id, seat);
              const assigned = assignSeat(room, seat, connId, resumeToken);
              if (!room.participantsLocked) room.seatIdentities[seat] = identity;
              if (!assigned) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "role_taken",
                  message: "Requested role is already taken",
                });
                return;
              }
              if (
                room.roomMode === "test" &&
                room.hostSeat === seat &&
                room.hostConnId === connId
              ) {
                room.testControllerConnId = connId;
              }
              if (!resumed) applyFigureSetToRoom(room, seat, msg.figureSet as HeroSelection | undefined);
            } else {
              room.spectators.add(connId);
            }

            if (!room.hostConnId && !room.reservedUserIds) {
              room.hostConnId = connId;
              if (requestedSeat) {
                room.hostSeat = requestedSeat;
                room.state = { ...room.state, hostPlayerId: requestedSeat };
              }
            }

            touchGameRoom(room);

            socketMeta.set(socket, {
              channel: "fate",
              roomId: room.id,
              role: msg.role,
              seat,
              connId,
              resumeToken,
              authIdentity: identity,
              name: identity ? identityDisplayName((seat ? room.seatIdentities[seat] : null) ?? identity) : msg.name,
            });
            addSocketToRoom(room.id, socket);
            if (seat) await lifecycle.syncParticipant(room, seat, msg.name, resumed);

            logFate(serverLogger!, {
              tag: "fate:join",
              roomId: room.id,
              role: msg.role,
              socketId: connId,
              seat,
            });

            sendMessage(socket, {
              type: "joinAck",
              roomId: room.id,
              role: msg.role,
              seat: seat ?? undefined,
              roomMode: room.roomMode,
              matchType: room.matchType,
              isHost: room.hostConnId === connId,
              resumeToken,
            });

            broadcastRoomState(room);
          });
          };
          if (matchmaking && identity && msg.role !== "spectator" && targetMode !== "test")
            await matchmaking.withCompetitor(identity.userId, targetRoomId, enter);
          else await enter();
          return;
        }
        case "switchRole": {
          const suppliedIdentity = msg.accessToken === undefined ? undefined
            : await identityService.verify(msg.accessToken);
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          const change = () => enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendMessage(socket, {
                type: "error",
                message: "Must join a room first",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }

            if (suppliedIdentity !== undefined) {
              if (current.authIdentity && current.authIdentity.userId !== suppliedIdentity?.userId)
                throw new MultiplayerIdentityError("RESUME_IDENTITY_MISMATCH", "Connection identity cannot change");
              current.authIdentity = suppliedIdentity;
              current.name = suppliedIdentity ? identityDisplayName(suppliedIdentity) : current.name;
            }

            const transition = buildSwitchRoleTransition(room, current, msg.role);
            if (!transition.ok) {
              sendMessage(socket, {
                type: "error",
                message: transition.message,
                code: transition.code,
              });
              return;
            }

            clearSeatGraceByToken(transition.previousResumeToken);
            if (transition.nextMeta.seat) {
              clearSeatGrace(room.id, transition.nextMeta.seat);
            }
            applySeatMutationSnapshot(room, transition.nextRoom);
            socketMeta.set(socket, transition.nextMeta);
            await lifecycle.syncVacantSeats(room);
            if (transition.nextMeta.seat)
              await lifecycle.syncParticipant(
                room,
                transition.nextMeta.seat,
                transition.nextMeta.name,
              );

            sendMessage(socket, {
              type: "joinAck",
              roomId: room.id,
              role: transition.nextMeta.role,
              roomMode: room.roomMode,
              matchType: room.matchType,
              seat: transition.nextMeta.seat ?? undefined,
              isHost: room.hostConnId === transition.nextMeta.connId,
              resumeToken: transition.nextMeta.resumeToken,
            });
            broadcastRoomState(room);
          });
          const actor = suppliedIdentity ?? meta.authIdentity;
          if (matchmaking && actor && msg.role !== "spectator" && getGameRoom(meta.roomId)?.roomMode !== "test")
            await matchmaking.withCompetitor(actor.userId, meta.roomId, change);
          else await change();
          return;
        }
        case "leaveRoom": {
          const existing = socketMeta.get(socket);
          const roomId = existing?.roomId ?? null;
          if (!existing) {
            sendMessage(socket, { type: "leftRoom", roomId });
            return;
          }
          await detachExistingConnection(existing, "leave");
          sendMessage(socket, { type: "leftRoom", roomId });
          return;
        }
        case "setGameMode": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendMessage(socket, {
                type: "error",
                message: "Must join a room first",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }
            if (!isGameModeId(msg.mode)) {
              sendMessage(socket, {
                type: "error",
                message: "Invalid game mode",
                code: "invalid_game_mode",
              });
              return;
            }
            if (room.hostConnId !== current.connId) {
              sendMessage(socket, {
                type: "error",
                message: "Only the host can change game mode",
                code: "not_host",
              });
              return;
            }
            if (isGameModeLocked(room)) {
              sendMessage(socket, {
                type: "error",
                message: "Game mode is locked",
                code: "mode_locked",
              });
              return;
            }

            setRoomGameMode(room, msg.mode);
            lifecycle.recordModeAction(room, current.seat ?? room.hostSeat);
            await lifecycle.syncGameMode(room);
            broadcastRoomState(room);
          });
          return;
        }
        case "draftBanHero":
        case "draftPickHero": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate" || !meta.seat) {
            sendMessage(socket, {
              type: "error",
              message: "Only seated players can draft",
              code: "not_seated",
            });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate" || !current.seat) {
              sendMessage(socket, {
                type: "error",
                message: "Only seated players can draft",
                code: "not_seated",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }
            if (room.gameMode !== "draft" || !room.draftState) {
              sendMessage(socket, {
                type: "error",
                message: "Draft is not active",
                code: "draft_phase_mismatch",
              });
              return;
            }

            const result =
              msg.type === "draftBanHero"
                ? applyDraftBan(room, current.seat, msg.heroId)
                : applyDraftPick(room, current.seat, msg.heroId);
            if (!result.ok) {
              sendMessage(socket, {
                type: "error",
                message: "Draft command rejected",
                code: result.reason,
              });
              return;
            }

            // The accepted final pick owns the completed armies before its checkpoint is captured.
            if (msg.type === "draftPickHero" && room.draftState?.phase === "complete")
              rebuildDraftedArmies(room);
            lifecycle.recordDraftAction(room, { type: msg.type, player: current.seat, heroId: msg.heroId });
            if (msg.type === "draftPickHero" && room.draftState?.phase === "complete") {
              await applyAndBroadcast(lifecycle, room, { type: "startGame" }, current.seat, socket);
              return;
            }

            broadcastRoomState(room);
          });
          return;
        }
        case "testRoomCommand": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendStructuredError(socket, "NOT_SEATED", "Must join a room first");
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendStructuredError(socket, "NOT_SEATED", "Must join a room first");
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendStructuredError(socket, "ROOM_NOT_FOUND", "Room not found");
              return;
            }
            if (!getTestRoomCapabilities().enabled) {
              sendStructuredError(socket, "TEST_ROOMS_DISABLED", "Test rooms are disabled");
              return;
            }
            if (room.roomMode !== "test" || room.testControllerConnId !== current.connId) {
              sendStructuredError(
                socket,
                "FORBIDDEN",
                "Only the test-room controller can use sandbox commands",
              );
              return;
            }

            if (msg.command.type === "debugDeleteRoom") {
              const sockets = roomSockets.get(room.id);
              clearSeatGrace(room.id, "P1");
              clearSeatGrace(room.id, "P2");
              deleteGameRoom(room.id);
              roomSockets.delete(room.id);
              if (sockets) {
                for (const roomSocket of sockets) {
                  socketMeta.delete(roomSocket);
                  sendMessage(roomSocket, {
                    type: "leftRoom",
                    roomId: room.id,
                  });
                }
              }
              logFate(serverLogger!, {
                tag: "fate:testRoomDeleted",
                roomId: room.id,
              });
              return;
            }

            const result = applyTestRoomCommand(room, msg.command);
            if (!result.command.ok) {
              sendActionRejected(socket, result.command);
              logFate(serverLogger!, {
                tag: "fate:testCommandRejected",
                roomId: room.id,
                actionType: msg.command.type,
                code: result.command.code,
                message: result.command.message,
              });
              return;
            }

            if (result.snapshot) {
              sendMessage(socket, {
                type: "testRoomSnapshot",
                snapshot: result.snapshot,
              });
            }
            if (result.command.stateChanged) {
              broadcastRoomState(room);
              broadcastActionResult({
                gameId: room.id,
                ok: true,
                events: result.command.events,
                logIndex: result.command.logIndex,
              });
            }
            logFate(serverLogger!, {
              tag: "fate:testCommandAccepted",
              roomId: room.id,
              actionType: msg.command.type,
              revision: result.command.revision,
            });
          });
          return;
        }
        case "setReady": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate" || !meta.seat) {
            sendMessage(socket, {
              type: "error",
              message: "Only seated players can ready up",
              code: "not_seated",
            });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate" || !current.seat) {
              sendMessage(socket, {
                type: "error",
                message: "Only seated players can ready up",
                code: "not_seated",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }
            if (room.state.phase !== "lobby") {
              sendMessage(socket, {
                type: "error",
                message: "Ready-up is only available in the lobby",
                code: "not_lobby",
              });
              return;
            }
            if (room.draftState) {
              sendMessage(socket, {
                type: "error",
                message: "Ready-up is locked after draft starts",
                code: "mode_locked",
              });
              return;
            }

            const action: GameAction = {
              type: "setReady",
              player: current.seat,
              ready: msg.ready,
            };
            await applyAndBroadcast(lifecycle, room, action, current.seat, socket);
          });
          return;
        }
        case "startGame": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendMessage(socket, {
                type: "error",
                message: "Must join a room first",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }
            if (room.hostConnId !== current.connId) {
              sendMessage(socket, {
                type: "error",
                message: "Only the host can start the game",
                code: "not_host",
              });
              return;
            }
            if (room.state.phase !== "lobby") {
              sendMessage(socket, {
                type: "error",
                message: "Game can only be started from the lobby",
                code: "not_lobby",
              });
              return;
            }
            if (room.state.pendingRoll) {
              sendMessage(socket, {
                type: "error",
                message: "Initiative roll already in progress",
                code: "pending_roll",
              });
              return;
            }

            const playersReady = room.state.playersReady;
            if (!room.seats.P1 || !room.seats.P2 || !playersReady.P1 || !playersReady.P2) {
              sendMessage(socket, {
                type: "error",
                message: "Both players must be seated and ready",
                code: "not_ready",
              });
              return;
            }

            if (room.gameMode === "draft") {
              if (room.roomMode === "normal" && !hasDistinctPlayerIdentities(room)) {
                sendStructuredError(socket, room.matchType === "RATED" ? "RATED_MATCH_INVALID_PARTICIPANTS" : "AUTH_REQUIRED", "Two distinct authenticated players are required");
                return;
              }
              if (!room.draftState) {
                startDraftSession(room);
                lifecycle.recordDraftAction(room, { type: "draftStarted", player: current.seat ?? room.hostSeat });
                broadcastRoomState(room);
                return;
              }
              if (room.draftState.phase !== "complete") {
                sendMessage(socket, {
                  type: "error",
                  message: "Draft must complete before placement",
                  code: "draft_phase_mismatch",
                });
                return;
              }
              rebuildDraftedArmies(room);
            } else {
              rebuildLobbyArmiesForMode(room);
            }

            const action: GameAction = { type: "startGame" };
            await applyAndBroadcast(lifecycle, room, action, current.seat ?? room.hostSeat, socket);
          });
          return;
        }
        case "resolvePendingRoll": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate" || !meta.seat) {
            sendMessage(socket, {
              type: "error",
              message: "Only seated players can roll",
              code: "not_seated",
            });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate" || !current.seat) {
              sendMessage(socket, {
                type: "error",
                message: "Only seated players can roll",
                code: "not_seated",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }

            const pending = room.state.pendingRoll;
            if (!pending || pending.player !== current.seat) {
              sendMessage(socket, {
                type: "error",
                message: "Not your pending roll",
                code: "pending_roll",
              });
              return;
            }

            const action: GameAction = {
              type: "resolvePendingRoll",
              pendingRollId: msg.pendingRollId,
              choice: msg.choice,
              player: current.seat,
            };
            await applyAndBroadcast(lifecycle, room, action, current.seat, socket, true);
          });
          return;
        }
        case "requestMoveOptions": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendMessage(socket, {
                type: "error",
                message: "Must join a room first",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }
            const action: GameAction = {
              type: "requestMoveOptions",
              unitId: msg.unitId,
              mode: msg.mode,
            };
            await applyRoomAction(lifecycle, socket, room, current, action);
          });
          return;
        }
        case "action": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          if (
            msg.action.type === "lobbyInit" ||
            msg.action.type === "setReady" ||
            msg.action.type === "startGame"
          ) {
            sendMessage(socket, {
              type: "error",
              message: "Invalid action type for this channel",
            });
            return;
          }

          await enqueueRoomCommand(fateRoomKey(meta.roomId), async () => {
            const current = socketMeta.get(socket);
            if (!current || current.channel !== "fate") {
              sendMessage(socket, {
                type: "error",
                message: "Must join a room first",
              });
              return;
            }
            const room = getGameRoom(current.roomId);
            if (!room) {
              sendMessage(socket, { type: "error", message: "Room not found" });
              return;
            }

            const normalizedAction =
              msg.action.type === "resolvePendingRoll"
                ? {
                    ...msg.action,
                    player:
                      room.roomMode === "test" && room.testControllerConnId === current.connId
                        ? (room.state.pendingRoll?.player ?? current.seat ?? msg.action.player)
                        : (current.seat ?? msg.action.player),
                  }
                : msg.action;

            // applyRoomAction rejects unseated callers before forwarding to rules;
            // seated callers have an authoritative player in the normalized action.
            await applyRoomAction(lifecycle, socket, room, current, normalizedAction as GameAction);
          });
          return;
        }
        default:
          sendStructuredError(socket, "BAD_REQUEST", "Unknown message type");
      }
    }

    let messages = Promise.resolve();
    async function handleIncomingMessage(data: RawData) {
      if (computePayloadBytes(data) > MAX_WS_PAYLOAD_BYTES) {
        sendStructuredError(socket, "PAYLOAD_TOO_LARGE", "Payload too large");
        return;
      }
      if (!consumeSocketRateBudget(socket)) {
        sendStructuredError(socket, "RATE_LIMITED", "Too many messages");
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawDataToString(data));
      } catch {
        sendStructuredError(socket, "BAD_REQUEST", "Invalid JSON");
        return;
      }

      const parsed = ClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        sendStructuredError(socket, parsed.error.issues.some((issue) => issue.path[0] === "matchType") ? "INVALID_MATCH_TYPE" : "INVALID_PAYLOAD", "Invalid message payload");
        return;
      }

      try {
        const processing = messages.then(() => handleParsedMessage(parsed.data));
        messages = processing.catch(() => undefined);
        await processing;
      } catch (error) {
        if (error instanceof MultiplayerIdentityError) {
          sendStructuredError(socket, error.code, error.message);
          return;
        }
        server.log.error({ tag: "fate:ws_unhandled_error" });
        sendStructuredError(socket, "BAD_REQUEST", "Failed to process message");
      }
    }

    socket.on("message", (data) => {
      void handleIncomingMessage(data);
    });

    async function handleSocketTermination(kind: "close" | "error") {
      if (matchmakingUserId) matchmaking?.disconnect(matchmakingUserId, matchmakingConnectionId);
      const meta = socketMeta.get(socket);
      if (!meta) {
        socketRateState.delete(socket);
        return;
      }

      try {
        await detachExistingConnection(meta, "disconnect");
      } catch {
        server.log.error({
          tag: "fate:disconnect_error",
          roomId: meta.roomId,
          kind,
        });
      }
    }

    socket.on("close", () => {
      void handleSocketTermination("close");
    });

    socket.on("error", () => {
      void handleSocketTermination("error");
    });
  });
}
