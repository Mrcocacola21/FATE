import { queryConfig } from "./validation/queryValidation";
import { AuthError } from "./auth/authErrors";
import { requireIdentity } from "./auth/bearer";
import { AppError } from "./errors/appError";
import { parseInput } from "./validation/parseRequest";
import { createRoomSchema, roomParamsSchema, heroParamsSchema, playerQuerySchema } from "./lobby/restSchemas";
import type { MatchmakingService } from "./services/matchmakingService";
import { readLeaderboardConfig } from "./leaderboard/config";
// packages/server/src/routes.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  GameAction,
  makePlayerView,
  projectEventsForRecipient,
  HERO_REGISTRY,
  getHeroMeta,
} from "rules";
import type { MatchLifecycle } from "./persistence/matchLifecycle";
import type { ConnectionIdentityService } from "./auth/connectionIdentity";
import { GameActionSchema } from "./schemas";
import { isActionAllowedByPlayer } from "./permissions";
import {
  getGameRoom,
  listGameRooms,
  listRoomSummaries,
  touchGameRoom,
} from "./store";
import { broadcastActionResult, broadcastRoomState, getActiveFateRoomIds } from "./ws";
import { FATE_CREATE_KEY, enqueueRoomCommand, fateRoomKey } from "./roomQueue";
import {
  canCreateTestRoom,
  getTestRoomCapabilities,
} from "./testRoom";

function hasDebugRestAccess(request: FastifyRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.FATE_DEBUG_TOKEN;
  const provided = request.headers["x-fate-debug-token"];
  return (
    typeof expected === "string" &&
    expected.length > 0 &&
    typeof provided === "string" &&
    provided === expected
  );
}

function requireDebugRestAccess(request: FastifyRequest): void {
  if (!hasDebugRestAccess(request)) throw new AuthError("UNAUTHORIZED");
}

export async function registerRoutes(
  server: FastifyInstance, lifecycle: MatchLifecycle,
  identityService: Pick<ConnectionIdentityService, "verify">,
  matchmaking?: MatchmakingService,
  interruptedRoom: (roomId: string) => Promise<boolean> = async () => false,
) {
  async function createPersistentRoom(options: Parameters<MatchLifecycle["createRoom"]>[0], createdById: string | null) {
    const create = () => lifecycle.createRoom(options, undefined, createdById);
    return matchmaking && createdById && options?.roomMode !== "test"
      ? matchmaking.withCompetitor(createdById, undefined, create) : create();
  }
  async function creatorId(request: FastifyRequest) {
    if (request.headers.authorization === undefined) return null;
    return (await requireIdentity(request.headers.authorization, identityService)).userId;
  }
  server.get("/", async () => ({
    name: "fate-server",
    version: process.env.npm_package_version ?? "unknown",
  }));

  server.get("/api/capabilities", async () => ({
    testRooms: getTestRoomCapabilities(),
  }));

  const competitiveConfig = readLeaderboardConfig();
  server.get("/api/competitive/config", async () => competitiveConfig);

  server.get("/api/heroes", async () => Object.values(HERO_REGISTRY));

  server.get(
    "/api/heroes/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const heroId = parseInput(heroParamsSchema, request.params).id;
      const hero = getHeroMeta(heroId);
      if (!hero) {
        throw new AppError("HERO_NOT_FOUND", 404, "Hero not found.");
      }
      reply.send(hero);
    }
  );

  server.get("/rooms", async () => {
    await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
    await lifecycle.refreshRatedLobbies(listGameRooms());
    return listRoomSummaries();
  });

  server.get("/rooms/:id", async (request) => {
    const { id } = parseInput(roomParamsSchema, request.params);
    const runtime = getGameRoom(id);
    if (runtime) await lifecycle.refreshRatedLobbies([runtime]);
    const room = listRoomSummaries().find((item) => item.id === id);
    if (!room) {
      const interrupted = await interruptedRoom(id);
      throw new AppError(interrupted ? "MATCH_INTERRUPTED" : "ROOM_NOT_FOUND", interrupted ? 410 : 404,
        interrupted ? "This match was interrupted by a server restart and cannot be resumed." : "Room not found.");
    }
    return room;
  });

  server.post(
    "/rooms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(createRoomSchema, request.body === undefined ? {} : request.body);
      if (
        input.roomMode === "test" &&
        !canCreateTestRoom(input.debugToken)
      ) {
        throw new AuthError("FORBIDDEN");
      }

      const createdById = await creatorId(request);
      const room = await enqueueRoomCommand(FATE_CREATE_KEY, async () => {
        await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
        return createPersistentRoom({
          seed: input.seed,
          arenaId: input.arenaId,
          roomMode: input.roomMode,
          gameMode: input.gameMode,
          matchType: input.matchType,
          lobbyName: input.lobbyName,
        }, createdById);
      });
      if (!room) return;
      reply.code(201).send({
        roomId: room.id,
        roomMode: room.roomMode,
        matchType: room.matchType,
        gameMode: room.gameMode,
      });
    }
  );

  server.post(
    "/api/games",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = parseInput(createRoomSchema, request.body === undefined ? {} : request.body);
      if (
        input.roomMode === "test" &&
        !canCreateTestRoom(input.debugToken)
      ) {
        throw new AuthError("FORBIDDEN");
      }

      const createdById = await creatorId(request);
      const room = await enqueueRoomCommand(FATE_CREATE_KEY, async () => {
        await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
        return createPersistentRoom({
          seed: input.seed,
          arenaId: input.arenaId,
          roomMode: input.roomMode,
          gameMode: input.gameMode,
          matchType: input.matchType,
          lobbyName: input.lobbyName,
        }, createdById);
      });
      if (!room) return;
      const views = {
        P1: makePlayerView(room.state, "P1"),
        P2: makePlayerView(room.state, "P2"),
      };

      reply.code(201).send({
        gameId: room.id,
        matchType: room.matchType,
        seed: room.seed,
        views,
      });
    }
  );

  server.get(
    "/api/games/:id",
    { config: queryConfig(playerQuerySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireDebugRestAccess(request);
      const gameId = parseInput(roomParamsSchema, request.params).id;
      const room = getGameRoom(gameId);
      if (!room) {
        throw new AppError("ROOM_NOT_FOUND", 404, "Room not found.");
      }

      const { playerId } = parseInput(playerQuerySchema, request.query);

      const view = makePlayerView(room.state, playerId);
      touchGameRoom(room);
      reply.send({ gameId: room.id, seed: room.seed, view });
    }
  );

  server.get(
    "/api/games/:id/log",
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireDebugRestAccess(request);
      const gameId = parseInput(roomParamsSchema, request.params).id;
      const room = getGameRoom(gameId);
      if (!room) {
        throw new AppError("ROOM_NOT_FOUND", 404, "Room not found.");
      }

      touchGameRoom(room);
      reply.send({ gameId: room.id, log: room.actionLog });
    }
  );

  server.post(
    "/api/games/:id/actions",
    { config: queryConfig(playerQuerySchema) },
    async (request: FastifyRequest, reply: FastifyReply) => {
      requireDebugRestAccess(request);
      const gameId = parseInput(roomParamsSchema, request.params).id;
      const { playerId } = parseInput(playerQuerySchema, request.query);

      const parsedAction = parseInput(GameActionSchema, request.body);
      const action: GameAction =
        parsedAction.type === "resolvePendingRoll"
          ? ({
              ...parsedAction,
              player: parsedAction.player ?? playerId,
            } as GameAction)
          : (parsedAction as GameAction);

      const outcome = await enqueueRoomCommand(fateRoomKey(gameId), async () => {
        const room = getGameRoom(gameId);
        if (!room) {
          throw new AppError("ROOM_NOT_FOUND", 404, "Room not found.");
        }

        if (room.state.phase === "ended") {
          throw new AppError("GAME_ENDED", 409, "Game has ended.");
        }

        if (!isActionAllowedByPlayer(room.state, action, playerId)) {
          throw new AuthError("FORBIDDEN");
        }

        const command = await lifecycle.applyAction(room, action, playerId);
        if (!command.ok) {
          if (command.code === "AUTH_REQUIRED") throw new AuthError("UNAUTHORIZED");
          const unavailable = ["MATCH_PERSISTENCE_UNAVAILABLE", "RATED_RATING_UNAVAILABLE"].includes(command.code);
          const forbidden = ["FORBIDDEN", "NOT_SEATED", "NOT_LOBBY_HOST"].includes(command.code);
          const details = command.code === "RATED_RATING_DIFFERENCE_TOO_LARGE"
            ? { difference: room.ratedCompatibility?.difference, maxDifference: room.ratedCompatibility?.maxDifference }
            : undefined;
          // Rules still return some free-text/lowercase rejection reasons. They
          // remain fallback messages, while REST always exposes a stable code.
          const code = /^[A-Z][A-Z0-9_]*$/.test(command.code) ? command.code : "RULES_REJECTED";
          throw new AppError(code, unavailable ? 503 : forbidden ? 403 : 409,
            command.message ?? "Action rejected.", details);
        }

        broadcastRoomState(room);
        broadcastActionResult({
          gameId: room.id,
          ok: true,
          events: command.events,
          logIndex: command.logIndex,
        });

        const view = makePlayerView(room.state, playerId);
        return {
          status: 200,
          payload: {
            view,
            events: projectEventsForRecipient(room.state, command.events, playerId),
            logIndex: command.logIndex,
            revision: command.revision,
          },
        };
      });

      reply.code(outcome.status).send(outcome.payload);
    }
  );
}
