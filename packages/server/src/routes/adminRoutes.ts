import { documented, protectedErrors } from "../openapi/contract";
import { z } from "zod";
import { resourceIdSchema } from "../validation/commonSchemas";
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
  rolePatchSchema,
  userListSchema,
} from "../admin/schemas";
import { registerApiErrorHandler } from "./apiErrorHandler";
import type { AccountAccessLoader } from "../auth/accountAccess";
import { AuditLogReader } from "../services/auditLogService";

export const adminUserParamsSchema = z.object({ userId: resourceIdSchema }).strict();
export const adminMatchParamsSchema = z.object({ matchId: resourceIdSchema }).strict();
export const unblockSchema = blockSchema.omit({ reason: true });

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
  const errors = {
    ...protectedErrors,
    403: ["ACCOUNT_BLOCKED", "FORBIDDEN"],
    429: ["RATE_LIMITED"],
  };
  const userErrors = { ...errors, 404: ["USER_NOT_FOUND"] };
  const matchErrors = { ...errors, 404: ["MATCH_NOT_FOUND"] };
  server.get(
    "/audit",
    {
      preHandler: requireAdmin,
      ...documented({
        operationId: "adminListAuditEvents",
        tag: "Audit",
        summary: "Read immutable server-generated audit events",
        description:
          "Read-only. dateFrom must be earlier than or equal to dateTo. Deleted identities and invalid stored metadata are returned as null.",
        auth: "bearer",
        role: "ADMIN",
        query: auditListSchema,
        response: "AuditEvents",
        errors,
      }),
    },
    (request) => {
      const input = parseInput(auditListSchema, request.query);
      return (options.auditReader ?? new AuditLogReader()).list(input);
    },
  );
  server.get(
    "/users",
    documented({
      operationId: "adminListUsers",
      tag: "Admin",
      summary: "List safe account metadata",
      description: "Email is included only for ADMIN callers.",
      auth: "bearer",
      role: "MODERATOR",
      query: userListSchema,
      response: "AdminUsers",
      errors,
    }),
    (request) => {
      const input = parseInput(userListSchema, request.query);
      return getService().listUsers(input, authenticatedRole(request));
    },
  );
  server.get<{ Params: { userId: string } }>(
    "/users/:userId",
    documented({
      operationId: "adminGetUser",
      tag: "Admin",
      summary: "Read account details and per-mode ratings",
      description: "Email is included only for ADMIN callers.",
      auth: "bearer",
      role: "MODERATOR",
      params: adminUserParamsSchema,
      response: "AdminUser",
      errors: userErrors,
    }),
    (request) => {
      const id = parseInput(adminUserParamsSchema, request.params).userId;
      return getService().getUser(id, authenticatedRole(request));
    },
  );
  server.post<{ Params: { userId: string } }>(
    "/users/:userId/block",
    {
      bodyLimit: 4096,
      ...documented({
        operationId: "adminBlockUser",
        tag: "Admin",
        summary: "Block account access",
        auth: "bearer",
        role: "MODERATOR",
        params: adminUserParamsSchema,
        body: blockSchema,
        bodyOptional: true,
        response: "AdminUserMutation",
        errors: {
          ...userErrors,
          403: ["ACCOUNT_BLOCKED", "FORBIDDEN", "CANNOT_BLOCK_SELF", "INSUFFICIENT_TARGET_ROLE"],
        },
      }),
    },
    (request) => {
      const id = parseInput(adminUserParamsSchema, request.params).userId;
      const body = parseInput(blockSchema, request.body === undefined ? {} : request.body);
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return getService().setBlocked(request.authUserId, id, true, body.reason);
    },
  );
  server.post<{ Params: { userId: string } }>(
    "/users/:userId/unblock",
    {
      bodyLimit: 4096,
      ...documented({
        operationId: "adminUnblockUser",
        tag: "Admin",
        summary: "Restore account access",
        auth: "bearer",
        role: "MODERATOR",
        params: adminUserParamsSchema,
        body: unblockSchema,
        bodyOptional: true,
        response: "AdminUserMutation",
        errors: {
          ...userErrors,
          403: ["ACCOUNT_BLOCKED", "FORBIDDEN", "INSUFFICIENT_TARGET_ROLE"],
        },
      }),
    },
    (request) => {
      const id = parseInput(adminUserParamsSchema, request.params).userId;
      parseInput(unblockSchema, request.body === undefined ? {} : request.body);
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return getService().setBlocked(request.authUserId, id, false);
    },
  );
  server.patch<{ Params: { userId: string } }>(
    "/users/:userId/role",
    {
      preHandler: requireAdmin,
      bodyLimit: 4096,
      ...documented({
        operationId: "adminChangeUserRole",
        tag: "Admin",
        summary: "Change an account role",
        auth: "bearer",
        role: "ADMIN",
        params: adminUserParamsSchema,
        body: rolePatchSchema,
        response: "AdminUserMutation",
        errors: {
          ...userErrors,
          403: ["ACCOUNT_BLOCKED", "FORBIDDEN", "CANNOT_CHANGE_OWN_ROLE"],
          409: ["LAST_ADMIN_PROTECTED", "BLOCKED_ROLE_TARGET"],
        },
      }),
    },
    (request) => {
      const id = parseInput(adminUserParamsSchema, request.params).userId;
      const body = parseInput(rolePatchSchema, request.body);
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return getService().changeRole(request.authUserId, id, body.role);
    },
  );
  server.get(
    "/matches",
    documented({
      operationId: "adminListMatches",
      tag: "Admin",
      summary: "List persistent match metadata",
      description:
        "createdFrom <= createdTo and finishedFrom <= finishedTo. No raw state snapshots are returned.",
      auth: "bearer",
      role: "MODERATOR",
      query: matchListSchema,
      response: "AdminMatches",
      errors,
    }),
    (request) => {
      const input = parseInput(matchListSchema, request.query);
      return getService().listMatches(input);
    },
  );
  server.get<{ Params: { matchId: string } }>(
    "/matches/:matchId",
    documented({
      operationId: "adminGetMatch",
      tag: "Admin",
      summary: "Read match details and snapshot metadata",
      auth: "bearer",
      role: "MODERATOR",
      params: adminMatchParamsSchema,
      response: "AdminMatch",
      errors: matchErrors,
    }),
    (request) => {
      const id = parseInput(adminMatchParamsSchema, request.params).matchId;
      return getService().getMatch(id);
    },
  );
  server.get<{ Params: { matchId: string } }>(
    "/matches/:matchId/actions",
    documented({
      operationId: "adminGetMatchActions",
      tag: "Admin",
      summary: "Inspect accepted MatchAction history",
      description:
        "Read-only. Payloads are decoded and credential keys removed recursively; invalid payloads become null.",
      auth: "bearer",
      role: "MODERATOR",
      params: adminMatchParamsSchema,
      query: actionListSchema,
      response: "AdminMatchActions",
      errors: matchErrors,
    }),
    (request) => {
      const id = parseInput(adminMatchParamsSchema, request.params).matchId;
      const input = parseInput(actionListSchema, request.query);
      return getService().listActions(id, input);
    },
  );
  server.get(
    "/summary",
    documented({
      operationId: "adminGetSummary",
      tag: "Admin",
      summary: "Read aggregate account and match counts",
      auth: "bearer",
      role: "MODERATOR",
      response: "AdminSummary",
      errors,
    }),
    () => getService().summary(),
  );
}
