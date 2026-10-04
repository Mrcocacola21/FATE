import { Prisma, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import type { LeaderboardQuery } from "../leaderboard/querySchema";

export interface LeaderboardRow {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rating: number;
  ratingDeviation: number;
  ratedGames: number;
  ratingRank: bigint;
  ratedResultsCount: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  lastActivity: Date | null;
}

// Only trusted SQL fragments enter ORDER BY. Query strings are never SQL identifiers.
function ordering(query: LeaderboardQuery): Prisma.Sql {
  const direction = query.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  switch (query.sort) {
    case "gamesPlayed":
      return Prisma.sql`"ratedGames" ${direction}, "rating" DESC, "userId" ASC`;
    case "winRate":
      return Prisma.sql`"winRate" ${direction} NULLS LAST, "ratedGames" DESC, "rating" DESC, "userId" ASC`;
    case "lastActivity":
      return Prisma.sql`"lastActivity" ${direction} NULLS LAST, "rating" DESC, "userId" ASC`;
    case "rating":
      return Prisma.sql`"rating" ${direction}, "ratingDeviation" ASC, "ratedGames" DESC, "userId" ASC`;
  }
}

export class LeaderboardRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  async getLeaderboard(query: LeaderboardQuery, minRatedGames: number) {
    const eligibility =
      query.status === "qualified"
        ? Prisma.sql`r."ratedGames" >= ${minRatedGames}`
        : Prisma.sql`r."ratedGames" > 0 AND r."ratedGames" < ${minRatedGames}`;
    const [counts, items] = await this.database.$transaction(
      [
        this.database.$queryRaw<{ total: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM "Rating" r
        JOIN "Profile" p ON p."userId" = r."userId" WHERE r."gameMode" = ${query.gameMode} AND ${eligibility}`),
        this.database.$queryRaw<LeaderboardRow[]>(Prisma.sql`
        WITH candidates AS (
          SELECT r."userId", p."username", p."displayName", p."avatarUrl",
                 r."rating", r."ratingDeviation", r."ratedGames",
                 ROW_NUMBER() OVER (ORDER BY r."rating" DESC, r."ratingDeviation" ASC,
                                             r."ratedGames" DESC, r."userId" ASC) AS "ratingRank"
          FROM "Rating" r JOIN "Profile" p ON p."userId" = r."userId"
          WHERE r."gameMode" = ${query.gameMode} AND ${eligibility}
        ), performance AS (
          SELECT mp."userId", COUNT(*)::int AS "ratedResultsCount",
                 COUNT(*) FILTER (WHERE mp."outcome" = 'WIN')::int AS wins,
                 COUNT(*) FILTER (WHERE mp."outcome" = 'LOSS')::int AS losses,
                 COUNT(*) FILTER (WHERE mp."outcome" = 'DRAW')::int AS draws,
                 MAX(m."finishedAt") AS "lastActivity"
          FROM "MatchParticipant" mp JOIN candidates c ON c."userId" = mp."userId"
          JOIN "Match" m ON m.id = mp."matchId"
          WHERE m."isRated" = true AND m.status = 'FINISHED'
            AND m."ratingProcessedAt" IS NOT NULL AND m."finishedAt" IS NOT NULL
            AND m."gameMode" = ${query.gameMode}
            AND mp.outcome IN ('WIN', 'LOSS', 'DRAW')
            AND EXISTS (
              SELECT 1 FROM "RatingHistory" h
              WHERE h."matchId" = m.id AND h."userId" = mp."userId"
                AND h."gameMode" = ${query.gameMode} AND h."ratedGameNumber" IS NOT NULL AND h.result = mp.outcome
            )
          GROUP BY mp."userId"
        ), standings AS (
          SELECT c.*, COALESCE(p."ratedResultsCount", 0) AS "ratedResultsCount",
                 COALESCE(p.wins, 0) AS wins, COALESCE(p.losses, 0) AS losses,
                 COALESCE(p.draws, 0) AS draws,
                 CASE WHEN p."ratedResultsCount" = c."ratedGames" THEN p."lastActivity" ELSE NULL END AS "lastActivity",
                 CASE WHEN p."ratedResultsCount" = c."ratedGames"
                      THEN p.wins::double precision / c."ratedGames" ELSE NULL END AS "winRate"
          FROM candidates c LEFT JOIN performance p ON p."userId" = c."userId"
        )
        SELECT * FROM standings ORDER BY ${ordering(query)}
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total: counts[0].total, items };
  }
}
