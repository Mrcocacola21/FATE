import { queue as matchmakingQueue } from "./matchmaking/store";
import type { MatchType } from "./matches/matchType";
import { create } from "zustand";
import type {
  GameAction,
  LokiLaughtOption as RulesLokiLaughtOption,
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
import { PresentationSession, MAX_PRESENTATION_BATCHES } from "./game/effects/presentationSession";
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
  | "lucheLightRayAround"
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

export type LokiLaughtOption = RulesLokiLaughtOption;

export interface PendingLokiLaughtOption {
  unitId: string;
  option: LokiLaughtOption;
  queuedAt: number;
}

const defaultRoomMeta: RoomMeta = {
  roomMode: "normal",
  matchType: "CASUAL",
  gameMode: "standard",
  draftState: null,
  draftPool: [],
  revision: 0,
  diceQueue: [],
  debugLog: [],
  ready: { P1: false, P2: false },
  players: { P1: false, P2: false },
  playerNames: { P1: null, P2: null },
  spectators: 0,
  phase: "lobby",
  pendingRoll: null,
  initiative: { P1: null, P2: null, winner: null },
  placementFirstPlayer: null,
};

interface GameStore {
  presentationSessionKey: string;
  presentationHydration: "awaitingBaseline" | "live";
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
  pendingEventBatches: BoardEventBatch[];
  eventStreamId: string | null;
  acknowledgeEventBatches: (batches: BoardEventBatch[]) => void;
  clientLog: string[];
  lastEventRevision: number;
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
    lobbyName?: string;
    gameMode?: GameModeId;
    mode: "create" | "join";
    roomId?: string;
    role: PlayerRole;
    name?: string;
    roomMode?: "normal" | "test";
    matchType?: MatchType;
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
  applyActionResult: (events: import("rules").DeliveredGameEvent[], revision: number, streamId: string, error?: string) => void;
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

export const presentationSession = new PresentationSession((reason, metadata) => {
  if (import.meta.env?.DEV) console.debug(`[presentation] ${reason}`, metadata);
});

function recipientIdentity(role: PlayerRole | null, seat: PlayerId | null, controller = false): string {
  return JSON.stringify([role, seat, controller]);
}

function beginPresentation(roomId: string | null, role: PlayerRole | null, seat: PlayerId | null = null): Partial<GameStore> {
  presentationSession.begin({ roomId, recipient: recipientIdentity(role, seat) });
  return presentationResetState();
}

function presentationResetState(): Partial<GameStore> {
  return {
    presentationSessionKey: presentationSession.key,
    presentationHydration: presentationSession.hydration,
    events: [], latestEventBatch: null, pendingEventBatches: [],
    eventStreamId: null, lastEventRevision: -1,
  };
}

function appendPresentationBatches(state: GameStore, batches: BoardEventBatch[]): Partial<GameStore> {
  return {
    presentationSessionKey: presentationSession.key,
    presentationHydration: presentationSession.hydration,
    eventStreamId: presentationSession.streamId,
    lastEventRevision: presentationSession.highestReceivedRevision,
    ...(batches.length ? {
      events: [...state.events, ...batches.flatMap(batch => batch.events)].slice(-200),
      latestEventBatch: batches[batches.length - 1],
      pendingEventBatches: [...state.pendingEventBatches, ...batches].slice(-MAX_PRESENTATION_BATCHES),
    } : {}),
  };
}

function buildLeaveResetState(
  state: GameStore,
  message?: string,
  preserveRoomSession = false,
): Partial<GameStore> {
  const clientLog = message ? [...state.clientLog, message].slice(-50) : state.clientLog;
  return {
    ...beginPresentation(preserveRoomSession ? state.roomId : null, preserveRoomSession ? state.role : null),
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
    pendingEventBatches: [],
    eventStreamId: null,
    clientLog,
    lastEventRevision: -1,
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

import { authStore } from "./auth/authStore";
import { multiplayerAccessToken, redirectToMultiplayerLogin } from "./auth/multiplayerAuth";
import { ApiError } from "./api/client";

let socket: WebSocket | null = null;
let subscription: { socket: WebSocket; userId: string; promise: Promise<void>; active: boolean; requestId: string } | null = null;
const subscriptionRequests = new Map<string, { resolve(): void; reject(error: Error): void }>();
export async function subscribeMatchmaking(): Promise<void> {
  const owner = authStore.getState().user?.id;
  const accessToken = await authStore.getState().getValidAccessToken();
  if (!owner || !accessToken || authStore.getState().user?.id !== owner) throw new ApiError("AUTH_REQUIRED");
  const ws = await useGameStore.getState().connect();
  if (subscription?.socket === ws && subscription.userId === owner) return subscription.promise;
  matchmakingQueue.newConnection();
  const requestId = crypto.randomUUID();
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { subscriptionRequests.delete(requestId); reject(new ApiError("NETWORK_ERROR")); }, 10000);
    subscriptionRequests.set(requestId, {
      resolve: () => { clearTimeout(timer); subscriptionRequests.delete(requestId); resolve(); },
      reject: error => { clearTimeout(timer); subscriptionRequests.delete(requestId); reject(error); },
    });
    ws.send(JSON.stringify({ type: "matchmakingSubscribe", accessToken, requestId }));
  });
  subscription = { socket: ws, userId: owner, promise, active: false, requestId };
  void promise.catch(() => { if (subscription?.promise === promise) subscription = null; });
  return promise;
}
export function unsubscribeMatchmaking(): void {
  if (subscription?.socket.readyState === WebSocket.OPEN)
    subscription.socket.send(JSON.stringify({ type: "matchmakingUnsubscribe" }));
  subscription = null;
}
let connectPromise: Promise<WebSocket> | null = null;
let reconnectPromise: Promise<void> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let suppressAutoReconnect = false;
let intentionalLeave = false;
// Persisted room identity is loaded on demand by resumeRoom, never on module import.
// Information/replay pages import the shared shell store without touching seat tokens.

function roomSessionFromState(state: GameStore): RoomSession | null {
  if (state.roomId && state.role && state.resumeToken) {
    return {
      roomId: state.roomId,
      role: state.role,
      seat: state.seat,
      resumeToken: state.resumeToken,
      roomMode: state.joined ? state.roomMeta?.roomMode
        : loadRoomSession()?.roomMode ?? state.roomMeta?.roomMode,
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
    case "matchmakingStatus":
    case "matchmakingFound":
      if (subscription?.active && subscription.userId === authStore.getState().user?.id)
        matchmakingQueue.event(msg);
      return;
    case "matchmakingSubscribed":
      if (subscription?.requestId === msg.requestId) subscription.active = true;
      subscriptionRequests.get(msg.requestId)?.resolve(); return;
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
          roomMode: msg.roomMode ?? "normal",
        });
      }
      set(() => ({
        ...beginPresentation(msg.roomId, msg.role, msg.seat ?? null),
        roomState: null,
        roomMeta: defaultRoomMeta,
        testRoomSnapshot: null,
        hasSnapshot: false,
        selectedUnitId: null,
        ...buildLocalBoardUiResetState(),
        joined: true,
        roomId: msg.roomId,
        role: msg.role,
        resumeToken: resumeToken ?? null,
        seat: msg.seat ?? null,
        isHost: msg.isHost,
        canControlTestRoom: false,
        joinError: null,
        leavingRoom: false,
      }));
      return;
    }
    case "joinRejected": {
      if (msg.reason === "match_interrupted") suppressAutoReconnect = true;
      clearRoomSession();
      set(() => ({
        ...beginPresentation(null, null),
        joined: false,
        roomId: null,
        role: null,
        resumeToken: null,
        seat: null,
        isHost: false,
        canControlTestRoom: false,
        roomMeta: defaultRoomMeta,
        joinError: msg.reason === "match_interrupted" ? "MATCH_INTERRUPTED" : msg.message,
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
        P1: incomingMeta.ready?.P1 ?? incomingMeta.playersReady?.P1 ?? prevMeta.ready.P1 ?? false,
        P2: incomingMeta.ready?.P2 ?? incomingMeta.playersReady?.P2 ?? prevMeta.ready.P2 ?? false,
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
        lobbyName: incomingMeta.lobbyName,
        origin: incomingMeta.origin,
        ratedCompatibility: incomingMeta.ratedCompatibility,
        roomMode: incomingMeta.roomMode ?? prevMeta.roomMode ?? "normal",
        matchType: incomingMeta.matchType ?? "CASUAL",
        gameMode: incomingMeta.gameMode ?? prevMeta.gameMode ?? "standard",
        gameModeLocked: incomingMeta.gameModeLocked ?? prevMeta.gameModeLocked ?? false,
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
        playerNames: incomingMeta.playerNames ?? prevMeta.playerNames ?? { P1: null, P2: null },
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
      const pendingLokiContext = msg.view.pendingRoll?.context as { lokiId?: unknown } | undefined;
      const preserveQueuedLokiOption = !!(
        queuedLokiOption &&
        msg.view.pendingRoll?.kind === "lokiLaughtChoice" &&
        pendingLokiContext?.lokiId === queuedLokiOption.unitId
      );

      const generation = presentationSession.generation;
      const batches = presentationSession.snapshot({
        roomId: msg.roomId, streamId: msg.streamId, revision: incomingMeta.revision,
        recipient: recipientIdentity(msg.you.role, msg.you.seat ?? null, msg.you.canControlTestRoom),
        view: msg.view,
      });
      const presentationReset = generation !== presentationSession.generation ? presentationResetState() : {};

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
        ...(preserveQueuedLokiOption ? { pendingLokiLaughtOption: queuedLokiOption } : {}),
        ...presentationReset,
        ...appendPresentationBatches({ ...current, ...presentationReset }, batches),
      }));
      const resumeToken = get().resumeToken;
      if (resumeToken) {
        saveRoomSession({
          roomId: msg.roomId,
          role: msg.you.role,
          seat: msg.you.seat ?? null,
          resumeToken,
          roomMode: nextMeta.roomMode,
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
        if (msg.streamId && msg.revision !== undefined) {
          applyActionResult(msg.events, msg.revision, msg.streamId);
        }
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
      if (["INVALID_LOBBY_NAME", "INVALID_MATCH_TYPE", "RATED_MATCH_REQUIRES_AUTHENTICATION"].includes(msg.code ?? ""))
        set(() => ({ joinError: msg.code ?? msg.message }));
      if (["AUTH_REQUIRED", "INVALID_ACCESS_TOKEN", "RESUME_IDENTITY_MISMATCH", "INVALID_RESUME_TOKEN", "SEAT_CONNECTION_REPLACED", "SEAT_OWNED_BY_ANOTHER_USER", "MATCHMAKING_IN_QUEUE", "MATCHMAKING_ALREADY_IN_MATCH"].includes(msg.code ?? "")) {
        suppressAutoReconnect = true;
        set(() => ({ joinError: msg.message }));
      }
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

  set((state) => ({ ...beginPresentation(state.roomId, state.role, state.seat), connectionStatus: "connecting" }));
  const openedSocket = connectGameSocket((msg) => { if (socket === openedSocket) handleServerMessage(msg, set, get); });
  socket = openedSocket;

  connectPromise = new Promise((resolve, reject) => {
    openedSocket.onopen = () => {
      if (socket !== openedSocket) return;
      set(() => ({ connectionStatus: "connected" }));
      resolve(openedSocket);
      // Matchmaking may reopen the shared socket before the room retry fires.
      // An earlier failed socket's close callback can then be stale; restore the
      // retained room session once this successful connection has settled.
      if (!suppressAutoReconnect && !intentionalLeave && get().roomId && !get().joined) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void get().resumeRoom();
        }, 0);
      }
    };

    openedSocket.onclose = () => {
      if (socket !== openedSocket) return;
      connectPromise = null;
      socket = null;
      subscription = null;
      for (const pending of subscriptionRequests.values()) pending.reject(new ApiError("NETWORK_ERROR"));
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
      set((state) => ({ ...beginPresentation(state.roomId, state.role, state.seat), connectionStatus: "disconnected" }));
      reject(err);
    };
  });

  return connectPromise;
}

async function closeSocketForReconnect(): Promise<void> {
  const state = useGameStore.getState();
  useGameStore.setState(beginPresentation(state.roomId, state.role, state.seat));
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
  presentationSessionKey: presentationSession.key,
  presentationHydration: "awaitingBaseline",
  connectionStatus: "disconnected",
  joined: false,
  roomId: null,
  role: null,
  resumeToken: null,
  seat: null,
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
  pendingEventBatches: [],
  eventStreamId: null,
  clientLog: [],
  lastEventRevision: -1,
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
    if (get().joined && socket?.readyState === WebSocket.OPEN &&
      (!options?.force || authStore.getState().status !== "authenticated")) return;
    const session = roomSessionFromState(get());
    if (!session) return;

    reconnectPromise = (async () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const accessToken = await multiplayerAccessToken(authStore, session.role, session.roomMode);
      suppressAutoReconnect = false;
      if (options?.force) await closeSocketForReconnect();
      const ws = await openSocket(set, get);
      const selection = loadFigureSetState(HERO_CATALOG).selection;
      set(() => beginPresentation(session.roomId, session.role, session.seat));
      sendJoinRoom(ws, {
        mode: "join",
        roomId: session.roomId,
        role: session.role,
        figureSet: selection,
        resumeToken: session.resumeToken,
        accessToken,
      });
    })();

    try {
      await reconnectPromise;
    } catch (error) {
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        suppressAutoReconnect = true;
        set(() => ({ joinError: "Sign in to resume your player seat" }));
        redirectToMultiplayerLogin();
      }
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
    let accessToken: string | undefined;
    try {
      const mode = params.mode === "create" ? params.roomMode
        : params.roomMode ?? get().roomsList.find((room) => room.id === params.roomId)?.roomMode;
      accessToken = await multiplayerAccessToken(authStore, params.role, mode);
    } catch (error) {
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        set(() => ({ joinError: "Sign in to occupy a player seat" }));
        redirectToMultiplayerLogin();
        return;
      }
      throw error;
    }
    suppressAutoReconnect = false;
    intentionalLeave = false;
    set(() => ({ joinError: null }));
    const ws = await openSocket(set, get);
    const selection = loadFigureSetState(HERO_CATALOG).selection;
    const resumeToken = params.roomId === get().roomId ? get().resumeToken ?? undefined : undefined;
    set(() => ({ ...beginPresentation(params.roomId ?? null, params.role), joined: false }));
    sendJoinRoom(ws, { ...params, figureSet: selection, resumeToken, accessToken });
  },
  leaveRoom: () => {
    const state = get();
    if (state.leavingRoom) return;
    intentionalLeave = true;
    set(() => beginPresentation(null, null));
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
    if (!state.canControlTestRoom && state.roomState?.pendingDecision?.viewerCanRespond === false) {
      state.addClientLog("Waiting for your opponent to finish their decision.");
      return;
    }
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
  switchRole: async (role) => {
    const state = get();
    if (!state.joined) {
      state.addClientLog("Not joined yet. Please join a room first.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      state.addClientLog("WebSocket not connected.");
      return;
    }
    const currentSocket = socket;
    try {
      const accessToken = await multiplayerAccessToken(authStore, role, state.roomMeta?.roomMode);
      if (socket === currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        set(() => beginPresentation(state.roomId, state.role, state.seat));
        sendSwitchRole(currentSocket, role, accessToken);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
        set(() => ({ joinError: "Sign in to occupy a player seat" }));
        redirectToMultiplayerLogin();
      } else state.addClientLog("Unable to authenticate player seat");
    }
  },
  sendAction: (action) => {
    const state = get();
    if (
      !state.canControlTestRoom &&
      (state.roomState?.pendingDecision?.viewerCanRespond === false ||
        (state.roomMeta?.pendingRoll &&
          state.roomMeta.pendingRoll.player !== getPlayerIdForViewer(state.role, state.seat)))
    ) {
      state.addClientLog("Waiting for your opponent to finish their decision.");
      return;
    }
    if (state.roomState?.phase === "ended") {
      state.addClientLog("Game is already over.");
      return;
    }
    if (
      (state.roomState?.pendingDecision || state.roomMeta?.pendingRoll) &&
      action.type !== "resolvePendingRoll"
    ) {
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
    if (!state.canControlTestRoom && state.roomState?.pendingDecision?.viewerCanRespond === false) {
      state.addClientLog("Waiting for your opponent to finish their decision.");
      return;
    }
    if (state.roomState?.phase === "ended") {
      state.addClientLog("Game is already over.");
      return;
    }
    if (state.roomState?.pendingDecision || state.roomMeta?.pendingRoll) {
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
  applyActionResult: (events, revision, streamId, error) =>
    set((state) => {
      if (!state.joined || state.leavingRoom) return {};
      const batches = presentationSession.receive({ streamId, revision, events }, {
        roomId: state.roomId,
        recipient: recipientIdentity(state.role, state.seat, state.canControlTestRoom),
      }, presentationSession.hydration === "live" ? state.roomState ?? undefined : undefined);
      return {
        ...appendPresentationBatches(state, batches),
        clientLog: error ? [...state.clientLog, error] : state.clientLog,
      };
    }),
  acknowledgeEventBatches: (batches) => set((state) => ({
    pendingEventBatches: state.pendingEventBatches.filter((batch) => !batches.includes(batch)),
  })),
  addEvents: (events) => set((state) => ({ events: [...state.events, ...events].slice(-200) })),
  addClientLog: (message) =>
    set((state) =>
      message === "Waiting for your opponent to finish their decision." &&
      state.clientLog[state.clientLog.length - 1] === message
        ? {}
        : { clientLog: [...state.clientLog, message].slice(-50) },
    ),
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
    set((state) => {
      if (!state.latestEventBatch) return {};
      const batch: BoardEventBatch = {
        ...state.latestEventBatch,
        previewId: `preview:${crypto.randomUUID()}`,
        receivedAt: Date.now(),
        presentationToken: presentationSession.token,
        view: state.roomState ?? undefined,
      };
      if (presentationSession.hydration !== "live") return {};
      return { pendingEventBatches: [...state.pendingEventBatches, batch].slice(-MAX_PRESENTATION_BATCHES) };
    }),
  resetGameState: () =>
    set(() => ({
      ...beginPresentation(null, null),
      roomState: null,
      roomMeta: defaultRoomMeta,
      hasSnapshot: false,
      hoveredAbilityId: null,
      hoverPreview: null,
      pendingLokiLaughtOption: null,
      events: [],
      latestEventBatch: null,
      pendingEventBatches: [],
      eventStreamId: null,
      clientLog: [],
      lastEventRevision: -1,
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
