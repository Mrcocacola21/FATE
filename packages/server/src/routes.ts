// packages/server/src/routes.ts

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { GameAction, PlayerId, makePlayerView } from "rules";
import { z } from "zod";
import { CreateGameBodySchema, GameActionSchema, PlayerIdSchema } from "./schemas";
import { isActionAllowedByPlayer } from "./permissions";
import { applyGameAction, createGameRoom, getGameRoom } from "./store";
import { broadcastActionResult, broadcastRoomState, listRoomSummaries } from "./ws";

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

  server.get("/rooms", async () => listRoomSummaries());

  server.post(
    "/rooms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateGameBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendValidationError(reply, parsed.error);
      }

      const room = createGameRoom(parsed.data);
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

      const room = createGameRoom(parsed.data);
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
      const room = getGameRoom(gameId);
      if (!room) {
        reply.code(404).send({ error: "Game not found" });
        return;
      }

      if (room.state.phase === "ended") {
        reply.code(409).send({ error: "Game has ended" });
        return;
      }

      const playerId = parsePlayerId(request);
      if (!playerId) {
        reply.code(400).send({ error: "playerId query is required" });
        return;
      }

      const parsed = GameActionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return sendValidationError(reply, parsed.error);
      }

      const action: GameAction = parsed.data;
      if (!isActionAllowedByPlayer(room.state, action, playerId)) {
        reply.code(403).send({ error: "Action not allowed for this player" });
        return;
      }

      const { state, events, logIndex } = applyGameAction(
        room,
        action,
        playerId
      );

      broadcastRoomState(room.id, state);
      broadcastActionResult({
        gameId: room.id,
        ok: true,
        events,
        logIndex,
      });

      const view = makePlayerView(state, playerId);
      reply.send({ view, events, logIndex });
    }
  );
}
