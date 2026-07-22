import { create } from "zustand";
import type {
  GameAction,
  GameEvent,
  PlayerView,
  Coord,
  PlayerId,
  MoveMode,
  ResolveRollChoice,
  GameModeId,
  AbilityUseSource,
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
  sendSetGameMode,
  sendSocketAction,
  sendStartGame,
  sendDraftBanHero,
  sendDraftPickHero,
  sendSwitchRole,
  sendTestRoomCommand as sendTestRoomCommandMessage,
  type PlayerRole,
  type RoomMeta,
  type ServerMessage,
} from "./ws";
import type { TestRoomCommand } from "./testRoom/types";
import {
  shouldResetLocalBoardUiForSnapshot,
  transitionActionMode,
  transitionMoveOptions,
  type TargetingMode,
} from "./game/selectionState";
import type { BoardEventBatch } from "./game/effects/types";
import { getPlayerIdForViewer } from "./game/pendingState";
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
  type RoomSession,
} from "./roomSession";

export type ActionMode =
  | "move"
  | "attack"
  | "place"
  | "dora"
  | "tisona"
  | "demonDuelist"
  | "invadeTime"
  | "assassinMark"
  | "guideTraveler"
  | "jebeHailOfArrows"
  | "jebeKhansShooter"
  | "asgoreFireball"
  | "asgoreFireParade"
  | "papyrusCoolGuy"
  | "hassanTrueEnemy"
  | "kaladinFifth"
  | "odinSleipnir"
  | "sansGasterBlaster"
  | "undyneSpearThrow"
  | "undyneEnergySpear"
  | "mettatonPoppins"
  | "mettatonLaser"
  | "gutsArbalet"
  | "gutsCannon"
  | "duolingoPush"
  | "lucheLightRay"
  | "zoroOniGiri"
  | "donReaction"
  | "donWindmills"
  | "jackTrap"
  | "jackHolyMother"
  | "artemisMoonInsight"
  | "artemisSilverSickle"
  | null;
export type ActionPreviewMode = Exclude<ActionMode, null>;
export type HoverPreview = { type: "actionMode"; mode: ActionPreviewMode } | null;

export type LokiLaughtOption =
  | "againSomeNonsense"
  | "chicken"
  | "mindControl"
  | "spinTheDrum"
  | "greatLokiJoke";

export interface PendingLokiLaughtOption {
  unitId: string;
  option: LokiLaughtOption;
  queuedAt: number;
}

const defaultRoomMeta: RoomMeta = {
  roomMode: "normal",
  gameMode: "standard",
  draftState: null,
  draftPool: [],
  revision: 0,
  diceQueue: [],
  debugLog: [],
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
  resumeToken: string | null;
  seat: PlayerId | null;
  isHost: boolean;
  canControlTestRoom: boolean;
  roomMeta: RoomMeta | null;
  joinError: string | null;
  roomsList: RoomSummary[];
  roomState: PlayerView | null;
  hasSnapshot: boolean;
  hoveredAbilityId: string | null;
  hoverPreview: HoverPreview;
  pendingLokiLaughtOption: PendingLokiLaughtOption | null;
  events: GameEvent[];
  latestEventBatch: BoardEventBatch | null;
  clientLog: string[];
  lastLogIndex: number;
  lastActionResult: { ok: boolean; error?: string } | null;
  lastActionResultAt: number;
  testRoomSnapshot: string | null;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  targetingMode: TargetingMode | null;
  placeUnitId: string | null;
  moveOptions: {
    unitId: string;
    roll?: number | null;
    legalTo: Coord[];
    mode?: MoveMode;
    modes?: MoveMode[];
  } | null;
  leavingRoom: boolean;
  connect: () => Promise<WebSocket>;
  resumeRoom: (options?: { force?: boolean }) => Promise<void>;
  fetchRooms: () => Promise<void>;
  joinRoom: (params: {
    mode: "create" | "join";
    roomId?: string;
    role: PlayerRole;
    name?: string;
    roomMode?: "normal" | "test";
    debugToken?: string;
  }) => Promise<void>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => void;
  setGameMode: (mode: GameModeId) => void;
  draftBanHero: (heroId: string) => void;
  draftPickHero: (heroId: string) => void;
  resolvePendingRoll: (pendingRollId: string, choice?: ResolveRollChoice) => void;
  switchRole: (role: PlayerRole) => void;
  sendAction: (action: GameAction) => void;
  sendTestRoomCommand: (command: TestRoomCommand) => void;
  requestMoveOptions: (unitId: string, mode?: MoveMode) => void;
  setRoomState: (roomId: string, room: PlayerView) => void;
  applyActionResult: (events: GameEvent[], logIndex: number, error?: string) => void;
  addEvents: (events: GameEvent[]) => void;
  addClientLog: (message: string) => void;
  setSelectedUnit: (unitId: string | null) => void;
  setActionMode: (mode: ActionMode, useSource?: AbilityUseSource) => void;
  setPlaceUnitId: (unitId: string | null) => void;
  setMoveOptions: (
    options: {
      unitId: string;
      roll?: number | null;
      legalTo: Coord[];
      mode?: MoveMode;
      modes?: MoveMode[];
    } | null,
  ) => void;
  setHoveredAbilityId: (abilityId: string | null) => void;
  setHoverPreview: (preview: HoverPreview) => void;
  queueLokiLaughtOption: (unitId: string, option: LokiLaughtOption) => void;
  clearLokiLaughtOption: () => void;
  replayLastEffects: () => void;
  resetGameState: () => void;
}

function buildLeaveResetState(
  state: GameStore,
  message?: string,
  preserveRoomSession = false,
): Partial<GameStore> {
  const clientLog = message ? [...state.clientLog, message].slice(-50) : state.clientLog;
  return {
    joined: false,
    roomId: preserveRoomSession ? state.roomId : null,
    role: preserveRoomSession ? state.role : null,
    resumeToken: preserveRoomSession ? state.resumeToken : null,
    seat: preserveRoomSession ? state.seat : null,
    isHost: false,
    canControlTestRoom: false,
    roomMeta: defaultRoomMeta,
    joinError: null,
    roomState: null,
    hasSnapshot: false,
    hoveredAbilityId: null,
    hoverPreview: null,
    pendingLokiLaughtOption: null,
    events: [],
    latestEventBatch: null,
    clientLog,
    lastLogIndex: -1,
    lastActionResult: null,
    lastActionResultAt: 0,
    testRoomSnapshot: null,
    selectedUnitId: null,
    actionMode: null,
    targetingMode: null,
    placeUnitId: null,
    moveOptions: null,
    leavingRoom: false,
  };
}

function buildLocalBoardUiResetState(): Partial<GameStore> {
  return {
    hoveredAbilityId: null,
    hoverPreview: null,
    pendingLokiLaughtOption: null,
    actionMode: null,
    targetingMode: null,
    placeUnitId: null,
    moveOptions: null,
  };
}

let socket: WebSocket | null = null;
let connectPromise: Promise<WebSocket> | null = null;
let reconnectPromise: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let suppressAutoReconnect = false;
let intentionalLeave = false;
const initialRoomSession = loadRoomSession();

function roomSessionFromState(state: GameStore): RoomSession | null {
  if (state.roomId && state.role && state.resumeToken) {
    return {
      roomId: state.roomId,
      role: state.role,
      seat: state.seat,
      resumeToken: state.resumeToken,
    };
  }
  return loadRoomSession();
}

function handleServerMessage(
  msg: ServerMessage,
  set: (fn: (state: GameStore) => Partial<GameStore>) => void,
  get: () => GameStore,
) {
  switch (msg.type) {
    case "joinAck": {
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const resumeToken = msg.resumeToken ?? get().resumeToken;
      if (resumeToken) {
        saveRoomSession({
          roomId: msg.roomId,
          role: msg.role,
          seat: msg.seat ?? null,
          resumeToken,
        });
      }
      set(() => ({
        joined: true,
        roomId: msg.roomId,
        role: msg.role,
        resumeToken: resumeToken ?? null,
        seat: msg.seat ?? null,
        isHost: msg.isHost,
        joinError: null,
        leavingRoom: false,
      }));
      return;
    }
    case "joinRejected": {
      clearRoomSession();
      set(() => ({
        joined: false,
        roomId: null,
        role: null,
        resumeToken: null,
        seat: null,
        isHost: false,
        canControlTestRoom: false,
        roomMeta: defaultRoomMeta,
        joinError: msg.message,
        roomState: null,
        hasSnapshot: false,
        pendingLokiLaughtOption: null,
        leavingRoom: false,
      }));
      return;
    }
    case "leftRoom": {
      clearRoomSession();
      intentionalLeave = false;
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
            : (prevMeta.initiative.P1 ?? null),
        P2:
          incomingInitiative && "P2" in incomingInitiative
            ? incomingInitiative.P2
            : (prevMeta.initiative.P2 ?? null),
        winner:
          incomingInitiative && "winner" in incomingInitiative
            ? incomingInitiative.winner
            : (prevMeta.initiative.winner ?? null),
      };
      const nextMeta: RoomMeta = {
        roomMode: incomingMeta.roomMode ?? prevMeta.roomMode ?? "normal",
        gameMode: incomingMeta.gameMode ?? prevMeta.gameMode ?? "standard",
        draftState:
          incomingMeta.draftState !== undefined
            ? incomingMeta.draftState
            : (prevMeta.draftState ?? null),
        draftPool: incomingMeta.draftPool ?? prevMeta.draftPool ?? [],
        revision: incomingMeta.revision ?? prevMeta.revision ?? 0,
        diceQueue: incomingMeta.diceQueue ?? prevMeta.diceQueue ?? [],
        debugLog: incomingMeta.debugLog ?? prevMeta.debugLog ?? [],
        ready: nextReady,
        players: nextPlayers,
        spectators: incomingMeta.spectators ?? prevMeta.spectators ?? 0,
        phase: incomingMeta.phase ?? prevMeta.phase ?? "lobby",
        pendingRoll:
          incomingMeta.pendingRoll !== undefined
            ? incomingMeta.pendingRoll
            : (prevMeta.pendingRoll ?? null),
        initiative: nextInitiative,
        placementFirstPlayer:
          incomingMeta.placementFirstPlayer !== undefined
            ? incomingMeta.placementFirstPlayer
            : (prevMeta.placementFirstPlayer ?? null),
      };
      const previousView = current.roomState;
      const lifecycleChanged =
        !previousView ||
        previousView.currentPlayer !== msg.view.currentPlayer ||
        previousView.roundNumber !== msg.view.roundNumber ||
        previousView.turnNumber !== msg.view.turnNumber ||
        previousView.activeUnitId !== msg.view.activeUnitId;
      const selectedUnitId =
        current.selectedUnitId && msg.view.units[current.selectedUnitId]
          ? current.selectedUnitId
          : null;
      const selectionLost = !!current.selectedUnitId && !selectedUnitId;
      const queuedLokiOption = current.pendingLokiLaughtOption;
      const pendingLokiContext = msg.view.pendingRoll?.context as
        | { lokiId?: unknown }
        | undefined;
      const preserveQueuedLokiOption = !!(
        queuedLokiOption &&
        msg.view.pendingRoll?.kind === "lokiLaughtChoice" &&
        pendingLokiContext?.lokiId === queuedLokiOption.unitId
      );

      set(() => ({
        roomState: msg.view,
        roomId: msg.roomId,
        joined: true,
        hasSnapshot: true,
        role: msg.you.role,
        seat: msg.you.seat ?? null,
        isHost: msg.you.isHost,
        canControlTestRoom: msg.you.canControlTestRoom ?? false,
        roomMeta: nextMeta,
        selectedUnitId,
        ...(shouldResetLocalBoardUiForSnapshot({
          lifecycleChanged,
          selectionLost,
          view: msg.view,
          metaPendingRoll: nextMeta.pendingRoll,
        })
          ? buildLocalBoardUiResetState()
          : {}),
        ...(preserveQueuedLokiOption
          ? { pendingLokiLaughtOption: queuedLokiOption }
          : {}),
      }));
      const resumeToken = get().resumeToken;
      if (resumeToken) {
        saveRoomSession({
          roomId: msg.roomId,
          role: msg.you.role,
          seat: msg.you.seat ?? null,
          resumeToken,
        });
      }
      return;
    }
    case "testRoomSnapshot": {
      set(() => ({
        testRoomSnapshot: JSON.stringify(msg.snapshot, null, 2),
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
      const moveOptions = {
        unitId: msg.unitId,
        roll: msg.roll,
        legalTo: msg.legalTo,
        mode: msg.mode,
        modes: msg.modes,
      };
      set((state) => transitionMoveOptions(state, moveOptions));
      return;
    }
    case "error": {
      get().addClientLog(msg.code ?? msg.message);
      return;
    }
    default:
      return;
  }
}

function openSocket(
  set: (fn: (state: GameStore) => Partial<GameStore>) => void,
  get: () => GameStore,
) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(socket);
  }

  if (connectPromise) return connectPromise;

  set(() => ({ connectionStatus: "connecting" }));
  const openedSocket = connectGameSocket((msg) => handleServerMessage(msg, set, get));
  socket = openedSocket;

  connectPromise = new Promise((resolve, reject) => {
    openedSocket.onopen = () => {
      if (socket !== openedSocket) return;
      set(() => ({ connectionStatus: "connected" }));
      resolve(openedSocket);
    };

    openedSocket.onclose = () => {
      if (socket !== openedSocket) return;
      connectPromise = null;
      socket = null;
      set((state) => ({
        ...buildLeaveResetState(state, state.joined ? "Disconnected" : undefined, true),
        connectionStatus: "disconnected",
      }));
      const { fetchRooms, addClientLog } = get();
      fetchRooms().catch((err) => {
        addClientLog(err instanceof Error ? err.message : "Failed to refresh rooms");
      });
      if (!suppressAutoReconnect && !intentionalLeave && loadRoomSession()) {
        const delay = Math.min(500 * 2 ** reconnectAttempts, 10_000);
        reconnectAttempts += 1;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void get().resumeRoom();
        }, delay);
      }
    };

    openedSocket.onerror = (err) => {
      if (socket !== openedSocket) return;
      connectPromise = null;
      set(() => ({ connectionStatus: "disconnected" }));
      reject(err);
    };
  });

  return connectPromise;
}

async function closeSocketForReconnect(): Promise<void> {
  const activeSocket = socket;
  if (!activeSocket || activeSocket.readyState === WebSocket.CLOSED) {
    socket = null;
    connectPromise = null;
    return;
  }

  suppressAutoReconnect = true;
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (socket === activeSocket) {
        socket = null;
        connectPromise = null;
      }
      resolve();
    };
    activeSocket.addEventListener("close", finish, { once: true });
    activeSocket.close(4000, "Refresh room snapshot");
    setTimeout(finish, 1_000);
  });
  suppressAutoReconnect = false;
}

export const useGameStore = create<GameStore>((set, get) => ({
  connectionStatus: "disconnected",
  joined: false,
  roomId: initialRoomSession?.roomId ?? null,
  role: initialRoomSession?.role ?? null,
  resumeToken: initialRoomSession?.resumeToken ?? null,
  seat: initialRoomSession?.seat ?? null,
  isHost: false,
  canControlTestRoom: false,
  roomMeta: defaultRoomMeta,
  joinError: null,
  roomsList: [],
  roomState: null,
  hasSnapshot: false,
  hoveredAbilityId: null,
  hoverPreview: null,
  pendingLokiLaughtOption: null,
  events: [],
  latestEventBatch: null,
  clientLog: [],
  lastLogIndex: -1,
  lastActionResult: null,
  lastActionResultAt: 0,
  testRoomSnapshot: null,
  selectedUnitId: null,
  actionMode: null,
  targetingMode: null,
  placeUnitId: null,
  moveOptions: null,
  leavingRoom: false,
  connect: async () => openSocket(set, get),
  resumeRoom: async (options) => {
    if (reconnectPromise) return reconnectPromise;
    const session = roomSessionFromState(get());
    if (!session) return;

    reconnectPromise = (async () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (options?.force) await closeSocketForReconnect();
      const ws = await openSocket(set, get);
      const selection = loadFigureSetState(HERO_CATALOG).selection;
      sendJoinRoom(ws, {
        mode: "join",
        roomId: session.roomId,
        role: session.role,
        figureSet: selection,
        resumeToken: session.resumeToken,
      });
    })();

    try {
      await reconnectPromise;
    } catch (error) {
      get().addClientLog(error instanceof Error ? error.message : "Failed to reconnect to room");
    } finally {
      reconnectPromise = null;
    }
  },
  fetchRooms: async () => {
    const rooms = await listRooms();
    set(() => ({ roomsList: rooms }));
  },
  joinRoom: async (params) => {
    intentionalLeave = false;
    set(() => ({ joinError: null }));
    const ws = await openSocket(set, get);
    const selection = loadFigureSetState(HERO_CATALOG).selection;
    const resumeToken = get().resumeToken ?? undefined;
    sendJoinRoom(ws, { ...params, figureSet: selection, resumeToken });
  },
  leaveRoom: () => {
    const state = get();
    if (state.leavingRoom) return;
    intentionalLeave = true;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      clearRoomSession();
      set((current) => ({
        ...buildLeaveResetState(current, "Disconnected"),
        connectionStatus: "disconnected",
      }));
      intentionalLeave = false;
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
    if (state.roomMeta?.draftState) {
      state.addClientLog("Ready-up is locked after draft starts.");
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
  setGameMode: (mode) => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (!state.isHost) {
      state.addClientLog("Only the host can change game mode.");
      return;
    }
    if (
      state.roomState?.phase !== "lobby" ||
      state.roomMeta?.pendingRoll ||
      state.roomMeta?.draftState
    ) {
      state.addClientLog("Game mode is locked.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendSetGameMode(socket, mode);
  },
  draftBanHero: (heroId) => {
    const state = get();
    if (!state.joined || !state.roomMeta?.draftState) {
      state.addClientLog("Draft is not active.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendDraftBanHero(socket, heroId);
  },
  draftPickHero: (heroId) => {
    const state = get();
    if (!state.joined || !state.roomMeta?.draftState) {
      state.addClientLog("Draft is not active.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendDraftPickHero(socket, heroId);
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
  sendTestRoomCommand: (command) => {
    const state = get();
    if (!state.joined || !state.canControlTestRoom) {
      state.addClientLog("Sandbox controls are not available.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    sendTestRoomCommandMessage(socket, command);
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
    set((state) => {
      const previousView = state.roomState;
      const lifecycleChanged =
        !previousView ||
        state.roomId !== roomId ||
        previousView.currentPlayer !== room.currentPlayer ||
        previousView.roundNumber !== room.roundNumber ||
        previousView.turnNumber !== room.turnNumber ||
        previousView.activeUnitId !== room.activeUnitId;
      const selectedUnitId =
        state.selectedUnitId && room.units[state.selectedUnitId] ? state.selectedUnitId : null;
      const selectionLost = !!state.selectedUnitId && !selectedUnitId;
      return {
        roomId,
        roomState: room,
        joined: true,
        hasSnapshot: true,
        selectedUnitId,
        ...(shouldResetLocalBoardUiForSnapshot({
          lifecycleChanged,
          selectionLost,
          view: room,
        })
          ? buildLocalBoardUiResetState()
          : {}),
      };
    }),
  applyActionResult: (events, logIndex, error) =>
    set((state) => {
      if (logIndex <= state.lastLogIndex) {
        return error ? { clientLog: [...state.clientLog, error] } : {};
      }
      return {
        events: [...state.events, ...events].slice(-200),
        latestEventBatch: { logIndex, events },
        lastLogIndex: logIndex,
        clientLog: error ? [...state.clientLog, error] : state.clientLog,
      };
    }),
  addEvents: (events) => set((state) => ({ events: [...state.events, ...events].slice(-200) })),
  addClientLog: (message) =>
    set((state) => ({ clientLog: [...state.clientLog, message].slice(-50) })),
  setSelectedUnit: (unitId) =>
    set(() => ({
      selectedUnitId: unitId,
      actionMode: null,
      targetingMode: null,
      moveOptions: null,
      hoveredAbilityId: null,
      hoverPreview: null,
      pendingLokiLaughtOption: null,
    })),
  setActionMode: (mode, useSource) =>
    set((state) => ({
      ...transitionActionMode(state, mode, useSource),
      hoveredAbilityId: null,
      hoverPreview: null,
    })),
  setPlaceUnitId: (unitId) => set(() => ({ placeUnitId: unitId })),
  setMoveOptions: (options) => set((state) => transitionMoveOptions(state, options)),
  setHoveredAbilityId: (abilityId) => set(() => ({ hoveredAbilityId: abilityId })),
  setHoverPreview: (preview) => set(() => ({ hoverPreview: preview })),
  queueLokiLaughtOption: (unitId, option) =>
    set(() => ({ pendingLokiLaughtOption: { unitId, option, queuedAt: Date.now() } })),
  clearLokiLaughtOption: () => set(() => ({ pendingLokiLaughtOption: null })),
  replayLastEffects: () =>
    set((state) =>
      state.latestEventBatch
        ? {
            latestEventBatch: {
              logIndex: Date.now(),
              events: [...state.latestEventBatch.events],
            },
          }
        : {},
    ),
  resetGameState: () =>
    set(() => ({
      roomState: null,
      roomMeta: defaultRoomMeta,
      hasSnapshot: false,
      hoveredAbilityId: null,
      hoverPreview: null,
      pendingLokiLaughtOption: null,
      events: [],
      latestEventBatch: null,
      clientLog: [],
      lastLogIndex: -1,
      lastActionResult: null,
      lastActionResultAt: 0,
      testRoomSnapshot: null,
      selectedUnitId: null,
      actionMode: null,
      targetingMode: null,
      placeUnitId: null,
      moveOptions: null,
      leavingRoom: false,
    })),
}));

export function getLocalPlayerId(
  role: PlayerRole | null,
  seat: PlayerId | null = null,
): PlayerId | null {
  return getPlayerIdForViewer(role, seat);
}
