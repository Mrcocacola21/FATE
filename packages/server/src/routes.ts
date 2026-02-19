// packages/server/src/routes.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { GameAction, PlayerId, makePlayerView, HERO_REGISTRY, getHeroMeta } from "rules";
import { z } from "zod";
import { CreateGameBodySchema, GameActionSchema, PlayerIdSchema } from "./schemas";
import { isActionAllowedByPlayer } from "./permissions";
import { applyGameAction, createGameRoom, getGameRoom, listRoomSummaries } from "./store";
import { broadcastActionResult, broadcastRoomState } from "./ws";
import { FATE_CREATE_KEY, enqueueRoomCommand, fateRoomKey } from "./roomQueue";

function parsePlayerId(request: FastifyRequest): PlayerId | null {
  const raw = (request.query as { playerId?: string }).playerId;
  const parsed = PlayerIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  reply.code(400).send({ error: "Invalid request", details: error.flatten() });
}

export async function registerRoutes(server: FastifyInstance) {
  server.get("/", async () => ({
    name: "fate-server",
    version: process.env.npm_package_version ?? "unknown",
  }));

  server.get("/health", async () => ({ ok: true }));

  server.get("/api/health", async () => ({ ok: true }));

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

  server.get("/rooms", async () => listRoomSummaries());

  server.post(
    "/rooms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateGameBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendValidationError(reply, parsed.error);
      }

      const room = await enqueueRoomCommand(FATE_CREATE_KEY, () =>
        createGameRoom(parsed.data)
      );
      reply.send({ roomId: room.id });
    }
  );

  server.post(
    "/api/games",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateGameBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendValidationError(reply, parsed.error);
      }

      const room = await enqueueRoomCommand(FATE_CREATE_KEY, () =>
        createGameRoom(parsed.data)
      );
      const views = {
        P1: makePlayerView(room.state, "P1"),
        P2: makePlayerView(room.state, "P2"),
      };

      reply.send({
        gameId: room.id,
        seed: room.seed,
        views,
      });
    }
  );

  server.get(
    "/api/games/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
      reply.send({ gameId: room.id, seed: room.seed, view });
    }
  );

  server.get(
    "/api/games/:id/log",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const gameId = (request.params as { id: string }).id;
      const room = getGameRoom(gameId);
      if (!room) {
        reply.code(404).send({ error: "Game not found" });
        return;
      }

      reply.send({ gameId: room.id, log: room.actionLog });
    }
  );

  server.post(
    "/api/games/:id/actions",
    async (request: FastifyRequest, reply: FastifyReply) => {
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

      const outcome = await enqueueRoomCommand(fateRoomKey(gameId), () => {
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

        const command = applyGameAction(room, action, playerId);
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
            events: command.events,
            logIndex: command.logIndex,
            revision: command.revision,
          },
        };
      });

      reply.code(outcome.status).send(outcome.payload);
    }
  );
}
