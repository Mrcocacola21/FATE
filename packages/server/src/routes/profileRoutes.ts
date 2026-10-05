import { z } from "zod";
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
  server.get("/profile", { preHandler: authenticate }, async (request) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return { profile: await getService().getOwnProfile(request.authUserId) };
  });
  server.patch("/profile", { preHandler: authenticate, bodyLimit: 8192 }, async (request) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    const input = parseInput(profilePatchSchema, request.body);
    return { profile: await getService().updateOwnProfile(request.authUserId, input) };
  });
  server.get<{ Params: { username: string } }>("/users/:username", async (request) => {
    const { username } = parseInput(publicProfileParamsSchema, request.params);
    return { profile: await getService().getPublicProfile(username) };
  });
}
