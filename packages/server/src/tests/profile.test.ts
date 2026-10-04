import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { profilePatchSchema } from "../profile/schemas";
import { usernameSchema } from "../auth/schemas";
import { AuthError } from "../auth/authErrors";
import { ProfileService } from "../services/profileService";
import { ProfileRepository } from "../repositories/profileRepository";
import { TokenService } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import { buildServer } from "../index";

async function run() {
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
