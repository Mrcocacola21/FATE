import { idParamsSchema, emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import type { FastifyInstance } from "fastify";
import { StatisticsRepository } from "../repositories/statisticsRepository";
import { PlayerStatisticsService } from "../services/playerStatisticsService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export async function statisticsRoutes(
  server: FastifyInstance,
  options: { playerStatistics?: Pick<PlayerStatisticsService, "getPlayerStatistics"> },
): Promise<void> {
  let service = options.playerStatistics;
  registerApiErrorHandler(server);
  server.get<{ Params: { id: string } }>("/users/:id/statistics", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    parseInput(idParamsSchema, request.params);
    parseInput(emptyObjectSchema, request.query);
    service ??= new PlayerStatisticsService(new StatisticsRepository(), server.log);
    return service.getPlayerStatistics(request.params.id);
  });
}
