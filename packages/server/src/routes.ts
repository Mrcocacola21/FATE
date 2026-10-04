import type { MatchmakingService } from "./services/matchmakingService";
import { readLeaderboardConfig } from "./leaderboard/config";
import { MultiplayerIdentityError } from "./auth/connectionIdentity";
import { MatchTypeError } from "./matches/matchType";
// packages/server/src/routes.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  GameAction,
  PlayerId,
  makePlayerView,
  projectEventsForRecipient,
  HERO_REGISTRY,
  getHeroMeta,
} from "rules";
import type { MatchLifecycle } from "./persistence/matchLifecycle";
import type { ConnectionIdentityService } from "./auth/connectionIdentity";
import { z } from "zod";
import { CreateGameBodySchema, GameActionSchema, PlayerIdSchema } from "./schemas";
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

function parsePlayerId(request: FastifyRequest): PlayerId | null {
  const raw = (request.query as { playerId?: string }).playerId;
  const parsed = PlayerIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  if (error.issues.some(issue => issue.path[0] === "lobbyName")) {
    reply.code(400).send({ error: { code: "INVALID_LOBBY_NAME", message: "Invalid lobby name" } });
    return;
  }
  reply.code(400).send({ error: "Invalid request", details: error.flatten() });
}

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

function requireDebugRestAccess(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (hasDebugRestAccess(request)) return true;
  reply.code(401).send({ error: "Debug token required" });
  return false;
}

export async function registerRoutes(
  server: FastifyInstance, lifecycle: MatchLifecycle,
  identityService: Pick<ConnectionIdentityService, "verify">,
  matchmaking?: MatchmakingService,
  interruptedRoom: (roomId: string) => Promise<boolean> = async () => false,
) {
  async function createPersistentRoom(options: Parameters<MatchLifecycle["createRoom"]>[0], createdById: string | null, reply: FastifyReply) {
    try {
      const create = () => lifecycle.createRoom(options, undefined, createdById);
      return matchmaking && createdById && options?.roomMode !== "test"
        ? await matchmaking.withCompetitor(createdById, undefined, create) : await create();
    } catch (error) {
      if (error instanceof MultiplayerIdentityError) {
        reply.code(409).send({ error: { code: error.code, message: error.message } });
        return null;
      }
      if (error instanceof MatchTypeError) {
        reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
        return null;
      }
      throw error;
    }
  }
  async function creatorId(request: FastifyRequest, reply: FastifyReply) {
    if (!request.headers.authorization) return null;
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization)?.[1];
    try {
      if (!token) throw new Error("Invalid authorization");
      return (await identityService.verify(token))?.userId ?? null;
    } catch {
      reply.code(401).send({ error: { code: "INVALID_ACCESS_TOKEN", message: "Unable to verify access token" } });
      return null;
    }
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
      const heroId = (request.params as { id: string }).id;
      const hero = getHeroMeta(heroId);
      if (!hero) {
        reply.code(404).send({ error: "Hero not found" });
        return;
      }
      reply.send(hero);
    }
  );

  server.get("/rooms", async () => {
    await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
    await lifecycle.refreshRatedLobbies(listGameRooms());
    return listRoomSummaries();
  });

  server.get("/rooms/:id", async (request, reply) => {
    const runtime = getGameRoom((request.params as { id: string }).id);
    if (runtime) await lifecycle.refreshRatedLobbies([runtime]);
    const room = listRoomSummaries().find((item) => item.id === (request.params as { id: string }).id);
    if (!room) {
      const interrupted = await interruptedRoom((request.params as { id: string }).id);
      return reply.code(interrupted ? 410 : 404).send({ error: {
        code: interrupted ? "MATCH_INTERRUPTED" : "ROOM_NOT_FOUND",
        message: interrupted ? "This match was interrupted by a server restart and cannot be resumed." : "Room not found",
      } });
    }
    return room;
  });

  server.post(
    "/rooms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateGameBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        if (parsed.error.issues.some((issue) => issue.path[0] === "matchType"))
          return reply.code(400).send({ error: { code: "INVALID_MATCH_TYPE", message: "Choose Casual or Rated" } });
        return sendValidationError(reply, parsed.error);
      }
      if (
        parsed.data.roomMode === "test" &&
        !canCreateTestRoom(parsed.data.debugToken)
      ) {
        reply.code(403).send({ error: "Test rooms are disabled or require a valid debug token" });
        return;
      }

      const createdById = await creatorId(request, reply);
      if (reply.sent) return;
      const room = await enqueueRoomCommand(FATE_CREATE_KEY, async () => {
        await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
        return createPersistentRoom({
          seed: parsed.data.seed,
          arenaId: parsed.data.arenaId,
          roomMode: parsed.data.roomMode,
          gameMode: parsed.data.gameMode,
          matchType: parsed.data.matchType,
          lobbyName: parsed.data.lobbyName,
        }, createdById, reply);
      });
      if (!room) return;
      reply.send({
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
      const parsed = CreateGameBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        if (parsed.error.issues.some((issue) => issue.path[0] === "matchType"))
          return reply.code(400).send({ error: { code: "INVALID_MATCH_TYPE", message: "Choose Casual or Rated" } });
        return sendValidationError(reply, parsed.error);
      }
      if (
        parsed.data.roomMode === "test" &&
        !canCreateTestRoom(parsed.data.debugToken)
      ) {
        reply.code(403).send({ error: "Test rooms are disabled or require a valid debug token" });
        return;
      }

      const createdById = await creatorId(request, reply);
      if (reply.sent) return;
      const room = await enqueueRoomCommand(FATE_CREATE_KEY, async () => {
        await lifecycle.cleanup({ activeRoomIds: getActiveFateRoomIds() });
        return createPersistentRoom({
          seed: parsed.data.seed,
          arenaId: parsed.data.arenaId,
          roomMode: parsed.data.roomMode,
          gameMode: parsed.data.gameMode,
          matchType: parsed.data.matchType,
          lobbyName: parsed.data.lobbyName,
        }, createdById, reply);
      });
      if (!room) return;
      const views = {
        P1: makePlayerView(room.state, "P1"),
        P2: makePlayerView(room.state, "P2"),
      };

      reply.send({
        gameId: room.id,
        matchType: room.matchType,
        seed: room.seed,
        views,
      });
    }
  );

  server.get(
    "/api/games/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireDebugRestAccess(request, reply)) return;
      const gameId = (request.params as { id: string }).id;
      const room = getGameRoom(gameId);
      if (!room) {
        reply.code(404).send({ error: "Game not found" });
        return;
      }

      const playerId = parsePlayerId(request);
      if (!playerId) {
        reply.code(400).send({ error: "playerId query is required" });
        return;
      }

      const view = makePlayerView(room.state, playerId);
      touchGameRoom(room);
      reply.send({ gameId: room.id, seed: room.seed, view });
    }
  );

  server.get(
    "/api/games/:id/log",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireDebugRestAccess(request, reply)) return;
      const gameId = (request.params as { id: string }).id;
      const room = getGameRoom(gameId);
      if (!room) {
        reply.code(404).send({ error: "Game not found" });
        return;
      }

      touchGameRoom(room);
      reply.send({ gameId: room.id, log: room.actionLog });
    }
  );

  server.post(
    "/api/games/:id/actions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!requireDebugRestAccess(request, reply)) return;
      const gameId = (request.params as { id: string }).id;
      const playerId = parsePlayerId(request);
      if (!playerId) {
        reply.code(400).send({ error: "playerId query is required" });
        return;
      }

      const parsed = GameActionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendValidationError(reply, parsed.error);
      }

      const parsedAction = parsed.data;
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
          return {
            status: 404,
            payload: { error: "Game not found" },
          };
        }

        if (room.state.phase === "ended") {
          return {
            status: 409,
            payload: { error: "Game has ended" },
          };
        }

        if (!isActionAllowedByPlayer(room.state, action, playerId)) {
          return {
            status: 403,
            payload: { error: "Action not allowed for this player" },
          };
        }

        const command = await lifecycle.applyAction(room, action, playerId);
        if (!command.ok) {
          return {
            status: 409,
            payload: {
              error: command.message ?? "Action rejected",
              code: command.code,
            },
          };
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
