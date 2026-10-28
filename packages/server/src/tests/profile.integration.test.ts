import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureTestDatabase } from "./testDatabase";
import { jpegHeader, pngHeader } from "./avatarFixtures";

async function run() {
  configureTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_ACCESS_SECRET: "profile-integration-access-01234567890123456789",
    JWT_REFRESH_SECRET: "profile-integration-refresh-01234567890123456789",
  });
  const [{ PrismaClient }, { buildServer }] = await Promise.all([
    import("@prisma/client"),
    import("../index"),
  ]);
  const database = new PrismaClient();
  const server = await buildServer();
  const suffix = randomUUID().slice(0, 8);
  const emails = [`profile-a-${suffix}@example.test`, `profile-b-${suffix}@example.test`];
  try {
    const accounts = [];
    for (let i = 0; i < 2; i++) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: emails[i],
          username: `Profile_${i}_${suffix}`,
          password: "profile test password",
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      accounts.push(response.json());
    }
    const [a, b] = accounts;
    const headers = { authorization: `Bearer ${a.accessToken}` };
    const getOwn = () => server.inject({ url: "/api/profile", headers });
    const patch = (payload: object) =>
      server.inject({ method: "PATCH", url: "/api/profile", headers, payload });
    const publicGet = (username: string) => server.inject({ url: `/api/users/${username}` });
    const ownResponse = await getOwn();
    assert.equal(ownResponse.statusCode, 200);
    const own = ownResponse.json().profile;
    assert.deepEqual(
      Object.keys(own).sort(),
      [
        "id",
        "email",
        "username",
        "displayName",
        "avatarUrl",
        "createdAt",
        "updatedAt",
        "preferredLanguage",
        "preferredTheme",
        "friendRequests",
        "presenceVisibility",
      ].sort(),
    );
    assert.equal(own.email, emails[0]);
    assert.equal(
      own.createdAt,
      (await database.user.findUniqueOrThrow({ where: { id: a.user.id } })).createdAt.toISOString(),
    );
    assert.equal(own.preferredLanguage, "en");
    assert.equal(own.preferredTheme, "light");
    assert.equal(await database.profile.count({ where: { userId: a.user.id } }), 1);
    const languages = [
      "uk",
      "en",
      "pl",
      "de",
      "fr",
      "es",
      "pt-BR",
      "tr",
      "ja",
      "ko",
      "zh-CN",
      "he",
    ] as const;
    for (const language of languages) {
      const updated = await patch({ preferredLanguage: language });
      assert.equal(updated.statusCode, 200, updated.body);
      assert.equal(updated.json().profile.preferredLanguage, language);
      const stored = await database.profile.findUniqueOrThrow({ where: { userId: a.user.id } });
      const expectedPrisma =
        language === "pt-BR" ? "pt_BR" : language === "zh-CN" ? "zh_CN" : language;
      assert.equal(stored.preferredLanguage, expectedPrisma);
      const rows = await database.$queryRaw<Array<{ language: string }>>`
        SELECT "preferredLanguage"::text AS language FROM "Profile" WHERE "userId" = ${a.user.id}::uuid`;
      assert.deepEqual(rows, [{ language }], "PostgreSQL stores the public enum label");
      const reloaded = await getOwn();
      assert.equal(reloaded.statusCode, 200, reloaded.body);
      assert.equal(reloaded.json().profile.preferredLanguage, language);
      console.log(
        `Profile locale round-trip: public=${language}, Prisma=${expectedPrisma}, PostgreSQL=${rows[0].language}, PATCH/GET=200`,
      );
    }
    for (const preferredLanguage of [
      "ru",
      "pt",
      "pt_BR",
      "zh",
      "zh_CN",
      "zh-TW",
      "iw",
      "ar",
      "",
      "HE",
    ]) {
      const invalid = await patch({ preferredLanguage });
      assert.equal(invalid.statusCode, 400, invalid.body);
      assert.equal(invalid.json().error.code, "VALIDATION_ERROR");
      assert.doesNotMatch(invalid.body, /Prisma|P\d{4}|SQLSTATE|ALTER TYPE|Invalid.*invocation/i);
      assert.equal((await getOwn()).json().profile.preferredLanguage, "he");
      assert.equal(
        (await database.profile.findUniqueOrThrow({ where: { userId: a.user.id } }))
          .preferredLanguage,
        "he",
      );
    }
    console.log(
      "Profile invalid locales: 10 rejected with HTTP 400 VALIDATION_ERROR, no Prisma disclosure or persisted changes",
    );
    assert.equal((await server.inject({ url: "/api/profile" })).statusCode, 401);
    assert.equal(
      (
        await server.inject({
          method: "PATCH",
          url: "/api/profile",
          payload: { displayName: "Hacked" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await server.inject({ url: "/api/profile", headers: { authorization: "Bearer bad" } }))
        .statusCode,
      401,
    );

    const publicResponse = await publicGet(own.username);
    assert.equal(publicResponse.statusCode, 200);
    assert.deepEqual(
      Object.keys(publicResponse.json().profile).sort(),
      ["id", "username", "displayName", "avatarUrl", "createdAt"].sort(),
    );
    const absent = await publicGet(`Unknown_${suffix}`);
    assert.equal(absent.statusCode, 404);
    assert.equal(absent.json().error.code, "USER_NOT_FOUND");

    let response = await patch({ displayName: "  Макс Player  " });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().profile.displayName, "Макс Player");
    assert.equal((await getOwn()).json().profile.displayName, "Макс Player");
    response = await patch({
      avatarUrl: " https://example.test/avatar.png ",
      preferredLanguage: "uk",
      preferredTheme: "dark",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().profile.avatarUrl, "https://example.test/avatar.png");
    response = await patch({ displayName: "Only name" });
    assert.equal(response.json().profile.avatarUrl, "https://example.test/avatar.png");
    assert.equal(response.json().profile.preferredLanguage, "uk");
    assert.equal(response.json().profile.preferredTheme, "dark");
    assert.equal(response.json().profile.username, own.username);
    for (const payload of [{ displayName: null }, { displayName: " " }]) {
      assert.equal((await patch(payload)).json().profile.displayName, null);
    }
    for (const payload of [{ avatarUrl: null }, { avatarUrl: "" }]) {
      assert.equal((await patch(payload)).json().profile.avatarUrl, null);
    }
    const renamed = `Renamed_${suffix}`;
    response = await patch({ username: ` ${renamed} ` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().profile.username, renamed);
    assert.equal((await publicGet(renamed)).statusCode, 200);
    assert.equal((await publicGet(own.username)).statusCode, 404);
    assert.equal((await patch({ username: renamed })).statusCode, 200);
    assert.equal((await patch({})).statusCode, 200);
    const currentIdentity = await server.inject({ url: "/api/auth/me", headers });
    assert.equal(currentIdentity.statusCode, 200);
    assert.equal(currentIdentity.json().user.username, renamed);
    response = await patch({ username: b.user.username });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error.code, "USERNAME_ALREADY_TAKEN");

    for (const payload of [
      { username: "ab" },
      { username: "Bad Name" },
      { username: "x".repeat(33) },
      { avatarUrl: "javascript:alert(1)" },
      { avatarUrl: "data:image/png;base64,x" },
      { avatarUrl: "file:///tmp/avatar.png" },
      { avatarUrl: "bad" },
      { preferredLanguage: "ru" },
      { preferredTheme: "system" },
      { displayName: "x".repeat(65) },
      { userId: b.user.id },
      { email: emails[1] },
      { passwordHash: "hacked" },
      { createdAt: "2000-01-01" },
    ]) {
      const invalid = await patch(payload);
      assert.equal(invalid.statusCode, 400, invalid.body);
      assert.equal(invalid.json().error.code, "VALIDATION_ERROR");
    }
    const bProfile = await database.profile.findUniqueOrThrow({ where: { userId: b.user.id } });
    assert.equal(bProfile.displayName, null);
    const claimed = `Claimed_${suffix}`;
    const raced = await Promise.all(
      accounts.map((account) =>
        server.inject({
          method: "PATCH",
          url: "/api/profile",
          headers: { authorization: `Bearer ${account.accessToken}` },
          payload: { username: claimed },
        }),
      ),
    );
    assert.deepEqual(raced.map((result) => result.statusCode).sort(), [200, 409]);
    assert.equal(
      raced.find((result) => result.statusCode === 409)?.json().error.code,
      "USERNAME_ALREADY_TAKEN",
    );
    assert.equal(await database.profile.count({ where: { username: claimed } }), 1);
    const saved = await database.profile.findUniqueOrThrow({ where: { userId: a.user.id } });
    assert.equal(saved.preferredLanguage, "uk");
    assert.equal(saved.preferredTheme, "dark");
    const afterReload = (await getOwn()).json().profile;
    assert.equal(afterReload.username, saved.username);
    assert.equal(afterReload.preferredLanguage, saved.preferredLanguage);

    // Avatar upload: stored bytes, a versioned URL, a cacheable public image and cleanup.
    const upload = (body: Buffer, type = "image/png", token = a.accessToken) =>
      server.inject({
        method: "PUT",
        url: "/api/profile/avatar",
        headers: { authorization: `Bearer ${token}`, "content-type": type },
        payload: body,
      });
    const first = await upload(pngHeader(256, 256));
    assert.equal(first.statusCode, 200, first.body);
    const firstUrl: string = first.json().profile.avatarUrl;
    assert.equal(firstUrl.split("?")[0], `/api/avatars/${a.user.id}`);
    assert.match(firstUrl, /\?v=[0-9a-f]{16}$/);
    assert.equal((await getOwn()).json().profile.avatarUrl, firstUrl);
    const image = await server.inject({ url: firstUrl });
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers["content-type"], "image/png");
    assert.equal(image.headers["cache-control"], "public, max-age=31536000, immutable");
    assert.equal(image.headers["x-content-type-options"], "nosniff");
    assert.match(String(image.headers["content-security-policy"]), /sandbox/);
    assert.deepEqual(image.rawPayload, pngHeader(256, 256));
    const revalidated = await server.inject({
      url: firstUrl,
      headers: { "if-none-match": String(image.headers.etag) },
    });
    assert.equal(revalidated.statusCode, 304);
    // A new picture replaces the row and changes the version.
    const second = await upload(jpegHeader(300, 300), "image/jpeg");
    assert.equal(second.statusCode, 200, second.body);
    assert.notEqual(second.json().profile.avatarUrl, firstUrl);
    assert.equal((await server.inject({ url: firstUrl })).headers["content-type"], "image/jpeg");
    assert.equal(await database.userAvatar.count({ where: { userId: a.user.id } }), 1);
    for (const [body, type] of [
      [pngHeader(256, 256), "image/jpeg"],
      [Buffer.from("<svg/>"), "image/svg+xml"],
      [Buffer.concat([pngHeader(64, 64), Buffer.alloc(300 * 1024)]), "image/png"],
    ] as const) {
      const rejected = await upload(body, type);
      assert.equal(rejected.statusCode, 400, rejected.body);
    }
    assert.equal((await upload(Buffer.from("x"), "image/gif")).statusCode, 400);
    // Setting a URL by hand drops the uploaded bytes; the old image URL then 404s.
    const external = await patch({ avatarUrl: "https://example.test/me.png" });
    assert.equal(external.json().profile.avatarUrl, "https://example.test/me.png");
    assert.equal(await database.userAvatar.count({ where: { userId: a.user.id } }), 0);
    const gone = await server.inject({ url: firstUrl });
    assert.equal(gone.statusCode, 404);
    assert.equal(gone.json().error.code, "AVATAR_NOT_FOUND");
    assert.equal((await server.inject({ url: "/api/avatars/not-a-uuid" })).statusCode, 400);
    assert.equal((await upload(pngHeader(64, 64))).statusCode, 200);
    assert.equal((await patch({ avatarUrl: null })).json().profile.avatarUrl, null);
    assert.equal(await database.userAvatar.count({ where: { userId: a.user.id } }), 0);

    // Missing legacy profiles are reported deliberately, never silently manufactured.
    await database.profile.delete({ where: { userId: b.user.id } });
    const missing = await server.inject({
      url: "/api/profile",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    console.log(
      "Profile PostgreSQL integration passed: own/public privacy, PATCH, validation, persistence, concurrent usernames, auth identity and avatar uploads",
    );
  } finally {
    await database.user.deleteMany({ where: { email: { in: emails } } });
    await server.close();
    await database.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
