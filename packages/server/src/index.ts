// packages/server/src/index.ts

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";

function isLocalDevOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/.test(
    origin
  );
}

export async function buildServer() {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const server = Fastify({ logger: { level: logLevel } });

  const allow = new Set(
    [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      process.env.WEB_ORIGIN,
    ].filter(Boolean) as string[]
  );

  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allow.has(origin)) return cb(null, true);
      if (isLocalDevOrigin(origin)) return cb(null, true);
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"), false);
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
