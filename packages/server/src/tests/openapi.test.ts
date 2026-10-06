import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { OpenAPIV3 } from "openapi-types";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { PrismaClient } from "@prisma/client";
import { buildServer } from "../index";
import { registerOpenApi } from "../openapi/register";
import { registerQueryValidation } from "../validation/queryValidation";
import { loginSchema, registerSchema } from "../auth/schemas";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { apiErrorSchema, validationErrorSchema } from "../errors/schemas";
import { authRoutes } from "../routes/authRoutes";
import { adminRoutes } from "../routes/adminRoutes";
import { matchRoutes } from "../routes/matchRoutes";
import { profileRoutes } from "../routes/profileRoutes";
import { ProfileRepository, type ProfileWithOwner } from "../repositories/profileRepository";
import { toOwnProfileDto } from "../profile/dto";
import { AuthService } from "../services/authService";
import { AuthError } from "../auth/authErrors";
import { TokenService } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import { toAuthUserDto } from "../auth/userDto";
import { AdminService } from "../services/adminService";
import { AdminRepository } from "../repositories/adminRepository";
import { MatchRepository } from "../repositories/matchRepository";
import { AuditLogReader } from "../services/auditLogService";
import type { AccountAccess } from "../auth/accountAccess";
import type { DetailedMatch } from "../repositories/matchRepository";
import { createReplayFixture } from "./replayTestSupport";
import { MemoryMatchPersistence } from "./matchTestSupport";
import { assertDocumentedResponse } from "./assertDocumentedResponse";
import { disconnectDatabase } from "../db/client";
import { storeTestHooks } from "../store";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";

test("OpenAPI validates, covers production routes, reuses Zod and has no private/debug surface", async () => {
  process.env.LOG_LEVEL = "silent";
  const server = await buildServer({ documentationOnly: true, matchRecovery: false });
  try {
    await server.ready();
    const response = await server.inject("/openapi.json");
    assert.equal(response.statusCode, 200);
    const spec: OpenAPIV3.Document = response.json();
    assert.equal(spec.openapi, "3.0.3");
    assert.equal(spec.info.title, "FATE API");
    await SwaggerParser.validate(structuredClone(spec));
    const ids: string[] = [];
    for (const route of server.apiRouteInventory) {
      if (["HEAD", "OPTIONS"].includes(route.method)) continue;
      if (route.url.startsWith("/docs") || route.url === "/openapi.json") continue;
      if (
        ["/metrics", "/ws", "/api/games/:id", "/api/games/:id/log", "/api/games/:id/actions"].includes(
          route.url,
        )
      ) {
        assert(route.hidden, `Missing explicit exclusion for ${route.url}`);
        continue;
      }
      assert(route.contract, `Undocumented ${route.method} ${route.url}`);
      const path = route.url.replace(/:([^/]+)/g, "{$1}");
      const operation = spec.paths[path]?.[route.method.toLowerCase() as OpenAPIV3.HttpMethods];
      assert(operation, `Missing ${route.method} ${path}`);
      assert.equal(operation.operationId, route.contract.operationId);
      ids.push(operation.operationId!);
    }
    assert.equal(ids.length, 43);
    assert.equal(new Set(ids).size, ids.length);
    const find = (id: string) =>
      server.apiRouteInventory.find((r) => r.method !== "HEAD" && r.contract?.operationId === id)!
        .contract!;
    assert.equal(find("login").body, loginSchema);
    assert.equal(find("registerUser").body, registerSchema);
    assert.equal(find("getLeaderboard").query, leaderboardQuerySchema);
    assert.deepEqual(spec.paths["/api/users/{id}/rating"]!.get!.security, []);
    assert.deepEqual(spec.paths["/api/matches/{id}/replay"]!.get!.security, [{ BearerAuth: [] }]);
    assert.deepEqual(spec.paths["/api/auth/refresh"]!.post!.security, [{ RefreshCookie: [] }]);
    assert.deepEqual(spec.components!.securitySchemes!.RefreshCookie, {
      type: "apiKey",
      in: "cookie",
      name: "fate_refresh",
      description:
        "HttpOnly refresh cookie. Browsers send it automatically; Swagger cannot read or set its value through JavaScript.",
    });
    assert.match(spec.paths["/api/admin/audit"]!.get!.description!, /Requires ADMIN/);
    assert.match(spec.paths["/api/admin/users"]!.get!.description!, /Requires MODERATOR or ADMIN/);
    assert.deepEqual(Object.keys(spec.paths["/api/admin/audit"]!), ["get"]);
    assert.deepEqual(Object.keys(spec.paths["/api/admin/matches/{matchId}/actions"]!), ["get"]);
    const parameters = spec.paths["/api/leaderboard"]!.get!
      .parameters as OpenAPIV3.ParameterObject[];
    const limit = parameters.find((p) => p.name === "limit")!.schema as OpenAPIV3.SchemaObject;
    assert.equal(limit.type, "integer");
    assert.equal(limit.minimum, 1);
    assert.equal(limit.maximum, 100);
    assert.equal(limit.default, 20);
    const ready = spec.paths["/ready"]!.get!.responses["503"] as OpenAPIV3.ResponseObject;
    assert.deepEqual(ready.content!["application/json"].schema, {
      $ref: "#/components/schemas/Health",
    });
    const logout = spec.paths["/api/auth/logout"]!.post!.responses[
      "204"
    ] as OpenAPIV3.ResponseObject;
    assert.equal(logout.content, undefined);
    const serialized = JSON.stringify(spec);
    assert.doesNotMatch(
      serialized,
      /passwordHash|refreshTokenHash|JWT_SECRET|DATABASE_URL|resumeToken|seatSecret|rngState|combatResolutionChain/,
    );
    assert(!spec.paths["/ws"]);
    assert(!spec.paths["/api/games/{id}/actions"]);
    const docs = await server.inject("/docs");
    assert.equal(docs.statusCode, 302);
    const html = await server.inject(
      new URL(String(docs.headers.location), "http://localhost/docs").pathname,
    );
    assert.equal(html.statusCode, 200);
    assert.match(html.body, /swagger-ui/);
    for (const asset of [
      "swagger-ui-bundle.js",
      "swagger-ui-standalone-preset.js",
      "swagger-initializer.js",
    ])
      assert.equal((await server.inject(`/docs/static/${asset}`)).statusCode, 200);
    assert.equal((await server.inject("/api/admin/users")).statusCode, 401);
    assert.equal((await server.inject(`/api/matches/${randomUUID()}/replay`)).statusCode, 401);
  } finally {
    await server.close();
  }
});

test("real auth handlers document separate session/access DTOs, cookies, errors and rate limits", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://fake:fake@127.0.0.1:1/fake",
    JWT_ACCESS_SECRET: "openapi-test-access-secret-01234567890123456789",
    JWT_REFRESH_SECRET: "openapi-test-refresh-secret-01234567890123456789",
  });
  const user = {
    id: randomUUID(),
    email: "player@example.com",
    role: "USER" as const,
    passwordHash: null,
    blockedAt: null,
    blockedReason: null,
    profile: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tokens = new TokenService(readAuthConfig());
  const credentials = {
    accessToken: tokens.signAccessToken(user.id),
    accessTokenExpiresIn: 900,
    refreshToken: tokens.signRefreshToken(user.id, randomUUID(), new Date(Date.now() + 60000)),
    refreshExpiresAt: new Date(Date.now() + 60000),
  };
  const originalLogin = AuthService.prototype.login;
  const originalRefresh = AuthService.prototype.refresh;
  let rejectLogin = false;
  AuthService.prototype.login = async () => {
    if (rejectLogin) throw new AuthError("INVALID_CREDENTIALS");
    return { user: toAuthUserDto(user), ...credentials };
  };
  AuthService.prototype.refresh = async () => credentials;
  const server = Fastify();
  registerQueryValidation(server);
  await server.register(authRoutes, { prefix: "/api/auth" });
  try {
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "player@example.com", password: "example-password" },
    });
    assert.equal(login.statusCode, 200);
    assertDocumentedResponse("AuthSessionCredentials", login.json());
    assert.match(String(login.headers["set-cookie"]), /fate_refresh=.*HttpOnly/);
    assert(!("refreshToken" in login.json()));
    const refresh = await server.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `fate_refresh=${credentials.refreshToken}` },
    });
    assert.equal(refresh.statusCode, 200);
    assertDocumentedResponse("AuthCredentials", refresh.json());
    assert(!("user" in refresh.json()));
    rejectLogin = true;
    const invalid = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "player@example.com", password: "example-password" },
    });
    assert.equal(invalid.statusCode, 401);
    apiErrorSchema.parse(invalid.json());
    const malformed = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "bad", password: "short", role: "ADMIN" },
    });
    assert.equal(malformed.statusCode, 400);
    validationErrorSchema.parse(malformed.json());
    assert(malformed.json().error.details.fields.some((f: { path: string }) => f.path === "role"));
    let limited = false;
    for (let i = 0; i < 11; i++) {
      const response = await server.inject({ method: "POST", url: "/api/auth/login", payload: {} });
      if (response.statusCode === 429) {
        limited = true;
        apiErrorSchema.parse(response.json());
      }
    }
    assert(limited);
  } finally {
    AuthService.prototype.login = originalLogin;
    AuthService.prototype.refresh = originalRefresh;
    await server.close();
    await disconnectDatabase();
    process.env = saved;
  }
});

test("real admin DTO and audit reader responses conform, while persisted RBAC remains authoritative", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, {
    JWT_ACCESS_SECRET: "openapi-admin-access-secret-01234567890123456789",
    JWT_REFRESH_SECRET: "openapi-admin-refresh-secret-01234567890123456789",
  });
  const account: AccountAccess = { id: randomUUID(), role: "ADMIN", blockedAt: null };
  const user = {
    id: randomUUID(),
    email: "fake@example.com",
    role: "USER" as const,
    blockedAt: null,
    blockedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: { username: "player_one", displayName: null },
  };
  const userDatabase = {
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    user: {
      count: async () => 1,
      findMany: async (options: { select: { email: boolean } }) => [
        { ...user, email: options.select.email ? user.email : undefined },
      ],
    },
  } as unknown as PrismaClient;
  const repository = new AdminRepository(userDatabase);
  const records = [
    {
      id: randomUUID(),
      eventType: "USER_BLOCKED",
      actorType: "USER",
      actorUserId: account.id,
      actorRole: "ADMIN",
      targetUserId: user.id,
      matchId: null,
      reason: "Synthetic example",
      createdAt: new Date(),
      metadata: { targetRole: "USER" },
    },
    {
      id: randomUUID(),
      eventType: "USER_ROLE_CHANGED",
      actorType: "USER",
      actorUserId: null,
      actorRole: "ADMIN",
      targetUserId: null,
      matchId: null,
      reason: null,
      createdAt: new Date(),
      metadata: { unrecognized: "hidden" },
    },
  ];
  const transaction = {
    auditLog: { count: async () => records.length, findMany: async () => records },
    user: { findMany: async () => [{ id: user.id, profile: user.profile }] },
  };
  const database = {
    $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
  } as unknown as PrismaClient;
  const server = Fastify();
  registerQueryValidation(server);
  await server.register(adminRoutes, {
    prefix: "/api/admin",
    revokeRuntime() {},
    service: new AdminService(repository, () => {}),
    loadAccount: async () => account,
    auditReader: new AuditLogReader(database),
  });
  const headers = {
    authorization: `Bearer ${new TokenService(readAuthConfig()).signAccessToken(account.id)}`,
  };
  try {
    const users = await server.inject({ url: "/api/admin/users", headers });
    assert.equal(users.statusCode, 200);
    assertDocumentedResponse("AdminUsers", users.json());
    const audit = await server.inject({ url: "/api/admin/audit", headers });
    assert.equal(audit.statusCode, 200);
    assertDocumentedResponse("AuditEvents", audit.json());
    assert.equal(audit.json().items[1].metadata, null);
    account.role = "MODERATOR";
    const moderator = await server.inject({ url: "/api/admin/users", headers });
    assertDocumentedResponse("AdminUsers", moderator.json());
    assert(!("email" in moderator.json().items[0]));
    assert.equal((await server.inject({ url: "/api/admin/audit", headers })).statusCode, 403);
    account.blockedAt = new Date();
    const blocked = await server.inject({ url: "/api/admin/users", headers });
    assert.equal(blocked.statusCode, 403);
    assert.equal(blocked.json().error.code, "ACCOUNT_BLOCKED");
  } finally {
    await server.close();
    process.env = saved;
  }
});

test("real public match DTO, room creation and readiness responses conform", async () => {
  const fixture = createReplayFixture("classic", true);
  const match: DetailedMatch = {
    ...fixture.match,
    participants: (["P1", "P2"] as const).map((seat) => ({
      id: randomUUID(),
      matchId: fixture.match.id,
      userId: null,
      seat,
      displayNameSnapshot: `Historical ${seat}`,
      outcome: seat === fixture.match.winnerSeat ? "WIN" : "LOSS",
      resultData: null,
      createdAt: new Date(),
      user: null,
    })),
  };
  const original = MatchRepository.prototype.findByIdWithParticipants;
  const originalProfile = ProfileRepository.prototype.findByUsername;
  const profile: ProfileWithOwner = {
    userId: randomUUID(),
    username: "player_one",
    displayName: null,
    avatarUrl: null,
    preferredLanguage: "en",
    preferredTheme: "dark",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: randomUUID(), email: "fake@example.com", createdAt: new Date() },
  };
  const saved = { ...process.env };
  process.env.DATABASE_URL = "postgresql://fake:fake@127.0.0.1:1/fake";
  MatchRepository.prototype.findByIdWithParticipants = async () => match;
  ProfileRepository.prototype.findByUsername = async () => profile;
  const server = Fastify();
  await server.register(matchRoutes, {
    prefix: "/api",
    identity: {
      verify: async () => {
        throw new AuthError("UNAUTHORIZED");
      },
    },
  });
  await server.register(profileRoutes, { prefix: "/api" });
  try {
    const response = await server.inject(`/api/matches/${match.id}`);
    assert.equal(response.statusCode, 200);
    assertDocumentedResponse("MatchDetails", response.json());
    const publicProfile = await server.inject("/api/users/player_one");
    assert.equal(publicProfile.statusCode, 200);
    assertDocumentedResponse("PublicProfile", publicProfile.json());
    assertDocumentedResponse("OwnProfile", { profile: toOwnProfileDto(profile) });
    assert(!("email" in publicProfile.json().profile));
  } finally {
    MatchRepository.prototype.findByIdWithParticipants = original;
    ProfileRepository.prototype.findByUsername = originalProfile;
    await server.close();
    await disconnectDatabase();
    process.env = saved;
  }
  const runtime = await buildServer({
    databaseReadiness: async () => false,
    matchPersistence: new MemoryMatchPersistence(),
    matchRecovery: false,
    ratings: (() => {
      const ratings = new RatingRepository({} as PrismaClient);
      ratings.userExists = async (id) => ({ id });
      ratings.getRating = async (userId, gameMode) => ({
        userId,
        gameMode,
        rating: gameMode === "standard" ? 250 : gameMode === "draft" ? 1800 : 2050,
        ratingDeviation: 50,
        volatility: 0.06,
        ratedGames: 5,
      });
      return new RatingService(ratings);
    })(),
  });
  try {
    const created = await runtime.inject({ method: "POST", url: "/rooms", payload: {} });
    assert.equal(created.statusCode, 201);
    assertDocumentedResponse("CreatedRoom", created.json());
    const game = await runtime.inject({ method: "POST", url: "/api/games", payload: {} });
    assert.equal(game.statusCode, 201);
    assertDocumentedResponse("CreatedGame", game.json());
    const rooms = await runtime.inject("/rooms");
    assertDocumentedResponse("Rooms", rooms.json());
    const ratings = await runtime.inject(`/api/users/${randomUUID()}/ratings`);
    assert.equal(ratings.statusCode, 200);
    assertDocumentedResponse("PlayerRatings", ratings.json());
    assert.equal(ratings.json().ratings.standard.rankTier, "SHADOW");
    assert.equal(ratings.json().ratings.standard.rankProgress.progress, null);
    assert.equal(ratings.json().ratings.draft.rankTier, "BLACK_MOON");
    assert.equal(ratings.json().ratings.classic.rankTier, "DESTINY");
    assert.equal(ratings.json().ratings.classic.rankProgress.nextTier, null);
    const ready = await runtime.inject("/ready");
    assert.equal(ready.statusCode, 503);
    assertDocumentedResponse("Health", ready.json());
  } finally {
    await runtime.close();
    storeTestHooks.reset();
  }
});

test("documentation exposure is explicitly configurable", async () => {
  const saved = { ...process.env };
  process.env.OPENAPI_ENABLED = "false";
  const server = Fastify();
  await registerOpenApi(server);
  try {
    assert.equal((await server.inject("/openapi.json")).statusCode, 404);
    assert.equal((await server.inject("/docs")).statusCode, 404);
  } finally {
    await server.close();
    process.env = saved;
  }
});
