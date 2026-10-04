import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { AuthError } from "../auth/authErrors";
import {
  accessTokenPreHandler,
  authenticatedRole,
  requireAdmin,
  requireModerator,
} from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { AdminRepository } from "../repositories/adminRepository";
import { AdminService } from "../services/adminService";
import {
  actionListSchema,
  auditListSchema,
  blockSchema,
  matchListSchema,
  parseInput,
  resourceId,
  rolePatchSchema,
  userListSchema,
} from "../admin/schemas";
import { toApiError } from "./apiErrorHandler";
import type { AccountAccessLoader } from "../auth/accountAccess";
import { AuditLogReader } from "../services/auditLogService";

export async function adminRoutes(
  server: FastifyInstance,
  options: {
    revokeRuntime: (userId: string) => void;
    service?: AdminService;
    loadAccount?: AccountAccessLoader;
    auditReader?: Pick<AuditLogReader, "list">;
  },
) {
  await server.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  let service = options.service;
  const getService = () =>
    (service ??= new AdminService(new AdminRepository(), options.revokeRuntime));
  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  server.addHook(
    "preHandler",
    accessTokenPreHandler(
      () => (tokens ??= new TokenService(readAuthConfig())),
      options.loadAccount,
    ),
  );
  server.addHook("preHandler", requireModerator);
  server.get("/audit", { preHandler: requireAdmin }, (request) =>
    (options.auditReader ?? new AuditLogReader()).list(parseInput(auditListSchema, request.query)),
  );
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error({ category: failure.code, requestId: request.id }, "Admin request failed");
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get("/users", (request) =>
    getService().listUsers(parseInput(userListSchema, request.query), authenticatedRole(request)),
  );
  server.get<{ Params: { userId: string } }>("/users/:userId", (request) =>
    getService().getUser(resourceId(request.params.userId), authenticatedRole(request)),
  );
  server.post<{ Params: { userId: string } }>(
    "/users/:userId/block",
    { bodyLimit: 4096 },
    async (request) => {
      const body = parseInput(blockSchema, request.body ?? {});
      return getService().setBlocked(
        request.authUserId!,
        resourceId(request.params.userId),
        true,
        body.reason,
      );
    },
  );
  server.post<{ Params: { userId: string } }>(
    "/users/:userId/unblock",
    { bodyLimit: 4096 },
    async (request) => {
      parseInput(blockSchema.omit({ reason: true }), request.body ?? {});
      return getService().setBlocked(request.authUserId!, resourceId(request.params.userId), false);
    },
  );
  server.patch<{ Params: { userId: string } }>(
    "/users/:userId/role",
    { preHandler: requireAdmin, bodyLimit: 4096 },
    async (request) => {
      const body = parseInput(rolePatchSchema, request.body);
      return getService().changeRole(
        request.authUserId!,
        resourceId(request.params.userId),
        body.role,
      );
    },
  );
  server.get("/matches", (request) =>
    getService().listMatches(parseInput(matchListSchema, request.query)),
  );
  server.get<{ Params: { matchId: string } }>("/matches/:matchId", (request) =>
    getService().getMatch(resourceId(request.params.matchId)),
  );
  server.get<{ Params: { matchId: string } }>("/matches/:matchId/actions", (request) =>
    getService().listActions(
      resourceId(request.params.matchId),
      parseInput(actionListSchema, request.query),
    ),
  );
  server.get("/summary", () => getService().summary());
}
