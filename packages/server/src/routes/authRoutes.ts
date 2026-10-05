import { emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import type { MatchmakingService } from "../services/matchmakingService";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError } from "../auth/authErrors";
import { readAuthConfig } from "../auth/config";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  requireTrustedAuthOrigin,
} from "../auth/httpSecurity";
import { loginSchema, registerSchema } from "../auth/schemas";
import { TokenService } from "../auth/tokens";
import type { toAuthUserDto } from "../auth/userDto";
import { registerApiErrorHandler } from "./apiErrorHandler";
import { UserRepository, AuthSessionRepository } from "../repositories";
import { AuthService } from "../services/authService";

type Credentials = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
};

function sendCredentials(
  reply: FastifyReply,
  credentials: Credentials,
  user?: ReturnType<typeof toAuthUserDto>,
) {
  reply.setCookie(REFRESH_COOKIE, credentials.refreshToken, {
    ...refreshCookieOptions(),
    expires: credentials.refreshExpiresAt,
  });
  return reply.send({
    ...(user === undefined ? {} : { user }),
    accessToken: credentials.accessToken,
    accessTokenExpiresIn: credentials.accessTokenExpiresIn,
  });
}

export async function authRoutes(server: FastifyInstance, options: { matchmaking?: MatchmakingService } = {}): Promise<void> {
  await server.register(cookie);
  await server.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });
  server.decorateRequest("authUserId", null);

  // Auth configuration and PostgreSQL are requested lazily, keeping gameplay independent.
  let tokens: TokenService | undefined;
  let service: AuthService | undefined;
  const getTokens = () => (tokens ??= new TokenService(readAuthConfig()));
  const getService = () =>
    (service ??= new AuthService(getTokens(), new UserRepository(), new AuthSessionRepository()));

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });

  registerApiErrorHandler(server, (failure, reply) => {
    if (failure.code === "INVALID_REFRESH_TOKEN")
      reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  });

  server.post(
    "/register",
    {
      bodyLimit: 4096,
      onRequest: requireTrustedAuthOrigin,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parseInput(registerSchema, request.body);
      refreshCookieOptions();
      const result = await getService().register(input);
      return sendCredentials(reply.code(201), result, result.user);
    },
  );

  server.post(
    "/login",
    {
      bodyLimit: 4096,
      onRequest: requireTrustedAuthOrigin,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parseInput(loginSchema, request.body);
      refreshCookieOptions();
      const result = await getService().login(input);
      return sendCredentials(reply, result, result.user);
    },
  );

  server.post(
    "/refresh",
    {
      bodyLimit: 4096,
      onRequest: requireTrustedAuthOrigin,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      parseInput(emptyObjectSchema, request.body === undefined ? {} : request.body);
      refreshCookieOptions();
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw new AuthError("INVALID_REFRESH_TOKEN");
      getTokens().verifyRefreshToken(token);
      const result = await getService().refresh(token);
      return sendCredentials(reply, result);
    },
  );

  server.post(
    "/logout",
    { bodyLimit: 4096, onRequest: requireTrustedAuthOrigin },
    async (request, reply) => {
      parseInput(emptyObjectSchema, request.body === undefined ? {} : request.body);
      reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      const token = request.cookies[REFRESH_COOKIE];
      if (token) {
        let userId: string;
        try { userId = getTokens().verifyRefreshToken(token).sub; }
        catch (error) {
          if (error instanceof AuthError && error.code === "INVALID_REFRESH_TOKEN")
            return reply.code(204).send();
          throw error;
        }
        await getService().logout(token);
        options.matchmaking?.cancel(userId);
      }
      return reply.code(204).send();
    },
  );

  server.get("/me", { preHandler: accessTokenPreHandler(getTokens) }, async (request) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return { user: await getService().currentUser(request.authUserId) };
  });
}
