// packages/server/src/index.ts

import Fastify from "fastify";
import { MatchLifecycle } from "./persistence/matchLifecycle";
import type { MatchPersistence } from "./services/matchService";
import cors, { type FastifyCorsOptionsDelegate } from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";
import { isAllowedOrigin } from "./origin";
import { disconnectDatabase } from "./db/client";
import { authRoutes } from "./routes/authRoutes";
import { profileRoutes } from "./routes/profileRoutes";
import { matchRoutes } from "./routes/matchRoutes";
import { isTrustedAuthOrigin } from "./auth/httpSecurity";
import { ConnectionIdentityService } from "./auth/connectionIdentity";

export async function buildServer(options: {
  matchPersistence?: MatchPersistence;
  connectionIdentity?: Pick<ConnectionIdentityService, "verify">;
} = {}) {
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

  const lifecycle = new MatchLifecycle(server.log, options.matchPersistence);
  lifecycle.startRetries();
  server.addHook("onClose", async () => {
    await lifecycle.close();
    await disconnectDatabase();
  });

  const identity = options.connectionIdentity ?? new ConnectionIdentityService();
  await registerRoutes(server, lifecycle, identity);
  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(profileRoutes, { prefix: "/api" });
  await server.register(matchRoutes, { prefix: "/api" });
  registerGameWebSocket(server, lifecycle, identity);

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
