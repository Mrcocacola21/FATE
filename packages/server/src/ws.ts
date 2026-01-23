// packages/server/src/ws.ts

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { Coord, GameAction, GameEvent, GameState, PlayerId, PlayerView } from "rules";
import { makePlayerView } from "rules";
import { ClientMessageSchema } from "./schemas";
import { isActionAllowedByPlayer } from "./permissions";
import { applyGameAction, getGameRoom, listGameRooms } from "./store";

export type PlayerRole = PlayerId | "spectator";

export interface RoomSummary {
  id: string;
  createdAt: number;
  phase: GameState["phase"];
  p1Taken: boolean;
  p2Taken: boolean;
  spectators: number;
}

type JoinAcceptedMessage = {
  type: "joinAccepted";
  roomId: string;
  role: PlayerRole;
  connId: string;
};

type JoinRejectedMessage = {
  type: "joinRejected";
  reason: "room_not_found" | "role_taken";
  message: string;
};

type RoomStateMessage = {
  type: "roomState";
  roomId: string;
  room: PlayerView;
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
};

type ErrorMessage = {
  type: "error";
  message: string;
};

type ServerMessage =
  | JoinAcceptedMessage
  | JoinRejectedMessage
  | RoomStateMessage
  | ActionResultMessage
  | MoveOptionsMessage
  | ErrorMessage;

interface ConnectionMeta {
  roomId: string;
  role: PlayerRole;
  connId: string;
  name?: string;
}

interface RoomPresence {
  players: { P1?: string; P2?: string };
  spectators: Set<string>;
}

const roomSockets = new Map<string, Set<WebSocket>>();
const socketMeta = new Map<WebSocket, ConnectionMeta>();
const roomPresence = new Map<string, RoomPresence>();

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

function getPresence(roomId: string): RoomPresence {
  let presence = roomPresence.get(roomId);
  if (!presence) {
    presence = { players: {}, spectators: new Set<string>() };
    roomPresence.set(roomId, presence);
  }
  return presence;
}

function viewForRole(state: GameState, role: PlayerRole): PlayerView {
  if (role === "spectator") {
    return makePlayerView(state, "P1");
  }
  return makePlayerView(state, role);
}

function removeSocketFromRoom(socket: WebSocket, roomId: string) {
  const sockets = roomSockets.get(roomId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      roomSockets.delete(roomId);
    }
  }
}

function releasePresence(roomId: string, role: PlayerRole, connId: string) {
  const presence = roomPresence.get(roomId);
  if (!presence) return;

  if (role === "spectator") {
    presence.spectators.delete(connId);
  } else if (presence.players[role] === connId) {
    delete presence.players[role];
  }

  if (
    !presence.players.P1 &&
    !presence.players.P2 &&
    presence.spectators.size === 0
  ) {
    roomPresence.delete(roomId);
  }
}

function leaveRoomForSocket(socket: WebSocket) {
  const meta = socketMeta.get(socket);
  if (!meta) return;

  removeSocketFromRoom(socket, meta.roomId);
  releasePresence(meta.roomId, meta.role, meta.connId);
  socketMeta.delete(socket);

  const room = getGameRoom(meta.roomId);
  if (room) {
    broadcastRoomState(room.id, room.state);
  }
}

function registerSocket(socket: WebSocket, meta: ConnectionMeta) {
  const existing = socketMeta.get(socket);
  if (existing) {
    leaveRoomForSocket(socket);
  }

  socketMeta.set(socket, meta);

  let sockets = roomSockets.get(meta.roomId);
  if (!sockets) {
    sockets = new Set<WebSocket>();
    roomSockets.set(meta.roomId, sockets);
  }
  sockets.add(socket);
}

function sendRoomState(socket: WebSocket, roomId: string, role: PlayerRole) {
  const room = getGameRoom(roomId);
  if (!room) return;
  const view = viewForRole(room.state, role);
  sendMessage(socket, { type: "roomState", roomId, room: view });
}

function getMoveOptions(
  events: GameEvent[],
  unitId: string
): { roll: number | null; legalTo: Coord[] } | null {
  const event = events.find(
    (item) => item.type === "moveOptionsGenerated" && item.unitId === unitId
  );
  if (!event || event.type !== "moveOptionsGenerated") return null;
  return {
    roll: event.roll ?? null,
    legalTo: event.legalTo,
  };
}

function handleAction(socket: WebSocket, action: GameAction) {
  const meta = socketMeta.get(socket);
  if (!meta) {
    sendMessage(socket, {
      type: "error",
      message: "Must join a room first",
    });
    return;
  }

  if (meta.role === "spectator") {
    sendMessage(socket, {
      type: "error",
      message: "Spectators cannot act",
    });
    return;
  }

  const room = getGameRoom(meta.roomId);
  if (!room) {
    sendMessage(socket, {
      type: "error",
      message: "Room not found",
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

  if (!isActionAllowedByPlayer(room.state, action, meta.role)) {
    sendMessage(socket, {
      type: "actionResult",
      ok: false,
      events: [],
      error: "Action not allowed for this player",
    });
    return;
  }

  const { events, logIndex } = applyGameAction(room, action, meta.role);

  broadcastRoomState(room.id, room.state);
  broadcastActionResult({ gameId: room.id, ok: true, events, logIndex });

  const moveEvent = events.find(
    (item) => item.type === "moveOptionsGenerated"
  );
  if (moveEvent && moveEvent.type === "moveOptionsGenerated") {
    sendMessage(socket, {
      type: "moveOptions",
      unitId: moveEvent.unitId,
      roll: moveEvent.roll ?? null,
      legalTo: moveEvent.legalTo,
    });
  }
}

function tryAssignRole(
  roomId: string,
  role: PlayerRole,
  connId: string
): boolean {
  const presence = getPresence(roomId);
  if (role === "spectator") {
    presence.spectators.add(connId);
    return true;
  }

  const current = presence.players[role];
  if (current && current !== connId) {
    return false;
  }

  presence.players[role] = connId;
  return true;
}

export function listRoomSummaries(): RoomSummary[] {
  return listGameRooms().map((room) => {
    const presence = roomPresence.get(room.id);
    return {
      id: room.id,
      createdAt: room.createdAt,
      phase: room.state.phase,
      p1Taken: !!presence?.players.P1,
      p2Taken: !!presence?.players.P2,
      spectators: presence?.spectators.size ?? 0,
    };
  });
}

export function broadcastRoomState(roomId: string, state: GameState) {
  const sockets = roomSockets.get(roomId);
  if (!sockets || sockets.size === 0) return;

  for (const socket of sockets) {
    const meta = socketMeta.get(socket);
    if (!meta) continue;
    const view = viewForRole(state, meta.role);
    sendMessage(socket, { type: "roomState", roomId, room: view });
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

  for (const socket of sockets) {
    sendMessage(socket, {
      type: "actionResult",
      ok: payload.ok,
      events: payload.events,
      error: payload.error,
      logIndex: payload.logIndex,
    });
  }
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
          const room = getGameRoom(msg.roomId);
          if (!room) {
            sendMessage(socket, {
              type: "joinRejected",
              reason: "room_not_found",
              message: "Room not found",
            });
            return;
          }

          leaveRoomForSocket(socket);
          const connId = randomUUID();
          const accepted = tryAssignRole(room.id, msg.requestedRole, connId);
          if (!accepted) {
            sendMessage(socket, {
              type: "joinRejected",
              reason: "role_taken",
              message: "Requested role is already taken",
            });
            return;
          }

          registerSocket(socket, {
            roomId: room.id,
            role: msg.requestedRole,
            connId,
            name: msg.name,
          });
          server.log.info(
            { roomId: room.id, role: msg.requestedRole, connId },
            "ws client joined room"
          );
          sendMessage(socket, {
            type: "joinAccepted",
            roomId: room.id,
            role: msg.requestedRole,
            connId,
          });
          sendRoomState(socket, room.id, msg.requestedRole);
          break;
        }
        case "leaveRoom": {
          const meta = socketMeta.get(socket);
          if (meta) {
            server.log.info(
              { roomId: meta.roomId, role: meta.role, connId: meta.connId },
              "ws client left room"
            );
          }
          leaveRoomForSocket(socket);
          break;
        }
        case "action": {
          handleAction(socket, msg.action);
          break;
        }
        case "requestMoveOptions": {
          handleAction(socket, {
            type: "requestMoveOptions",
            unitId: msg.unitId,
          });
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
      if (meta) {
        server.log.info(
          { roomId: meta.roomId, role: meta.role, connId: meta.connId },
          "ws client disconnected"
        );
      }
      leaveRoomForSocket(socket);
    });

    socket.on("error", () => {
      const meta = socketMeta.get(socket);
      if (meta) {
        server.log.warn(
          { roomId: meta.roomId, role: meta.role, connId: meta.connId },
          "ws client error"
        );
      }
      leaveRoomForSocket(socket);
    });
  });
}
