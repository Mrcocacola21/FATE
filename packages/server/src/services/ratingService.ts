import { GAME_MODE_IDS, isGameModeId, type GameModeId } from "rules";
import { Prisma } from "@prisma/client";
import { AuthError } from "../auth/authErrors";
import { INITIAL_RATING, RATING_TRANSACTION_ATTEMPTS } from "../rating/constants";
import { eligibleRatingPlayers } from "../rating/eligibility";
import { calculateRating, Glicko2Error, validateRating } from "../rating/glicko2";
import type { RatingHistoryQuery } from "../rating/historySchema";
import { RatingError } from "../rating/ratingError";
import type { Glicko2Options } from "../rating/types";
import { getRankMetadata } from "../rating/rankTiers";
import type { RatingRepository } from "../repositories/ratingRepository";

function transactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" ||
      (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))))
  );
}

export interface RatingProcessingResult {
  matchId: string;
  outcome: "processed" | "alreadyProcessed" | "ineligible";
  alreadyProcessed: boolean;
}

export class RatingService {
  constructor(
    private readonly repository: Pick<
      RatingRepository,
      "userExists" | "getRating" | "getHistory" | "serializable"
    > & Partial<Pick<RatingRepository, "getRatings">>,
    private readonly logger: {
      info(data: object, message: string): void;
      error(data: object, message: string): void;
    } = console,
    // Server-owned configuration only; routes never accept algorithm parameters.
    private readonly configuration: Partial<Glicko2Options> = {},
  ) {}

  async getPlayerRating(userId: string, gameMode: GameModeId) {
    if (!(await this.repository.userExists(userId))) throw new AuthError("USER_NOT_FOUND");
    const state = await this.repository.getRating(userId, gameMode);
    if (state) validateRating(state);
    const rating = state ?? { userId, gameMode, ...INITIAL_RATING, ratedGames: 0 };
    return { ...rating, gameMode, ...getRankMetadata(rating.rating) };
  }

  async getAllPlayerRatings(userId: string) {
    const entries = await Promise.all(
      GAME_MODE_IDS.map(
        async (gameMode) => [gameMode, await this.getPlayerRating(userId, gameMode)] as const,
      ),
    );
    return {
      ratings: Object.fromEntries(entries) as Record<
        GameModeId,
        Awaited<ReturnType<RatingService["getPlayerRating"]>>
      >,
    };
  }

  /** Runtime identities have already been authenticated; one query for discovery. */
  async getPlayerRatings(userIds: string[], gameMode: GameModeId): Promise<Map<string, number>> {
    if (!this.repository.getRatings)
      return new Map(
        await Promise.all(
          userIds.map(
            async (id) => [id, (await this.getPlayerRating(id, gameMode)).rating] as const,
          ),
        ),
      );
    const rows = await this.repository.getRatings(userIds, gameMode);
    rows.forEach(validateRating);
    const found = new Map(rows.map((row) => [row.userId, row.rating]));
    return new Map(userIds.map((id) => [id, found.get(id) ?? INITIAL_RATING.rating]));
  }

  async getRatingHistory(userId: string, query: RatingHistoryQuery) {
    if (!(await this.repository.userExists(userId))) throw new AuthError("USER_NOT_FOUND");
    const { total, items } = await this.repository.getHistory(userId, query);
    return {
      items: items.map((item) => ({
        ...item,
        ratingDelta: item.ratingAfter - item.ratingBefore,
        createdAt: item.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Safe recovery entrypoint for a FINISHED rated match after crash/restart.
   * Exactly-once effect, irrespective of delivery count; no historical backfill. */
  async processRatedMatch(matchId: string): Promise<RatingProcessingResult> {
    for (let attempt = 1; attempt <= RATING_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        const result = await this.repository.serializable(
          async (tx): Promise<RatingProcessingResult> => {
            const match = await tx.getMatch(matchId);
            if (!match) throw new RatingError("RATING_MATCH_NOT_FOUND");
            const players = eligibleRatingPlayers(match);
            const response = (
              outcome: RatingProcessingResult["outcome"],
            ): RatingProcessingResult => ({
              matchId,
              outcome,
              alreadyProcessed: outcome === "alreadyProcessed",
            });
            if (!players || !isGameModeId(match.gameMode)) {
              if (match.ratingProcessedAt) throw new RatingError("RATING_INCONSISTENT_HISTORY");
              return response("ineligible");
            }
            const histories = await tx.findMatchHistory(matchId);
            if (match.ratingProcessedAt) {
              if (
                histories.length !== 2 ||
                !players.every((p, i) =>
                  histories.some(
                    (h) =>
                      h.userId === p.userId &&
                      (h.gameMode === null || h.gameMode === match.gameMode) &&
                      h.opponentUserId === players[1 - i].userId &&
                      h.result === p.result &&
                      h.ratedGameNumber !== null,
                  ),
                )
              )
                throw new RatingError("RATING_INCONSISTENT_HISTORY");
              return response("alreadyProcessed");
            }
            if (histories.length) throw new RatingError("RATING_INCONSISTENT_HISTORY");
            await tx.lockPlayers(
              players.map((p) => p.userId),
              match.gameMode,
            );
            const before = [
              await tx.getOrCreateRating(players[0].userId, match.gameMode),
              await tx.getOrCreateRating(players[1].userId, match.gameMode),
            ];
            if (
              before.some(
                (p) =>
                  !Number.isSafeInteger(p.ratedGames) ||
                  p.ratedGames < 0 ||
                  p.ratedGames >= 2147483647,
              )
            )
              throw new RatingError("RATING_INVALID_STATE");
            // Compute BOTH from the immutable pre-match snapshots before either write.
            const after = players.map((p, i) =>
              calculateRating(
                before[i],
                [{ opponent: before[1 - i], score: p.score }],
                this.configuration,
              ),
            );
            const timestamp = new Date();
            for (let i = 0; i < 2; i++) {
              await tx.saveRating(players[i].userId, match.gameMode, after[i]);
              await tx.insertHistory(
                matchId,
                match.gameMode,
                players[i],
                players[1 - i].userId,
                before[i],
                after[i],
                before[i].ratedGames + 1,
                timestamp,
              );
            }
            await tx.markProcessed(matchId, timestamp);
            return response("processed");
          },
        );
        this.logger.info(
          { event: "rating:processed", ...result, retryCount: attempt - 1 },
          "Rating processing completed",
        );
        return result;
      } catch (error) {
        // Prisma ORM conflicts use P2034; raw FOR UPDATE queries expose SQLSTATE
        // 40001/40P01 through P2010. Retry only those exact conflict codes.
        // Unique/integrity failures and mathematical/domain errors are NOT retried.
        if (transactionConflict(error)) {
          if (attempt === RATING_TRANSACTION_ATTEMPTS) {
            this.logger.error(
              { event: "rating:conflict_exhausted", matchId, retryCount: attempt - 1 },
              "Rating transaction retries exhausted",
            );
            throw new RatingError("RATING_TRANSACTION_CONFLICT");
          }
          this.logger.info(
            { event: "rating:retry", matchId, retryCount: attempt },
            "Retrying rating transaction conflict",
          );
          await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
          continue;
        }
        this.logger.error(
          {
            event: "rating:failed",
            matchId,
            code:
              error instanceof RatingError || error instanceof Glicko2Error
                ? error.code
                : "RATING_PROCESSING_FAILED",
          },
          "Rating processing failed",
        );
        throw error;
      }
    }
    throw new RatingError("RATING_TRANSACTION_CONFLICT");
  }
}
