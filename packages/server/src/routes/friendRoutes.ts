import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { usernameSchema } from "../auth/schemas";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { documented, protectedErrors } from "../openapi/contract";
import { FriendRepository } from "../repositories/friendRepository";
import { FriendService, type PresenceLookup } from "../services/friendService";
import type { FriendEvents } from "../services/notificationService";
import { bearerToken } from "../auth/bearer";
import { idParamsSchema, emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { registerApiErrorHandler } from "./apiErrorHandler";

export const friendRequestBodySchema = z.object({ username: usernameSchema }).strict();
export const userIdParamsSchema = z.object({ userId: z.string().uuid() }).strict();
export const playerSearchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

const notFound = { 404: ["USER_NOT_FOUND"] };

export async function friendRoutes(
  server: FastifyInstance,
  options: { friends?: FriendService; presence?: PresenceLookup; events?: FriendEvents } = {},
): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  let service = options.friends;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
  const getService = () =>
    (service ??= new FriendService(new FriendRepository(), options.presence, options.events));
  const me = (request: { authUserId: string | null }) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return request.authUserId;
  };

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  registerApiErrorHandler(server);
  await server.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });

  server.get(
    "/friends",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listFriends",
        tag: "Friends",
        summary: "List your friends",
        response: "Friends",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => {
      parseInput(emptyObjectSchema, request.query);
      return getService().listFriends(me(request));
    },
  );

  server.get(
    "/friends/requests",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listFriendRequests",
        tag: "Friends",
        summary: "List pending friend requests you received and sent",
        response: "FriendRequests",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => getService().listRequests(me(request)),
  );

  server.get(
    "/friends/requests/count",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "countFriendRequests",
        tag: "Friends",
        summary: "Count pending friend requests you received",
        response: "FriendRequestCount",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => getService().incomingCount(me(request)),
  );

  server.post(
    "/friends/requests",
    {
      preHandler: authenticate,
      bodyLimit: 1024,
      ...documented(
        {
          operationId: "sendFriendRequest",
          tag: "Friends",
          summary: "Send a friend request by username",
          description:
            "A request the other player already sent you is accepted instead. Returns your relationship with that player.",
          body: friendRequestBodySchema,
          response: "Relationship",
          auth: "bearer",
          errors: {
            ...protectedErrors,
            ...notFound,
            400: ["VALIDATION_ERROR", "FRIEND_SELF"],
            403: ["ACCOUNT_BLOCKED", "FRIEND_REQUEST_NOT_ALLOWED"],
            409: ["ALREADY_FRIENDS"],
            429: ["RATE_LIMITED"],
          },
        },
        { rateLimit: { max: 20, timeWindow: "1 minute" } },
      ),
    },
    async (request) => {
      const { username } = parseInput(friendRequestBodySchema, request.body);
      return getService().sendRequest(me(request), username);
    },
  );

  server.post<{ Params: { id: string } }>(
    "/friends/requests/:id/accept",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "acceptFriendRequest",
        tag: "Friends",
        summary: "Accept a friend request sent to you",
        params: idParamsSchema,
        response: "Friend",
        auth: "bearer",
        errors: { ...protectedErrors, 404: ["FRIEND_REQUEST_NOT_FOUND"] },
      }),
    },
    async (request) => {
      const { id } = parseInput(idParamsSchema, request.params);
      return getService().accept(me(request), id);
    },
  );

  server.delete<{ Params: { id: string } }>(
    "/friends/requests/:id",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "deleteFriendRequest",
        tag: "Friends",
        summary: "Decline a request you received or cancel one you sent",
        params: idParamsSchema,
        success: 204,
        auth: "bearer",
        errors: { ...protectedErrors, 404: ["FRIEND_REQUEST_NOT_FOUND"] },
      }),
    },
    async (request, reply) => {
      const { id } = parseInput(idParamsSchema, request.params);
      await getService().deleteRequest(me(request), id);
      return reply.code(204).send();
    },
  );

  server.delete<{ Params: { userId: string } }>(
    "/friends/:userId",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "removeFriend",
        tag: "Friends",
        summary: "Remove a player from your friends",
        params: userIdParamsSchema,
        success: 204,
        auth: "bearer",
        errors: { ...protectedErrors, 404: ["FRIEND_NOT_FOUND"] },
      }),
    },
    async (request, reply) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      await getService().removeFriend(me(request), userId);
      return reply.code(204).send();
    },
  );

  server.get<{ Params: { userId: string } }>(
    "/friends/relationship/:userId",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "getRelationship",
        tag: "Friends",
        summary: "Your relationship with one player",
        params: userIdParamsSchema,
        response: "Relationship",
        auth: "bearer",
        errors: { ...protectedErrors, ...notFound, 400: ["VALIDATION_ERROR", "FRIEND_SELF"] },
      }),
    },
    async (request) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      return getService().relationshipWith(me(request), userId);
    },
  );

  server.get(
    "/friends/blocks",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listBlockedPlayers",
        tag: "Friends",
        summary: "List players you blocked",
        response: "BlockedPlayers",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => getService().listBlocks(me(request)),
  );

  server.put<{ Params: { userId: string } }>(
    "/friends/blocks/:userId",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "blockPlayer",
        tag: "Friends",
        summary: "Block a player",
        description: "Also removes any friendship or pending request between you.",
        params: userIdParamsSchema,
        success: 204,
        auth: "bearer",
        errors: { ...protectedErrors, ...notFound, 400: ["VALIDATION_ERROR", "FRIEND_SELF"] },
      }),
    },
    async (request, reply) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      await getService().block(me(request), userId);
      return reply.code(204).send();
    },
  );

  server.delete<{ Params: { userId: string } }>(
    "/friends/blocks/:userId",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "unblockPlayer",
        tag: "Friends",
        summary: "Unblock a player",
        params: userIdParamsSchema,
        success: 204,
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request, reply) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      await getService().unblock(me(request), userId);
      return reply.code(204).send();
    },
  );

  server.get<{ Params: { userId: string } }>(
    "/users/:userId/presence",
    documented({
      operationId: "getUserPresence",
      tag: "Users",
      summary: "A player's online status, as you may see it",
      description:
        "Signed-out visitors and non-friends see at most online or last seen. Friends also see the lobby or battle. The player's visibility setting and blocks can hide the status entirely.",
      params: userIdParamsSchema,
      response: "Presence",
      auth: "optionalBearer",
      errors: { ...notFound, 401: ["UNAUTHORIZED"], 503: ["DATABASE_UNAVAILABLE"] },
    }),
    async (request) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      const token = bearerToken(request.headers.authorization, false);
      const viewerId = token
        ? (tokens ??= new TokenService(readAuthConfig())).verifyAccessToken(token).sub
        : null;
      return getService().presenceOf(viewerId, userId);
    },
  );

  server.get(
    "/players/search",
    {
      preHandler: authenticate,
      ...documented(
        {
          operationId: "searchPlayers",
          tag: "Friends",
          summary: "Find players by the start of their username",
          description:
            "Case-insensitive prefix match, at most 10 players, with your relationship to each.",
          query: playerSearchQuerySchema,
          response: "PlayerSearch",
          auth: "bearer",
          errors: { ...protectedErrors, 400: ["VALIDATION_ERROR"], 429: ["RATE_LIMITED"] },
        },
        { rateLimit: { max: 60, timeWindow: "1 minute" } },
      ),
    },
    async (request) => {
      const { q } = parseInput(playerSearchQuerySchema, request.query);
      return getService().search(me(request), q);
    },
  );
}
