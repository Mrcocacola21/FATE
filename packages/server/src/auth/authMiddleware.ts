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
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "");
    if (!match) throw new AuthError("UNAUTHORIZED");
    request.authUserId = getTokens().verifyAccessToken(match[1]).sub;
    const account = await requireActiveAccount(request.authUserId, load);
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
