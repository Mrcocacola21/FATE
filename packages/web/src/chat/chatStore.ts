import { create } from "zustand";
import type { ChatAccess, ChatChannel, ChatMessage, ChatRejectionCode, ChatReportReason } from "../ws";
import { userEvents } from "../notifications/userEvents";

/** Codes that answer a report rather than a message. */
const REPORT_ANSWERS: ChatRejectionCode[] = [
  "CHAT_REPORT_INVALID",
  "CHAT_REPORT_LIMIT",
  "CHAT_AUTH_REQUIRED",
  "CHAT_UNAVAILABLE",
  "CHAT_FORBIDDEN",
];
const REPORT_TIMEOUT_MS = 10_000;
/** Reports waiting for the server's answer, oldest first; it answers them in order. */
const pendingReports: Array<{ messageId: string; done(code: string | null): void }> = [];

/** True while a moderator's restriction is in force. */
export function isMuted(until: string | null | undefined, now = Date.now()) {
  return !!until && Date.parse(until) > now;
}

export interface RoomChatState {
  /** The room this chat belongs to; messages of any other room are dropped. */
  roomId: string | null;
  access: ChatAccess;
  messages: ChatMessage[];
  unread: Record<ChatChannel, number>;
  /** Channels the reader is looking at; their messages arrive already read. */
  viewing: Record<ChatChannel, boolean>;
  rejection: { code: ChatRejectionCode; retryUntil: number | null; at: number } | null;
  /** Seats whose messages this reader hid for the rest of the match. Local only. */
  hiddenSeats: { P1: boolean; P2: boolean };
  /** The name of the player just blocked from this chat, for a short notice. */
  blockedName: string | null;
}

const MAX_MESSAGES = 200;
const noAccess: ChatAccess = { read: [], write: [] };

const initial = (roomId: string | null): RoomChatState => ({
  roomId,
  access: noAccess,
  messages: [],
  unread: { match: 0, spectators: 0 },
  viewing: { match: false, spectators: false },
  rejection: null,
  hiddenSeats: { P1: false, P2: false },
  blockedName: null,
});

export const useRoomChat = create<RoomChatState>(() => initial(null));

function visible(state: RoomChatState, message: ChatMessage): boolean {
  return !(message.sender.seat && !message.own && state.hiddenSeats[message.sender.seat]);
}

/** Fed by the game store from the room socket. */
export const roomChat = {
  /** A new room, or none: forget the old room's chat and local choices. */
  reset(roomId: string | null) {
    if (useRoomChat.getState().roomId === roomId && roomId !== null) return;
    useRoomChat.setState(initial(roomId), true);
  },
  history(roomId: string, access: ChatAccess, messages: ChatMessage[]) {
    useRoomChat.setState((state) => {
      const sameRoom = state.roomId === roomId;
      const base = sameRoom ? state : initial(roomId);
      // A message delivered live before the history arrived is in both; keep one copy.
      const ids = new Set(messages.map((message) => message.id));
      const live = sameRoom ? state.messages.filter((message) => !ids.has(message.id)) : [];
      return {
        ...base,
        roomId,
        access,
        messages: [...messages, ...live]
          .filter((message) => access.read.includes(message.channel))
          .slice(-MAX_MESSAGES),
      };
    });
  },
  message(roomId: string, message: ChatMessage) {
    useRoomChat.setState((state) => {
      if (state.roomId !== roomId || state.messages.some((item) => item.id === message.id)) return state;
      const counts = !message.own && !state.viewing[message.channel] && visible(state, message);
      return {
        messages: [...state.messages, message].slice(-MAX_MESSAGES),
        unread: counts ? { ...state.unread, [message.channel]: state.unread[message.channel] + 1 } : state.unread,
        rejection: message.own ? null : state.rejection,
      };
    });
  },
  rejected(code: ChatRejectionCode, retryAfterMs?: number, until?: string, now = Date.now()) {
    if (pendingReports.length && REPORT_ANSWERS.includes(code)) {
      pendingReports.shift()!.done(code);
      return;
    }
    if (code === "CHAT_MUTED") {
      useRoomChat.setState((state) => ({ access: { ...state.access, mutedUntil: until ?? state.access.mutedUntil } }));
      return;
    }
    useRoomChat.setState({ rejection: { code, retryUntil: retryAfterMs ? now + retryAfterMs : null, at: now } });
  },
  /** The server stored the report. */
  reported(messageId: string) {
    const index = pendingReports.findIndex((item) => item.messageId === messageId);
    if (index >= 0) pendingReports.splice(index, 1)[0].done(null);
  },
  /** Resolves to null once stored, or to the code the server refused it with. */
  report(
    send: (message: { type: "chatReport"; messageId: string; reason: ChatReportReason; comment?: string }) => boolean,
    messageId: string,
    reason: ChatReportReason,
    comment: string,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const entry = {
        messageId,
        done: (code: string | null) => {
          clearTimeout(timer);
          resolve(code);
        },
      };
      const timer = setTimeout(() => {
        const index = pendingReports.indexOf(entry);
        if (index >= 0) pendingReports.splice(index, 1);
        resolve("CHAT_UNAVAILABLE");
      }, REPORT_TIMEOUT_MS);
      pendingReports.push(entry);
      const trimmed = comment.trim();
      if (!send({ type: "chatReport", messageId, reason, ...(trimmed ? { comment: trimmed } : {}) })) {
        pendingReports.splice(pendingReports.indexOf(entry), 1);
        entry.done("CHAT_UNAVAILABLE");
      }
    });
  },
  /** The server blocked that message's author; a fresh history without them follows. */
  blocked(messageId: string) {
    useRoomChat.setState((state) => ({
      blockedName: state.messages.find((item) => item.id === messageId)?.sender.name ?? state.blockedName,
    }));
  },
  clearBlocked() {
    useRoomChat.setState({ blockedName: null });
  },
  /** A moderator restricted or freed this player's chat. */
  muted(until: string | null) {
    useRoomChat.setState((state) => {
      const access = { ...state.access };
      if (until) access.mutedUntil = until;
      else delete access.mutedUntil;
      return { access, rejection: state.rejection?.code === "CHAT_MUTED" ? null : state.rejection };
    });
  },
  clearRejection() {
    useRoomChat.setState({ rejection: null });
  },
  setViewing(channel: ChatChannel, viewing: boolean) {
    useRoomChat.setState((state) => ({
      viewing: { ...state.viewing, [channel]: viewing },
      unread: viewing ? { ...state.unread, [channel]: 0 } : state.unread,
    }));
  },
  setSeatHidden(seat: "P1" | "P2", hidden: boolean) {
    useRoomChat.setState((state) => ({ hiddenSeats: { ...state.hiddenSeats, [seat]: hidden } }));
  },
};

export function visibleChatMessages(state: RoomChatState, channel: ChatChannel): ChatMessage[] {
  return state.messages.filter((message) => message.channel === channel && visible(state, message));
}

export function totalUnread(state: RoomChatState): number {
  return state.access.read.reduce((sum, channel) => sum + state.unread[channel], 0);
}

userEvents.on((event) => {
  if (event.type === "chatMuted") roomChat.muted(event.until);
});
