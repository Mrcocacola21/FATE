import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { attachArmy, createDefaultArmy, HERO_HASSAN_ID, ABILITY_HASSAN_ASSASIN_ORDER } from "rules";
import { buildServer } from "../index";
import { AuthError } from "../auth/authErrors";
import { MultiplayerIdentityError } from "../auth/connectionIdentity";
import { AppError } from "../errors/appError";
import { registerApiErrorHandler } from "../routes/apiErrorHandler";
import { adminRoutes } from "../routes/adminRoutes";
import { readAuthConfig } from "../auth/config";
import { TokenService } from "../auth/tokens";
import { INITIAL_RATING } from "../rating/constants";
import { getRankMetadata } from "../rating/rankTiers";
import { getGameRoom, storeTestHooks } from "../store";
import { booleanQuerySchema, dateTimeSchema } from "../validation/commonSchemas";
import { parseInput } from "../validation/parseRequest";
import { MemoryMatchPersistence, testAccessToken, testIdentityService, testUserIds } from "./matchTestSupport";
import { assertApiError } from "./assertApiError";

test("REST validation, authentication, not-found and real rating conflicts share one contract", async () => {
  process.env.JWT_ACCESS_SECRET = "api-contract-access-secret-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "api-contract-refresh-secret-01234567890123456789";
  process.env.LOG_LEVEL = "silent";
  process.env.NODE_ENV = "test";
  storeTestHooks.reset();
  const persistence = new MemoryMatchPersistence();
  const id = randomUUID();
  const fail = async (): Promise<never> => { throw new AuthError("USER_NOT_FOUND"); };
  const server = await buildServer({
    matchPersistence: persistence,
    matchRecovery: false,
    connectionIdentity: testIdentityService(),
    matchmakingActiveMatch: async () => false,
    matchHistory: { getUserMatchHistory: fail },
    playerStatistics: { getPlayerStatistics: fail },
    leaderboard: { getLeaderboard: async () => { throw new Error("private-query-sentinel"); } },
    actionHistory: { getCompletedMatchActionHistory: async () => { throw new AppError("MATCH_NOT_FOUND", 404, "Match not found."); } },
    replayQuery: { getMetadata: async () => { throw new AppError("MATCH_NOT_FOUND", 404, "Match not found."); }, getState: fail },
    ratings: {
      getPlayerRating: async (userId, gameMode) => ({
        userId, gameMode, ...INITIAL_RATING,
        rating: userId === testUserIds.P1 ? 1800 : 1350,
        ...getRankMetadata(userId === testUserIds.P1 ? 1800 : 1350), ratedGames: 0,
      }),
      getRatingHistory: fail,
    },
  });
  const authorization = `Bearer ${testAccessToken("P1")}`;
  try {
    for (const url of [
      "/api/users/bad-id/rating", "/api/users/bad-id/ratings", "/api/users/bad-id/statistics",
      "/api/users/bad-id/matches", "/api/matches/bad-id", "/rooms/bad%20id",
    ]) assertApiError(await server.inject(url), 400, "VALIDATION_ERROR");
    for (const query of ["page=0", "page=-1", "page=abc", "page=", "limit=0", "limit=-5", "limit=999999", "limit=1.5", "gameMode=LOL", "status=banana", "sort=drop_table", "order=sideways", "page=1&page=2"])
      assertApiError(await server.inject(`/api/leaderboard?${query}`), 400, "VALIDATION_ERROR");
    for (const query of ["gameMode=", "gameMode=LOL", "limit=1.5"])
      assertApiError(await server.inject(`/api/users/${id}/rating?${query}`), 400, "VALIDATION_ERROR");
    const fields = assertApiError(await server.inject({
      method: "POST", url: "/api/auth/register",
      payload: { email: "bad", username: "!", password: "x", role: "ADMIN", isAdmin: true },
    }), 400, "VALIDATION_ERROR").details?.fields;
    assert.deepEqual(fields, [
      { path: "email", message: "Invalid value." },
      { path: "isAdmin", message: "Unexpected field." },
      { path: "password", message: "Value is below the allowed minimum." },
      { path: "role", message: "Unexpected field." },
      { path: "username", message: "Invalid value." },
      { path: "username", message: "Value is below the allowed minimum." },
    ]);
    for (const url of ["/api/auth/me", "/api/profile", "/api/admin/users", "/api/matchmaking/queue", `/api/matches/${id}/actions`, `/api/matches/${id}/replay`]) {
      assertApiError(await server.inject(url), 401, "UNAUTHORIZED");
      for (const header of ["Basic abc", "Bearer ", "Bearer malformed", "Bearer a b"])
        assertApiError(await server.inject({ url, headers: { authorization: header } }), 401, "UNAUTHORIZED");
    }
    assertApiError(await server.inject(`/api/users/${id}/matches`), 404, "USER_NOT_FOUND");
    assertApiError(await server.inject(`/api/users/${id}/statistics`), 404, "USER_NOT_FOUND");
    assertApiError(await server.inject({ url: `/api/matches/${id}/actions`, headers: { authorization } }), 404, "MATCH_NOT_FOUND");
    assertApiError(await server.inject({ url: `/api/matches/${id}/replay`, headers: { authorization } }), 404, "MATCH_NOT_FOUND");
    assertApiError(await server.inject("/api/heroes/unknown"), 404, "HERO_NOT_FOUND");
    assertApiError(await server.inject("/rooms/missing"), 404, "ROOM_NOT_FOUND");
    assertApiError(await server.inject("/api/does-not-exist"), 404, "ROUTE_NOT_FOUND");
    assertApiError(await server.inject("/api/does-not-exist?ignored=value"), 404, "ROUTE_NOT_FOUND");
    assertApiError(await server.inject("/rooms/%ZZ"), 400, "VALIDATION_ERROR");
    assertApiError(await server.inject("/api/leaderboard"), 500, "INTERNAL_SERVER_ERROR");
    assertApiError(await server.inject({ method: "POST", url: "/api/auth/refresh" }), 401, "INVALID_REFRESH_TOKEN");
    for (const token of ["malformed", new TokenService({ ...readAuthConfig(), refreshTtlSeconds: -1 }).signRefreshToken(id, randomUUID(), new Date(0))])
      assertApiError(await server.inject({ method: "POST", url: "/api/auth/refresh", headers: { cookie: `fate_refresh=${token}` } }), 401, "INVALID_REFRESH_TOKEN");
    let limited = false;
    for (let i = 0; i < 11; i++) {
      const response = await server.inject({ method: "POST", url: "/api/auth/login", payload: {} });
      if (response.statusCode === 429) {
        assertApiError(response, 429, "RATE_LIMITED");
        assert(response.headers["retry-after"]);
        limited = true;
      }
    }
    assert(limited);
    for (const payload of [null, { seed: "12" }, { rating: 9999 }, { gameMode: "LOL" }, { lobbyName: " " }])
      assertApiError(await server.inject({ method: "POST", url: "/rooms", payload: JSON.stringify(payload), headers: { "content-type": "application/json" } }), 400, "VALIDATION_ERROR");
    for (const [payload, contentType] of [["{", "application/json"], ["x", "text/unknown"]])
      assertApiError(await server.inject({ method: "POST", url: "/rooms", payload, headers: { "content-type": contentType } }), 400, "VALIDATION_ERROR");
    assertApiError(await server.inject({ method: "POST", url: "/api/matchmaking/queue", headers: { authorization }, payload: { gameMode: "standard", rating: 9999 } }), 400, "VALIDATION_ERROR");

    const created = await server.inject({ method: "POST", url: "/rooms", headers: { authorization }, payload: { matchType: "RATED" } });
    assert.equal(created.statusCode, 201);
    const room = getGameRoom(created.json().roomId);
    assert(room);
    room.seats = { P1: "first", P2: "second" };
    room.seatIdentities = {
      P1: { userId: testUserIds.P1, username: "First", displayName: null },
      P2: { userId: testUserIds.P2, username: "Second", displayName: null },
    };
    room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    const revision = room.revision;
    const conflict = assertApiError(await server.inject({ method: "POST", url: `/api/games/${room.id}/actions?playerId=P1`, payload: { type: "startGame" } }), 409, "RATED_RATING_DIFFERENCE_TOO_LARGE");
    assert.deepEqual(conflict.details, { difference: 450, maxDifference: 400 });
    assert.equal(room.revision, revision);
    assert.equal(room.state.phase, "lobby");
    const casual = await server.inject({ method: "POST", url: "/rooms", payload: {} });
    const casualRoom = getGameRoom(casual.json().roomId);
    assert(casualRoom);
    const state = attachArmy(casualRoom.state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
    const hassan = Object.values(state.units).find(unit => unit.heroId === HERO_HASSAN_ID);
    assert(hassan);
    state.units[hassan.id] = { ...hassan, position: { col: 1, row: 1 } };
    casualRoom.state = { ...state, phase: "battle", currentPlayer: "P1", activeUnitId: hassan.id, pendingRoll: null };
    const before = casualRoom.revision;
    assertApiError(await server.inject({ method: "POST", url: `/api/games/${casualRoom.id}/actions?playerId=P1`,
      payload: { type: "useAbility", unitId: hassan.id, abilityId: ABILITY_HASSAN_ASSASIN_ORDER } }), 409, "RULES_REJECTED");
    assert.equal(casualRoom.revision, before);
    assert.deepEqual((await server.inject("/health")).json(), { ok: true });
  } finally { await server.close(); storeTestHooks.reset(); }
});

test("blocked identities and unexpected identity failures are distinguishable", async () => {
  for (const error of [new MultiplayerIdentityError("ACCOUNT_BLOCKED", "Account access is blocked"), new Error("private-identity-sentinel")]) {
    const server = await buildServer({ matchRecovery: false, matchPersistence: new MemoryMatchPersistence(), connectionIdentity: { verify: async () => { throw error; } } });
    try {
      for (const url of ["/api/matchmaking/queue", `/api/matches/${randomUUID()}/replay`, `/api/matches/${randomUUID()}/actions`])
        assertApiError(await server.inject({ url, headers: { authorization: "Bearer token" } }), error instanceof MultiplayerIdentityError ? 403 : 500, error instanceof MultiplayerIdentityError ? "ACCOUNT_BLOCKED" : "INTERNAL_SERVER_ERROR");
      assertApiError(await server.inject({ method: "POST", url: "/rooms", payload: {}, headers: { authorization: "Bearer token" } }), error instanceof MultiplayerIdentityError ? 403 : 500, error instanceof MultiplayerIdentityError ? "ACCOUNT_BLOCKED" : "INTERNAL_SERVER_ERROR");
    } finally { await server.close(); }
  }
});

test("unknown exceptions log their real cause and never publish diagnostics or Prisma codes", async () => {
  const logs: string[] = [];
  const server = Fastify({ logger: { stream: { write: (line: string) => { logs.push(line); } } } });
  registerApiErrorHandler(server);
  server.get("/bug", () => { throw new Error("private-stack-sentinel"); });
  server.get("/prisma", () => { throw new Prisma.PrismaClientKnownRequestError("private-sql-sentinel", { code: "P2002", clientVersion: "test", meta: { target: ["unknown_constraint"] } }); });
  server.post("/validate", request => parseInput(z.object({ password: z.string().min(8) }).strict(), request.body));
  try {
    assertApiError(await server.inject("/bug"), 500, "INTERNAL_SERVER_ERROR");
    assertApiError(await server.inject("/prisma"), 500, "INTERNAL_SERVER_ERROR");
    assert(logs.some(line => line.includes("private-stack-sentinel")));
    assert(logs.some(line => line.includes("private-sql-sentinel")));
    const count = logs.filter(line => JSON.parse(line).level === 50).length;
    assertApiError(await server.inject({ method: "POST", url: "/validate", payload: { password: "x" } }), 400, "VALIDATION_ERROR");
    assert.equal(logs.filter(line => JSON.parse(line).level === 50).length, count);
  } finally { await server.close(); }
});

test("admin filters validate dates/IDs and current RBAC survives stale JWTs", async () => {
  process.env.JWT_ACCESS_SECRET = "api-contract-access-secret-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "api-contract-refresh-secret-01234567890123456789";
  const account = { id: randomUUID(), role: "ADMIN" as "ADMIN" | "USER", blockedAt: null as Date | null };
  const tokens = new TokenService(readAuthConfig());
  const server = Fastify();
  await server.register(adminRoutes, { prefix: "/api/admin", revokeRuntime() {}, loadAccount: async () => account });
  const headers = { authorization: `Bearer ${tokens.signAccessToken(account.id)}` };
  try {
    for (const url of ["users?role=SUPERADMIN", "matches?createdFrom=nonsense", "matches?createdFrom=2026-02-30T00:00:00Z", "audit?dateFrom=2026-10-05T00:00:00Z&dateTo=2026-10-01T00:00:00Z", "audit?actorUserId=bad", "audit?eventType=UNKNOWN", "users/not-a-uuid"])
      assertApiError(await server.inject({ url: `/api/admin/${url}`, headers }), 400, "VALIDATION_ERROR");
    const dateError = assertApiError(await server.inject({
      url: "/api/admin/audit?dateFrom=2026-10-05T00:00:00Z&dateTo=2026-10-01T00:00:00Z", headers,
    }), 400, "VALIDATION_ERROR");
    assert.deepEqual(dateError.details?.fields, [{ path: "dateTo", message: "Invalid value." }]);
    assertApiError(await server.inject({ url: "/api/admin/summary", headers: { authorization: `Bearer ${new TokenService({ ...tokens.config, accessTtlSeconds: -1 }).signAccessToken(account.id)}` } }), 401, "UNAUTHORIZED");
    account.role = "USER";
    assertApiError(await server.inject({ url: "/api/admin/users", headers }), 403, "FORBIDDEN");
    account.blockedAt = new Date();
    assertApiError(await server.inject({ url: "/api/admin/users", headers }), 403, "ACCOUNT_BLOCKED");
  } finally { await server.close(); }
});

test("boolean and timestamp primitives reject explicit invalid values", () => {
  assert.equal(booleanQuerySchema.parse("false"), false);
  assert.equal(booleanQuerySchema.parse("true"), true);
  for (const value of ["", "0", "yes", false]) assert.equal(booleanQuerySchema.safeParse(value).success, false);
  for (const value of ["nonsense", "2026-02-30T00:00:00Z", "2026-10-05"]) assert.equal(dateTimeSchema.safeParse(value).success, false);
  assert.equal(dateTimeSchema.parse("2026-10-05T12:00:00+03:00").toISOString(), "2026-10-05T09:00:00.000Z");
});
