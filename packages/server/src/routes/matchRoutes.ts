import { documented, protectedErrors } from "../openapi/contract";
import type { FastifyInstance } from "fastify";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchActionService } from "../services/matchActionService";
import type { ConnectionIdentityService } from "../auth/connectionIdentity";
import { requireIdentity } from "../auth/bearer";
import { parseInput } from "../validation/parseRequest";
import { idParamsSchema } from "../validation/commonSchemas";
import { matchActionsQuerySchema } from "../matches/actionQuerySchema";
import { registerApiErrorHandler } from "./apiErrorHandler";

export interface MatchRouteOptions {
  identity: Pick<ConnectionIdentityService, "verify">;
  actionHistory?: Pick<MatchActionService, "getCompletedMatchActionHistory">;
}

export async function matchRoutes(
  server: FastifyInstance,
  options: MatchRouteOptions,
): Promise<void> {
  registerApiErrorHandler(server);
  let service: MatchService | undefined;
  let history = options.actionHistory;
  server.get(
    "/matches/:id/actions",
    documented({
      operationId: "getMatchActions",
      tag: "Matches",
      summary: "Read public action history for a completed match",
      description:
        "Read-only, player-neutral action metadata and allowlisted events; private choices are omitted.",
      auth: "bearer",
      params: idParamsSchema,
      query: matchActionsQuerySchema,
      response: "MatchActions",
      errors: { ...protectedErrors, 404: ["MATCH_NOT_FOUND"], 409: ["MATCH_NOT_FINISHED"] },
    }),
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await requireIdentity(request.headers.authorization, options.identity, request);
      const { id } = parseInput(idParamsSchema, request.params);
      const query = parseInput(matchActionsQuerySchema, request.query);
      history ??= new MatchActionService(new MatchRepository(), new MatchActionRepository());
      return history.getCompletedMatchActionHistory(id, query.revisionAfter, query.limit);
    },
  );
  server.get(
    "/matches/:id",
    documented({
      operationId: "getMatch",
      tag: "Matches",
      summary: "Return completed match details",
      params: idParamsSchema,
      response: "MatchDetails",
      errors: {
        404: ["MATCH_NOT_FOUND"],
        409: ["MATCH_NOT_FINISHED"],
        503: ["DATABASE_UNAVAILABLE"],
      },
    }),
    async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      service ??= new MatchService(new MatchRepository(), server.log);
      return service.getFinishedMatchDetails(id);
    },
  );
}
