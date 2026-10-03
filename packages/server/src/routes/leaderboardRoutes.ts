import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { readLeaderboardConfig } from "../leaderboard/config";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { LeaderboardService } from "../services/leaderboardService";
import { toApiError } from "./apiErrorHandler";

export async function leaderboardRoutes(
  server: FastifyInstance,
  options: { leaderboard?: Pick<LeaderboardService, "getLeaderboard"> },
): Promise<void> {
  const configuration = readLeaderboardConfig();
  let service = options.leaderboard;
  const getService = () =>
    (service ??= new LeaderboardService(new LeaderboardRepository(), configuration));
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error(
        { category: failure.code, requestId: request.id },
        "Leaderboard request failed",
      );
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get<{ Querystring: unknown }>("/leaderboard", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = leaderboardQuerySchema.safeParse(request.query);
    if (!query.success) throw new AuthError("INVALID_REQUEST");
    return getService().getLeaderboard(query.data);
  });
}
