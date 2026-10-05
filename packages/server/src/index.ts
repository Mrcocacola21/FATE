import { registerQueryValidation } from "./validation/queryValidation";
import { registerJsonParser } from "./validation/jsonParser";
import { registerOpenApi } from "./openapi/register";
import { AppError } from "./errors/appError";
import { registerApiErrorHandler, handleApiError } from "./routes/apiErrorHandler";
import { createMatchmakingService } from "./matchmaking/runtime";
import { matchmakingRoutes } from "./routes/matchmakingRoutes";
// packages/server/src/index.ts

import Fastify from "fastify";
import { MatchLifecycle } from "./persistence/matchLifecycle";
import type { MatchPersistence } from "./services/matchService";
import type { MatchActionService } from "./services/matchActionService";
import cors, { type FastifyCorsOptionsDelegate } from "@fastify/cors";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { registerGameWebSocket } from "./ws";
import { AccountConnections } from "./auth/accountConnections";
import { adminRoutes } from "./routes/adminRoutes";
import { isAllowedOrigin } from "./origin";
import { disconnectDatabase } from "./db/client";
import { authRoutes } from "./routes/authRoutes";
import { profileRoutes } from "./routes/profileRoutes";
import { matchRoutes } from "./routes/matchRoutes";
import { replayRoutes } from "./routes/replayRoutes";
import type { ReplayQueryService } from "./services/replayQueryService";
import { matchHistoryRoutes } from "./routes/matchHistoryRoutes";
import type { MatchHistoryService } from "./services/matchHistoryService";
import { statisticsRoutes } from "./routes/statisticsRoutes";
import { ratingRoutes, type RatingReads } from "./routes/ratingRoutes";
import { leaderboardRoutes } from "./routes/leaderboardRoutes";
import type { LeaderboardService } from "./services/leaderboardService";
import type { PlayerStatisticsService } from "./services/playerStatisticsService";
import { isTrustedAuthOrigin } from "./auth/httpSecurity";
import { ConnectionIdentityService } from "./auth/connectionIdentity";
import { ProductionConfigurationError, validateProductionEnvironment } from "./config";
import { checkDatabaseReadiness } from "./db/readiness";
import { registerHealthRoutes } from "./routes/healthRoutes";
import { MatchRecoveryService } from "./services/matchRecoveryService";
import { MatchRecoveryRepository } from "./repositories/matchRecoveryRepository";

export async function buildServer(
  options: {
    documentationOnly?: boolean;
    matchPersistence?: MatchPersistence;
    connectionIdentity?: Pick<ConnectionIdentityService, "verify"> &
      Partial<Pick<ConnectionIdentityService, "assertActive">>;
    actionHistory?: Pick<MatchActionService, "getCompletedMatchActionHistory">;
    matchHistory?: Pick<MatchHistoryService, "getUserMatchHistory">;
    playerStatistics?: Pick<PlayerStatisticsService, "getPlayerStatistics">;
    ratings?: RatingReads;
    matchmakingActiveMatch?: (userId: string) => Promise<boolean>;
    leaderboard?: Pick<LeaderboardService, "getLeaderboard">;
    replayQuery?: Pick<ReplayQueryService, "getMetadata" | "getState">;
    matchRecovery?: Pick<MatchRecoveryService, "recover"> | false;
    interruptedRoom?: (roomId: string) => Promise<boolean>;
  } = {},
) {
  const logLevel = process.env.LOG_LEVEL ?? "info";
  const server = Fastify({
    frameworkErrors: handleApiError,
    logger: {
      level: logLevel,
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    },
  });

  registerApiErrorHandler(server);
  await registerOpenApi(server);
  registerQueryValidation(server);
  registerJsonParser(server);
  server.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(new AppError("ROUTE_NOT_FOUND", 404, "Route not found.").toResponse()),
  );

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
  const identity = options.connectionIdentity ?? new ConnectionIdentityService();
  const connections = new AccountConnections();
  const matchmaking = createMatchmakingService(
    lifecycle,
    server.log,
    options.ratings,
    options.matchmakingActiveMatch,
    (userId) => identity.assertActive?.(userId) ?? Promise.resolve(),
  );
  let startupComplete = false;
  const recoverPersistentMatches =
    options.matchRecovery !== false &&
    (!!options.matchRecovery || (!options.matchPersistence && !!process.env.DATABASE_URL?.trim()));
  const interruptedRoom =
    options.interruptedRoom ??
    (recoverPersistentMatches
      ? (roomId: string) => new MatchRecoveryRepository().isInterruptedRoom(roomId)
      : async () => false);
  server.addHook("onReady", async () => {
    if (options.documentationOnly) {
      startupComplete = true;
      return;
    }
    if (recoverPersistentMatches)
      await (options.matchRecovery || new MatchRecoveryService()).recover(lifecycle, server.log);
    lifecycle.startRetries();
    matchmaking.start();
    startupComplete = true;
  });
  server.addHook("onClose", async () => {
    await matchmaking.close();
    await lifecycle.close();
    await disconnectDatabase();
  });

  registerHealthRoutes(server, checkDatabaseReadiness, () => startupComplete);
  await registerRoutes(server, lifecycle, identity, matchmaking, interruptedRoom);
  await server.register(authRoutes, { prefix: "/api/auth", matchmaking });
  await server.register(adminRoutes, {
    prefix: "/api/admin",
    revokeRuntime: (userId: string) => {
      matchmaking.invalidateAccount(userId);
      connections.revoke(userId);
    },
  });
  await server.register(matchmakingRoutes, { prefix: "/api", identity, matchmaking });
  await server.register(profileRoutes, { prefix: "/api" });
  await server.register(matchRoutes, {
    prefix: "/api",
    identity,
    actionHistory: options.actionHistory,
  });
  await server.register(matchHistoryRoutes, { prefix: "/api", matchHistory: options.matchHistory });
  await server.register(statisticsRoutes, {
    prefix: "/api",
    playerStatistics: options.playerStatistics,
  });
  await server.register(ratingRoutes, { prefix: "/api", ratings: options.ratings });
  await server.register(leaderboardRoutes, { prefix: "/api", leaderboard: options.leaderboard });
  await server.register(replayRoutes, {
    prefix: "/api",
    identity,
    replayQuery: options.replayQuery,
  });
  registerGameWebSocket(server, lifecycle, identity, matchmaking, interruptedRoom, connections);

  return server;
}

async function start() {
  validateProductionEnvironment();
  if (process.env.NODE_ENV === "production" && !(await checkDatabaseReadiness())) {
    throw new ProductionConfigurationError(
      "Production database readiness check failed; server has not started",
    );
  }
  const port = Number(process.env.PORT ?? 3000);
  const host = "0.0.0.0";

  const server = await buildServer();
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void server.close().catch(() => {
      server.log.error({ event: "server:shutdown_failed" }, "Graceful shutdown failed");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    const address = await server.listen({ port, host });
    server.log.info(`server listening on ${address}`);
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (require.main === module) {
  void start().catch((error: unknown) => {
    // Never serialize underlying Prisma errors, URLs, environment or stacks.
    console.error(
      error instanceof ProductionConfigurationError ? error.message : "Server startup failed",
    );
    process.exit(1);
  });
}
