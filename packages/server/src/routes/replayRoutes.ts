import { queryConfig } from "../validation/queryValidation";
import type { FastifyInstance } from "fastify";
import type { ConnectionIdentityService } from "../auth/connectionIdentity";
import { requireIdentity } from "../auth/bearer";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { ReplayQueryService } from "../services/replayQueryService";
import { replayRevisionQuerySchema } from "../replay/querySchema";
import { parseInput } from "../validation/parseRequest";
import { idParamsSchema } from "../validation/commonSchemas";
import { registerApiErrorHandler } from "./apiErrorHandler";

export async function replayRoutes(
  server: FastifyInstance,
  options: {
    identity: Pick<ConnectionIdentityService, "verify">;
    replayQuery?: Pick<ReplayQueryService, "getMetadata" | "getState">;
  },
) {
  registerApiErrorHandler(server);
  let service = options.replayQuery;
  server.addHook("preHandler", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireIdentity(request.headers.authorization, options.identity);
  });
  const query = () =>
    (service ??= new ReplayQueryService(new MatchRepository(), new MatchActionRepository()));
  server.get("/matches/:id/replay", async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return query().getMetadata(id);
  });
  server.get("/matches/:id/replay/state", { config: queryConfig(replayRevisionQuerySchema) }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const { revision } = parseInput(replayRevisionQuerySchema, request.query);
    return query().getState(id, revision);
  });
}
