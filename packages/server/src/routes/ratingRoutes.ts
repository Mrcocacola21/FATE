import { GAME_MODE_IDS } from "rules";
import { GameModeIdSchema } from "../schemas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthError } from "../auth/authErrors";
import { ratingHistoryQuerySchema } from "../rating/historySchema";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { toApiError } from "./apiErrorHandler";

export type RatingReads = Pick<RatingService, "getPlayerRating" | "getRatingHistory">;
export async function ratingRoutes(
  server: FastifyInstance,
  options: { ratings?: RatingReads },
): Promise<void> {
  let service = options.ratings;
  const getService = () => (service ??= new RatingService(new RatingRepository(), server.log));
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error({ category: failure.code, requestId: request.id }, "Rating request failed");
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get<{ Params: { id: string } }>("/users/:id/rating", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!z.string().uuid().safeParse(request.params.id).success)
      throw new AuthError("INVALID_REQUEST");
    const query = z
      .object({ gameMode: GameModeIdSchema.default("standard") })
      .strict()
      .safeParse(request.query);
    if (!query.success) throw new AuthError("INVALID_REQUEST");
    return getService().getPlayerRating(request.params.id, query.data.gameMode);
  });
  server.get<{ Params: { id: string } }>("/users/:id/ratings", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!z.string().uuid().safeParse(request.params.id).success)
      throw new AuthError("INVALID_REQUEST");
    const entries = await Promise.all(
      GAME_MODE_IDS.map(
        async (mode) =>
          [mode, await getService().getPlayerRating(request.params.id, mode)] as const,
      ),
    );
    return { ratings: Object.fromEntries(entries) };
  });
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    "/users/:id/rating/history",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const query = ratingHistoryQuerySchema.safeParse(request.query);
      if (!z.string().uuid().safeParse(request.params.id).success || !query.success)
        throw new AuthError("INVALID_REQUEST");
      return getService().getRatingHistory(request.params.id, query.data);
    },
  );
}
