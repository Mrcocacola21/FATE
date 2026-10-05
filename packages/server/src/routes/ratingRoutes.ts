import { documented, readErrors } from "../openapi/contract";
import { idParamsSchema, emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { GAME_MODE_IDS } from "rules";
import type { FastifyInstance } from "fastify";
import { ratingQuerySchema } from "../rating/historySchema";
import { ratingHistoryQuerySchema } from "../rating/historySchema";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export type RatingReads = Pick<RatingService, "getPlayerRating" | "getRatingHistory">;
export async function ratingRoutes(
  server: FastifyInstance,
  options: { ratings?: RatingReads },
): Promise<void> {
  let service = options.ratings;
  const getService = () => (service ??= new RatingService(new RatingRepository(), server.log));
  registerApiErrorHandler(server);
  server.get<{ Params: { id: string } }>(
    "/users/:id/rating",
    documented({
      operationId: "getUserRating",
      tag: "Ratings",
      summary: "Return Glicko-2 rating and rank for one mode",
      params: idParamsSchema,
      query: ratingQuerySchema,
      response: "PlayerModeRating",
      errors: readErrors,
    }),
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      parseInput(idParamsSchema, request.params);
      const query = parseInput(ratingQuerySchema, request.query);
      return getService().getPlayerRating(request.params.id, query.gameMode);
    },
  );
  server.get<{ Params: { id: string } }>(
    "/users/:id/ratings",
    documented({
      operationId: "getUserRatings",
      tag: "Ratings",
      summary: "Return independent Standard, Draft and Classic ratings",
      params: idParamsSchema,
      response: "PlayerRatings",
      errors: readErrors,
    }),
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      parseInput(idParamsSchema, request.params);
      parseInput(emptyObjectSchema, request.query);
      const entries = await Promise.all(
        GAME_MODE_IDS.map(
          async (mode) =>
            [mode, await getService().getPlayerRating(request.params.id, mode)] as const,
        ),
      );
      return { ratings: Object.fromEntries(entries) };
    },
  );
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    "/users/:id/rating/history",
    documented({
      operationId: "getUserRatingHistory",
      tag: "Ratings",
      summary: "List rating changes for one mode",
      params: idParamsSchema,
      query: ratingHistoryQuerySchema,
      response: "RatingHistory",
      errors: readErrors,
    }),
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      parseInput(idParamsSchema, request.params);
      const query = parseInput(ratingHistoryQuerySchema, request.query);
      return getService().getRatingHistory(request.params.id, query);
    },
  );
}
