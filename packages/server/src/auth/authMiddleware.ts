import type { FastifyRequest } from "fastify";
import { AuthError } from "./authErrors";
import type { TokenService } from "./tokens";

declare module "fastify" {
  interface FastifyRequest {
    authUserId: string | null;
  }
}

export function accessTokenPreHandler(getTokens: () => TokenService) {
  return async (request: FastifyRequest): Promise<void> => {
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "");
    if (!match) throw new AuthError("UNAUTHORIZED");
    request.authUserId = getTokens().verifyAccessToken(match[1]).sub;
  };
}
