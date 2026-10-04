import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { configureTestDatabase } from "./testDatabase";
import { hashRefreshToken, TokenService } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import { verifyPassword } from "../auth/password";

const userSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["USER", "MODERATOR", "ADMIN"]),
    email: z.string().email(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
const credentialsSchema = z
  .object({
    user: userSchema.optional(),
    accessToken: z.string(),
    accessTokenExpiresIn: z.number(),
  })
  .strict();

function refreshCookie(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find((value) => value.name === "fate_refresh");
  assert(cookie, "refresh cookie must be set");
  return cookie.value;
}

function error(response: LightMyRequestResponse, status: number, code: string) {
  assert.equal(response.statusCode, status, response.body);
  assert.equal(response.json().error.code, code);
  assert.equal(response.body.includes("passwordHash"), false);
  assert.equal(response.body.includes("refreshTokenHash"), false);
}

async function run() {
  configureTestDatabase();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.WEB_ORIGIN = "http://localhost:5173";
  process.env.JWT_ACCESS_SECRET = "auth-integration-access-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "auth-integration-refresh-01234567890123456789";
  const [{ PrismaClient }, { buildServer }] = await Promise.all([
    import("@prisma/client"),
    import("../index"),
  ]);
  const database = new PrismaClient();
  const server = await buildServer();
  const tokenService = new TokenService(readAuthConfig());
  const suffix = randomUUID().slice(0, 12);
  const createdEmails: string[] = [];
  const password = "  integration password  ";
  let requestNumber = 1;
  const post = (endpoint: string, payload?: object, token?: string) =>
    server.inject({
      method: "POST",
      url: `/api/auth/${endpoint}`,
      payload,
      // Independent clients keep lifecycle tests independent of rate-limit tests.
      remoteAddress: `127.1.${Math.floor(requestNumber / 250)}.${(requestNumber++ % 250) + 1}`,
      headers: {
        origin: process.env.WEB_ORIGIN,
        ...(token ? { cookie: `fate_refresh=${token}` } : {}),
      },
    });
  const me = (token?: string) =>
    server.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const register = async (name: string) => {
    const email = `${name.toLowerCase()}-${suffix}@example.test`;
    createdEmails.push(email);
    const response = await post("register", {
      email: ` ${email.toUpperCase()} `,
      username: `${name}_${suffix}`,
      password,
    });
    assert.equal(response.statusCode, 201, response.body);
    return {
      response,
      body: credentialsSchema.parse(response.json()),
      email,
      token: refreshCookie(response),
    };
  };

  try {
    const account = await register("Player");
    assert(account.body.user);
    const userId = account.body.user.id;
    assert.equal(account.body.user.email, account.email);
    assert.equal(account.body.user.username, `Player_${suffix}`);
    assert.equal(account.body.accessTokenExpiresIn, 900);
    assert.equal(account.response.body.includes(password), false);
    assert.equal(account.response.headers["cache-control"], "no-store");
    assert.match(String(account.response.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(account.response.headers["set-cookie"]), /Path=\/api\/auth/);
    assert.match(String(account.response.headers["set-cookie"]), /SameSite=Lax/);
    assert.equal(String(account.response.headers["set-cookie"]).includes("Secure"), false);
    const user = await database.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true, ratings: true, authSessions: true },
    });
    assert(user.passwordHash && user.profile && user.ratings[0]);
    assert.notEqual(user.passwordHash, password);
    assert(await verifyPassword(user.passwordHash, password));
    assert.equal(user.ratings.length, 3);
    assert.deepEqual(user.ratings.map((row) => row.gameMode).sort(), [
      "classic",
      "draft",
      "standard",
    ]);
    assert(
      user.ratings.every(
        (row) =>
          row.rating === 1500 &&
          row.ratingDeviation === 350 &&
          row.volatility === 0.06 &&
          row.ratedGames === 0,
      ),
    );
    assert.equal(user.ratings[0].rating, 1500);
    assert.equal(user.ratings[0].ratingDeviation, 350);
    assert.equal(user.ratings[0].volatility, 0.06);
    assert.equal(user.ratings[0].ratedGames, 0);
    assert.equal(user.authSessions.length, 1);
    assert.equal(user.authSessions[0].refreshTokenHash, hashRefreshToken(account.token));
    assert.notEqual(user.authSessions[0].refreshTokenHash, account.token);
    assert.equal(
      user.authSessions[0].expiresAt.getTime() / 1000,
      tokenService.verifyRefreshToken(account.token).exp,
    );
    console.log("auth integration: registration, related records, password and cookie passed");

    error(
      await post("register", {
        email: account.email.toUpperCase(),
        username: `Different_${suffix}`,
        password,
      }),
      409,
      "EMAIL_ALREADY_REGISTERED",
    );
    const conflictingEmail = `duplicate-${suffix}@example.test`;
    createdEmails.push(conflictingEmail);
    error(
      await post("register", {
        email: conflictingEmail,
        username: user.profile.username,
        password,
      }),
      409,
      "USERNAME_ALREADY_TAKEN",
    );
    assert.equal(
      await database.user.count({ where: { email: conflictingEmail } }),
      0,
      "failed nested writes must roll back",
    );
    for (const payload of [
      {},
      { email: "invalid", username: "ok_name", password },
      { email: `valid-${suffix}@example.test`, username: "bad handle", password },
      { email: `valid-${suffix}@example.test`, username: "ok_name", password: "short" },
    ])
      error(await post("register", payload), 400, "INVALID_REQUEST");

    const concurrentEmail = `race-${suffix}@example.test`;
    createdEmails.push(concurrentEmail);
    const racePayload = { email: concurrentEmail, username: `Race_${suffix}`, password };
    const registrations = await Promise.all([
      post("register", racePayload),
      post("register", racePayload),
    ]);
    assert.deepEqual(registrations.map((r) => r.statusCode).sort(), [201, 409]);
    assert.equal(await database.user.count({ where: { email: concurrentEmail } }), 1);
    const usernameRaceEmails = [`r1-${suffix}@example.test`, `r2-${suffix}@example.test`];
    createdEmails.push(...usernameRaceEmails);
    const usernameRace = await Promise.all(
      usernameRaceEmails.map((email) =>
        post("register", { email, username: `Same_${suffix}`, password }),
      ),
    );
    assert.deepEqual(usernameRace.map((r) => r.statusCode).sort(), [201, 409]);
    const usernameLoser = usernameRace.find((r) => r.statusCode === 409)!;
    error(usernameLoser, 409, "USERNAME_ALREADY_TAKEN");
    console.log("auth integration: validation, conflicts and concurrent registration passed");

    const login = await post("login", { email: ` ${account.email.toUpperCase()} `, password });
    assert.equal(login.statusCode, 200, login.body);
    const loginBody = credentialsSchema.parse(login.json());
    assert.equal(loginBody.user?.id, userId);
    const loginToken = refreshCookie(login);
    const loginClaims = tokenService.verifyRefreshToken(loginToken);
    const loginSession = await database.authSession.findUniqueOrThrow({
      where: { id: loginClaims.sid },
    });
    assert.equal(loginSession.userId, userId);
    assert.equal(loginSession.refreshTokenHash, hashRefreshToken(loginToken));
    assert.equal(await database.authSession.count({ where: { userId } }), 2);
    const wrong = await post("login", { email: account.email, password: "wrong-password" });
    const unknown = await post("login", { email: `unknown-${suffix}@example.test`, password });
    error(wrong, 401, "INVALID_CREDENTIALS");
    error(unknown, 401, "INVALID_CREDENTIALS");
    assert.deepEqual(unknown.json(), wrong.json());
    await database.user.update({ where: { id: userId }, data: { passwordHash: null } });
    const passwordless = await post("login", { email: account.email, password });
    assert.deepEqual(passwordless.json(), wrong.json());
    assert.equal(passwordless.statusCode, 401);
    await database.user.update({
      where: { id: userId },
      data: { passwordHash: user.passwordHash },
    });
    console.log("auth integration: login, multiple sessions and generic credentials errors passed");

    const identity = await me(loginBody.accessToken);
    assert.equal(identity.statusCode, 200);
    assert.equal(userSchema.parse(identity.json().user).id, userId);
    for (const token of [
      undefined,
      "malformed",
      loginToken,
      jwt.sign(
        { type: "access", sub: userId, exp: Math.floor(Date.now() / 1000) - 1 },
        tokenService.config.accessSecret,
      ),
      tokenService.signAccessToken(randomUUID()),
    ])
      error(await me(token), 401, "UNAUTHORIZED");
    console.log("auth integration: access-token authorization passed");

    const refreshed = await post("refresh", undefined, loginToken);
    assert.equal(refreshed.statusCode, 200, refreshed.body);
    const next = credentialsSchema.parse(refreshed.json());
    const nextToken = refreshCookie(refreshed);
    assert.notEqual(nextToken, loginToken);
    assert.notEqual(next.accessToken, loginBody.accessToken);
    const nextClaims = tokenService.verifyRefreshToken(nextToken);
    assert.notEqual(nextClaims.jti, loginClaims.jti);
    assert.equal(nextClaims.exp, loginClaims.exp);
    const rotated = await database.authSession.findUniqueOrThrow({
      where: { id: loginClaims.sid },
    });
    assert.notEqual(rotated.refreshTokenHash, loginSession.refreshTokenHash);
    assert.equal(rotated.refreshTokenHash, hashRefreshToken(nextToken));
    assert.equal(rotated.expiresAt.getTime(), loginSession.expiresAt.getTime());
    assert(rotated.lastUsedAt);
    error(await post("refresh", undefined, loginToken), 401, "INVALID_REFRESH_TOKEN");
    assert(
      (await database.authSession.findUniqueOrThrow({ where: { id: loginClaims.sid } })).revokedAt,
    );
    error(await post("refresh", undefined, nextToken), 401, "INVALID_REFRESH_TOKEN");
    error(await post("refresh", undefined, loginBody.accessToken), 401, "INVALID_REFRESH_TOKEN");
    error(await post("refresh"), 401, "INVALID_REFRESH_TOKEN");

    const newLogin = async () => {
      const response = await post("login", { email: account.email, password });
      assert.equal(response.statusCode, 200);
      const token = refreshCookie(response);
      return { token, claims: tokenService.verifyRefreshToken(token) };
    };
    const expired = await newLogin();
    await database.authSession.update({
      where: { id: expired.claims.sid },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    error(await post("refresh", undefined, expired.token), 401, "INVALID_REFRESH_TOKEN");
    const jwtExpired = tokenService.signRefreshToken(
      userId,
      expired.claims.sid,
      new Date(Date.now() - 1000),
    );
    error(await post("refresh", undefined, jwtExpired), 401, "INVALID_REFRESH_TOKEN");
    const revoked = await newLogin();
    await database.authSession.update({
      where: { id: revoked.claims.sid },
      data: { revokedAt: new Date() },
    });
    error(await post("refresh", undefined, revoked.token), 401, "INVALID_REFRESH_TOKEN");
    const racing = await newLogin();
    const refreshRace = await Promise.all([
      post("refresh", undefined, racing.token),
      post("refresh", undefined, racing.token),
    ]);
    assert.deepEqual(refreshRace.map((r) => r.statusCode).sort(), [200, 401]);
    assert(
      (await database.authSession.findUniqueOrThrow({ where: { id: racing.claims.sid } }))
        .revokedAt,
    );
    console.log(
      "auth integration: refresh rotation, reuse revocation, expiry and atomic race passed",
    );

    const logoutSession = await newLogin();
    const anotherDevice = await newLogin();
    for (const token of [
      logoutSession.token,
      logoutSession.token,
      undefined,
      "malformed",
      jwtExpired,
    ]) {
      const response = await post("logout", undefined, token);
      assert.equal(response.statusCode, 204, response.body);
      assert.equal(refreshCookie(response), "");
      assert.match(String(response.headers["set-cookie"]), /Expires=Thu, 01 Jan 1970/);
    }
    assert(
      (await database.authSession.findUniqueOrThrow({ where: { id: logoutSession.claims.sid } }))
        .revokedAt,
    );
    error(await post("refresh", undefined, logoutSession.token), 401, "INVALID_REFRESH_TOKEN");
    assert.equal((await post("refresh", undefined, anotherDevice.token)).statusCode, 200);
    console.log("auth integration: logout idempotence and session isolation passed");

    const deleted = await register("Deleted");
    assert(deleted.body.user);
    await database.user.delete({ where: { id: deleted.body.user.id } });
    error(await me(deleted.body.accessToken), 401, "UNAUTHORIZED");
    error(await post("refresh", undefined, deleted.token), 401, "INVALID_REFRESH_TOKEN");
    assert.equal(await database.authSession.count({ where: { userId: deleted.body.user.id } }), 0);
    assert.equal(
      (await server.inject({ method: "POST", url: "/rooms", payload: {} })).statusCode,
      200,
    );
    console.log("auth integration: deleted identities, cascade and public gameplay passed");
  } finally {
    // Delete only this run's accounts; never truncate or reset a database.
    await database.user.deleteMany({ where: { email: { in: createdEmails } } });
    await database.$disconnect();
    await server.close();
  }
  console.log("auth PostgreSQL integration tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
