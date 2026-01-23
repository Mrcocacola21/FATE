import type { GameAction, GameEvent, PlayerId, PlayerView, Coord } from "rules";
import { getWsUrl } from "./api";

export type PlayerRole = PlayerId | "spectator";

export type ServerMessage =
  | {
      type: "roomState";
      roomId: string;
      room: PlayerView;
    }
  | {
      type: "joinAccepted";
      roomId: string;
      role: PlayerRole;
      connId: string;
    }
  | {
      type: "joinRejected";
      reason: "room_not_found" | "role_taken";
      message: string;
    }
  | {
      type: "actionResult";
      ok: boolean;
      events: GameEvent[];
      error?: string;
      logIndex?: number;
    }
  | {
      type: "moveOptions";
      unitId: string;
      roll: number | null;
      legalTo: Coord[];
    }
  | {
      type: "error";
      message: string;
    };

export type ClientMessage =
  | {
      type: "joinRoom";
      roomId: string;
      requestedRole: PlayerRole;
      name?: string;
    }
  | { type: "action"; action: GameAction }
  | { type: "requestMoveOptions"; unitId: string }
  | { type: "leaveRoom" };

export function connectGameSocket(
  onMessage: (msg: ServerMessage) => void
): WebSocket {
  const socket = new WebSocket(getWsUrl());

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ServerMessage;
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };

  return socket;
}

export function sendJoinRoom(
  socket: WebSocket,
  roomId: string,
  requestedRole: PlayerRole,
  name?: string
) {
  const join: ClientMessage = { type: "joinRoom", roomId, requestedRole, name };
  socket.send(JSON.stringify(join));
}

export function sendSocketAction(socket: WebSocket, action: GameAction) {
  const msg: ClientMessage = { type: "action", action };
  socket.send(JSON.stringify(msg));
}

export function sendMoveOptionsRequest(socket: WebSocket, unitId: string) {
  const msg: ClientMessage = { type: "requestMoveOptions", unitId };
  socket.send(JSON.stringify(msg));
}

export function sendLeaveRoom(socket: WebSocket) {
  const msg: ClientMessage = { type: "leaveRoom" };
  socket.send(JSON.stringify(msg));
}
