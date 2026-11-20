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
    identities.set(request, await requireIdentity(request.headers.authorization, options.identity, request));
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
      summary: "Join the Rated or Casual queue for one mode",
      description:
        "Uses the selected mode's independent rating to pair players. matchType defaults to RATED; CASUAL matches never change ratings and pause searching for less after a missed match. An active authenticated WebSocket connection is required.",
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
          "MATCHMAKING_PENALTY",
        ],
        429: ["RATE_LIMITED"],
        503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE", "MATCHMAKING_UNAVAILABLE"],
      },
    }),
    async (request) => {
      const body = parseInput(joinQueueSchema, request.body);
      await options.matchmaking.join(user(request), body.gameMode, body.matchType ?? "RATED");
      return options.matchmaking.getSnapshot(user(request).userId);
    },
  );
  // A found match is offered first; both players accept or it falls through.
  for (const [path, operationId, summary, act] of [
    ["/matchmaking/accept", "acceptMatchmakingMatch", "Accept the offered rated match", "accept"],
    ["/matchmaking/decline", "declineMatchmakingMatch", "Decline the offered rated match", "decline"],
  ] as const)
    server.post(
      path,
      documented({
        operationId,
        tag: "Matchmaking",
        summary,
        description:
          "Harmless when nothing is offered. Declining, or letting the offer lapse, pauses searching for a while.",
        auth: "bearer",
        body: emptyObjectSchema,
        bodyOptional: true,
        response: "MatchmakingStatus",
        errors: { ...protectedErrors, 429: ["RATE_LIMITED"] },
      }),
      async (request) => {
        parseInput(emptyObjectSchema, request.body === undefined ? {} : request.body);
        options.matchmaking[act](user(request).userId);
        return options.matchmaking.getSnapshot(user(request).userId);
      },
    );
}
