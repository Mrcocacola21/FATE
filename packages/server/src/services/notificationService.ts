import type { FastifyBaseLogger } from "fastify";
import type { NotificationRepository, NotificationRow } from "../repositories/notificationRepository";
import type { FriendshipRow } from "../repositories/friendRepository";
import { silentChannel, type UserChannel } from "../realtime/userEvents";
import { toPlayerDto, type PlayerDto } from "./friendService";

export const NOTIFICATION_LIMIT = 30;

export type NotificationKindDto = "friendRequest" | "friendAccepted";

export interface NotificationDto {
  id: string;
  kind: NotificationKindDto;
  player: PlayerDto;
  createdAt: string;
  read: boolean;
  /** For a request that is still pending: its id, so the bell can accept or decline it. */
  requestId: string | null;
}

/** What the friend service reports after a change; the notification service fans it out. */
export type FriendEvent =
  | { type: "requested"; row: FriendshipRow }
  | { type: "accepted"; row: FriendshipRow }
  /** A request was cancelled or declined, a friend removed, or a player blocked. */
  | { type: "ended"; userIds: [string, string] };

export interface FriendEvents {
  friendEvent(event: FriendEvent): Promise<void>;
}

function toDto(row: NotificationRow): NotificationDto | null {
  const profile = row.actor.profile;
  if (!profile) return null;
  return {
    id: row.id,
    kind: row.kind === "FRIEND_REQUEST" ? "friendRequest" : "friendAccepted",
    player: toPlayerDto(profile),
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
    requestId:
      row.kind === "FRIEND_REQUEST" && row.friendship?.status === "PENDING"
        ? row.friendship.id
        : null,
  };
}

export class NotificationService implements FriendEvents {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly channel: UserChannel = silentChannel,
    private readonly log?: FastifyBaseLogger,
  ) {}

  async list(userId: string) {
    const [rows, unread] = await Promise.all([
      this.notifications.list(userId, NOTIFICATION_LIMIT),
      this.notifications.countUnread(userId),
    ]);
    return {
      notifications: rows.map(toDto).filter((item): item is NotificationDto => item !== null),
      unread,
    };
  }

  async markAllRead(userId: string) {
    await this.notifications.markAllRead(userId, new Date());
    return { unread: 0 };
  }

  /**
   * Stores and pushes what a friend change means for each side. The change itself is already
   * saved, so a failure here is logged and never undoes or fails the request.
   */
  async friendEvent(event: FriendEvent) {
    try {
      if (event.type === "ended") {
        for (const userId of event.userIds) this.channel.send(userId, { type: "friendsChanged" });
        return;
      }
      const { row } = event;
      const [userId, actorId] =
        event.type === "requested"
          ? [row.addresseeId, row.requesterId]
          : [row.requesterId, row.addresseeId];
      const stored = await this.notifications.create({
        userId,
        actorId,
        kind: event.type === "requested" ? "FRIEND_REQUEST" : "FRIEND_ACCEPTED",
        friendshipId: row.id,
      });
      const notification = toDto(stored);
      if (notification && this.channel.isOnline(userId))
        this.channel.send(userId, {
          type: "notification",
          notification,
          unread: await this.notifications.countUnread(userId),
        });
      this.channel.send(row.requesterId, { type: "friendsChanged" });
      this.channel.send(row.addresseeId, { type: "friendsChanged" });
    } catch (error) {
      this.log?.warn({ event: "notification_failed", err: error }, "Could not store a notification");
    }
  }
}
