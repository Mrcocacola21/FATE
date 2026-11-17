import { Prisma, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { playerSelect, sortedPair } from "./friendRepository";

const messageSelect = {
  id: true,
  senderId: true,
  recipientId: true,
  body: true,
  createdAt: true,
  readAt: true,
} satisfies Prisma.DirectMessageSelect;
export type DirectMessageRow = Prisma.DirectMessageGetPayload<{ select: typeof messageSelect }>;

/** A sender the reader can still see: not hidden by moderation and not blocked either way. */
function visibleSender(readerId: string): Prisma.UserWhereInput {
  return {
    blockedAt: null,
    blocksMade: { none: { blockedId: readerId } },
    blocksReceived: { none: { blockerId: readerId } },
  };
}

export class DirectMessageRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  create(input: { senderId: string; recipientId: string; body: string }) {
    return this.database.directMessage.create({
      data: { ...input, ...sortedPair(input.senderId, input.recipientId) },
      select: messageSelect,
    });
  }

  /** A page of one conversation, newest first; `before` continues from an earlier page. */
  page(a: string, b: string, limit: number, before?: { createdAt: Date; id: string }) {
    return this.database.directMessage.findMany({
      where: {
        ...sortedPair(a, b),
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      select: messageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }

  findById(id: string) {
    return this.database.directMessage.findUnique({ where: { id }, select: messageSelect });
  }

  /** The latest message of each of the player's conversations, newest conversation first. */
  async latestPerConversation(userId: string, limit: number): Promise<DirectMessageRow[]> {
    return this.database.$queryRaw<DirectMessageRow[]>(Prisma.sql`
      SELECT * FROM (
        SELECT DISTINCT ON ("userLowId", "userHighId")
          "id", "senderId", "recipientId", "body", "createdAt", "readAt"
        FROM "DirectMessage"
        WHERE "userLowId" = ${userId}::uuid OR "userHighId" = ${userId}::uuid
        ORDER BY "userLowId", "userHighId", "createdAt" DESC, "id" DESC
      ) AS latest
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${limit}
    `);
  }

  /** Unread messages per sender, only from senders the reader can see. */
  async unreadBySender(userId: string): Promise<Map<string, number>> {
    const rows = await this.database.directMessage.groupBy({
      by: ["senderId"],
      where: { recipientId: userId, readAt: null, sender: visibleSender(userId) },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.senderId, row._count._all]));
  }

  countUnread(userId: string) {
    return this.database.directMessage.count({
      where: { recipientId: userId, readAt: null, sender: visibleSender(userId) },
    });
  }

  async markRead(readerId: string, senderId: string, at: Date) {
    const { count } = await this.database.directMessage.updateMany({
      where: { recipientId: readerId, senderId, readAt: null },
      data: { readAt: at },
    });
    return count;
  }

  /** Players by id that the viewer may see, with who among them is a friend or blocked either way. */
  async partners(viewerId: string, userIds: string[]) {
    if (!userIds.length) return { profiles: [], friends: new Set<string>(), blocked: new Set<string>() };
    const [profiles, friendships, blocks] = await Promise.all([
      this.database.profile.findMany({
        where: { userId: { in: userIds }, user: { blockedAt: null } },
        select: { ...playerSelect, directMessages: true },
      }),
      this.database.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: viewerId, addresseeId: { in: userIds } },
            { addresseeId: viewerId, requesterId: { in: userIds } },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      }),
      this.database.userBlock.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: { in: userIds } },
            { blockedId: viewerId, blockerId: { in: userIds } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const other = (a: string, b: string) => (a === viewerId ? b : a);
    return {
      profiles,
      friends: new Set(friendships.map((row) => other(row.requesterId, row.addresseeId))),
      blocked: new Set(blocks.map((row) => other(row.blockerId, row.blockedId))),
    };
  }

  async deleteOlderThan(cutoff: Date) {
    const { count } = await this.database.directMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
  }
}
