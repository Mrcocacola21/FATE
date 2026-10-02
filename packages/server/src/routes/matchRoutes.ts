import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MatchResultError } from "../persistence/matchResult";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchActionService } from "../services/matchActionService";
import type { ConnectionIdentityService } from "../auth/connectionIdentity";

export interface MatchRouteOptions {
  identity: Pick<ConnectionIdentityService, "verify">;
  actionHistory?: Pick<MatchActionService, "getCompletedMatchActionHistory">;
}

/** Public, result-only API. Repository initialization stays lazy without DATABASE_URL. */
export async function matchRoutes(server: FastifyInstance, options: MatchRouteOptions): Promise<void> {
  let service: MatchService | undefined;
  let history = options.actionHistory;
  server.get<{ Params: { id: string } }>("/matches/:id/actions", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "")?.[1];
    if (!token) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    try {
      if (!(await options.identity.verify(token))) throw new Error("Invalid identity");
    } catch {
      return reply.code(401).send({ error: { code: "INVALID_ACCESS_TOKEN", message: "Unable to verify access token" } });
    }
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      revisionAfter: z.coerce.number().int().min(0).max(2147483647).default(0),
    }).strict().safeParse(request.query);
    if (!z.string().uuid().safeParse(request.params.id).success || !query.success)
      return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Invalid match id or pagination" } });
    try {
      history ??= new MatchActionService(new MatchRepository(), new MatchActionRepository());
      return await history.getCompletedMatchActionHistory(request.params.id, query.data.revisionAfter, query.data.limit);
    } catch (error) {
      if (error instanceof MatchResultError)
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      request.log.error({ event: "match:actions_failed", matchId: request.params.id }, "Match action history request failed");
      return reply.code(503).send({ error: { code: "MATCH_PERSISTENCE_UNAVAILABLE", message: "Unable to load match actions" } });
    }
  });
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
