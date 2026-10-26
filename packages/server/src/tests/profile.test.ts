import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { profilePatchSchema } from "../profile/schemas";
import { profileLanguages, toPublicLanguage, toStoredLanguage } from "../profile/languages";
import { usernameSchema } from "../auth/schemas";
import { AuthError } from "../auth/authErrors";
import { ProfileService } from "../services/profileService";
import { ProfileRepository } from "../repositories/profileRepository";
import { TokenService } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import { buildServer } from "../index";
import { parseAvatarImage, uploadedAvatarPath } from "../profile/avatarImage";
import { jpegHeader, pngHeader, webpHeader } from "./avatarFixtures";

async function run() {
  for (const preferredLanguage of profileLanguages) {
    assert.deepEqual(profilePatchSchema.parse({ preferredLanguage }), { preferredLanguage });
    assert.equal(toPublicLanguage(toStoredLanguage(preferredLanguage)), preferredLanguage);
  }
  for (const preferredLanguage of ["pt", "pt_BR", "zh", "zh_CN", "zh-TW", "iw", "ar"]) {
    assert.equal(profilePatchSchema.safeParse({ preferredLanguage }).success, false);
  }
  let writtenLanguage: string | undefined;
  const languageRepository = new ProfileRepository({
    profile: {
      update: async ({ data }: { data: { preferredLanguage?: string } }) => {
        writtenLanguage = data.preferredLanguage;
        return {};
      },
    },
  } as unknown as PrismaClient);
  await languageRepository.updateByUserId(randomUUID(), { preferredLanguage: "pt-BR" });
  assert.equal(writtenLanguage, "pt_BR");
  await languageRepository.updateByUserId(randomUUID(), { preferredLanguage: "zh-CN" });
  assert.equal(writtenLanguage, "zh_CN");
  await languageRepository.updateByUserId(randomUUID(), { preferredLanguage: "he" });
  assert.equal(writtenLanguage, "he");
  assert.deepEqual(profilePatchSchema.parse({ displayName: "  Макс  ", avatarUrl: " " }), {
    displayName: "Макс",
    avatarUrl: null,
  });
  assert.deepEqual(profilePatchSchema.parse({ avatarUrl: null }), { avatarUrl: null });
  assert.deepEqual(profilePatchSchema.parse({}), {});
  for (const username of [" AbC_1 ", "bad name", "ab", "a".repeat(33)]) {
    const parsed = profilePatchSchema.safeParse({ username });
    const registration = usernameSchema.safeParse(username);
    assert.equal(parsed.success, registration.success);
    if (parsed.success && registration.success)
      assert.equal(parsed.data.username, registration.data);
  }
  for (const body of [
    { avatarUrl: "javascript:alert(1)" },
    { avatarUrl: "data:image/png;base64,x" },
    { avatarUrl: "file:///avatar.png" },
    { avatarUrl: "not a URL" },
    { avatarUrl: "https://example.test/" + "x".repeat(2048) },
    { displayName: "x".repeat(65) },
    { preferredTheme: "system" },
    { preferredLanguage: "ru" },
    { userId: randomUUID() },
    { email: "other@example.test" },
    { passwordHash: "hash" },
    { roles: ["admin"] },
    { createdAt: "2020-01-01" },
  ])
    assert.equal(profilePatchSchema.safeParse(body).success, false);

  // Avatar uploads: the bytes must match the declared type and report a sane size.
  for (const [type, image] of [
    ["image/png", pngHeader(256, 256)],
    ["image/jpeg", jpegHeader(320, 240)],
    ["image/webp", webpHeader(1024, 16)],
  ] as const) {
    const parsed = parseAvatarImage(`${type}; charset=binary`, image);
    assert.equal(parsed.contentType, type);
    assert.equal(parsed.sha256.length, 64);
  }
  assert.deepEqual(
    (({ width, height }) => ({ width, height }))(parseAvatarImage("image/jpeg", jpegHeader(320, 240))),
    { width: 320, height: 240 },
  );
  for (const [type, body] of [
    ["image/jpeg", pngHeader(256, 256)],
    ["image/svg+xml", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")],
    ["image/png", pngHeader(8, 256)],
    ["image/png", pngHeader(2048, 256)],
    ["image/webp", webpHeader(4000, 4000)],
    ["image/png", Buffer.concat([pngHeader(64, 64), Buffer.alloc(256 * 1024)])],
    ["image/png", Buffer.alloc(0)],
    ["image/png", "not a buffer"],
    [undefined, pngHeader(64, 64)],
  ] as const)
    assert.throws(() => parseAvatarImage(type, body), /Upload a PNG, JPEG or WebP image/);
  assert.equal(
    uploadedAvatarPath("00000000-0000-4000-8000-000000000000", "a".repeat(64)),
    `/api/avatars/00000000-0000-4000-8000-000000000000?v=${"a".repeat(16)}`,
  );

  const repository = new ProfileRepository({} as PrismaClient);
  repository.updateByUserId = async () => {
    throw new Prisma.PrismaClientKnownRequestError("unique violation", {
      code: "P2002",
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ["username"] },
    });
  };
  await assert.rejects(
    new ProfileService(repository).updateOwnProfile(randomUUID(), { username: "Taken" }),
    (error: unknown) => error instanceof AuthError && error.code === "USERNAME_ALREADY_TAKEN",
  );
  const unexpectedConstraint = new Prisma.PrismaClientKnownRequestError("unknown constraint", {
    code: "P2002",
    clientVersion: Prisma.prismaVersion.client,
    meta: { target: ["unrelated_field"] },
  });
  repository.updateByUserId = async () => {
    throw unexpectedConstraint;
  };
  await assert.rejects(
    new ProfileService(repository).updateOwnProfile(randomUUID(), { username: "Player" }),
    (error: unknown) => error === unexpectedConstraint,
  );

  Object.assign(process.env, {
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    JWT_ACCESS_SECRET: "profile-unit-access-01234567890123456789",
    JWT_REFRESH_SECRET: "profile-unit-refresh-01234567890123456789",
  });
  delete process.env.DATABASE_URL;
  const server = await buildServer();
  const token = new TokenService(readAuthConfig()).signAccessToken(randomUUID());
  try {
    for (const method of ["GET", "PATCH"] as const) {
      const response = await server.inject({
        method,
        url: "/api/profile",
        ...(method === "PATCH" ? { payload: {} } : {}),
      });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, "UNAUTHORIZED");
    }
    const anonymousUpload = await server.inject({
      method: "PUT",
      url: "/api/profile/avatar",
      headers: { "content-type": "image/png" },
      payload: pngHeader(64, 64),
    });
    assert.equal(anonymousUpload.statusCode, 401);
    assert.equal(anonymousUpload.json().error.code, "UNAUTHORIZED");
    const invalid = await server.inject({
      method: "PATCH",
      url: "/api/profile",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId: randomUUID() },
    });
    // Protected input cannot be processed until current account access is verified.
    // Payload validation with an authenticated DB account is covered by the DB suite.
    assert.equal(invalid.statusCode, 503);
    assert.equal(invalid.json().error.code, "DATABASE_UNAVAILABLE");
    const unavailable = await server.inject({ url: "/api/users/Player" });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().error.code, "DATABASE_UNAVAILABLE");
    assert.equal(unavailable.headers["cache-control"], "no-store");
    assert.equal((await server.inject({ url: "/health" })).statusCode, 200);
  } finally {
    await server.close();
  }
  console.log("Profile validation, conflict mapping and HTTP security tests passed");
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
