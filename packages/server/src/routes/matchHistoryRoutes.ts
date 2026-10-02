import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthError } from "../auth/authErrors";
import { matchHistoryQuerySchema } from "../matches/historySchema";
import { MatchHistoryRepository } from "../repositories/matchHistoryRepository";
import { MatchHistoryService } from "../services/matchHistoryService";
import { toApiError } from "./apiErrorHandler";

export async function matchHistoryRoutes(
  server: FastifyInstance,
  options: {
    matchHistory?: Pick<MatchHistoryService, "getUserMatchHistory">;
  },
): Promise<void> {
  let service = options.matchHistory;
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error(
        { category: failure.code, requestId: request.id },
        "Match history request failed",
      );
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get<{ Params: { id: string } }>("/users/:id/matches", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = matchHistoryQuerySchema.safeParse(request.query);
    if (!z.string().uuid().safeParse(request.params.id).success || !query.success)
      throw new AuthError("INVALID_REQUEST");
    service ??= new MatchHistoryService(new MatchHistoryRepository());
    return service.getUserMatchHistory(request.params.id, query.data);
  });
}
