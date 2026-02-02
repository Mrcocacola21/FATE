import { create } from "zustand";
import type {
  GameAction,
  GameEvent,
  PlayerView,
  Coord,
  PlayerId,
  MoveMode,
  ResolveRollChoice,
} from "rules";
import { listRooms, type RoomSummary } from "./api";
import { HERO_CATALOG } from "./figures/catalog";
import { loadFigureSetState } from "./figures/storage";
import {
  connectGameSocket,
  sendJoinRoom,
  sendLeaveRoom,
  sendMoveOptionsRequest,
  sendResolvePendingRoll,
  sendSetReady,
  sendSocketAction,
  sendStartGame,
  sendSwitchRole,
  type PlayerRole,
  type RoomMeta,
  type ServerMessage,
} from "./ws";

export type ActionMode =
  | "move"
  | "attack"
  | "place"
  | "dora"
  | "tisona"
  | "demonDuelist"
  | null;
export type HoverPreview = { type: "attackRange"; unitId: string } | null;

const defaultRoomMeta: RoomMeta = {
  ready: { P1: false, P2: false },
  players: { P1: false, P2: false },
  spectators: 0,
  phase: "lobby",
  pendingRoll: null,
  initiative: { P1: null, P2: null, winner: null },
  placementFirstPlayer: null,
};

interface GameStore {
  connectionStatus: "disconnected" | "connecting" | "connected";
  joined: boolean;
  roomId: string | null;
  role: PlayerRole | null;
  seat: PlayerId | null;
  isHost: boolean;
  roomMeta: RoomMeta | null;
  joinError: string | null;
  roomsList: RoomSummary[];
  roomState: PlayerView | null;
  hasSnapshot: boolean;
  hoveredAbilityId: string | null;
  hoverPreview: HoverPreview;
  events: GameEvent[];
  clientLog: string[];
  lastLogIndex: number;
  lastActionResult: { ok: boolean; error?: string } | null;
  lastActionResultAt: number;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  moveOptions:
    | {
        unitId: string;
        roll?: number | null;
        legalTo: Coord[];
        mode?: MoveMode;
        modes?: MoveMode[];
      }
    | null;
  leavingRoom: boolean;
  connect: () => Promise<WebSocket>;
  fetchRooms: () => Promise<void>;
  joinRoom: (params: {
    mode: "create" | "join";
    roomId?: string;
    role: PlayerRole;
    name?: string;
  }) => Promise<void>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  resolvePendingRoll: (pendingRollId: string, choice?: ResolveRollChoice) => void;
  switchRole: (role: PlayerRole) => void;
  sendAction: (action: GameAction) => void;
  requestMoveOptions: (unitId: string, mode?: MoveMode) => void;
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
    options:
      | {
          unitId: string;
          roll?: number | null;
          legalTo: Coord[];
          mode?: MoveMode;
          modes?: MoveMode[];
        }
      | null
  ) => void;
  setHoveredAbilityId: (abilityId: string | null) => void;
  setHoverPreview: (preview: HoverPreview) => void;
  resetGameState: () => void;
}

function buildLeaveResetState(state: GameStore, message?: string): Partial<GameStore> {
  const clientLog = message
    ? [...state.clientLog, message].slice(-50)
    : state.clientLog;
  return {
    joined: false,
    roomId: null,
    role: null,
    seat: null,
    isHost: false,
    roomMeta: defaultRoomMeta,
    joinError: null,
    roomState: null,
    hasSnapshot: false,
    hoveredAbilityId: null,
    hoverPreview: null,
    events: [],
    clientLog,
    lastLogIndex: -1,
    lastActionResult: null,
    lastActionResultAt: 0,
    selectedUnitId: null,
    actionMode: null,
    placeUnitId: null,
    moveOptions: null,
    leavingRoom: false,
  };
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
    case "joinAck": {
      set(() => ({
        joined: true,
        roomId: msg.roomId,
        role: msg.role,
        seat: msg.seat ?? null,
        isHost: msg.isHost,
        joinError: null,
        leavingRoom: false,
      }));
      return;
    }
    case "joinRejected": {
      set(() => ({
        joined: false,
        roomId: null,
        role: null,
        seat: null,
        isHost: false,
        roomMeta: defaultRoomMeta,
        joinError: msg.message,
        roomState: null,
        hasSnapshot: false,
        leavingRoom: false,
      }));
      return;
    }
    case "leftRoom": {
      const { fetchRooms, addClientLog } = get();
      set((state) => ({
        ...buildLeaveResetState(state),
        connectionStatus: state.connectionStatus,
      }));
      fetchRooms().catch((err) => {
        addClientLog(err instanceof Error ? err.message : "Failed to refresh rooms");
      });
      return;
    }
    case "roomState": {
      const current = get();
      if (!current.joined || current.leavingRoom) {
        return;
      }
      if (current.roomId && msg.roomId !== current.roomId) {
        return;
      }
      const prevMeta = get().roomMeta ?? defaultRoomMeta;
      const incomingMeta = msg.meta ?? ({} as RoomMeta);
      const incomingInitiative = incomingMeta.initiative;
      const nextReady = {
        P1:
          incomingMeta.ready?.P1 ??
          (incomingMeta as any).playersReady?.P1 ??
          prevMeta.ready.P1 ??
          false,
        P2:
          incomingMeta.ready?.P2 ??
          (incomingMeta as any).playersReady?.P2 ??
          prevMeta.ready.P2 ??
          false,
      };
      const nextPlayers = {
        P1: incomingMeta.players?.P1 ?? prevMeta.players.P1 ?? false,
        P2: incomingMeta.players?.P2 ?? prevMeta.players.P2 ?? false,
      };
      const nextInitiative = {
        P1:
          incomingInitiative && "P1" in incomingInitiative
            ? incomingInitiative.P1
            : prevMeta.initiative.P1 ?? null,
        P2:
          incomingInitiative && "P2" in incomingInitiative
            ? incomingInitiative.P2
            : prevMeta.initiative.P2 ?? null,
        winner:
          incomingInitiative && "winner" in incomingInitiative
            ? incomingInitiative.winner
            : prevMeta.initiative.winner ?? null,
      };
      const nextMeta: RoomMeta = {
        ready: nextReady,
        players: nextPlayers,
        spectators: incomingMeta.spectators ?? prevMeta.spectators ?? 0,
        phase: incomingMeta.phase ?? prevMeta.phase ?? "lobby",
        pendingRoll:
          incomingMeta.pendingRoll !== undefined
            ? incomingMeta.pendingRoll
            : prevMeta.pendingRoll ?? null,
        initiative: nextInitiative,
        placementFirstPlayer:
          incomingMeta.placementFirstPlayer !== undefined
            ? incomingMeta.placementFirstPlayer
            : prevMeta.placementFirstPlayer ?? null,
      };

      set(() => ({
        roomState: msg.view,
        roomId: msg.roomId,
        joined: true,
        hasSnapshot: true,
        role: msg.you.role,
        seat: msg.you.seat ?? null,
        isHost: msg.you.isHost,
        roomMeta: nextMeta,
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
          mode: msg.mode,
          modes: msg.modes,
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
      set((state) => ({
        ...buildLeaveResetState(
          state,
          state.joined ? "Disconnected" : undefined
        ),
        connectionStatus: "disconnected",
      }));
      const { fetchRooms, addClientLog } = get();
      fetchRooms().catch((err) => {
        addClientLog(err instanceof Error ? err.message : "Failed to refresh rooms");
      });
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
  seat: null,
  isHost: false,
  roomMeta: defaultRoomMeta,
  joinError: null,
  roomsList: [],
  roomState: null,
  hasSnapshot: false,
  hoveredAbilityId: null,
  hoverPreview: null,
  events: [],
  clientLog: [],
  lastLogIndex: -1,
  lastActionResult: null,
  lastActionResultAt: 0,
  selectedUnitId: null,
  actionMode: null,
  placeUnitId: null,
  moveOptions: null,
  leavingRoom: false,
  connect: async () => openSocket(set, get),
  fetchRooms: async () => {
    const rooms = await listRooms();
    set(() => ({ roomsList: rooms }));
  },
  joinRoom: async (params) => {
    set(() => ({ joinError: null }));
    const ws = await openSocket(set, get);
    const selection = loadFigureSetState(HERO_CATALOG).selection;
    sendJoinRoom(ws, { ...params, figureSet: selection });
  },
  leaveRoom: () => {
    const state = get();
    if (state.leavingRoom) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      set((current) => ({
        ...buildLeaveResetState(current, "Disconnected"),
        connectionStatus: "disconnected",
      }));
      return;
    }
    set(() => ({ leavingRoom: true }));
    sendLeaveRoom(socket);
  },
  setReady: (ready) => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (state.roomState?.phase !== "lobby") {
      state.addClientLog("Ready-up is only available in the lobby.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendSetReady(socket, ready);
  },
  startGame: () => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (state.roomState?.phase !== "lobby") {
      state.addClientLog("Game can only be started from the lobby.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendStartGame(socket);
  },
  resolvePendingRoll: (pendingRollId, choice) => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendResolvePendingRoll(socket, pendingRollId, choice);
  },
  switchRole: (role) => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendSwitchRole(socket, role);
  },
  sendAction: (action) => {
    const state = get();
    if (state.roomMeta?.pendingRoll && action.type !== "resolvePendingRoll") {
      state.addClientLog("Resolve the pending roll before acting.");
      return;
    }
    if (state.roomState?.phase === "lobby" && action.type !== "resolvePendingRoll") {
      state.addClientLog("Game has not started yet.");
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
  requestMoveOptions: (unitId, mode) => {
    const state = get();
    if (state.roomMeta?.pendingRoll) {
      state.addClientLog("Resolve the pending roll before acting.");
      return;
    }
    if (state.roomState?.phase === "lobby") {
      state.addClientLog("Game has not started yet.");
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
    sendMoveOptionsRequest(socket, unitId, mode);
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
  setHoverPreview: (preview) => set(() => ({ hoverPreview: preview })),
  resetGameState: () =>
    set(() => ({
      roomState: null,
      roomMeta: defaultRoomMeta,
      hasSnapshot: false,
      hoveredAbilityId: null,
      hoverPreview: null,
      events: [],
      clientLog: [],
      lastLogIndex: -1,
      lastActionResult: null,
      lastActionResultAt: 0,
      selectedUnitId: null,
      actionMode: null,
      placeUnitId: null,
      moveOptions: null,
      leavingRoom: false,
    })),
}));

export function getLocalPlayerId(role: PlayerRole | null): PlayerId | null {
  return roleToPlayerId(role);
}
