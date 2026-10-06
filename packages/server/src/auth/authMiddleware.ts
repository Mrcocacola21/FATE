import { bearerToken } from "./bearer";
import { correlateUser } from "../observability/requestContext";
import type { FastifyRequest } from "fastify";
import { AuthError } from "./authErrors";
import type { TokenService } from "./tokens";
import type { UserRole } from "@prisma/client";
import { requireActiveAccount, loadAccountAccess, type AccountAccessLoader } from "./accountAccess";

const currentRoles = new WeakMap<FastifyRequest, UserRole>();

declare module "fastify" {
  interface FastifyRequest {
    authUserId: string | null;
  }
}

export function accessTokenPreHandler(
  getTokens: () => TokenService,
  load: AccountAccessLoader = loadAccountAccess,
) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new AuthError("UNAUTHORIZED");
    request.authUserId = getTokens().verifyAccessToken(token).sub;
    const account = await requireActiveAccount(request.authUserId, load);
    correlateUser(request, request.authUserId);
    currentRoles.set(request, account.role);
  };
}

export function authenticatedRole(request: FastifyRequest): UserRole {
  const role = currentRoles.get(request);
  if (!role) throw new AuthError("UNAUTHORIZED");
  return role;
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!roles.includes(authenticatedRole(request))) throw new AuthError("FORBIDDEN");
  };
}
export const requireModerator = requireRole("MODERATOR", "ADMIN");
export const requireAdmin = requireRole("ADMIN");
