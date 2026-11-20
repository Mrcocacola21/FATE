import type { MatchmakingEvent } from "./matchmaking/types";
import type { MatchType } from "./matches/matchType";
import type { UserEvent } from "./api/notificationApi";
import type {
  GameAction,
  DeliveredGameEvent,
  PlayerId,
  PlayerView,
  PendingRollContext,
  Coord,
  RollKind,
  GamePhase,
  MoveMode,
  ResolveRollChoice,
  GameModeId,
  DraftChoice,
  DraftLockReason,
  DraftOrderStep,
  DraftState,
  HeroDraftMeta,
} from "rules";
import { getWsUrl } from "./api";
import type { FigureSetSelection } from "./figures/types";
import type { TestRoomCommand } from "./testRoom/types";

export type PlayerRole = PlayerId | "spectator";

export type RoomMeta = {
  lobbyName?: string;
  origin?: "MANUAL" | "MATCHMAKING";
  ratedCompatibility?: import("./api").RatedCompatibility | null;
  /** The server bot's seat and difficulty in a match against the bot. */
  bot?: { seat: PlayerId; difficulty: import("./play/PlaySigils").BotDifficulty } | null;
  gameModeLocked?: boolean;
  matchType: MatchType;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
  draftState: DraftState | null;
  draftPool: HeroDraftMeta[];
  /** Every ban and pick with its player, from the server. */
  draftOrder?: DraftOrderStep[];
  draftOrderIndex?: number;
  /** Why each pool hero cannot be banned at the current ban step; null when it can. */
  draftBanLocks?: Record<string, DraftLockReason | null>;
  revision: number;
  diceQueue: number[];
  debugLog: Array<{
    revision: number;
    type: string;
    at: number;
    diceConsumed?: number[];
  }>;
  ready: { P1: boolean; P2: boolean };
  /** Legacy snapshot field read by the store fallback. */
  playersReady?: { P1?: boolean; P2?: boolean };
  players: { P1: boolean; P2: boolean };
  /** Milliseconds left to reconnect for a seat that lost its connection, otherwise null. */
  disconnectedSeats?: { P1: number | null; P2: number | null };
  /** Leaving now, or not returning in time, counts as a loss. */
  forfeitOnLeave?: boolean;
  playerNames: { P1: string | null; P2: string | null };
  playerAvatars?: { P1: string | null; P2: string | null };
  /** The frame each seat's figures wear, from the players' profiles; null wears none. */
  playerFrames?: { P1: string | null; P2: string | null };
  /** The wax seal each seated player stamps when ready; null stamps the default. */
  playerSeals?: { P1: string | null; P2: string | null };
  spectators: number;
  phase: GamePhase;
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
  streamId: string;
  you: {
    role: PlayerRole;
    seat?: PlayerId;
    isHost: boolean;
    canControlTestRoom: boolean;
  };
  view: PlayerView;
  meta: RoomMeta;
};

export type ChatChannel = "match" | "spectators";
export const QUICK_PHRASES = ["goodLuck", "niceMove", "oops", "thanks", "goodGame"] as const;
export type QuickPhraseId = (typeof QUICK_PHRASES)[number];
/** Characters a room chat message may hold, counted as the server counts them. */
export const CHAT_MAX_LENGTH = 200;

export type ChatMessage = {
  id: string;
  channel: ChatChannel;
  sentAt: string;
  sender: { username: string; name: string; seat: PlayerId | null };
  own: boolean;
  text?: string;
  phrase?: QuickPhraseId;
};

/** `mutedUntil`: a moderator's restriction keeps this player from writing until then. */
export type ChatAccess = { read: ChatChannel[]; write: ChatChannel[]; mutedUntil?: string };
export const CHAT_REPORT_REASONS = ["ABUSE", "SPAM", "CHEATING", "OTHER"] as const;
export type ChatReportReason = (typeof CHAT_REPORT_REASONS)[number];
export const CHAT_REPORT_COMMENT_MAX = 300;

export type ChatRejectionCode =
  | "CHAT_DISABLED"
  | "CHAT_AUTH_REQUIRED"
  | "CHAT_FORBIDDEN"
  | "CHAT_EMPTY"
  | "CHAT_TOO_LONG"
  | "CHAT_RATE_LIMITED"
  | "CHAT_DUPLICATE"
  | "CHAT_UNAVAILABLE"
  | "CHAT_MUTED"
  | "CHAT_REPORT_INVALID"
  | "CHAT_REPORT_LIMIT"
  | "CHAT_BLOCK_INVALID";

export type ServerMessage =
  | MatchmakingEvent
  | UserEvent
  | { type: "matchmakingSubscribed"; requestId: string }
  | RoomStateMessage
  | {
      type: "joinAck";
      roomMode?: "normal" | "test";
      matchType?: MatchType;
      roomId: string;
      role: PlayerRole;
      seat?: PlayerId;
      isHost: boolean;
      resumeToken?: string;
    }
  | {
      type: "joinRejected";
      reason: "room_not_found" | "role_taken" | "room_exists" | "test_room_disabled" | "match_interrupted" | "match_finished";
      message: string;
    }
  | {
      type: "leftRoom";
      roomId: string | null;
    }
  | {
      type: "actionResult";
      code?: string;
      ok: boolean;
      events: DeliveredGameEvent[];
      error?: string;
      revision?: number;
      streamId?: string;
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
    }
  | {
      type: "testRoomSnapshot";
      snapshot: unknown;
    }
  | { type: "chatHistory"; roomId: string; access: ChatAccess; messages: ChatMessage[] }
  | { type: "chatMessage"; roomId: string; message: ChatMessage }
  | { type: "chatRejected"; code: ChatRejectionCode; retryAfterMs?: number; until?: string }
  | { type: "chatReported"; roomId: string; messageId: string }
  | { type: "chatBlocked"; roomId: string; messageId: string }
  | { type: "heartbeatAck" };

export type ClientMessage =
  | { type: "heartbeat" }
  | {
      type: "joinRoom";
      lobbyName?: string;
      gameMode?: GameModeId;
      accessToken?: string;
      mode: "create" | "join";
      roomId?: string;
      role: PlayerRole;
      name?: string;
      figureSet?: FigureSetSelection;
      resumeToken?: string;
      roomMode?: "normal" | "test";
      matchType?: MatchType;
      debugToken?: string;
    }
  | { type: "setReady"; ready: boolean }
  | { type: "startGame" }
  | { type: "setGameMode"; mode: GameModeId }
  | { type: "draftBanHero"; heroId: string }
  | { type: "draftPickHero"; heroId: string }
  | { type: "draftChoice"; choice: DraftClientChoice }
  | {
      type: "resolvePendingRoll";
      pendingRollId: string;
      choice?: ResolveRollChoice;
    }
  | { type: "action"; action: GameAction }
  | { type: "requestMoveOptions"; unitId: string; mode?: MoveMode }
  | { type: "switchRole"; role: PlayerRole; accessToken?: string }
  | { type: "leaveRoom" }
  | { type: "testRoomCommand"; command: TestRoomCommand }
  | { type: "chatSend"; channel: ChatChannel; text: string }
  | { type: "chatQuick"; channel: ChatChannel; phrase: QuickPhraseId }
  | { type: "chatReport"; messageId: string; reason: ChatReportReason; comment?: string }
  | { type: "chatBlock"; messageId: string };

export function connectGameSocket(onMessage: (msg: ServerMessage) => void): WebSocket {
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
    lobbyName?: string;
    gameMode?: GameModeId;
    accessToken?: string;
    mode: "create" | "join";
    roomId?: string;
    role: PlayerRole;
    name?: string;
    figureSet?: FigureSetSelection;
    resumeToken?: string;
    roomMode?: "normal" | "test";
    matchType?: MatchType;
    debugToken?: string;
  },
) {
  const join: ClientMessage = { type: "joinRoom", ...params };
  socket.send(JSON.stringify(join));
}

export function sendHeartbeat(socket: WebSocket) {
  const msg: ClientMessage = { type: "heartbeat" };
  socket.send(JSON.stringify(msg));
}

export function sendSetReady(socket: WebSocket, ready: boolean) {
  const msg: ClientMessage = { type: "setReady", ready };
  socket.send(JSON.stringify(msg));
}

export function sendStartGame(socket: WebSocket) {
  const msg: ClientMessage = { type: "startGame" };
  socket.send(JSON.stringify(msg));
}

export function sendSetGameMode(socket: WebSocket, mode: GameModeId) {
  const msg: ClientMessage = { type: "setGameMode", mode };
  socket.send(JSON.stringify(msg));
}

export function sendDraftBanHero(socket: WebSocket, heroId: string) {
  const msg: ClientMessage = { type: "draftBanHero", heroId };
  socket.send(JSON.stringify(msg));
}

export function sendDraftPickHero(socket: WebSocket, heroId: string) {
  const msg: ClientMessage = { type: "draftPickHero", heroId };
  socket.send(JSON.stringify(msg));
}

/** A pre-ban draft step; for a roll the server rolls the dice. */
export type DraftClientChoice =
  | { type: "roll" }
  | Exclude<DraftChoice, { type: "roll" }>;

export function sendDraftChoice(socket: WebSocket, choice: DraftClientChoice) {
  const msg: ClientMessage = { type: "draftChoice", choice };
  socket.send(JSON.stringify(msg));
}

export function sendResolvePendingRoll(
  socket: WebSocket,
  pendingRollId: string,
  choice?: ResolveRollChoice,
) {
  const msg: ClientMessage = { type: "resolvePendingRoll", pendingRollId, choice };
  socket.send(JSON.stringify(msg));
}

export function sendSocketAction(socket: WebSocket, action: GameAction) {
  const msg: ClientMessage = { type: "action", action };
  socket.send(JSON.stringify(msg));
}

export function sendMoveOptionsRequest(socket: WebSocket, unitId: string, mode?: MoveMode) {
  const msg: ClientMessage = { type: "requestMoveOptions", unitId, mode };
  socket.send(JSON.stringify(msg));
}

export function sendSwitchRole(socket: WebSocket, role: PlayerRole, accessToken?: string) {
  const msg: ClientMessage = { type: "switchRole", role, accessToken };
  socket.send(JSON.stringify(msg));
}

export function sendLeaveRoom(socket: WebSocket) {
  const msg: ClientMessage = { type: "leaveRoom" };
  socket.send(JSON.stringify(msg));
}

export function sendTestRoomCommand(socket: WebSocket, command: TestRoomCommand) {
  const msg: ClientMessage = { type: "testRoomCommand", command };
  socket.send(JSON.stringify(msg));
}
