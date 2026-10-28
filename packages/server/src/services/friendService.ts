import { Prisma } from "@prisma/client";
import { AuthError } from "../auth/authErrors";
import { AppError } from "../errors/appError";
import type { FriendRepository, FriendshipRow, PlayerRow } from "../repositories/friendRepository";

export const PLAYER_SEARCH_LIMIT = 10;

export type Relationship = "none" | "friends" | "outgoing" | "incoming";

export interface PlayerDto {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RelationshipDto {
  status: Relationship;
  /** The pending request to accept, decline or cancel; null otherwise. */
  requestId: string | null;
  /** Whether the viewer has blocked this player. */
  blocked: boolean;
  /** Whether a request can be sent now (no block, the player accepts requests, none pending). */
  canRequest: boolean;
}

export const friendErrors = {
  self: () => new AppError("FRIEND_SELF", 400, "You cannot add yourself."),
  notAllowed: () =>
    new AppError("FRIEND_REQUEST_NOT_ALLOWED", 403, "This player does not accept friend requests."),
  alreadyFriends: () => new AppError("ALREADY_FRIENDS", 409, "You are already friends."),
  requestNotFound: () => new AppError("FRIEND_REQUEST_NOT_FOUND", 404, "Friend request not found."),
  friendNotFound: () => new AppError("FRIEND_NOT_FOUND", 404, "This player is not your friend."),
};

export function toPlayerDto(row: PlayerRow): PlayerDto {
  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
  };
}

function otherSide(row: FriendshipRow, userId: string): PlayerDto {
  const profile = row.requesterId === userId ? row.addressee.profile : row.requester.profile;
  if (!profile) throw new AuthError("USER_NOT_FOUND");
  return toPlayerDto(profile);
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class FriendService {
  constructor(private readonly friends: FriendRepository) {}

  async listFriends(userId: string) {
    const rows = await this.friends.listFriends(userId);
    return {
      friends: rows.map((row) => ({
        player: otherSide(row, userId),
        friendsSince: row.acceptedAt!.toISOString(),
      })),
    };
  }

  async listRequests(userId: string) {
    const rows = await this.friends.listPending(userId);
    const toDto = (row: FriendshipRow) => ({
      id: row.id,
      player: otherSide(row, userId),
      createdAt: row.createdAt.toISOString(),
    });
    return {
      incoming: rows.filter((row) => row.addresseeId === userId).map(toDto),
      outgoing: rows.filter((row) => row.requesterId === userId).map(toDto),
    };
  }

  async incomingCount(userId: string) {
    return { incoming: await this.friends.countIncoming(userId) };
  }

  /**
   * Sends a request by username. A request the other player already sent is accepted instead,
   * so two players adding each other end up friends whichever click lands first.
   */
  async sendRequest(userId: string, username: string) {
    const target = await this.friends.findPlayerByUsername(username);
    if (!target) throw new AuthError("USER_NOT_FOUND");
    if (target.userId === userId) throw friendErrors.self();
    const blocks = await this.friends.blocksBetween(userId, target.userId);
    // A player who blocked you looks the same as one who closed requests.
    if (blocks.blockedMe || blocks.iBlocked) throw friendErrors.notAllowed();
    const existing = await this.friends.findPair(userId, target.userId);
    if (existing) return this.resolveExisting(existing, userId, target.userId);
    if (target.friendRequests === "NOBODY") throw friendErrors.notAllowed();
    try {
      await this.friends.createRequest(userId, target.userId);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The other player asked at the same moment; meet on their row.
      const raced = await this.friends.findPair(userId, target.userId);
      if (raced) return this.resolveExisting(raced, userId, target.userId);
      throw error;
    }
    return this.relationshipWith(userId, target.userId);
  }

  private async resolveExisting(row: FriendshipRow, userId: string, otherId: string) {
    if (row.status === "ACCEPTED") throw friendErrors.alreadyFriends();
    if (row.addresseeId === userId) await this.friends.accept(row.id, userId);
    return this.relationshipWith(userId, otherId);
  }

  async accept(userId: string, requestId: string) {
    const row = await this.friends.accept(requestId, userId);
    if (!row) throw friendErrors.requestNotFound();
    return {
      friend: { player: otherSide(row, userId), friendsSince: row.acceptedAt!.toISOString() },
    };
  }

  async deleteRequest(userId: string, requestId: string) {
    if (!(await this.friends.deletePending(requestId, userId)))
      throw friendErrors.requestNotFound();
  }

  async removeFriend(userId: string, friendId: string) {
    if (!(await this.friends.deleteFriendship(userId, friendId)))
      throw friendErrors.friendNotFound();
  }

  async block(userId: string, targetId: string) {
    if (targetId === userId) throw friendErrors.self();
    if (!(await this.friends.findPlayerById(targetId))) throw new AuthError("USER_NOT_FOUND");
    await this.friends.block(userId, targetId);
  }

  async unblock(userId: string, targetId: string) {
    await this.friends.unblock(userId, targetId);
  }

  async listBlocks(userId: string) {
    const rows = await this.friends.listBlocks(userId);
    return {
      blocked: rows
        .filter((row) => row.blocked.profile)
        .map((row) => ({
          player: toPlayerDto(row.blocked.profile!),
          blockedAt: row.createdAt.toISOString(),
        })),
    };
  }

  async relationshipWith(
    userId: string,
    otherId: string,
  ): Promise<{ relationship: RelationshipDto }> {
    if (otherId === userId) throw friendErrors.self();
    const player = await this.friends.findPlayerById(otherId);
    if (!player) throw new AuthError("USER_NOT_FOUND");
    const [row, blocks] = await Promise.all([
      this.friends.findPair(userId, otherId),
      this.friends.blocksBetween(userId, otherId),
    ]);
    return {
      relationship: describe(
        row && { id: row.id, requesterId: row.requesterId, status: row.status },
        userId,
        blocks.iBlocked,
        !blocks.iBlocked && !blocks.blockedMe && player.friendRequests === "EVERYONE",
      ),
    };
  }

  async search(userId: string, query: string) {
    const rows = await this.friends.searchPlayers(userId, query, PLAYER_SEARCH_LIMIT);
    const pairs = rows.length
      ? await this.friends.pairsWith(
          userId,
          rows.map((row) => row.userId),
        )
      : [];
    return {
      players: rows.map((row) => {
        const pair = pairs.find(
          (item) => item.requesterId === row.userId || item.addresseeId === row.userId,
        );
        return {
          player: toPlayerDto(row),
          // Blocked players never reach the results, so only the request policy matters here.
          relationship: describe(pair ?? null, userId, false, row.friendRequests === "EVERYONE"),
        };
      }),
    };
  }
}

function describe(
  row: { id: string; requesterId: string; status: "PENDING" | "ACCEPTED" } | null,
  userId: string,
  blocked: boolean,
  acceptsRequests: boolean,
): RelationshipDto {
  if (!row) return { status: "none", requestId: null, blocked, canRequest: acceptsRequests };
  if (row.status === "ACCEPTED")
    return { status: "friends", requestId: null, blocked, canRequest: false };
  return {
    status: row.requesterId === userId ? "outgoing" : "incoming",
    requestId: row.id,
    blocked,
    canRequest: false,
  };
}
