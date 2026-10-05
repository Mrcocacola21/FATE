import { z } from "zod";
import { documented, protectedErrors, readErrors } from "../openapi/contract";
import { usernameSchema } from "../auth/schemas";
import { parseInput } from "../validation/parseRequest";
import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { profilePatchSchema } from "../profile/schemas";
import { ProfileRepository } from "../repositories/profileRepository";
import { ProfileService } from "../services/profileService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export const publicProfileParamsSchema = z.object({ username: usernameSchema }).strict();

export async function profileRoutes(server: FastifyInstance): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  let service: ProfileService | undefined;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
  const getService = () => (service ??= new ProfileService(new ProfileRepository()));

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  registerApiErrorHandler(server);
  server.get(
    "/profile",
    {
      preHandler: authenticate,
      ...documented({
        operationId: "getOwnProfile",
        tag: "Profiles",
        summary: "Return the private profile",
        response: "OwnProfile",
        auth: "bearer",
        errors: { ...protectedErrors, ...readErrors },
      }),
    },
    async (request) => {
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return { profile: await getService().getOwnProfile(request.authUserId) };
    },
  );
  server.patch(
    "/profile",
    {
      preHandler: authenticate,
      bodyLimit: 8192,
      ...documented({
        operationId: "updateOwnProfile",
        tag: "Profiles",
        summary: "Update profile preferences and public identity",
        body: profilePatchSchema,
        response: "OwnProfile",
        auth: "bearer",
        errors: { ...protectedErrors, ...readErrors, 409: ["USERNAME_ALREADY_TAKEN"] },
      }),
    },
    async (request) => {
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      const input = parseInput(profilePatchSchema, request.body);
      return { profile: await getService().updateOwnProfile(request.authUserId, input) };
    },
  );
  server.get<{ Params: { username: string } }>(
    "/users/:username",
    documented({
      operationId: "getUserProfile",
      tag: "Users",
      summary: "Look up a public profile by username",
      params: publicProfileParamsSchema,
      response: "PublicProfile",
      errors: readErrors,
    }),
    async (request) => {
      const { username } = parseInput(publicProfileParamsSchema, request.params);
      return { profile: await getService().getPublicProfile(username) };
    },
  );
}
