// packages/server/src/index.ts

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";
import { isAllowedOrigin } from "./origin";

export async function buildServer() {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const server = Fastify({ logger: { level: logLevel } });

  await server.register(cors, {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
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
    const address = await server.listen({ port, host });
    server.log.info(`server listening on ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}
