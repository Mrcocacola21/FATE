import type { FastifyInstance, FastifyRequest } from "fastify";
import { documented, protectedErrors } from "../openapi/contract";
import type { ConnectionIdentityService, ConnectionIdentity } from "../auth/connectionIdentity";
import { requireIdentity } from "../auth/bearer";
import { AuthError } from "../auth/authErrors";
import type { MatchmakingService } from "../services/matchmakingService";
import { registerApiErrorHandler } from "./apiErrorHandler";
import { parseInput } from "../validation/parseRequest";
import { emptyObjectSchema } from "../validation/commonSchemas";
import { joinQueueSchema } from "../matchmaking/schemas";
import rateLimit from "@fastify/rate-limit";

export async function matchmakingRoutes(
  server: FastifyInstance,
  options: {
    identity: Pick<ConnectionIdentityService, "verify">;
    matchmaking: MatchmakingService;
  },
): Promise<void> {
  await server.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });
  registerApiErrorHandler(server);
  const identities = new WeakMap<FastifyRequest, ConnectionIdentity>();
  server.addHook("preHandler", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    identities.set(request, await requireIdentity(request.headers.authorization, options.identity));
  });
  const user = (request: FastifyRequest) => {
    const identity = identities.get(request);
    if (!identity) throw new AuthError("UNAUTHORIZED");
    return identity;
  };
  server.get(
    "/matchmaking/queue",
    documented({
      operationId: "getMatchmakingStatus",
      tag: "Matchmaking",
      summary: "Return the current queue state",
      auth: "bearer",
      response: "MatchmakingStatus",
      errors: { ...protectedErrors, 429: ["RATE_LIMITED"] },
    }),
    async (request) => options.matchmaking.getSnapshot(user(request).userId),
  );
  server.delete(
    "/matchmaking/queue",
    documented({
      operationId: "leaveMatchmakingQueue",
      tag: "Matchmaking",
      summary: "Cancel queue membership",
      auth: "bearer",
      body: emptyObjectSchema,
      bodyOptional: true,
      response: "MatchmakingStatus",
      errors: { ...protectedErrors, 429: ["RATE_LIMITED"] },
    }),
    async (request) => {
      parseInput(emptyObjectSchema, request.body === undefined ? {} : request.body);
      options.matchmaking.cancel(user(request).userId);
      return options.matchmaking.getSnapshot(user(request).userId);
    },
  );
  server.post(
    "/matchmaking/queue",
    documented({
      operationId: "joinMatchmakingQueue",
      tag: "Matchmaking",
      summary: "Join the rated queue for one mode",
      description:
        "Uses the selected mode's independent rating. An active authenticated WebSocket connection is required.",
      auth: "bearer",
      body: joinQueueSchema,
      response: "MatchmakingStatus",
      errors: {
        ...protectedErrors,
        409: [
          "MATCHMAKING_ALREADY_IN_MATCH",
          "MATCHMAKING_CONNECTION_REQUIRED",
          "MATCHMAKING_IN_QUEUE",
          "MATCHMAKING_CANCELLED",
        ],
        429: ["RATE_LIMITED"],
        503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE", "MATCHMAKING_UNAVAILABLE"],
      },
    }),
    async (request) => {
      const body = parseInput(joinQueueSchema, request.body);
      await options.matchmaking.join(user(request), body.gameMode);
      return options.matchmaking.getSnapshot(user(request).userId);
    },
  );
}
