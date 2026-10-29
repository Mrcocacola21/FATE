import type { NotificationKind, Prisma, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { playerSelect } from "./friendRepository";

const notificationInclude = {
  actor: { select: { profile: { select: playerSelect } } },
  friendship: { select: { id: true, status: true } },
} satisfies Prisma.NotificationInclude;
export type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

export class NotificationRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  /** One notification per friendship and kind; a repeat returns the existing row unchanged. */
  create(input: { userId: string; actorId: string; kind: NotificationKind; friendshipId: string }) {
    return this.database.notification.upsert({
      where: { friendshipId_kind: { friendshipId: input.friendshipId, kind: input.kind } },
      create: input,
      update: {},
      include: notificationInclude,
    });
  }

  /** The newest notifications, leaving out players hidden by moderation. */
  list(userId: string, limit: number) {
    return this.database.notification.findMany({
      where: { userId, actor: { blockedAt: null } },
      include: notificationInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
    });
  }

  countUnread(userId: string) {
    return this.database.notification.count({
      where: { userId, readAt: null, actor: { blockedAt: null } },
    });
  }

  async markAllRead(userId: string, at: Date) {
    await this.database.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: at },
    });
  }
}
