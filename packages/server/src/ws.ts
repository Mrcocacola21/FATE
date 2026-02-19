// packages/server/src/ws.ts

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type {
  Coord,
  GameAction,
  GameEvent,
  GameState,
  HeroSelection,
  MoveMode,
  PlayerId,
  PlayerView,
  RollKind,
} from "rules";
import { attachArmy, createDefaultArmy, makePlayerView, makeSpectatorView } from "rules";
import { ClientMessageSchema } from "./schemas";
import { isActionAllowedByPlayer } from "./permissions";
import {
  applyGameAction,
  createGameRoomWithId,
  getGameRoom,
  type GameRoom,
} from "./store";
import { logFate } from "./fateLogger";
import { rejected, type CommandResult } from "./commandResult";
import { enqueueRoomCommand, fateRoomKey } from "./roomQueue";
import type { z } from "zod";

let serverLogger: any = null;
import { createPongRoom, getPongRoom } from "./pong/rooms";
import { logPong } from "./pong/logger";

export type PlayerRole = PlayerId | "spectator";

type RoomMeta = {
  ready: { P1: boolean; P2: boolean };
  players: { P1: boolean; P2: boolean };
  spectators: number;
  phase: GameState["phase"];
  pendingRoll: { id: string; kind: RollKind; player: PlayerId } | null;
  initiative: {
    P1: number | null;
    P2: number | null;
    winner: PlayerId | null;
  };
  placementFirstPlayer: PlayerId | null;
};

type RoomStateMessage = {
  type: "roomState";
  roomId: string;
  you: { role: PlayerRole; seat?: PlayerId; isHost: boolean };
  view: PlayerView;
  meta: RoomMeta;
};

type JoinAckMessage = {
  type: "joinAck";
  roomId: string;
  role: PlayerRole;
  seat?: PlayerId;
  isHost: boolean;
  resumeToken?: string;
};

type JoinRejectedMessage = {
  type: "joinRejected";
  reason: "room_not_found" | "role_taken" | "room_exists";
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

type ServerMessage =
  | RoomStateMessage
  | JoinAckMessage
  | JoinRejectedMessage
  | ActionResultMessage
  | MoveOptionsMessage
  | ErrorMessage
  | LeftRoomMessage;

interface ConnectionMeta {
  channel: "fate" | "pong";
  roomId: string;
  role: PlayerRole;
  seat: PlayerId | null;
  connId: string;
  resumeToken: string;
  name?: string;
}

const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new Map<WebSocket, ConnectionMeta>();
const socketRateState = new Map<
  WebSocket,
  { windowStartMs: number; messageCount: number }
>();

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

function sendMessage(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function sendStructuredError(
  socket: WebSocket,
  code: string,
  message: string
) {
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
  resumeToken: string
): boolean {
  const currentConnId = room.seats[seat];
  if (!currentConnId) return true;
  if (currentConnId === connId) return true;
  return room.seatTokens[seat] === resumeToken;
}

function assignSeat(
  room: GameRoom,
  seat: PlayerId,
  connId: string,
  resumeToken: string
): boolean {
  if (!canAssignSeat(room, seat, connId, resumeToken)) return false;
  const wasSameOccupant =
    room.seatTokens[seat] === resumeToken && room.seats[seat] !== null;

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

function applyFigureSetToRoom(
  room: GameRoom,
  seat: PlayerId,
  figureSet?: HeroSelection
) {
  if (!figureSet) return;
  room.figureSets[seat] = figureSet;
  if (room.state.phase !== "lobby") return;
  room.state = attachArmy(room.state, createDefaultArmy(seat, figureSet));
}

function vacateSeat(room: GameRoom, seat: PlayerId, connId: string) {
  if (room.seats[seat] !== connId) return;
  room.seats[seat] = null;
  room.seatTokens[seat] = null;
  room.state = {
    ...room.state,
    seats: { ...room.state.seats, [seat]: false },
    playersReady: { ...room.state.playersReady, [seat]: false },
  };
}

function updateHost(room: GameRoom) {
  const hostConnId = room.hostConnId;
  if (!hostConnId) return;
  const stillConnected =
    room.seats.P1 === hostConnId ||
    room.seats.P2 === hostConnId ||
    room.spectators.has(hostConnId);
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

function scheduleSeatGrace(room: GameRoom, meta: ConnectionMeta) {
  if (!meta.seat || meta.channel !== "fate") return;
  const seat = meta.seat;
  clearSeatGraceByToken(meta.resumeToken);

  const expiresAt = Date.now() + RECONNECT_GRACE_MS;
  const timer = setTimeout(() => {
    graceByToken.delete(meta.resumeToken);
    graceBySeat.delete(seatGraceKey(room.id, seat));
    void enqueueRoomCommand(fateRoomKey(room.id), () => {
      const current = getGameRoom(room.id);
      if (!current) return;

      const stillReserved =
        current.seats[seat] === meta.connId &&
        current.seatTokens[seat] === meta.resumeToken;
      if (!stillReserved) return;

      vacateSeat(current, seat, meta.connId);
      updateHost(current);
      broadcastRoomState(current);
      logFate(serverLogger!, {
        tag: "fate:seat:grace_expired",
        roomId: room.id,
        seat,
        resumeToken: meta.resumeToken,
      });
    }).catch((err) => {
      logFate(serverLogger!, {
        tag: "fate:error",
        roomId: room.id,
        code: "grace_expiry_failed",
        message: String(err),
      });
    });
  }, RECONNECT_GRACE_MS);
  timer.unref?.();

  const record: SeatGraceRecord = {
    roomId: room.id,
    seat,
    connId: meta.connId,
    resumeToken: meta.resumeToken,
    expiresAt,
    timer,
  };

  graceByToken.set(meta.resumeToken, record);
  graceBySeat.set(seatGraceKey(room.id, seat), record);
}

function buildRoomMeta(room: GameRoom): RoomMeta {
  const ready = room.state.playersReady ?? { P1: false, P2: false };
  const initiative = room.state.initiative ?? {
    P1: null,
    P2: null,
    winner: null,
  };
  return {
    ready: {
      P1: ready.P1 ?? false,
      P2: ready.P2 ?? false,
    },
    players: { P1: !!room.seats.P1, P2: !!room.seats.P2 },
    spectators: room.spectators.size,
    phase: room.state.phase ?? "lobby",
    pendingRoll: room.state.pendingRoll
      ? {
          id: room.state.pendingRoll.id,
          kind: room.state.pendingRoll.kind,
          player: room.state.pendingRoll.player,
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
  const view = viewForRole(room.state, meta.role);
  const you = {
    role: meta.role,
    seat: meta.seat ?? undefined,
    isHost: room.hostConnId === meta.connId,
  };
  sendMessage(socket, {
    type: "roomState",
    roomId: room.id,
    you,
    view,
    meta: buildRoomMeta(room),
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
    const filteredEvents = filterEventsForRecipient(
      room,
      meta ?? null,
      payload.events
    );
    sendMessage(socket, {
      type: "actionResult",
      ok: payload.ok,
      events: filteredEvents,
      error: payload.error,
      logIndex: payload.logIndex,
    });
  }
}

function filterEventsForRecipient(
  room: GameRoom | undefined,
  meta: ConnectionMeta | null,
  events: GameEvent[]
): GameEvent[] {
  if (!meta || !room) return events;
  const role = meta.role;
  return events.filter((event) => {
    if (event.type === "stakesPlaced") {
      return role === event.owner;
    }
    if (event.type === "intimidateTriggered") {
      const defender = room.state.units[event.defenderId];
      if (!defender) return false;
      return role === defender.owner;
    }
    return true;
  });
}

function sendMoveOptionsIfAny(socket: WebSocket, events: GameEvent[]) {
  const moveEvent = events.find(
    (item) => item.type === "moveOptionsGenerated"
  );
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
  const message =
    result.ok ? undefined : result.message ?? "Action rejected";
  sendMessage(socket, {
    type: "actionResult",
    ok: false,
    events: [],
    error: message,
  });
}

function applyRoomAction(
  socket: WebSocket,
  room: GameRoom,
  meta: ConnectionMeta,
  action: GameAction
): CommandResult {
  if (meta.role === "spectator" || !meta.seat) {
    const result = rejected("NOT_SEATED", "Spectators cannot act");
    sendActionRejected(socket, result);
    return result;
  }

  if (room.state.phase === "ended") {
    const result = rejected("GAME_ENDED", "Game has ended");
    sendActionRejected(socket, result);
    return result;
  }

  if (room.state.pendingRoll && action.type !== "resolvePendingRoll") {
    const result = rejected(
      "PENDING_ROLL_REQUIRED",
      "Pending roll must be resolved"
    );
    sendActionRejected(socket, result);
    return result;
  }

  if (!isActionAllowedByPlayer(room.state, action, meta.seat)) {
    const result = rejected(
      "FORBIDDEN",
      "Action not allowed for this player"
    );
    sendActionRejected(socket, result);
    return result;
  }

  const command = applyAndBroadcast(room, action, meta.seat, socket, true);
  if (!command.ok) return command;

  try {
    for (const ev of command.events) {
      const summary: Record<string, any> = { tag: "fate:event", roomId: room.id, eventType: ev.type };
      if ((ev as any).attackerId) summary.playerId = (ev as any).attackerId;
      if ((ev as any).defenderId) summary.unitId = (ev as any).defenderId;
      logFate(serverLogger!, summary);
    }
  } catch (e) {
    logFate(serverLogger!, { tag: "fate:error", roomId: room.id, code: "log_error", message: String(e), err: e });
  }
  return command;
}

function applyAndBroadcast(
  room: GameRoom,
  action: GameAction,
  playerId: PlayerId,
  socketForErrors?: WebSocket,
  sendMoveOptions = false
): CommandResult {
  const command = applyGameAction(room, action, playerId);
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

function detachFromFateRoom(
  meta: ConnectionMeta,
  options: { useGrace: boolean; reason: "leave" | "disconnect" | "switch_room" }
) {
  const room = getGameRoom(meta.roomId);
  if (!room) return;

  if (meta.seat) {
    if (options.useGrace) {
      scheduleSeatGrace(room, meta);
      logFate(serverLogger!, {
        tag: "fate:seat:grace_started",
        roomId: room.id,
        seat: meta.seat,
        resumeToken: meta.resumeToken,
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

export function registerGameWebSocket(server: FastifyInstance) {
  serverLogger = server.log;
  server.get("/ws", { websocket: true }, (socket) => {
    async function detachExistingConnection(
      existing: ConnectionMeta,
      reason: "leave" | "switch_room" | "disconnect"
    ) {
      const key = queueKey(existing.channel, existing.roomId);
      await enqueueRoomCommand(key, () => {
        const current = socketMeta.get(socket);
        if (!current || current.connId !== existing.connId) return;

        if (current.channel === "fate") {
          detachFromFateRoom(current, {
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
              server.log
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
              seat:
                msg.role === "P1" || msg.role === "P2"
                  ? msg.role
                  : undefined,
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
          const targetRoomId = msg.mode === "create" ? msg.roomId ?? randomUUID() : msg.roomId;
          if (!targetRoomId) {
            sendMessage(socket, {
              type: "joinRejected",
              reason: "room_not_found",
              message: "Room not found",
            });
            return;
          }

          const existing = socketMeta.get(socket);
          if (existing) {
            await detachExistingConnection(existing, "switch_room");
          }

          await enqueueRoomCommand(fateRoomKey(targetRoomId), () => {
            const connId = randomUUID();
            const resumeToken = msg.resumeToken ?? randomUUID();
            clearSeatGraceByToken(resumeToken);

            const requestedSeat =
              msg.role === "P1" || msg.role === "P2" ? (msg.role as PlayerId) : null;
            let room: GameRoom | undefined;
            let seat: PlayerId | null = null;

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
              room = createGameRoomWithId(targetRoomId, {
                hostSeat,
                hostConnId: hostConnForState,
              });
              room.hostConnId = connId;
              room.hostSeat = hostSeat;
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

            if (requestedSeat) {
              seat = requestedSeat;
              if (!canAssignSeat(room, seat, connId, resumeToken)) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "role_taken",
                  message: "Requested role is already taken",
                });
                return;
              }
              const assigned = assignSeat(room, seat, connId, resumeToken);
              if (!assigned) {
                sendMessage(socket, {
                  type: "joinRejected",
                  reason: "role_taken",
                  message: "Requested role is already taken",
                });
                return;
              }
              applyFigureSetToRoom(room, seat, msg.figureSet as HeroSelection | undefined);
            } else {
              room.spectators.add(connId);
            }

            if (!room.hostConnId) {
              room.hostConnId = connId;
              if (requestedSeat) {
                room.hostSeat = requestedSeat;
                room.state = { ...room.state, hostPlayerId: requestedSeat };
              }
            }

            socketMeta.set(socket, {
              channel: "fate",
              roomId: room.id,
              role: msg.role,
              seat,
              connId,
              resumeToken,
              name: msg.name,
            });
            addSocketToRoom(room.id, socket);

            logFate(serverLogger!, {
              tag: "fate:join",
              roomId: room.id,
              role: msg.role,
              socketId: connId,
              seat,
              name: msg.name,
            });

            sendMessage(socket, {
              type: "joinAck",
              roomId: room.id,
              role: msg.role,
              seat: seat ?? undefined,
              isHost: room.hostConnId === connId,
              resumeToken,
            });

            broadcastRoomState(room);
          });
          return;
        }
        case "switchRole": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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

            const targetSeat =
              msg.role === "P1" || msg.role === "P2" ? (msg.role as PlayerId) : null;
            if (
              targetSeat &&
              !canAssignSeat(room, targetSeat, current.connId, current.resumeToken)
            ) {
              sendMessage(socket, {
                type: "error",
                message: "Requested role is already taken",
                code: "role_taken",
              });
              return;
            }

            clearSeatGraceByToken(current.resumeToken);
            const previousSeat = current.seat;

            if (targetSeat) {
              const assigned = assignSeat(
                room,
                targetSeat,
                current.connId,
                current.resumeToken
              );
              if (!assigned) {
                sendMessage(socket, {
                  type: "error",
                  message: "Requested role is already taken",
                  code: "role_taken",
                });
                return;
              }
              if (!previousSeat) {
                room.spectators.delete(current.connId);
              } else if (previousSeat !== targetSeat) {
                vacateSeat(room, previousSeat, current.connId);
              }
              current.role = targetSeat;
              current.seat = targetSeat;
            } else {
              if (previousSeat) {
                vacateSeat(room, previousSeat, current.connId);
              }
              room.spectators.add(current.connId);
              current.role = "spectator";
              current.seat = null;
            }

            socketMeta.set(socket, current);
            updateHost(room);
            broadcastRoomState(room);
          });
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
          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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

            const action: GameAction = {
              type: "setReady",
              player: current.seat,
              ready: msg.ready,
            };
            applyAndBroadcast(room, action, current.seat, socket);
          });
          return;
        }
        case "startGame": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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
            if (
              !room.seats.P1 ||
              !room.seats.P2 ||
              !playersReady.P1 ||
              !playersReady.P2
            ) {
              sendMessage(socket, {
                type: "error",
                message: "Both players must be seated and ready",
                code: "not_ready",
              });
              return;
            }

            const action: GameAction = { type: "startGame" };
            applyAndBroadcast(room, action, current.seat ?? room.hostSeat, socket);
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
          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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
            applyAndBroadcast(room, action, current.seat, socket, true);
          });
          return;
        }
        case "requestMoveOptions": {
          const meta = socketMeta.get(socket);
          if (!meta || meta.channel !== "fate") {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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
            applyRoomAction(socket, room, current, action);
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

          await enqueueRoomCommand(fateRoomKey(meta.roomId), () => {
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

            const normalizedAction: GameAction =
              msg.action.type === "resolvePendingRoll"
                ? {
                    ...msg.action,
                    player: current.seat ?? (msg.action as any).player,
                  }
                : msg.action;

            applyRoomAction(socket, room, current, normalizedAction);
          });
          return;
        }
        default:
          sendStructuredError(socket, "BAD_REQUEST", "Unknown message type");
      }
    }

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
        sendStructuredError(socket, "INVALID_PAYLOAD", "Invalid message payload");
        return;
      }

      try {
        await handleParsedMessage(parsed.data);
      } catch (error) {
        server.log.error({ tag: "fate:ws_unhandled_error", err: error });
        sendStructuredError(socket, "BAD_REQUEST", "Failed to process message");
      }
    }

    socket.on("message", (data) => {
      void handleIncomingMessage(data);
    });

    async function handleSocketTermination(kind: "close" | "error") {
      const meta = socketMeta.get(socket);
      if (!meta) {
        socketRateState.delete(socket);
        return;
      }

      try {
        await detachExistingConnection(meta, "disconnect");
      } catch (error) {
        server.log.error({
          tag: "fate:disconnect_error",
          roomId: meta.roomId,
          err: error,
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

