import type { GameModeId } from "rules";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { INITIAL_RATING } from "../rating/constants";
import type { Glicko2Rating } from "../rating/types";
import type { RatingHistoryQuery } from "../rating/historySchema";
import type { RatingCompetitor } from "../rating/eligibility";
import { RatingError } from "../rating/ratingError";

const ratingSelect = {
  userId: true,
  gameMode: true,
  rating: true,
  ratingDeviation: true,
  volatility: true,
  ratedGames: true,
} satisfies Prisma.RatingSelect;
const historySelect = {
  id: true,
  gameMode: true,
  matchId: true,
  opponentUserId: true,
  result: true,
  ratedGameNumber: true,
  ratingBefore: true,
  ratingAfter: true,
  ratingDeviationBefore: true,
  ratingDeviationAfter: true,
  volatilityBefore: true,
  volatilityAfter: true,
  createdAt: true,
} satisfies Prisma.RatingHistorySelect;

export class RatingTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async getMatch(matchId: string) {
    // Match lock also serializes duplicate deliveries and canonical-result edits.
    await this.tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId}::uuid FOR UPDATE`;
    return this.tx.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        isRated: true,
        ratingProcessedAt: true,
        gameMode: true,
        finishedAt: true,
        winnerSeat: true,
        loserSeat: true,
        winnerUserId: true,
        loserUserId: true,
        finishReason: true,
        finalRevision: true,
        participants: { select: { seat: true, userId: true, outcome: true } },
      },
    });
  }

  findMatchHistory(matchId: string) {
    return this.tx.ratingHistory.findMany({
      where: { matchId },
      select: { ...historySelect, userId: true },
    });
  }

  async lockPlayers(userIds: string[], gameMode: GameModeId): Promise<void> {
    // Native upsert locks the actual mode row, including first-game initialization.
    // Stable user ordering avoids opposite-seat deadlocks. Other modes stay independent.
    for (const userId of [...userIds].sort()) await this.getOrCreateRating(userId, gameMode);
  }

  async getOrCreateRating(userId: string, gameMode: GameModeId) {
    // Non-empty update uses PostgreSQL's native upsert. Serializable retries cover
    // an earlier snapshot when another transaction initialized the same user.
    try {
      return await this.tx.rating.upsert({
        where: { userId_gameMode: { userId, gameMode } },
        create: { userId, gameMode, ...INITIAL_RATING },
        update: { ratedGames: { increment: 0 } },
        select: ratingSelect,
      });
    } catch (error) {
      // PostgreSQL permits NaN/Infinity in float columns; Prisma rejects decoding
      // them before the pure validator runs. Treat corrupt storage as permanent.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2023")
        throw new RatingError("RATING_INVALID_STATE");
      throw error;
    }
  }

  async saveRating(userId: string, gameMode: GameModeId, after: Glicko2Rating): Promise<void> {
    await this.tx.rating.update({
      where: { userId_gameMode: { userId, gameMode } },
      data: { ...after, ratedGames: { increment: 1 } },
    });
  }

  async insertHistory(
    matchId: string,
    gameMode: GameModeId,
    player: RatingCompetitor,
    opponentUserId: string,
    before: Glicko2Rating,
    after: Glicko2Rating,
    ratedGameNumber: number,
    createdAt: Date,
  ): Promise<void> {
    await this.tx.ratingHistory.create({
      data: {
        matchId,
        gameMode,
        userId: player.userId,
        opponentUserId,
        result: player.result,
        ratedGameNumber,
        createdAt,
        ratingBefore: before.rating,
        ratingAfter: after.rating,
        ratingDeviationBefore: before.ratingDeviation,
        ratingDeviationAfter: after.ratingDeviation,
        volatilityBefore: before.volatility,
        volatilityAfter: after.volatility,
      },
    });
  }

  async markProcessed(matchId: string, timestamp: Date): Promise<void> {
    await this.tx.match.update({ where: { id: matchId }, data: { ratingProcessedAt: timestamp } });
  }
}

export class RatingRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  userExists(userId: string): Promise<{ id: string } | null> {
    return this.database.user.findUnique({ where: { id: userId }, select: { id: true } });
  }

  getRating(
    userId: string,
    gameMode: GameModeId,
  ): Promise<Prisma.RatingGetPayload<{ select: typeof ratingSelect }> | null> {
    return this.database.rating.findUnique({
      where: { userId_gameMode: { userId, gameMode } },
      select: ratingSelect,
    });
  }

  async getRatings(userIds: string[], gameMode: GameModeId) {
    return this.database.rating.findMany({
      where: { userId: { in: userIds }, gameMode },
      select: ratingSelect,
    });
  }

  async getHistory(userId: string, query: RatingHistoryQuery) {
    const where = { userId, gameMode: query.gameMode };
    const [total, items] = await this.database.$transaction(
      [
        this.database.ratingHistory.count({ where }),
        this.database.ratingHistory.findMany({
          where,
          select: historySelect,
          // Period numbers capture durable per-player order; legacy unnumbered rows
          // fall back to timestamps/IDs. API is newest first.
          orderBy: [
            { ratedGameNumber: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { total, items };
  }

  serializable<T>(run: (transaction: RatingTransaction) => Promise<T>): Promise<T> {
    return this.database.$transaction((tx) => run(new RatingTransaction(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    });
  }
}
