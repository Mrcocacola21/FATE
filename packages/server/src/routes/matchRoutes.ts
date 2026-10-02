import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MatchResultError } from "../persistence/matchResult";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";

/** Public, result-only API. Repository initialization stays lazy without DATABASE_URL. */
export async function matchRoutes(server: FastifyInstance): Promise<void> {
  let service: MatchService | undefined;
  server.get<{ Params: { id: string } }>("/matches/:id", async (request, reply) => {
    if (!z.string().uuid().safeParse(request.params.id).success)
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Invalid match id" } });
    try {
      service ??= new MatchService(new MatchRepository(), server.log);
      return await service.getFinishedMatchDetails(request.params.id);
    } catch (error) {
      if (error instanceof MatchResultError)
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      request.log.error({ event: "match:details_failed", matchId: request.params.id }, "Match detail request failed");
      return reply.code(503).send({ error: { code: "MATCH_PERSISTENCE_UNAVAILABLE", message: "Unable to load match result" } });
    }
  });
}
