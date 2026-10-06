import { registerQueryValidation } from "./validation/queryValidation";
import { registerJsonParser } from "./validation/jsonParser";
import { registerOpenApi } from "./openapi/register";
import { AppError } from "./errors/appError";
import { registerApiErrorHandler, handleApiError } from "./routes/apiErrorHandler";
import { createMatchmakingService } from "./matchmaking/runtime";
import { matchmakingRoutes } from "./routes/matchmakingRoutes";
// packages/server/src/index.ts

import Fastify, { type FastifyBaseLogger } from "fastify";
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
import { AuthError } from "./auth/authErrors";
import { readObservabilityConfig } from "./config";
import { createLogger, safeError } from "./observability/logger";
import { requestId, registerRequestContext } from "./observability/requestContext";
import { applicationMetrics, type ApplicationMetrics } from "./observability/metrics";
import { getGameRoomCount } from "./store";
import type { DestinationStream } from "pino";

export async function buildServer(
  options: {
    documentationOnly?: boolean;
    serveDuringRecovery?: boolean;
    logStream?: DestinationStream;
    metrics?: ApplicationMetrics;
    databaseReadiness?: () => Promise<boolean>;
    roomSeed?: () => number;
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
  const observability = readObservabilityConfig();
  const metrics = options.metrics ?? applicationMetrics;
  metrics.setRoomCollector(getGameRoomCount);
  const server = Fastify({
    frameworkErrors: handleApiError,
    logger: createLogger(options.logStream) as FastifyBaseLogger,
    requestIdHeader: false,
    genReqId: requestId,
    requestIdLogLabel: "requestId",
    disableRequestLogging: true,
  });
  registerRequestContext(server);

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
      exposedHeaders: ["X-Request-Id"],
    });
  await server.register(cors, { delegator: corsOptions });

  await server.register(websocket);

  const lifecycle = new MatchLifecycle(server.log, options.matchPersistence, undefined, options.roomSeed, metrics);
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
  let shuttingDown = false;
  let startupWork: Promise<void> = Promise.resolve();
  server.decorate("waitForStartup", () => startupWork);
  server.decorate("beginShutdown", () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ event: "server_shutdown_started" }, "Server shutdown started");
  });
  const recoverPersistentMatches =
    options.matchRecovery !== false &&
    (!!options.matchRecovery || (!options.matchPersistence && !!process.env.DATABASE_URL?.trim()));
  const interruptedRoom =
    options.interruptedRoom ??
    (recoverPersistentMatches
      ? (roomId: string) => new MatchRecoveryRepository().isInterruptedRoom(roomId)
      : async () => false);
  const finishStartup = async () => {
    if (options.documentationOnly) {
      startupComplete = true;
      return;
    }
    if (recoverPersistentMatches)
      await (options.matchRecovery || new MatchRecoveryService(undefined, undefined, undefined, metrics, server.log)).recover(lifecycle, server.log);
    if (shuttingDown) return;
    lifecycle.startRetries();
    matchmaking.start();
    startupComplete = true;
    server.log.info({ event: "server_ready" }, "Startup and recovery complete");
  };
  server.addHook("onReady", async () => {
    startupWork = finishStartup();
    if (!options.serveDuringRecovery) await startupWork;
    else void startupWork.catch(error => {
      server.log.error({ event: "server_startup_failed", err: error }, "Startup failed; normal traffic remains unavailable");
    });
  });
  server.addHook("onRequest", async (request) => {
    if (startupComplete && !shuttingDown) return;
    if (["/health", "/api/health", "/ready", "/metrics"].includes(request.url.split("?")[0])) return;
    throw new AuthError("DATABASE_UNAVAILABLE");
  });
  server.addHook("preClose", async () => { server.beginShutdown(); });
  server.addHook("onClose", async () => {
    await startupWork.catch(() => undefined);
    await matchmaking.close();
    await lifecycle.close();
    await disconnectDatabase();
    server.log.info({ event: "server_shutdown_complete" }, "Server shutdown complete");
  });

  registerHealthRoutes(server, options.databaseReadiness ?? checkDatabaseReadiness, () => startupComplete && !shuttingDown);
  if (observability.metricsEnabled) server.get("/metrics", { schema: { hide: true } }, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });
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
  registerGameWebSocket(server, lifecycle, identity, matchmaking, interruptedRoom, connections, metrics);

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

  const server = await buildServer({ serveDuringRecovery: true });
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    server.log.info({ event: "shutdown_signal_received", signal }, "Shutdown signal received");
    server.beginShutdown();
    void server.close().catch(error => {
      server.log.error({ event: "server_shutdown_failed", err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  const fatal = (error: unknown) => {
    server.log.fatal({ event: "process_fatal", err: error }, "Fatal process error");
    server.beginShutdown();
    const deadline = setTimeout(() => process.exit(1), 15000);
    void server.close().catch(() => undefined).finally(() => { clearTimeout(deadline); process.exit(1); });
  };
  process.once("uncaughtException", fatal);
  process.once("unhandledRejection", fatal);
  try {
    const address = await server.listen({ port, host });
    server.log.info({ event: "server_started", address }, "Server listening");
    await server.waitForStartup();
  } catch (error) {
    await server.close();
    throw error;
  }
}

if (require.main === module) {
  void start().catch((error: unknown) => {
    // A fatal startup event must remain visible even with LOG_LEVEL=silent or invalid config.
    process.stderr.write(JSON.stringify({ level: 60, time: Date.now(), event: "server_startup_failed",
      err: safeError(error), msg: error instanceof ProductionConfigurationError ? error.message : "Server startup failed" }) + "\n");
    process.exit(1);
  });
}

declare module "fastify" { interface FastifyInstance { beginShutdown(): void; waitForStartup(): Promise<void> } }
