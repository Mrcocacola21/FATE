import { ApiError, isRecord, type ApiClient } from "./client";
import { parsePlayer, parsePresence, type Player, type Presence } from "./friendApi";
import { parseInvite, type LobbyInvite } from "./inviteApi";

export type NotificationKind = "friendRequest" | "friendAccepted";
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  player: Player;
  createdAt: string;
  read: boolean;
  /** The pending request this entry can still accept or decline. */
  requestId: string | null;
}
export interface NotificationList {
  notifications: AppNotification[];
  unread: number;
}

/** What the server pushes to the signed-in player over the game socket. */
export type UserEvent =
  | { type: "notification"; notification: AppNotification; unread: number }
  | { type: "friendsChanged" }
  | { type: "presence"; userId: string; presence: Presence }
  | { type: "invite"; invite: LobbyInvite }
  | { type: "inviteGone"; inviteId: string };

const fail = (): never => {
  throw new ApiError("INVALID_RESPONSE");
};
const count = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : fail();

export function parseNotification(value: unknown): AppNotification {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.kind !== "friendRequest" && value.kind !== "friendAccepted") ||
    typeof value.createdAt !== "string" ||
    typeof value.read !== "boolean" ||
    (value.requestId !== null && typeof value.requestId !== "string")
  )
    return fail();
  return {
    id: value.id,
    kind: value.kind,
    player: parsePlayer(value.player),
    createdAt: value.createdAt,
    read: value.read,
    requestId: value.requestId,
  };
}

/** Null for anything that is not a well-formed user event, so a bad push is simply dropped. */
export function parseUserEvent(value: unknown): UserEvent | null {
  if (!isRecord(value)) return null;
  try {
    if (value.type === "notification")
      return {
        type: "notification",
        notification: parseNotification(value.notification),
        unread: count(value.unread),
      };
    if (value.type === "friendsChanged") return { type: "friendsChanged" };
    if (value.type === "presence" && typeof value.userId === "string" && value.presence)
      return { type: "presence", userId: value.userId, presence: parsePresence(value.presence) };
    if (value.type === "invite") return { type: "invite", invite: parseInvite(value.invite) };
    if (value.type === "inviteGone" && typeof value.inviteId === "string")
      return { type: "inviteGone", inviteId: value.inviteId };
  } catch {
    return null;
  }
  return null;
}

export function createNotificationApi(authenticated: ApiClient) {
  return {
    list: () =>
      authenticated.request("/api/notifications", (value): NotificationList =>
        isRecord(value) && Array.isArray(value.notifications)
          ? { notifications: value.notifications.map(parseNotification), unread: count(value.unread) }
          : fail(),
      ),
    markAllRead: () =>
      authenticated.request(
        "/api/notifications/read",
        (value) => (isRecord(value) ? count(value.unread) : fail()),
        { method: "POST" },
      ),
  };
}
