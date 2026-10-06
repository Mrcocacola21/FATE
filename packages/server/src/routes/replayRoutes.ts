import { documented, protectedErrors } from "../openapi/contract";
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
    await requireIdentity(request.headers.authorization, options.identity, request);
  });
  const query = () =>
    (service ??= new ReplayQueryService(new MatchRepository(), new MatchActionRepository()));
  server.get(
    "/matches/:id/replay",
    documented({
      operationId: "getReplayMetadata",
      tag: "Replay",
      summary: "Read replay participants and revision timeline",
      auth: "bearer",
      params: idParamsSchema,
      response: "ReplayMetadata",
      errors: {
        ...protectedErrors,
        404: ["MATCH_NOT_FOUND"],
        409: ["MATCH_NOT_FINISHED", "MATCH_NOT_REPLAYABLE", "REPLAY_ACTION_GAP"],
      },
    }),
    async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      return query().getMetadata(id);
    },
  );
  server.get(
    "/matches/:id/replay/state",
    documented({
      operationId: "getReplayState",
      tag: "Replay",
      summary: "Read the safe board projection at a revision",
      description:
        "Read-only ReplayView, never authoritative GameState. Revision zero is the initial position; revision must not exceed finalRevision.",
      auth: "bearer",
      params: idParamsSchema,
      query: replayRevisionQuerySchema,
      response: "ReplayState",
      errors: {
        ...protectedErrors,
        400: ["VALIDATION_ERROR", "INVALID_REPLAY_REVISION"],
        404: ["MATCH_NOT_FOUND"],
        409: [
          "MATCH_NOT_FINISHED",
          "MATCH_NOT_REPLAYABLE",
          "REPLAY_ACTION_GAP",
          "REPLAY_FINAL_STATE_MISMATCH",
        ],
      },
    }),
    async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      const { revision } = parseInput(replayRevisionQuerySchema, request.query);
      return query().getState(id, revision);
    },
  );
}
