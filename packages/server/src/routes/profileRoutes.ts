import type { FastifyInstance } from "fastify";
import { AuthError } from "../auth/authErrors";
import { accessTokenPreHandler } from "../auth/authMiddleware";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { profilePatchSchema } from "../profile/schemas";
import { ProfileRepository } from "../repositories/profileRepository";
import { ProfileService } from "../services/profileService";
import { toApiError } from "./apiErrorHandler";

export async function profileRoutes(server: FastifyInstance): Promise<void> {
  server.decorateRequest("authUserId", null);
  let tokens: TokenService | undefined;
  let service: ProfileService | undefined;
  const authenticate = accessTokenPreHandler(() => (tokens ??= new TokenService(readAuthConfig())));
  const getService = () => (service ??= new ProfileService(new ProfileRepository()));

  server.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  server.setErrorHandler((error, request, reply) => {
    const failure = toApiError(error);
    if (failure.statusCode >= 500)
      request.log.error(
        { category: failure.code, requestId: request.id },
        "Profile request failed",
      );
    reply.code(failure.statusCode).send(failure.toResponse());
  });
  server.get("/profile", { preHandler: authenticate }, async (request) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    return { profile: await getService().getOwnProfile(request.authUserId) };
  });
  server.patch("/profile", { preHandler: authenticate, bodyLimit: 8192 }, async (request) => {
    if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST");
    return { profile: await getService().updateOwnProfile(request.authUserId, parsed.data) };
  });
  server.get<{ Params: { username: string } }>("/users/:username", async (request) => {
    return { profile: await getService().getPublicProfile(request.params.username) };
  });
}
