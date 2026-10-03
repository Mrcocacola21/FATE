import { Prisma, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import type { MatchHistoryQuery } from "../matches/historySchema";

export const historyMatchSelect = {
  id: true,
  status: true,
  isRated: true,
  gameMode: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  finishReason: true,
  finalRevision: true,
  turnCount: true,
  participants: {
    orderBy: { seat: "asc" },
    select: {
      userId: true,
      seat: true,
      displayNameSnapshot: true,
      outcome: true,
      user: { select: { profile: { select: { username: true, avatarUrl: true } } } },
    },
  },
} satisfies Prisma.MatchSelect;
export type HistoryMatch = Prisma.MatchGetPayload<{ select: typeof historyMatchSelect }>;

export class MatchHistoryRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  async userExists(userId: string): Promise<{ id: string } | null> {
    return this.database.user.findUnique({ where: { id: userId }, select: { id: true } });
  }

  async findUserHistory(userId: string, query: MatchHistoryQuery) {
    const where: Prisma.MatchWhereInput = {
      status: "FINISHED",
      gameMode: query.gameMode,
      participants: { some: { userId, outcome: query.result } },
    };
    const [total, items] = await this.database.$transaction(
      [
        this.database.match.count({ where }),
        this.database.match.findMany({
          where,
          select: historyMatchSelect,
          // Legacy null finish dates sort after dated results. Their displayed date
          // falls back to startedAt/createdAt, without inventing a completion date.
          orderBy: [{ finishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total, items };
  }
}
