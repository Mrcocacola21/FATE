// packages/server/src/ws.ts

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { makePlayerView, PlayerId } from "rules";
import { PlayerIdSchema } from "./schemas";
import { getGameRoom } from "./store";

interface WsSubscriber {
  playerId: PlayerId;
  socket: WebSocket;
}

const subscribers = new Map<string, Set<WsSubscriber>>();

function addSubscriber(gameId: string, subscriber: WsSubscriber) {
  const set = subscribers.get(gameId) ?? new Set<WsSubscriber>();
  set.add(subscriber);
  subscribers.set(gameId, set);
}

function removeSubscriber(gameId: string, subscriber: WsSubscriber) {
  const set = subscribers.get(gameId);
  if (!set) return;
  set.delete(subscriber);
  if (set.size === 0) {
    subscribers.delete(gameId);
  }
}

function safeSend(socket: WebSocket, payload: unknown) {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // ignore send errors for now
  }
}

export function registerGameWebSocket(server: FastifyInstance) {
  server.get(
    "/ws/games/:id",
    { websocket: true },
    (socket: WebSocket, request) => {
      const gameId = (request.params as { id: string }).id;
      const playerIdRaw = (request.query as { playerId?: string }).playerId;

      const room = getGameRoom(gameId);
      if (!room) {
        safeSend(socket, {
          type: "error",
          message: "Game not found",
        });
        socket.close();
        return;
      }

      const playerIdResult = PlayerIdSchema.safeParse(playerIdRaw);
      if (!playerIdResult.success) {
        safeSend(socket, {
          type: "error",
          message: "Invalid playerId",
        });
        socket.close();
        return;
      }

      const playerId = playerIdResult.data;
      const subscriber: WsSubscriber = {
        playerId,
        socket,
      };

      addSubscriber(gameId, subscriber);

      const view = makePlayerView(room.state, playerId);
      safeSend(socket, {
        type: "stateSnapshot",
        gameId,
        seed: room.seed,
        view,
      });

      socket.on("close", () => {
        removeSubscriber(gameId, subscriber);
      });
    }
  );
}

export function broadcastGameUpdate(params: {
  gameId: string;
  views: { P1: unknown; P2: unknown };
  events: unknown[];
  lastAction: unknown;
  logIndex: number;
}) {
  const set = subscribers.get(params.gameId);
  if (!set) return;

  for (const subscriber of set) {
    const view = subscriber.playerId === "P1" ? params.views.P1 : params.views.P2;
    safeSend(subscriber.socket, {
      type: "stateUpdated",
      gameId: params.gameId,
      view,
      events: params.events,
      lastAction: params.lastAction,
      logIndex: params.logIndex,
    });
  }
}
