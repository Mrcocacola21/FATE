import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { requireTestDatabaseUrl } from "./testDatabase";

async function run() {
  process.env.DATABASE_URL = requireTestDatabaseUrl();
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
      assert.equal(invalid.json().error.code, "INVALID_REQUEST");
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

    // Missing legacy profiles are reported deliberately, never silently manufactured.
    await database.profile.delete({ where: { userId: b.user.id } });
    const missing = await server.inject({
      url: "/api/profile",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    console.log(
      "Profile PostgreSQL integration passed: own/public privacy, PATCH, validation, persistence, concurrent usernames and auth identity",
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
