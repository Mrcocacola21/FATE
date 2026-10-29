import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import type { InviteService } from "../invites/inviteService";
import { documented, protectedErrors } from "../openapi/contract";
import { emptyObjectSchema, idParamsSchema, roomIdSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { registerApiErrorHandler } from "./apiErrorHandler";

export const inviteBodySchema = z.object({ userId: z.string().uuid() }).strict();
export const lobbyParamsSchema = z.object({ roomId: roomIdSchema }).strict();

export async function inviteRoutes(
  server: FastifyInstance,
  options: { invites: InviteService },
): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
  const me = (request: { authUserId: string | null }) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return request.authUserId;
  };
  const { invites } = options;

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  registerApiErrorHandler(server);

  server.post<{ Params: { roomId: string } }>(
    "/lobbies/:roomId/invites",
    {
      preHandler: authenticate,
      bodyLimit: 1024,
      ...documented({
        operationId: "inviteToLobby",
        tag: "Lobbies",
        summary: "Invite a player into your lobby",
        description:
          "Only from a casual lobby you sit in while the other seat is free. The invite lasts two minutes or until the seat is taken; inviting the same player again returns the same invite. At most 10 new invites a minute.",
        params: lobbyParamsSchema,
        body: inviteBodySchema,
        response: "LobbyInvite",
        success: 201,
        auth: "bearer",
        errors: {
          ...protectedErrors,
          400: ["VALIDATION_ERROR", "INVITE_SELF"],
          403: ["ACCOUNT_BLOCKED", "INVITE_NOT_ALLOWED"],
          404: ["USER_NOT_FOUND"],
          409: ["LOBBY_NOT_INVITABLE"],
          429: ["RATE_LIMITED"],
        },
      }),
    },
    async (request, reply) => {
      const { roomId } = parseInput(lobbyParamsSchema, request.params);
      const { userId } = parseInput(inviteBodySchema, request.body);
      return reply.code(201).send(await invites.send(me(request), roomId, userId));
    },
  );

  server.get(
    "/invites",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "listLobbyInvites",
        tag: "Lobbies",
        summary: "Lobby invites you received and sent that are still open",
        response: "LobbyInvites",
        auth: "bearer",
        errors: protectedErrors,
      }),
    },
    async (request) => {
      parseInput(emptyObjectSchema, request.query);
      return invites.list(me(request));
    },
  );

  server.delete<{ Params: { id: string } }>(
    "/invites/:id",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "deleteLobbyInvite",
        tag: "Lobbies",
        summary: "Decline an invite you received or withdraw one you sent",
        params: idParamsSchema,
        success: 204,
        auth: "bearer",
        errors: { ...protectedErrors, 404: ["INVITE_NOT_FOUND"] },
      }),
    },
    async (request, reply) => {
      const { id } = parseInput(idParamsSchema, request.params);
      invites.remove(me(request), id);
      return reply.code(204).send();
    },
  );
}
