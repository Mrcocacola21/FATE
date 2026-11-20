import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { documented, protectedErrors } from "../openapi/contract";
import type { ConnectionIdentityService, ConnectionIdentity } from "../auth/connectionIdentity";
import { requireIdentity } from "../auth/bearer";
import { AuthError } from "../auth/authErrors";
import type { MatchmakingService } from "../services/matchmakingService";
import type { MatchLifecycle } from "../persistence/matchLifecycle";
import { registerApiErrorHandler } from "./apiErrorHandler";
import { parseInput } from "../validation/parseRequest";
import { gameModeSchema } from "../validation/commonSchemas";
import { BOT_DIFFICULTIES, type BotDifficulty, type BotRandom } from "../bot/types";
import { chooseBotFigureSet } from "../bot/lobby";
import type { GameModeId, PlayerId } from "rules";

export const createBotMatchSchema = z
  .object({ difficulty: z.enum(BOT_DIFFICULTIES), gameMode: gameModeSchema })
  .strict();

/** The response of a bot match request: where the player sits. */
export function toBotMatchDto(created: {
  roomId: string;
  matchId: string;
  seat: PlayerId;
  gameMode: GameModeId;
  difficulty: BotDifficulty;
}) {
  return {
    roomId: created.roomId,
    matchId: created.matchId,
    seat: created.seat,
    gameMode: created.gameMode,
    difficulty: created.difficulty,
    matchType: "CASUAL" as const,
  };
}

const serverRandom: BotRandom = { next: () => randomInt(0, 2 ** 32) / 2 ** 32 };

export async function botRoutes(
  server: FastifyInstance,
  options: {
    identity: Pick<ConnectionIdentityService, "verify">;
    matchmaking: MatchmakingService;
    lifecycle: MatchLifecycle;
  },
): Promise<void> {
  await server.register(rateLimit, {
    max: 20,
    timeWindow: "1 minute",
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });
  registerApiErrorHandler(server);
  const identities = new WeakMap<FastifyRequest, ConnectionIdentity>();
  server.addHook("preHandler", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    identities.set(
      request,
      await requireIdentity(request.headers.authorization, options.identity, request),
    );
  });
  server.post(
    "/bot-matches",
    documented({
      operationId: "createBotMatch",
      tag: "Matchmaking",
      summary: "Start a Casual match against the server bot",
      description:
        "The bot takes one seat and the player's seat is reserved. The match starts once the player joins that seat over WebSocket. Bot matches never change ratings; they are kept in the player's history and replays.",
      auth: "bearer",
      body: createBotMatchSchema,
      response: "BotMatch",
      errors: {
        ...protectedErrors,
        409: ["MATCHMAKING_ALREADY_IN_MATCH", "MATCHMAKING_IN_QUEUE"],
        429: ["RATE_LIMITED"],
        503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE", "MATCHMAKING_UNAVAILABLE"],
      },
    }),
    async (request, reply) => {
      const identity = identities.get(request);
      if (!identity) throw new AuthError("UNAUTHORIZED");
      const body = parseInput(createBotMatchSchema, request.body);
      const playerSeat: PlayerId = serverRandom.next() < 0.5 ? "P1" : "P2";
      const created = await options.matchmaking.withCompetitor(identity.userId, undefined, () =>
        options.lifecycle.createBotRoom({
          identity,
          difficulty: body.difficulty,
          gameMode: body.gameMode,
          playerSeat,
          botFigureSet:
            body.gameMode === "standard"
              ? chooseBotFigureSet(body.difficulty, serverRandom)
              : undefined,
        }),
      );
      reply.code(201);
      return toBotMatchDto({ ...created, gameMode: body.gameMode, difficulty: body.difficulty });
    },
  );
}
