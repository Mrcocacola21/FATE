import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { AuthError } from "../auth/authErrors";
import { readAuthConfig } from "../auth/config";
import { hashPassword, PasswordVerifier, verifyPassword } from "../auth/password";
import { registerSchema, loginSchema } from "../auth/schemas";
import { equalTokenHashes, hashRefreshToken, TokenService } from "../auth/tokens";
import { buildTestServer as buildServer } from "./matchTestSupport";

const testEnv = {
  JWT_ACCESS_SECRET: "test-access-key-01234567890123456789",
  JWT_REFRESH_SECRET: "test-refresh-key-01234567890123456789",
};

async function run() {
  const config = readAuthConfig(testEnv);
  assert.equal(config.accessTtlSeconds, 900);
  assert.equal(config.refreshTtlSeconds, 2592000);
  for (const env of [
    {},
    { ...testEnv, JWT_ACCESS_SECRET: "changeme" },
    { ...testEnv, JWT_REFRESH_SECRET: testEnv.JWT_ACCESS_SECRET },
    { ...testEnv, JWT_ACCESS_TTL_SECONDS: "0" },
    { ...testEnv, JWT_REFRESH_TTL_SECONDS: "1.5" },
  ])
    assert.throws(() => readAuthConfig(env), AuthError);

  const password = "  long password  ";
  const hash = await hashPassword(password);
  assert.match(hash, /^\$argon2id\$v=19\$/);
  assert.deepEqual(hash.split("$")[3].split(",").sort(), ["m=65536", "p=1", "t=3"]);
  assert.notEqual(hash, password);
  assert(await verifyPassword(hash, password));
  assert.equal(await verifyPassword(hash, password.trim()), false);
  assert.equal(await new PasswordVerifier().verify(null, password), false);

  const input = registerSchema.parse({
    email: "  PLAYER@Example.com ",
    username: " Player_1 ",
    password,
  });
  assert.equal(input.email, "player@example.com");
  assert.equal(input.username, "Player_1");
  assert.equal(input.password, password);
  for (const body of [
    { ...input, email: "bad" },
    { ...input, username: "ab" },
    { ...input, username: "a".repeat(33) },
    { ...input, username: "bad handle" },
    { ...input, password: "short" },
    { ...input, password: "a".repeat(129) },
    { ...input, role: "admin" },
  ])
    assert.equal(registerSchema.safeParse(body).success, false);
  assert.equal(
    loginSchema.safeParse({ email: input.email, password: "a".repeat(128) }).success,
    true,
  );

  const tokens = new TokenService(config);
  const userId = randomUUID();
  const sessionId = randomUUID();
  const access = tokens.signAccessToken(userId);
  const refresh = tokens.signRefreshToken(userId, sessionId, new Date(Date.now() + 60000));
  assert.equal(tokens.verifyAccessToken(access).sub, userId);
  assert.equal(tokens.verifyRefreshToken(refresh).sid, sessionId);
  assert.notEqual(
    refresh,
    tokens.signRefreshToken(userId, sessionId, new Date(Date.now() + 60000)),
  );
  assert.throws(() => tokens.verifyAccessToken(refresh), AuthError);
  assert.throws(() => tokens.verifyRefreshToken(access), AuthError);
  assert.throws(() => tokens.verifyAccessToken("malformed"), AuthError);
  for (const payload of [
    { sub: userId, type: "access", exp: Math.floor(Date.now() / 1000) - 1 },
    { sub: "bad-uuid", type: "access", exp: Math.floor(Date.now() / 1000) + 60 },
    { sub: userId, type: "access" },
    { sub: userId, type: "refresh", exp: Math.floor(Date.now() / 1000) + 60 },
  ])
    assert.throws(
      () => tokens.verifyAccessToken(jwt.sign(payload, config.accessSecret)),
      AuthError,
    );
  assert.throws(
    () =>
      tokens.verifyAccessToken(
        jwt.sign({ sub: userId, type: "access" }, config.accessSecret, {
          algorithm: "HS512",
          expiresIn: 60,
        }),
      ),
    AuthError,
  );
  assert.throws(
    () =>
      tokens.verifyRefreshToken(
        jwt.sign({ sub: userId, type: "refresh", sid: sessionId }, config.refreshSecret, {
          expiresIn: 60,
        }),
      ),
    AuthError,
  );
  const fingerprint = hashRefreshToken(refresh);
  assert.equal(fingerprint.length, 64);
  assert.notEqual(fingerprint, refresh);
  assert(equalTokenHashes(fingerprint, hashRefreshToken(refresh)));
  assert.equal(equalTokenHashes(fingerprint, hashRefreshToken(access)), false);
  assert.equal(equalTokenHashes(fingerprint, "bad"), false);

  process.env.LOG_LEVEL = "silent";
  process.env.NODE_ENV = "production";
  process.env.WEB_ORIGIN = "https://fate.example.test";
  Object.assign(process.env, testEnv);
  delete process.env.DATABASE_URL;
  const server = await buildServer();
  try {
    for (const headers of [
      {},
      { authorization: "Bearer bad" },
      { authorization: `Bearer ${refresh}` },
    ]) {
      const response = await server.inject({ method: "GET", url: "/api/auth/me", headers });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, "UNAUTHORIZED");
    }
    for (const endpoint of ["register", "login", "refresh", "logout"]) {
      const response = await server.inject({
        method: "POST",
        url: `/api/auth/${endpoint}`,
        headers: { origin: "https://attacker.vercel.app" },
      });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error.code, "FORBIDDEN_ORIGIN");
    }
    const forbidden = await server.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { "sec-fetch-site": "cross-site" },
    });
    assert.equal(forbidden.statusCode, 403);
    const logout = await server.inject({ method: "POST", url: "/api/auth/logout" });
    assert.equal(logout.statusCode, 204);
    assert.match(String(logout.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(logout.headers["set-cookie"]), /Secure/);
    assert.match(String(logout.headers["set-cookie"]), /SameSite=None/);
    const malformed = await server.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: "{",
      headers: { "content-type": "application/json" },
    });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().error.code, "INVALID_REQUEST");
    const unavailable = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: input.email, password },
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.json().error.code, "DATABASE_UNAVAILABLE");
    assert.equal(unavailable.headers["cache-control"], "no-store");
    for (const origin of [process.env.WEB_ORIGIN, "https://attacker.vercel.app"]) {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/api/auth/refresh",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(
        response.headers["access-control-allow-origin"],
        origin === process.env.WEB_ORIGIN ? origin : undefined,
      );
      if (origin === process.env.WEB_ORIGIN)
        assert.equal(response.headers["access-control-allow-credentials"], "true");
    }
    let rateLimited = false;
    for (let i = 0; i < 11; i++) {
      const response = await server.inject({ method: "POST", url: "/api/auth/login", payload: {} });
      if (response.statusCode === 429) {
        assert.equal(response.json().error.code, "RATE_LIMITED");
        rateLimited = true;
      }
    }
    assert(rateLimited);
    assert.equal((await server.inject({ url: "/health" })).statusCode, 200);
    assert.equal(
      (await server.inject({ method: "POST", url: "/rooms", payload: {} })).statusCode,
      200,
    );
  } finally {
    await server.close();
  }

  // A refused local PostgreSQL connection must produce a safe 503, without stopping gameplay.
  process.env.DATABASE_URL =
    "postgresql://auth_unit_test:local_test@127.0.0.1:1/auth_unit_test?connect_timeout=1";
  const unavailableServer = await buildServer();
  try {
    const response = await unavailableServer.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${access}` },
    });
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), new AuthError("DATABASE_UNAVAILABLE").toResponse());
    assert.equal((await unavailableServer.inject({ url: "/health" })).statusCode, 200);
  } finally {
    await unavailableServer.close();
  }
  console.log("auth unit and HTTP security tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
