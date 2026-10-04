import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ConnectionIdentityService } from "../auth/connectionIdentity";
import { MultiplayerIdentityError, type ConnectionIdentity } from "../auth/connectionIdentity";
import { GameModeIdSchema } from "../schemas";
import type { MatchmakingService } from "../services/matchmakingService";
import rateLimit from "@fastify/rate-limit";

export async function matchmakingRoutes(
  server: FastifyInstance,
  options: {
    identity: Pick<ConnectionIdentityService, "verify">;
    matchmaking: MatchmakingService;
  },
): Promise<void> {
  await server.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  server.setErrorHandler((error, request, reply) => {
    const code =
      error instanceof MultiplayerIdentityError
        ? error.code === "INVALID_ACCESS_TOKEN"
          ? "UNAUTHORIZED"
          : error.code
        : "MATCHMAKING_UNAVAILABLE";
    const status =
      code === "AUTH_REQUIRED" || code === "UNAUTHORIZED"
        ? 401
        : code === "MATCHMAKING_UNAVAILABLE"
          ? 503
          : code === "ACCOUNT_BLOCKED" ? 403 : 409;
    if (error.statusCode === 429)
      return reply
        .code(429)
        .send({ error: { code: "RATE_LIMITED", message: "Try again shortly" } });
    if (status >= 500)
      request.log.error(
        { event: "matchmaking:request_failed", code, requestId: request.id },
        "Matchmaking request unavailable",
      );
    reply
      .code(status)
      .send({
        error: {
          code,
          message:
            error instanceof MultiplayerIdentityError
              ? error.message
              : "Unable to search. Try again.",
        },
      });
  });
  const identities = new WeakMap<FastifyRequest, ConnectionIdentity>();
  server.addHook("preHandler", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const header = request.headers.authorization;
    const identity = await options.identity.verify(
      header?.startsWith("Bearer ") ? header.slice(7) : undefined,
    );
    if (!identity)
      throw new MultiplayerIdentityError("AUTH_REQUIRED", "Sign in to find a Rated match");
    identities.set(request, identity);
  });
  const user = (request: FastifyRequest) => identities.get(request)!;
  server.get("/matchmaking/queue", async (request) =>
    options.matchmaking.getSnapshot(user(request).userId),
  );
  server.delete("/matchmaking/queue", async (request) => {
    options.matchmaking.cancel(user(request).userId);
    return options.matchmaking.getSnapshot(user(request).userId);
  });
  server.post("/matchmaking/queue", async (request, reply) => {
    const body = z.object({ gameMode: GameModeIdSchema }).strict().safeParse(request.body);
    if (!body.success)
      return reply
        .code(400)
        .send({
          error: {
            code: "MATCHMAKING_INVALID_REQUEST",
            message: "Choose a game mode; ratings are server-owned",
          },
        });
    await options.matchmaking.join(user(request), body.data.gameMode);
    return options.matchmaking.getSnapshot(user(request).userId);
  });
}
