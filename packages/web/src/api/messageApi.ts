import { ApiError, isRecord, type ApiClient } from "./client";
import { parsePlayer, type Player } from "./friendApi";
import type { ChatReportReason } from "../ws";

export const DIRECT_MESSAGE_MAX_LENGTH = 1000;

export interface DirectMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  sentAt: string;
  readAt: string | null;
}
export interface Conversation {
  player: Player;
  lastMessage: DirectMessage;
  unread: number;
  /** Friends who have not blocked each other can write; others only read the history. */
  canSend: boolean;
}
export interface ConversationList {
  conversations: Conversation[];
  unread: number;
}
export interface DirectMessagePage {
  player: Player;
  /** Oldest first. */
  messages: DirectMessage[];
  hasMore: boolean;
  canSend: boolean;
  /** A moderator's restriction on the reader, if any. */
  mutedUntil: string | null;
}

const fail = (): never => {
  throw new ApiError("INVALID_RESPONSE");
};
const text = (value: unknown) => (typeof value === "string" && value ? value : fail());
const count = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fail();
const flag = (value: unknown) => (typeof value === "boolean" ? value : fail());
const list = (value: unknown) => (Array.isArray(value) ? value : fail());

export function parseDirectMessage(value: unknown): DirectMessage {
  if (!isRecord(value) || typeof value.text !== "string") return fail();
  return {
    id: text(value.id),
    from: text(value.from),
    to: text(value.to),
    text: value.text,
    sentAt: text(value.sentAt),
    readAt: value.readAt === null ? null : text(value.readAt),
  };
}

const unreadBody = (value: unknown) => (isRecord(value) ? count(value.unread) : fail());

/** Private messages between friends; every call is the signed-in player's own. */
export function createMessageApi(authenticated: ApiClient) {
  const id = encodeURIComponent;
  return {
    conversations: () =>
      authenticated.request("/api/messages", (value): ConversationList =>
        isRecord(value)
          ? {
              conversations: list(value.conversations).map((row) =>
                isRecord(row)
                  ? {
                      player: parsePlayer(row.player),
                      lastMessage: parseDirectMessage(row.lastMessage),
                      unread: count(row.unread),
                      canSend: flag(row.canSend),
                    }
                  : fail(),
              ),
              unread: count(value.unread),
            }
          : fail(),
      ),
    unread: () => authenticated.request("/api/messages/unread", unreadBody),
    history: (userId: string, before?: string) =>
      authenticated.request(
        `/api/messages/${id(userId)}${before ? `?before=${id(before)}` : ""}`,
        (value): DirectMessagePage =>
          isRecord(value)
            ? {
                player: parsePlayer(value.player),
                messages: list(value.messages).map(parseDirectMessage),
                hasMore: flag(value.hasMore),
                canSend: flag(value.canSend),
                // Older servers do not send it.
                mutedUntil: typeof value.mutedUntil === "string" ? value.mutedUntil : null,
              }
            : fail(),
      ),
    send: (userId: string, message: string) =>
      authenticated.request(`/api/messages/${id(userId)}`, parseDirectMessage, {
        method: "POST",
        body: JSON.stringify({ text: message }),
      }),
    report: (userId: string, messageId: string, reason: ChatReportReason, comment?: string) =>
      authenticated.request(`/api/messages/${id(userId)}/report`, () => undefined, {
        method: "POST",
        body: JSON.stringify({ messageId, reason, ...(comment ? { comment } : {}) }),
      }),
    markRead: (userId: string) =>
      authenticated.request(`/api/messages/${id(userId)}/read`, unreadBody, { method: "POST" }),
  };
}
export type MessageApi = ReturnType<typeof createMessageApi>;
