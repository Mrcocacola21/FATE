import type { PresenceDto } from "../presence/presenceService";
import type { NotificationDto } from "../services/notificationService";
import type { InviteDto } from "../invites/inviteService";

/**
 * Events for one signed-in player, sent over every socket that player has open (the site keeps
 * one open through the matchmaking subscription). They only say what changed; the web re-reads
 * the details over HTTP where it needs them.
 */
export type UserEvent =
  | { type: "notification"; notification: NotificationDto; unread: number }
  /** Requests or friends changed: re-read the badge, the bell and the friends list. */
  | { type: "friendsChanged" }
  /** A friend's status as that friend lets you see it. */
  | { type: "presence"; userId: string; presence: PresenceDto }
  /** A lobby invite, sent to both the invited player and the inviter. */
  | { type: "invite"; invite: InviteDto }
  /** The invite expired, was answered or withdrawn, or its lobby filled or closed. */
  | { type: "inviteGone"; inviteId: string };

export interface UserChannel {
  send(userId: string, event: UserEvent): void;
  isOnline(userId: string): boolean;
}

/** For tests and for servers built without sockets. */
export const silentChannel: UserChannel = { send() {}, isOnline: () => false };
