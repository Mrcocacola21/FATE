// packages/server/src/index.ts

import Fastify from "fastify";
import cors, { type FastifyCorsOptionsDelegate } from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";
import { isAllowedOrigin } from "./origin";
import { disconnectDatabase } from "./db/client";
import { authRoutes } from "./routes/authRoutes";
import { profileRoutes } from "./routes/profileRoutes";
import { isTrustedAuthOrigin } from "./auth/httpSecurity";

export async function buildServer() {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const server = Fastify({
    logger: {
      level: logLevel,
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
  });

  const corsOptions: FastifyCorsOptionsDelegate = (request, cb) =>
    cb(null, {
      origin: (origin, cb) => {
        const allowed = request.url.split("?")[0].startsWith("/api/auth/")
          ? isTrustedAuthOrigin(origin)
          : isAllowedOrigin(origin);
        if (allowed) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
    });
  await server.register(cors, { delegator: corsOptions });

  await server.register(websocket);

  server.addHook("onClose", async () => {
    await disconnectDatabase();
  });

  await registerRoutes(server);
  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(profileRoutes, { prefix: "/api" });
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
