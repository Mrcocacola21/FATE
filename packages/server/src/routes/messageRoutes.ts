import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { documented, protectedErrors } from "../openapi/contract";
import type { DirectMessageService } from "../services/directMessageService";
import { emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { registerApiErrorHandler } from "./apiErrorHandler";
import { userIdParamsSchema } from "./friendRoutes";
import { CHAT_REPORT_COMMENT_MAX, CHAT_REPORT_REASONS } from "../chat/roomChat";

/** Length is checked after normalization; this bound only keeps junk out. */
export const directMessageBodySchema = z.object({ text: z.string().max(4000) }).strict();
export const directMessageHistoryQuerySchema = z.object({ before: z.string().uuid().optional() }).strict();

export const directMessageReportSchema = z
  .object({
    messageId: z.string().uuid(),
    reason: z.enum(CHAT_REPORT_REASONS),
    comment: z.string().max(CHAT_REPORT_COMMENT_MAX * 4).optional(),
  })
  .strict();

const notFound = { 404: ["USER_NOT_FOUND"] };

export async function messageRoutes(
  server: FastifyInstance,
  /** Built on first use, so a server without a database still starts. */
  options: { messages: () => DirectMessageService },
): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
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
    "/messages",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listConversations",
        tag: "Messages",
        summary: "Your conversations",
        description:
          "The latest message of each conversation, newest first, at most 50, with unread counts. Conversations with a player blocked either way are left out.",
        response: "Conversations",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => {
      parseInput(emptyObjectSchema, request.query);
      return options.messages().conversations(me(request));
    },
  );

  server.get(
    "/messages/unread",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "countUnreadMessages",
        tag: "Messages",
        summary: "How many private messages you have not read",
        response: "DirectMessageUnread",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => {
      parseInput(emptyObjectSchema, request.query);
      return options.messages().unreadCount(me(request));
    },
  );

  server.get<{ Params: { userId: string } }>(
    "/messages/:userId",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listDirectMessages",
        tag: "Messages",
        summary: "A page of your conversation with a player",
        description:
          "Up to 50 messages, oldest first. Pass `before` (the oldest message id you hold) for the page before it. Empty while either of you has blocked the other.",
        params: userIdParamsSchema,
        query: directMessageHistoryQuerySchema,
        response: "DirectMessages",
        auth: "bearer",
        errors: { ...protectedErrors, 400: ["VALIDATION_ERROR", "MESSAGE_SELF"], 404: ["USER_NOT_FOUND", "MESSAGE_NOT_FOUND"] },
      }),
    },
    async (request) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      const { before } = parseInput(directMessageHistoryQuerySchema, request.query);
      return options.messages().history(me(request), userId, before);
    },
  );

  server.post<{ Params: { userId: string } }>(
    "/messages/:userId",
    {
      preHandler: authenticate,
      bodyLimit: 16 * 1024,
      ...documented(
        {
          operationId: "sendDirectMessage",
          tag: "Messages",
          summary: "Send a private message to a friend",
          description:
            "At most 1000 characters after control characters are removed and whitespace is folded; 5 messages in 10 seconds.",
          params: userIdParamsSchema,
          body: directMessageBodySchema,
          response: "DirectMessage",
          success: 201,
          auth: "bearer",
          errors: {
            ...protectedErrors,
            ...notFound,
            400: ["VALIDATION_ERROR", "MESSAGE_SELF", "MESSAGE_EMPTY", "MESSAGE_TOO_LONG"],
            403: ["ACCOUNT_BLOCKED", "MESSAGE_NOT_ALLOWED", "CHAT_MUTED"],
            409: ["MESSAGE_DUPLICATE"],
            429: ["RATE_LIMITED"],
          },
        },
        { rateLimit: { max: 30, timeWindow: "1 minute" } },
      ),
    },
    async (request, reply) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      const { text } = parseInput(directMessageBodySchema, request.body);
      reply.code(201);
      return options.messages().send(me(request), userId, text);
    },
  );

  server.post<{ Params: { userId: string } }>(
    "/messages/:userId/report",
    {
      preHandler: authenticate,
      bodyLimit: 8 * 1024,
      ...documented(
        {
          operationId: "reportDirectMessage",
          tag: "Messages",
          summary: "Report a private message this player sent you",
          description:
            "The message and up to ten messages before it are copied for moderators. Reporting the same message again is accepted and changes nothing; 10 reports an hour.",
          params: userIdParamsSchema,
          body: directMessageReportSchema,
          success: 204,
          auth: "bearer",
          errors: {
            ...protectedErrors,
            400: ["VALIDATION_ERROR", "MESSAGE_SELF", "CHAT_REPORT_INVALID"],
            429: ["CHAT_REPORT_LIMIT", "RATE_LIMITED"],
          },
        },
        { rateLimit: { max: 20, timeWindow: "1 minute" } },
      ),
    },
    async (request, reply) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      const body = parseInput(directMessageReportSchema, request.body);
      await options.messages().report(me(request), userId, body.messageId, body.reason, body.comment);
      return reply.code(204).send();
    },
  );

  server.post<{ Params: { userId: string } }>(
    "/messages/:userId/read",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "markDirectMessagesRead",
        tag: "Messages",
        summary: "Mark a conversation as read",
        description: "Returns how many private messages you still have unread.",
        params: userIdParamsSchema,
        response: "DirectMessageUnread",
        auth: "bearer",
        errors: { ...protectedErrors, ...notFound, 400: ["VALIDATION_ERROR", "MESSAGE_SELF"] },
      }),
    },
    async (request) => {
      const { userId } = parseInput(userIdParamsSchema, request.params);
      return options.messages().markRead(me(request), userId);
    },
  );
}
