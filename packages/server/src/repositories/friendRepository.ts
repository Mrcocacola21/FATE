import type { Prisma, PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

/** Only the public identity of another player; never email, role or sessions. */
export const playerSelect = {
  userId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.ProfileSelect;
export type PlayerRow = Prisma.ProfileGetPayload<{ select: typeof playerSelect }>;

/** What online status needs: the player's visibility choice and when they were last seen. */
export const presenceSelect = {
  ...playerSelect,
  presenceVisibility: true,
  lastSeenAt: true,
} satisfies Prisma.ProfileSelect;

const friendshipInclude = {
  requester: { select: { profile: { select: presenceSelect } } },
  addressee: { select: { profile: { select: presenceSelect } } },
} satisfies Prisma.FriendshipInclude;
export type FriendshipRow = Prisma.FriendshipGetPayload<{ include: typeof friendshipInclude }>;

export const sortedPair = (a: string, b: string) =>
  a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };

export class FriendRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  /** A player others can reach: has a profile and is not blocked by moderation. */
  findPlayerByUsername(username: string) {
    return this.database.profile.findFirst({
      where: { username, user: { blockedAt: null } },
      select: { ...playerSelect, friendRequests: true },
    });
  }

  findPlayerById(userId: string) {
    return this.database.profile.findFirst({
      where: { userId, user: { blockedAt: null } },
      select: { ...presenceSelect, friendRequests: true },
    });
  }

  /** Writes "last seen" when a player's last connection closes. */
  async touchLastSeen(userId: string, at: Date) {
    await this.database.profile.updateMany({ where: { userId }, data: { lastSeenAt: at } });
  }

  findPair(a: string, b: string) {
    return this.database.friendship.findUnique({
      where: { userLowId_userHighId: sortedPair(a, b) },
      include: friendshipInclude,
    });
  }

  findById(id: string) {
    return this.database.friendship.findUnique({ where: { id }, include: friendshipInclude });
  }

  /** Blocks in either direction between two players. */
  async blocksBetween(a: string, b: string) {
    const rows = await this.database.userBlock.findMany({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return {
      iBlocked: rows.some((row) => row.blockerId === a),
      blockedMe: rows.some((row) => row.blockerId === b),
    };
  }

  createRequest(requesterId: string, addresseeId: string) {
    return this.database.friendship.create({
      data: { requesterId, addresseeId, ...sortedPair(requesterId, addresseeId) },
      include: friendshipInclude,
    });
  }

  /** Accepts only a still-pending request addressed to this player; null when it is gone. */
  async accept(id: string, addresseeId: string) {
    const { count } = await this.database.friendship.updateMany({
      where: { id, addresseeId, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return count ? this.findById(id) : null;
  }

  /** Declines or cancels a pending request the player is part of. */
  async deletePending(id: string, userId: string) {
    const { count } = await this.database.friendship.deleteMany({
      where: { id, status: "PENDING", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    return count > 0;
  }

  async deleteFriendship(a: string, b: string) {
    const { count } = await this.database.friendship.deleteMany({
      where: { ...sortedPair(a, b), status: "ACCEPTED" },
    });
    return count > 0;
  }

  listFriends(userId: string) {
    return this.database.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: friendshipInclude,
      orderBy: [{ acceptedAt: "desc" }, { id: "asc" }],
    });
  }

  listPending(userId: string) {
    return this.database.friendship.findMany({
      where: { status: "PENDING", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: friendshipInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }

  countIncoming(userId: string) {
    return this.database.friendship.count({ where: { addresseeId: userId, status: "PENDING" } });
  }

  /** Blocking also ends any friendship or request between the two, atomically. */
  block(blockerId: string, blockedId: string) {
    return this.database.$transaction([
      this.database.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        create: { blockerId, blockedId },
        update: {},
      }),
      this.database.friendship.deleteMany({ where: sortedPair(blockerId, blockedId) }),
    ]);
  }

  async unblock(blockerId: string, blockedId: string) {
    const { count } = await this.database.userBlock.deleteMany({ where: { blockerId, blockedId } });
    return count > 0;
  }

  listBlocks(blockerId: string) {
    return this.database.userBlock.findMany({
      where: { blockerId },
      select: { createdAt: true, blocked: { select: { profile: { select: playerSelect } } } },
      orderBy: [{ createdAt: "desc" }, { blockedId: "asc" }],
    });
  }

  /**
   * Username prefix search, case-insensitive. Leaves out the searcher, moderated accounts and
   * anyone separated from the searcher by a block in either direction.
   */
  searchPlayers(userId: string, prefix: string, limit: number) {
    return this.database.profile.findMany({
      where: {
        username: { startsWith: prefix, mode: "insensitive" },
        userId: { not: userId },
        user: {
          blockedAt: null,
          blocksMade: { none: { blockedId: userId } },
          blocksReceived: { none: { blockerId: userId } },
        },
      },
      select: { ...playerSelect, friendRequests: true },
      orderBy: [{ username: "asc" }],
      take: limit,
    });
  }

  /** Every friendship row between the searcher and the given players, for relationship labels. */
  pairsWith(userId: string, others: string[]) {
    return this.database.friendship.findMany({
      where: {
        OR: others.map((other) => sortedPair(userId, other)),
      },
      select: { id: true, requesterId: true, addresseeId: true, status: true },
    });
  }
}
