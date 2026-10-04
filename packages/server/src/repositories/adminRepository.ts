import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { AuthError } from "../auth/authErrors";
import { assertCanChangeRole, assertCanModerate } from "../admin/policy";
import type { UserListQuery, MatchListQuery, ActionListQuery } from "../admin/schemas";

const profileSelect = { username: true, displayName: true } satisfies Prisma.ProfileSelect;
export function adminUserSelect(email: boolean) {
  return {
    id: true,
    role: true,
    blockedAt: true,
    blockedReason: true,
    createdAt: true,
    updatedAt: true,
    email,
    profile: { select: profileSelect },
  } satisfies Prisma.UserSelect;
}
const participantSelect = {
  userId: true,
  seat: true,
  displayNameSnapshot: true,
  outcome: true,
  user: { select: { profile: { select: profileSelect } } },
} satisfies Prisma.MatchParticipantSelect;
export const adminMatchSelect = {
  id: true,
  roomId: true,
  status: true,
  gameMode: true,
  isRated: true,
  createdById: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  updatedAt: true,
  initialConfig: true,
  winnerUserId: true,
  winnerSeat: true,
  loserUserId: true,
  loserSeat: true,
  durationMs: true,
  turnCount: true,
  finishReason: true,
  finalRevision: true,
  ratingProcessedAt: true,
  participants: { orderBy: { seat: "asc" }, select: participantSelect },
} satisfies Prisma.MatchSelect;
export type AdminMatch = Prisma.MatchGetPayload<{ select: typeof adminMatchSelect }>;
export type AdminUser = Prisma.UserGetPayload<{ select: ReturnType<typeof adminUserSelect> }>;

// All role/block mutations (including bootstrap) take the same transaction lock.
// This makes target policy and last-admin counting atomic under concurrent requests.
export async function lockAccountAdministration(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1178686533)`;
}

export class AdminRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  async listUsers(query: UserListQuery, email: boolean) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      blockedAt:
        query.status === "BLOCKED" ? { not: null } : query.status === "ACTIVE" ? null : undefined,
      ...(query.search
        ? {
            OR: [
              { profile: { username: { contains: query.search, mode: "insensitive" } } },
              { profile: { displayName: { contains: query.search, mode: "insensitive" } } },
              ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                query.search,
              )
                ? [{ id: query.search }]
                : []),
            ],
          }
        : {}),
    };
    const sort: Prisma.UserOrderByWithRelationInput =
      query.sort === "username"
        ? { profile: { username: query.order } }
        : { [query.sort]: query.order };
    const [total, items] = await this.database.$transaction(
      [
        this.database.user.count({ where }),
        this.database.user.findMany({
          where,
          select: adminUserSelect(email),
          orderBy: [sort, { id: query.order }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total, items };
  }

  async getUser(id: string, email: boolean) {
    const user = await this.database.user.findUnique({
      where: { id },
      select: {
        ...adminUserSelect(email),
        ratings: {
          orderBy: { gameMode: "asc" },
          select: {
            gameMode: true,
            rating: true,
            ratingDeviation: true,
            volatility: true,
            ratedGames: true,
            updatedAt: true,
          },
        },
        _count: { select: { matchParticipants: true } },
      },
    });
    if (!user) throw new AuthError("USER_NOT_FOUND");
    return user;
  }

  async setBlocked(actorId: string, targetId: string, blocked: boolean, reason?: string) {
    return this.database.$transaction(async (tx) => {
      await lockAccountAdministration(tx);
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: adminUserSelect(false),
      });
      if (!actor) throw new AuthError("UNAUTHORIZED");
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: adminUserSelect(false),
      });
      if (!target) throw new AuthError("USER_NOT_FOUND");
      assertCanModerate(actor, target, blocked);
      const now = new Date();
      if (blocked) {
        await tx.user.updateMany({
          where: { id: targetId, blockedAt: null },
          data: {
            blockedAt: now,
            blockedReason: reason || null,
          },
        });
        await tx.authSession.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: now },
        });
      } else if (target.blockedAt) {
        await tx.user.update({
          where: { id: targetId },
          data: { blockedAt: null, blockedReason: null },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: targetId },
        select: adminUserSelect(actor.role === "ADMIN"),
      });
    });
  }

  async changeRole(actorId: string, targetId: string, role: UserRole) {
    return this.database.$transaction(async (tx) => {
      await lockAccountAdministration(tx);
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: adminUserSelect(false),
      });
      if (!actor) throw new AuthError("UNAUTHORIZED");
      assertCanChangeRole(actor, targetId);
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: adminUserSelect(false),
      });
      if (!target) throw new AuthError("USER_NOT_FOUND");
      if (target.blockedAt && role !== "USER") throw new AuthError("BLOCKED_ROLE_TARGET");
      if (
        target.role === "ADMIN" &&
        role !== "ADMIN" &&
        (await tx.user.count({ where: { role: "ADMIN", blockedAt: null } })) <= 1
      )
        throw new AuthError("LAST_ADMIN_PROTECTED");
      return tx.user.update({
        where: { id: targetId },
        data: { role },
        select: adminUserSelect(true),
      });
    });
  }

  async listMatches(query: MatchListQuery) {
    const where: Prisma.MatchWhereInput = {
      id: query.matchId,
      status: query.status,
      gameMode: query.gameMode,
      isRated: query.matchType === undefined ? undefined : query.matchType === "RATED",
      participants: query.participantUserId
        ? { some: { userId: query.participantUserId } }
        : undefined,
      createdAt: { gte: query.createdFrom, lte: query.createdTo },
      finishedAt: { gte: query.finishedFrom, lte: query.finishedTo },
    };
    const [total, items] = await this.database.$transaction(
      [
        this.database.match.count({ where }),
        this.database.match.findMany({
          where,
          select: adminMatchSelect,
          orderBy: [
            query.sort === "finishedAt"
              ? { finishedAt: { sort: query.order, nulls: "last" } }
              : { createdAt: query.order },
            { id: query.order },
          ],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total, items };
  }

  async getMatch(id: string) {
    return this.database.$transaction(
      async (tx) => {
        const match = await tx.match.findUnique({
          where: { id },
          select: {
            ...adminMatchSelect,
            _count: { select: { actions: true, snapshots: true } },
            snapshots: {
              orderBy: { revision: "desc" },
              take: 1,
              select: { revision: true, formatVersion: true, createdAt: true },
            },
          },
        });
        if (!match) throw new AuthError("MATCH_NOT_FOUND");
        const revision = await tx.matchAction.aggregate({
          where: { matchId: id },
          _max: { revision: true },
        });
        return { match, latestActionRevision: revision._max.revision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listActions(matchId: string, query: ActionListQuery) {
    return this.database.$transaction(
      async (tx) => {
        if (!(await tx.match.findUnique({ where: { id: matchId }, select: { id: true } })))
          throw new AuthError("MATCH_NOT_FOUND");
        const total = await tx.matchAction.count({ where: { matchId } });
        const items = await tx.matchAction.findMany({
          where: { matchId },
          orderBy: { revision: query.order },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            matchId: true,
            revision: true,
            actorUserId: true,
            actorSeat: true,
            actionType: true,
            actionPayload: true,
            createdAt: true,
          },
        });
        return { total, items };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async summary() {
    const now = Date.now();
    return this.database.$transaction(
      async (tx) => {
        const [
          totalUsers,
          blockedUsers,
          roles,
          totalMatches,
          statuses,
          modes,
          classification,
          usersCreatedLast7d,
          matchesCreatedLast24h,
          matchesFinishedLast24h,
        ] = await Promise.all([
          tx.user.count(),
          tx.user.count({ where: { blockedAt: { not: null } } }),
          tx.user.groupBy({ by: ["role"], _count: { _all: true } }),
          tx.match.count(),
          tx.match.groupBy({ by: ["status"], _count: { _all: true } }),
          tx.match.groupBy({ by: ["gameMode"], _count: { _all: true } }),
          tx.match.groupBy({ by: ["isRated"], _count: { _all: true } }),
          tx.user.count({ where: { createdAt: { gte: new Date(now - 7 * 86400000) } } }),
          tx.match.count({ where: { createdAt: { gte: new Date(now - 86400000) } } }),
          tx.match.count({
            where: { status: "FINISHED", finishedAt: { gte: new Date(now - 86400000) } },
          }),
        ]);
        return {
          users: {
            total: totalUsers,
            active: totalUsers - blockedUsers,
            blocked: blockedUsers,
            byRole: {
              USER: 0,
              MODERATOR: 0,
              ADMIN: 0,
              ...Object.fromEntries(roles.map((r) => [r.role, r._count._all])),
            },
          },
          matches: {
            total: totalMatches,
            byStatus: {
              WAITING: 0,
              IN_PROGRESS: 0,
              FINISHED: 0,
              CANCELLED: 0,
              ...Object.fromEntries(statuses.map((r) => [r.status, r._count._all])),
            },
            byGameMode: {
              standard: 0,
              draft: 0,
              classic: 0,
              ...Object.fromEntries(modes.map((r) => [r.gameMode, r._count._all])),
            },
            classification: {
              CASUAL: 0,
              RATED: 0,
              ...Object.fromEntries(
                classification.map((r) => [r.isRated ? "RATED" : "CASUAL", r._count._all]),
              ),
            },
          },
          activity: { usersCreatedLast7d, matchesCreatedLast24h, matchesFinishedLast24h },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
