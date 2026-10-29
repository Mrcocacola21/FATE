import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { documented, protectedErrors } from "../openapi/contract";
import { NotificationRepository } from "../repositories/notificationRepository";
import { NotificationService } from "../services/notificationService";
import { emptyObjectSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { registerApiErrorHandler } from "./apiErrorHandler";

export async function notificationRoutes(
  server: FastifyInstance,
  /** Built on first use, so a server without a database still starts. */
  options: { notifications?: () => NotificationService } = {},
): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
  let fallback: NotificationService | undefined;
  const getService = () =>
    options.notifications?.() ?? (fallback ??= new NotificationService(new NotificationRepository()));
  const me = (request: { authUserId: string | null }) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return request.authUserId;
  };

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  registerApiErrorHandler(server);

  server.get(
    "/notifications",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listNotifications",
        tag: "Notifications",
        summary: "Your latest notifications",
        description: "At most 30, newest first, with the number still unread.",
        response: "Notifications",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => {
      parseInput(emptyObjectSchema, request.query);
      return getService().list(me(request));
    },
  );

  server.post(
    "/notifications/read",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "markNotificationsRead",
        tag: "Notifications",
        summary: "Mark all your notifications as read",
        response: "NotificationsRead",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => getService().markAllRead(me(request)),
  );
}
