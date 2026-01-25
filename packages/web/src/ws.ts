import type {
  GameAction,
  GameEvent,
  PlayerId,
  PlayerView,
  Coord,
  RollKind,
  GamePhase,
  MoveMode,
  ResolveRollChoice,
} from "rules";
import { getWsUrl } from "./api";
import type { FigureSetSelection } from "./figures/types";

export type PlayerRole = PlayerId | "spectator";

export type RoomMeta = {
  ready: { P1: boolean; P2: boolean };
  players: { P1: boolean; P2: boolean };
  spectators: number;
  phase: GamePhase;
  pendingRoll: { id: string; kind: RollKind; player: PlayerId } | null;
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
  you: { role: PlayerRole; seat?: PlayerId; isHost: boolean };
  view: PlayerView;
  meta: RoomMeta;
};

export type ServerMessage =
  | RoomStateMessage
  | {
      type: "joinAck";
      roomId: string;
      role: PlayerRole;
      seat?: PlayerId;
      isHost: boolean;
    }
  | {
      type: "joinRejected";
      reason: "room_not_found" | "role_taken" | "room_exists";
      message: string;
    }
  | {
      type: "leftRoom";
      roomId: string | null;
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
      mode?: MoveMode;
      modes?: MoveMode[];
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };

export type ClientMessage =
  | {
      type: "joinRoom";
      mode: "create" | "join";
      roomId?: string;
      role: PlayerRole;
      name?: string;
      figureSet?: FigureSetSelection;
    }
  | { type: "setReady"; ready: boolean }
  | { type: "startGame" }
  | {
      type: "resolvePendingRoll";
      pendingRollId: string;
      choice?: ResolveRollChoice;
    }
  | { type: "action"; action: GameAction }
  | { type: "requestMoveOptions"; unitId: string; mode?: MoveMode }
  | { type: "switchRole"; role: PlayerRole }
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
  params: {
    mode: "create" | "join";
    roomId?: string;
    role: PlayerRole;
    name?: string;
    figureSet?: FigureSetSelection;
  }
) {
  const join: ClientMessage = { type: "joinRoom", ...params };
  socket.send(JSON.stringify(join));
}

export function sendSetReady(socket: WebSocket, ready: boolean) {
  const msg: ClientMessage = { type: "setReady", ready };
  socket.send(JSON.stringify(msg));
}

export function sendStartGame(socket: WebSocket) {
  const msg: ClientMessage = { type: "startGame" };
  socket.send(JSON.stringify(msg));
}

export function sendResolvePendingRoll(
  socket: WebSocket,
  pendingRollId: string,
  choice?: ResolveRollChoice
) {
  const msg: ClientMessage = { type: "resolvePendingRoll", pendingRollId, choice };
  socket.send(JSON.stringify(msg));
}

export function sendSocketAction(socket: WebSocket, action: GameAction) {
  const msg: ClientMessage = { type: "action", action };
  socket.send(JSON.stringify(msg));
}

export function sendMoveOptionsRequest(
  socket: WebSocket,
  unitId: string,
  mode?: MoveMode
) {
  const msg: ClientMessage = { type: "requestMoveOptions", unitId, mode };
  socket.send(JSON.stringify(msg));
}

export function sendSwitchRole(socket: WebSocket, role: PlayerRole) {
  const msg: ClientMessage = { type: "switchRole", role };
  socket.send(JSON.stringify(msg));
}

export function sendLeaveRoom(socket: WebSocket) {
  const msg: ClientMessage = { type: "leaveRoom" };
  socket.send(JSON.stringify(msg));
}
