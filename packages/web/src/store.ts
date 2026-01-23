import { create } from "zustand";
import type { GameAction, GameEvent, PlayerView, Coord, PlayerId } from "rules";
import { createRoom as createRoomApi, listRooms, type RoomSummary } from "./api";
import {
  connectGameSocket,
  sendJoinRoom,
  sendLeaveRoom,
  sendMoveOptionsRequest,
  sendSocketAction,
  type PlayerRole,
  type ServerMessage,
} from "./ws";

export type ActionMode = "move" | "attack" | "place" | null;

interface GameStore {
  connectionStatus: "disconnected" | "connecting" | "connected";
  joined: boolean;
  roomId: string | null;
  role: PlayerRole | null;
  joinError: string | null;
  roomsList: RoomSummary[];
  roomState: PlayerView | null;
  hasSnapshot: boolean;
  hoveredAbilityId: string | null;
  events: GameEvent[];
  clientLog: string[];
  lastLogIndex: number;
  lastActionResult: { ok: boolean; error?: string } | null;
  lastActionResultAt: number;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  moveOptions: { unitId: string; roll?: number | null; legalTo: Coord[] } | null;
  connect: () => Promise<WebSocket>;
  fetchRooms: () => Promise<void>;
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string, role: PlayerRole, name?: string) => Promise<void>;
  leaveRoom: () => void;
  sendAction: (action: GameAction) => void;
  requestMoveOptions: (unitId: string) => void;
  setRoomState: (roomId: string, room: PlayerView) => void;
  applyActionResult: (
    events: GameEvent[],
    logIndex: number,
    error?: string
  ) => void;
  addEvents: (events: GameEvent[]) => void;
  addClientLog: (message: string) => void;
  setSelectedUnit: (unitId: string | null) => void;
  setActionMode: (mode: ActionMode) => void;
  setPlaceUnitId: (unitId: string | null) => void;
  setMoveOptions: (
    options: { unitId: string; roll?: number | null; legalTo: Coord[] } | null
  ) => void;
  setHoveredAbilityId: (abilityId: string | null) => void;
  resetGameState: () => void;
}

let socket: WebSocket | null = null;
let connectPromise: Promise<WebSocket> | null = null;

function roleToPlayerId(role: PlayerRole | null): PlayerId | null {
  if (role === "P1" || role === "P2") return role;
  return null;
}

function handleServerMessage(
  msg: ServerMessage,
  set: (fn: (state: GameStore) => Partial<GameStore>) => void,
  get: () => GameStore
) {
  switch (msg.type) {
    case "joinAccepted": {
      set(() => ({
        joined: true,
        roomId: msg.roomId,
        role: msg.role,
        joinError: null,
      }));
      return;
    }
    case "joinRejected": {
      set(() => ({
        joined: false,
        roomId: null,
        role: null,
        joinError: msg.message,
        roomState: null,
        hasSnapshot: false,
      }));
      return;
    }
    case "roomState": {
      set(() => ({
        roomState: msg.room,
        roomId: msg.roomId,
        joined: true,
        hasSnapshot: true,
      }));
      return;
    }
    case "actionResult": {
      const { applyActionResult, addClientLog } = get();
      if (msg.ok) {
        applyActionResult(msg.events, msg.logIndex ?? -1);
      } else if (msg.error) {
        addClientLog(msg.error);
      }
      set(() => ({
        lastActionResult: { ok: msg.ok, error: msg.error },
        lastActionResultAt: Date.now(),
      }));
      return;
    }
    case "moveOptions": {
      set(() => ({
        moveOptions: {
          unitId: msg.unitId,
          roll: msg.roll,
          legalTo: msg.legalTo,
        },
      }));
      return;
    }
    case "error": {
      get().addClientLog(msg.message);
      return;
    }
    default:
      return;
  }
}

function openSocket(set: (fn: (state: GameStore) => Partial<GameStore>) => void, get: () => GameStore) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(socket);
  }

  if (connectPromise) return connectPromise;

  set(() => ({ connectionStatus: "connecting" }));
  socket = connectGameSocket((msg) => handleServerMessage(msg, set, get));

  connectPromise = new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error("Socket not initialized"));
      return;
    }

    socket.onopen = () => {
      set(() => ({ connectionStatus: "connected" }));
      resolve(socket as WebSocket);
    };

    socket.onclose = () => {
      connectPromise = null;
      socket = null;
      set(() => ({
        connectionStatus: "disconnected",
        joined: false,
        roomId: null,
        role: null,
        roomState: null,
        hasSnapshot: false,
        hoveredAbilityId: null,
      }));
    };

    socket.onerror = (err) => {
      connectPromise = null;
      socket = null;
      set(() => ({ connectionStatus: "disconnected" }));
      reject(err);
    };
  });

  return connectPromise;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connectionStatus: "disconnected",
  joined: false,
  roomId: null,
  role: null,
  joinError: null,
  roomsList: [],
  roomState: null,
  hasSnapshot: false,
  hoveredAbilityId: null,
  events: [],
  clientLog: [],
  lastLogIndex: -1,
  lastActionResult: null,
  lastActionResultAt: 0,
  selectedUnitId: null,
  actionMode: null,
  placeUnitId: null,
  moveOptions: null,
  connect: async () => openSocket(set, get),
  fetchRooms: async () => {
    const rooms = await listRooms();
    set(() => ({ roomsList: rooms }));
  },
  createRoom: async () => {
    const res = await createRoomApi();
    return res.roomId;
  },
  joinRoom: async (roomId, role, name) => {
    set(() => ({ joinError: null }));
    const ws = await openSocket(set, get);
    sendJoinRoom(ws, roomId, role, name);
  },
  leaveRoom: () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      sendLeaveRoom(socket);
    }
    set((state) => ({
      joined: false,
      roomId: null,
      role: null,
      joinError: null,
      roomState: null,
      hasSnapshot: false,
      hoveredAbilityId: null,
      events: [],
      clientLog: state.clientLog,
      lastLogIndex: -1,
      lastActionResult: null,
      lastActionResultAt: 0,
      selectedUnitId: null,
      actionMode: null,
      placeUnitId: null,
      moveOptions: null,
    }));
  },
  sendAction: (action) => {
    const state = get();
    if (state.roomState?.pendingRoll && action.type !== "resolvePendingRoll") {
      state.addClientLog("Resolve the pending roll before acting.");
      return;
    }
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (state.role === "spectator") {
      state.addClientLog("Spectators cannot act.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendSocketAction(socket, action);
  },
  requestMoveOptions: (unitId) => {
    const state = get();
    if (state.roomState?.pendingRoll) {
      state.addClientLog("Resolve the pending roll before acting.");
      return;
    }
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (state.role === "spectator") {
      state.addClientLog("Spectators cannot act.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendMoveOptionsRequest(socket, unitId);
  },
  setRoomState: (roomId, room) =>
    set(() => ({
      roomId,
      roomState: room,
      joined: true,
      hasSnapshot: true,
    })),
  applyActionResult: (events, logIndex, error) =>
    set((state) => {
      if (logIndex <= state.lastLogIndex) {
        return error ? { clientLog: [...state.clientLog, error] } : {};
      }
      return {
        events: [...state.events, ...events].slice(-200),
        lastLogIndex: logIndex,
        clientLog: error ? [...state.clientLog, error] : state.clientLog,
      };
    }),
  addEvents: (events) =>
    set((state) => ({ events: [...state.events, ...events].slice(-200) })),
  addClientLog: (message) =>
    set((state) => ({ clientLog: [...state.clientLog, message].slice(-50) })),
  setSelectedUnit: (unitId) => set(() => ({ selectedUnitId: unitId })),
  setActionMode: (mode) => set(() => ({ actionMode: mode })),
  setPlaceUnitId: (unitId) => set(() => ({ placeUnitId: unitId })),
  setMoveOptions: (options) => set(() => ({ moveOptions: options })),
  setHoveredAbilityId: (abilityId) => set(() => ({ hoveredAbilityId: abilityId })),
  resetGameState: () =>
    set(() => ({
      roomState: null,
      hasSnapshot: false,
      hoveredAbilityId: null,
      events: [],
      clientLog: [],
      lastLogIndex: -1,
      lastActionResult: null,
      lastActionResultAt: 0,
      selectedUnitId: null,
      actionMode: null,
      placeUnitId: null,
      moveOptions: null,
    })),
}));

export function getLocalPlayerId(role: PlayerRole | null): PlayerId | null {
  return roleToPlayerId(role);
}
