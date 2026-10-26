import rateLimit from "@fastify/rate-limit";
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
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES } from "../profile/avatarImage";
import { ProfileRepository } from "../repositories/profileRepository";
import { ProfileService } from "../services/profileService";
import { registerApiErrorHandler } from "./apiErrorHandler";

export const publicProfileParamsSchema = z.object({ username: usernameSchema }).strict();
export const avatarParamsSchema = z.object({ userId: z.string().uuid() }).strict();
/** The content version only busts caches; any picture is served for the user's current one. */
export const avatarQuerySchema = z
  .object({ v: z.string().regex(/^[0-9a-f]{16}$/).optional() })
  .strict();

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
  await server.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AuthError("RATE_LIMITED"),
  });
  // Raw image bodies, only inside this plugin; every other route keeps the JSON parser.
  server.addContentTypeParser(
    [...AVATAR_CONTENT_TYPES],
    { parseAs: "buffer", bodyLimit: AVATAR_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );
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
  server.put(
    "/profile/avatar",
    {
      preHandler: authenticate,
      bodyLimit: AVATAR_MAX_BYTES,
      ...documented(
        {
          operationId: "uploadOwnAvatar",
          tag: "Profiles",
          summary: "Upload a profile picture",
          description:
            "The raw image is the request body: Content-Type image/png, image/jpeg or image/webp, up to 256 KB and 16–1024 px per side. The profile's avatarUrl then points at /api/avatars/{userId} with a content version. Setting avatarUrl through PATCH /profile removes the uploaded picture.",
          response: "OwnProfile",
          auth: "bearer",
          errors: {
            ...protectedErrors,
            ...readErrors,
            400: ["AVATAR_INVALID", "VALIDATION_ERROR"],
            429: ["RATE_LIMITED"],
          },
        },
        { rateLimit: { max: 10, timeWindow: "1 minute" } },
      ),
    },
    async (request) => {
      if (!request.authUserId) throw new AuthError("UNAUTHORIZED");
      return {
        profile: await getService().uploadAvatar(
          request.authUserId,
          request.headers["content-type"],
          request.body,
        ),
      };
    },
  );
  server.get<{ Params: { userId: string } }>(
    "/avatars/:userId",
    documented({
      operationId: "getUserAvatar",
      tag: "Users",
      summary: "Return an uploaded profile picture",
      description:
        "Image bytes with their stored Content-Type. Profile avatarUrl values carry a content version, so responses are cacheable forever.",
      params: avatarParamsSchema,
      query: avatarQuerySchema,
      errors: { 400: ["VALIDATION_ERROR"], 404: ["AVATAR_NOT_FOUND"], 503: ["DATABASE_UNAVAILABLE"] },
    }),
    async (request, reply) => {
      const { userId } = parseInput(avatarParamsSchema, request.params);
      const avatar = await getService().getAvatar(userId);
      const etag = `"${avatar.sha256}"`;
      reply
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .header("ETag", etag)
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      if (request.headers["if-none-match"] === etag) return reply.code(304).send();
      return reply.type(avatar.contentType).send(avatar.data);
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
