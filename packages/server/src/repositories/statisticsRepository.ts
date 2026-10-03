import { Prisma, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

// Analytics never need profiles, result JSON, actions or private checkpoints.
export const statisticsResultSelect = {
  outcome: true,
  match: {
    select: {
      id: true,
      gameMode: true,
      finishedAt: true,
      durationMs: true,
      turnCount: true,
    },
  },
} satisfies Prisma.MatchParticipantSelect;

export type StatisticsResultRow = Prisma.MatchParticipantGetPayload<{
  select: typeof statisticsResultSelect;
}>;

export class StatisticsRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  userExists(userId: string): Promise<{ id: string } | null> {
    return this.database.user.findUnique({ where: { id: userId }, select: { id: true } });
  }

  findFinishedResults(userId: string): Promise<StatisticsResultRow[]> {
    return this.database.matchParticipant.findMany({
      where: { userId, match: { status: "FINISHED" } },
      select: statisticsResultSelect,
      // Unique (matchId, userId) prevents duplicate games. Undated legacy rows
      // are returned for service diagnostics, then excluded from all metrics.
      orderBy: [{ match: { finishedAt: { sort: "asc", nulls: "last" } } }, { matchId: "asc" }],
    });
  }
}
