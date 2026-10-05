import { documented, readErrors } from "../openapi/contract";
import { idParamsSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import type { FastifyInstance } from "fastify";
import { matchHistoryQuerySchema } from "../matches/historySchema";
import { MatchHistoryRepository } from "../repositories/matchHistoryRepository";
import { MatchHistoryService } from "../services/matchHistoryService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export async function matchHistoryRoutes(
  server: FastifyInstance,
  options: {
    matchHistory?: Pick<MatchHistoryService, "getUserMatchHistory">;
  },
): Promise<void> {
  let service = options.matchHistory;
  registerApiErrorHandler(server);
  server.get<{ Params: { id: string } }>(
    "/users/:id/matches",
    documented({
      operationId: "listUserMatches",
      tag: "Matches",
      summary: "List completed matches for a user",
      params: idParamsSchema,
      query: matchHistoryQuerySchema,
      response: "MatchHistory",
      errors: readErrors,
    }),
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      parseInput(idParamsSchema, request.params);
      const query = parseInput(matchHistoryQuerySchema, request.query);
      service ??= new MatchHistoryService(new MatchHistoryRepository());
      return service.getUserMatchHistory(request.params.id, query);
    },
  );
}
