import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthError } from "../auth/authErrors";
import { StatisticsRepository } from "../repositories/statisticsRepository";
import { PlayerStatisticsService } from "../services/playerStatisticsService";
import { toApiError } from "./apiErrorHandler";

export async function statisticsRoutes(
  server: FastifyInstance,
  options: { playerStatistics?: Pick<PlayerStatisticsService, "getPlayerStatistics"> },
): Promise<void> {
  let service = options.playerStatistics;
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error(
        { category: failure.code, requestId: request.id },
        "Player statistics request failed",
      );
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get<{ Params: { id: string } }>("/users/:id/statistics", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!z.string().uuid().safeParse(request.params.id).success)
      throw new AuthError("INVALID_REQUEST");
    service ??= new PlayerStatisticsService(new StatisticsRepository(), server.log);
    return service.getPlayerStatistics(request.params.id);
  });
}
