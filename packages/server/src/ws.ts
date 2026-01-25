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
  createGameRoom,
  createGameRoomWithId,
  getGameRoom,
  type GameRoom,
} from "./store";

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
  roomId: string;
  role: PlayerRole;
  seat: PlayerId | null;
  connId: string;
  name?: string;
}

const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new Map<WebSocket, ConnectionMeta>();

function sendMessage(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString();
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.from(data).toString();
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

function assignSeat(room: GameRoom, seat: PlayerId, connId: string): boolean {
  const current = room.seats[seat];
  if (current && current !== connId) return false;
  const isNew = !current || current !== connId;
  room.seats[seat] = connId;
  room.state = {
    ...room.state,
    seats: { ...room.state.seats, [seat]: true },
    playersReady: {
      ...room.state.playersReady,
      [seat]: isNew ? false : room.state.playersReady[seat],
    },
  };
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

function applyRoomAction(
  socket: WebSocket,
  room: GameRoom,
  meta: ConnectionMeta,
  action: GameAction
) {
  if (meta.role === "spectator" || !meta.seat) {
    sendMessage(socket, {
      type: "error",
      message: "Spectators cannot act",
      code: "spectator",
    });
    return;
  }

  if (room.state.phase === "ended") {
    sendMessage(socket, {
      type: "actionResult",
      ok: false,
      events: [],
      error: "Game has ended",
    });
    return;
  }

  if (room.state.pendingRoll && action.type !== "resolvePendingRoll") {
    sendMessage(socket, {
      type: "actionResult",
      ok: false,
      events: [],
      error: "Pending roll must be resolved",
    });
    return;
  }

  if (!isActionAllowedByPlayer(room.state, action, meta.seat)) {
    sendMessage(socket, {
      type: "actionResult",
      ok: false,
      events: [],
      error: "Action not allowed for this player",
    });
    return;
  }

  const { events, logIndex } = applyGameAction(room, action, meta.seat);
  broadcastRoomState(room);
  broadcastActionResult({ gameId: room.id, ok: true, events, logIndex });
  sendMoveOptionsIfAny(socket, events);
}

export function registerGameWebSocket(server: FastifyInstance) {
  server.get("/ws", { websocket: true }, (socket) => {
    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawDataToString(data));
      } catch {
        sendMessage(socket, { type: "error", message: "Invalid JSON" });
        return;
      }

      const message = ClientMessageSchema.safeParse(parsed);
      if (!message.success) {
        sendMessage(socket, {
          type: "error",
          message: "Invalid message payload",
        });
        return;
      }

      const msg = message.data;
      switch (msg.type) {
        case "joinRoom": {
          const existing = socketMeta.get(socket);
          if (existing) {
            const prevRoom = getGameRoom(existing.roomId);
            if (prevRoom) {
              if (existing.seat) {
                vacateSeat(prevRoom, existing.seat, existing.connId);
              } else {
                prevRoom.spectators.delete(existing.connId);
              }
              updateHost(prevRoom);
              broadcastRoomState(prevRoom);
            }
            removeSocketFromRoom(existing.roomId, socket);
            socketMeta.delete(socket);
          }

          const connId = randomUUID();
          let room: GameRoom | undefined;
          let seat: PlayerId | null = null;

          if (msg.mode === "create") {
            const isSeatRole = msg.role === "P1" || msg.role === "P2";
            const hostSeat: PlayerId =
              msg.role === "P1" || msg.role === "P2" ? msg.role : "P1";
            const hostConnForState = isSeatRole ? connId : null;
            if (msg.roomId && getGameRoom(msg.roomId)) {
              sendMessage(socket, {
                type: "joinRejected",
                reason: "room_exists",
                message: "Room already exists",
              });
              return;
            }
            room = msg.roomId
              ? createGameRoomWithId(msg.roomId, {
                  hostSeat,
                  hostConnId: hostConnForState,
                })
              : createGameRoom({ hostSeat, hostConnId: hostConnForState });

            room.hostConnId = connId;
            room.hostSeat = hostSeat;
            room.state = {
              ...room.state,
              hostPlayerId: hostSeat,
              seats: isSeatRole ? room.state.seats : { P1: false, P2: false },
            };
          } else {
            if (!msg.roomId) {
              sendMessage(socket, {
                type: "joinRejected",
                reason: "room_not_found",
                message: "Room not found",
              });
              return;
            }
            room = getGameRoom(msg.roomId);
            if (!room) {
              sendMessage(socket, {
                type: "joinRejected",
                reason: "room_not_found",
                message: "Room not found",
              });
              return;
            }
            if (!room.hostConnId) {
              room.hostConnId = connId;
              if (msg.role === "P1" || msg.role === "P2") {
                room.hostSeat = msg.role;
                room.state = { ...room.state, hostPlayerId: msg.role };
              }
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

          if (msg.role === "P1" || msg.role === "P2") {
            seat = msg.role;
            const assigned = assignSeat(room, seat, connId);
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

          socketMeta.set(socket, {
            roomId: room.id,
            role: msg.role,
            seat,
            connId,
            name: msg.name,
          });
          addSocketToRoom(room.id, socket);

          sendMessage(socket, {
            type: "joinAck",
            roomId: room.id,
            role: msg.role,
            seat: seat ?? undefined,
            isHost: room.hostConnId === connId,
          });

          broadcastRoomState(room);
          break;
        }
        case "switchRole": {
          const meta = socketMeta.get(socket);
          if (!meta) {
            sendMessage(socket, {
              type: "error",
              message: "Must join a room first",
            });
            return;
          }
          const room = getGameRoom(meta.roomId);
          if (!room) {
            sendMessage(socket, { type: "error", message: "Room not found" });
            return;
          }

          if (meta.seat) {
            vacateSeat(room, meta.seat, meta.connId);
          } else {
            room.spectators.delete(meta.connId);
          }

          updateHost(room);

          if (msg.role === "P1" || msg.role === "P2") {
            const assigned = assignSeat(room, msg.role, meta.connId);
            if (!assigned) {
              sendMessage(socket, {
                type: "error",
                message: "Requested role is already taken",
                code: "role_taken",
              });
              return;
            }
            meta.role = msg.role;
            meta.seat = msg.role;
          } else {
            room.spectators.add(meta.connId);
            meta.role = "spectator";
            meta.seat = null;
          }

          socketMeta.set(socket, meta);
          broadcastRoomState(room);
          break;
        }
        case "leaveRoom": {
          const meta = socketMeta.get(socket);
          const roomId = meta?.roomId ?? null;
          let room: GameRoom | undefined;
          if (meta) {
            room = getGameRoom(meta.roomId);
            if (room) {
              if (meta.seat) {
                vacateSeat(room, meta.seat, meta.connId);
              } else {
                room.spectators.delete(meta.connId);
              }
              updateHost(room);
            }
            removeSocketFromRoom(meta.roomId, socket);
            socketMeta.delete(socket);
            if (room) {
              broadcastRoomState(room);
            }
          }
          sendMessage(socket, { type: "leftRoom", roomId });
          break;
        }
        case "setReady": {
          const meta = socketMeta.get(socket);
          if (!meta || !meta.seat) {
            sendMessage(socket, {
              type: "error",
              message: "Only seated players can ready up",
              code: "not_seated",
            });
            return;
          }
          const room = getGameRoom(meta.roomId);
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
            player: meta.seat,
            ready: msg.ready,
          };

          const { events, logIndex } = applyGameAction(room, action, meta.seat);
          broadcastRoomState(room);
          broadcastActionResult({ gameId: room.id, ok: true, events, logIndex });
          break;
        }
        case "startGame": {
          const meta = socketMeta.get(socket);
          if (!meta) {
            sendMessage(socket, {
              type: "error",
              message: "Must join a room first",
            });
            return;
          }
          const room = getGameRoom(meta.roomId);
          if (!room) {
            sendMessage(socket, { type: "error", message: "Room not found" });
            return;
          }
          if (room.hostConnId !== meta.connId) {
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

          const action: GameAction = { type: "startGame" };
          const { events, logIndex } = applyGameAction(room, action, meta.seat ?? room.hostSeat);
          broadcastRoomState(room);
          broadcastActionResult({ gameId: room.id, ok: true, events, logIndex });
          break;
        }
        case "resolvePendingRoll": {
          const meta = socketMeta.get(socket);
          if (!meta || !meta.seat) {
            sendMessage(socket, {
              type: "error",
              message: "Only seated players can roll",
              code: "not_seated",
            });
            return;
          }
          const room = getGameRoom(meta.roomId);
          if (!room) {
            sendMessage(socket, { type: "error", message: "Room not found" });
            return;
          }

          const pending = room.state.pendingRoll;
          if (!pending || pending.player !== meta.seat) {
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
            player: meta.seat,
          };

          const { events, logIndex } = applyGameAction(room, action, meta.seat);
          broadcastRoomState(room);
          broadcastActionResult({ gameId: room.id, ok: true, events, logIndex });
          sendMoveOptionsIfAny(socket, events);
          break;
        }
        case "requestMoveOptions": {
          const meta = socketMeta.get(socket);
          if (!meta) {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          const room = getGameRoom(meta.roomId);
          if (!room) {
            sendMessage(socket, { type: "error", message: "Room not found" });
            return;
          }
          const action: GameAction = {
            type: "requestMoveOptions",
            unitId: msg.unitId,
            mode: msg.mode,
          };
          applyRoomAction(socket, room, meta, action);
          break;
        }
        case "action": {
          const meta = socketMeta.get(socket);
          if (!meta) {
            sendMessage(socket, { type: "error", message: "Must join a room first" });
            return;
          }
          const room = getGameRoom(meta.roomId);
          if (!room) {
            sendMessage(socket, { type: "error", message: "Room not found" });
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

          const normalizedAction: GameAction =
            msg.action.type === "resolvePendingRoll"
              ? {
                  ...msg.action,
                  player: meta.seat ?? (msg.action as any).player,
                }
              : msg.action;

          applyRoomAction(socket, room, meta, normalizedAction);
          break;
        }
        default:
          sendMessage(socket, {
            type: "error",
            message: "Unknown message type",
          });
      }
    });

    socket.on("close", () => {
      const meta = socketMeta.get(socket);
      if (!meta) return;
      const room = getGameRoom(meta.roomId);
      if (room) {
        if (meta.seat) {
          vacateSeat(room, meta.seat, meta.connId);
        } else {
          room.spectators.delete(meta.connId);
        }
        updateHost(room);
        broadcastRoomState(room);
      }
      removeSocketFromRoom(meta.roomId, socket);
      socketMeta.delete(socket);
    });

    socket.on("error", () => {
      const meta = socketMeta.get(socket);
      if (!meta) return;
      const room = getGameRoom(meta.roomId);
      if (room) {
        if (meta.seat) {
          vacateSeat(room, meta.seat, meta.connId);
        } else {
          room.spectators.delete(meta.connId);
        }
        updateHost(room);
        broadcastRoomState(room);
      }
      removeSocketFromRoom(meta.roomId, socket);
      socketMeta.delete(socket);
    });
  });
}
