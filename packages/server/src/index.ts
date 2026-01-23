// packages/server/src/index.ts

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";

export async function buildServer() {
  const server = Fastify({ logger: true });

  await server.register(cors, {
    origin: true,
  });

  await server.register(websocket);

  await registerRoutes(server);
  registerGameWebSocket(server);

  return server;
}

async function start() {
  const port = Number(process.env.PORT ?? 3000);
  const host = "0.0.0.0";

  const server = await buildServer();
  try {
    await server.listen({ port, host });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
