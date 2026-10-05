import { queryConfig } from "../validation/queryValidation";
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
import { registerApiErrorHandler } from "./apiErrorHandler";
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
  registerApiErrorHandler(server);
  server.get("/audit", { preHandler: requireAdmin, config: queryConfig(auditListSchema) }, request => {
    const input = parseInput(auditListSchema, request.query);
    return (options.auditReader ?? new AuditLogReader()).list(input);
  });
  server.get("/users", { config: queryConfig(userListSchema) }, request => {
    const input = parseInput(userListSchema, request.query);
    return getService().listUsers(input, authenticatedRole(request));
  });
  server.get<{ Params: { userId: string } }>("/users/:userId", request => {
    const id = resourceId(request.params.userId, "userId");
    return getService().getUser(id, authenticatedRole(request));
  });
  server.post<{ Params: { userId: string } }>("/users/:userId/block", { bodyLimit: 4096 }, request => {
    const id = resourceId(request.params.userId, "userId");
    const body = parseInput(blockSchema, request.body === undefined ? {} : request.body);
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return getService().setBlocked(request.authUserId, id, true, body.reason);
  });
  server.post<{ Params: { userId: string } }>("/users/:userId/unblock", { bodyLimit: 4096 }, request => {
    const id = resourceId(request.params.userId, "userId");
    parseInput(blockSchema.omit({ reason: true }), request.body === undefined ? {} : request.body);
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return getService().setBlocked(request.authUserId, id, false);
  });
  server.patch<{ Params: { userId: string } }>("/users/:userId/role", { preHandler: requireAdmin, bodyLimit: 4096 }, request => {
    const id = resourceId(request.params.userId, "userId");
    const body = parseInput(rolePatchSchema, request.body);
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return getService().changeRole(request.authUserId, id, body.role);
  });
  server.get("/matches", { config: queryConfig(matchListSchema) }, request => {
    const input = parseInput(matchListSchema, request.query);
    return getService().listMatches(input);
  });
  server.get<{ Params: { matchId: string } }>("/matches/:matchId", request => {
    const id = resourceId(request.params.matchId, "matchId");
    return getService().getMatch(id);
  });
  server.get<{ Params: { matchId: string } }>("/matches/:matchId/actions", { config: queryConfig(actionListSchema) }, request => {
    const id = resourceId(request.params.matchId, "matchId");
    const input = parseInput(actionListSchema, request.query);
    return getService().listActions(id, input);
  });
  server.get("/summary", () => getService().summary());
}
