import { emptyObjectSchema } from "../validation/commonSchemas";
import { documented, protectedErrors } from "../openapi/contract";
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

export function toAccessCredentialsDto(
  credentials: Pick<Credentials, "accessToken" | "accessTokenExpiresIn">,
) {
  return {
    accessToken: credentials.accessToken,
    accessTokenExpiresIn: credentials.accessTokenExpiresIn,
  };
}

export function toSessionCredentialsDto(
  credentials: Pick<Credentials, "accessToken" | "accessTokenExpiresIn">,
  user: ReturnType<typeof toAuthUserDto>,
) {
  return { user, ...toAccessCredentialsDto(credentials) };
}

function sendCredentials(
  reply: FastifyReply,
  credentials: Credentials,
  user?: ReturnType<typeof toAuthUserDto>,
) {
  reply.setCookie(REFRESH_COOKIE, credentials.refreshToken, {
    ...refreshCookieOptions(),
    expires: credentials.refreshExpiresAt,
  });
  return reply.send(
    user === undefined
      ? toAccessCredentialsDto(credentials)
      : toSessionCredentialsDto(credentials, user),
  );
}

export async function authRoutes(
  server: FastifyInstance,
  options: { matchmaking?: MatchmakingService } = {},
): Promise<void> {
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
      ...documented(
        {
          operationId: "registerUser",
          tag: "Auth",
          summary: "Register an account and issue credentials",
          body: registerSchema,
          response: "AuthSessionCredentials",
          success: 201,
          cookie: "set",
          errors: {
            403: ["FORBIDDEN_ORIGIN"],
            409: ["EMAIL_ALREADY_REGISTERED", "USERNAME_ALREADY_TAKEN"],
            429: ["RATE_LIMITED"],
            503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"],
          },
          requestExample: {
            username: "player_one",
            email: "player@example.com",
            password: "example-password",
          },
        },
        { rateLimit: { max: 5, timeWindow: "1 minute" } },
      ),
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
      ...documented(
        {
          operationId: "login",
          tag: "Auth",
          summary: "Log in and issue credentials",
          body: loginSchema,
          response: "AuthSessionCredentials",
          cookie: "set",
          errors: {
            401: ["INVALID_CREDENTIALS"],
            403: ["FORBIDDEN_ORIGIN", "ACCOUNT_BLOCKED"],
            429: ["RATE_LIMITED"],
            503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"],
          },
          requestExample: { email: "player@example.com", password: "example-password" },
        },
        { rateLimit: { max: 10, timeWindow: "1 minute" } },
      ),
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
      ...documented(
        {
          operationId: "refreshSession",
          tag: "Auth",
          summary: "Rotate refresh cookie and issue an access token",
          body: emptyObjectSchema,
          bodyOptional: true,
          response: "AuthCredentials",
          auth: "refresh",
          cookie: "set",
          description:
            "The refresh token is accepted only from the HttpOnly cookie. Invalid refresh credentials clear the cookie. No user object is returned.",
          errors: {
            401: ["INVALID_REFRESH_TOKEN"],
            403: ["FORBIDDEN_ORIGIN", "ACCOUNT_BLOCKED"],
            429: ["RATE_LIMITED"],
            503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"],
          },
        },
        { rateLimit: { max: 30, timeWindow: "1 minute" } },
      ),
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
    {
      bodyLimit: 4096,
      onRequest: requireTrustedAuthOrigin,
      ...documented({
        operationId: "logout",
        tag: "Auth",
        summary: "Revoke the session and clear refresh cookie",
        body: emptyObjectSchema,
        bodyOptional: true,
        success: 204,
        auth: "optionalRefresh",
        cookie: "clear",
        description:
          "Idempotent: missing or invalid refresh credentials still return 204. A valid cookie revokes the session and cancels the queue.",
        errors: { 403: ["FORBIDDEN_ORIGIN"], 503: ["DATABASE_UNAVAILABLE", "AUTH_UNAVAILABLE"] },
      }),
    },
    async (request, reply) => {
      parseInput(emptyObjectSchema, request.body === undefined ? {} : request.body);
      reply.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      const token = request.cookies[REFRESH_COOKIE];
      if (token) {
        let userId: string;
        try {
          userId = getTokens().verifyRefreshToken(token).sub;
        } catch (error) {
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

  server.get(
    "/me",
    {
      preHandler: accessTokenPreHandler(getTokens),
      ...documented({
        operationId: "getCurrentUser",
        tag: "Auth",
        summary: "Return the current account",
        response: "CurrentUser",
        auth: "bearer",
        errors: { ...protectedErrors, 404: ["USER_NOT_FOUND"] },
      }),
    },
    async (request) => {
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return { user: await getService().currentUser(request.authUserId) };
    },
  );
}
