import { queryConfig } from "../validation/queryValidation";
import { parseInput } from "../validation/parseRequest";
import type { FastifyInstance } from "fastify";
import { readLeaderboardConfig } from "../leaderboard/config";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { LeaderboardService } from "../services/leaderboardService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export async function leaderboardRoutes(
  server: FastifyInstance,
  options: { leaderboard?: Pick<LeaderboardService, "getLeaderboard"> },
): Promise<void> {
  const configuration = readLeaderboardConfig();
  let service = options.leaderboard;
  const getService = () =>
    (service ??= new LeaderboardService(new LeaderboardRepository(), configuration));
  registerApiErrorHandler(server);
  server.get<{ Querystring: unknown }>("/leaderboard", { config: queryConfig(leaderboardQuerySchema) }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = parseInput(leaderboardQuerySchema, request.query);
    return getService().getLeaderboard(query);
  });
}
