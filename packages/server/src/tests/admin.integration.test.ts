import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type UserRole } from "@prisma/client";
import WebSocket from "ws";
import { configureTestDatabase } from "./testDatabase";
import { buildServer } from "../index";
import { TokenService, hashRefreshToken } from "../auth/tokens";
import { readAuthConfig } from "../auth/config";
import { hashPassword } from "../auth/password";
import { MatchRepository } from "../repositories/matchRepository";
import { PairCreationRolledBack } from "../matchmaking/errors";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks } from "../ws";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

async function until<T>(
  get: () => T | false | undefined | Promise<T | false | undefined>,
): Promise<T> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const value = await get();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for admin integration state");
}
type Message = {
  type: string;
  code?: string;
  ok?: boolean;
  resumeToken?: string;
  status?: { status: string };
};

async function run() {
  configureTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_ACCESS_SECRET: "admin-integration-access-secret-01234567890123456789",
    JWT_REFRESH_SECRET: "admin-integration-refresh-secret-01234567890123456789",
  });
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  const db = new PrismaClient();
  const server = await buildServer({ matchRecovery: false });
  const tokens = new TokenService(readAuthConfig());
  const prefix = `rbac_${randomUUID().slice(0, 8)}`;
  const password = "admin integration password";
  const passwordHash = await hashPassword(password);
  const accounts: {
    id: string;
    email: string;
    token: string;
    refresh: string;
    username: string;
  }[] = [];
  const matches: string[] = [];
  const sockets: WebSocket[] = [];
  let requests = 0;
  async function account(role: UserRole = "USER", displayName?: string) {
    const id = randomUUID(),
      username = `${prefix}_${accounts.length}`,
      email = `${username}@example.test`;
    const expiresAt = new Date(Date.now() + 3600000),
      sessionId = randomUUID();
    const refresh = tokens.signRefreshToken(id, sessionId, expiresAt);
    const user = await db.user.create({
      data: {
        id,
        email,
        passwordHash,
        role,
        profile: { create: { username, displayName } },
        ratings: { create: ["standard", "draft", "classic"].map((gameMode) => ({ gameMode })) },
        authSessions: {
          create: { id: sessionId, refreshTokenHash: hashRefreshToken(refresh), expiresAt },
        },
      },
    });
    assert.equal(user.blockedAt, null);
    assert.equal(user.blockedReason, null);
    const entry = { id, email, username, token: tokens.signAccessToken(id), refresh };
    accounts.push(entry);
    return entry;
  }
  const request = (
    url: string,
    actor?: (typeof accounts)[number],
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    payload?: object,
  ) =>
    server.inject({
      url,
      method,
      payload,
      remoteAddress: `127.2.${Math.floor(requests / 250)}.${(++requests % 250) + 1}`,
      headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}) },
    });
  function expectError(
    response: Awaited<ReturnType<typeof request>>,
    status: number,
    code: string,
  ) {
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, code);
  }
  function noSecrets(value: unknown) {
    const json = JSON.stringify(value);
    for (const key of [
      "passwordHash",
      "refreshToken",
      "tokenHash",
      "refreshTokenHash",
      "resumeToken",
      "seatSecret",
      "rngState",
      "initialConfig",
    ])
      assert.equal(json.includes(`"${key}"`), false, `Unexpected DTO field ${key}`);
  }
  async function connect() {
    const address = server.server.address() as { port: number };
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const messages: Message[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return {
      socket,
      messages,
      send: (message: object) => {
        messages.length = 0;
        socket.send(JSON.stringify(message));
      },
      wait: (type: string) => until(() => messages.find((message) => message.type === type)),
    };
  }
  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const baselineUsers = await db.user.count(),
      baselineMatches = await db.match.count();
    const baselineRoles = Object.fromEntries(
      (await db.user.groupBy({ by: ["role"], _count: true })).map((r) => [r.role, r._count]),
    );
    const baselineStatuses = Object.fromEntries(
      (await db.match.groupBy({ by: ["status"], _count: true })).map((r) => [r.status, r._count]),
    );
    const baselineModes = Object.fromEntries(
      (await db.match.groupBy({ by: ["gameMode"], _count: true })).map((r) => [
        r.gameMode,
        r._count,
      ]),
    );
    const baselineClassification = Object.fromEntries(
      (await db.match.groupBy({ by: ["isRated"], _count: true })).map((r) => [
        r.isRated ? "RATED" : "CASUAL",
        r._count,
      ]),
    );
    const baselineBlocked = await db.user.count({ where: { blockedAt: { not: null } } });
    const admin = await account("ADMIN"),
      admin2 = await account("ADMIN");
    const mod = await account("MODERATOR"),
      mod2 = await account("MODERATOR");
    const user = await account("USER", "Searchable Player"),
      liveUser = await account();
    for (let i = 0; i < 23; i++) await account();
    const expectedUsers = accounts.length;
    for (const [index, [gameMode, isRated, status]] of [
      ["standard", false, "FINISHED"],
      ["standard", true, "IN_PROGRESS"],
      ["draft", true, "FINISHED"],
      ["classic", true, "WAITING"],
      ["classic", false, "CANCELLED"],
      ["draft", false, "WAITING"],
    ].entries()) {
      const created = await db.match.create({
        data: {
          roomId: randomUUID(),
          seed: 7,
          gameMode: gameMode as string,
          isRated: isRated as boolean,
          status: status as "FINISHED" | "IN_PROGRESS" | "WAITING" | "CANCELLED",
          createdById: admin.id,
          initialConfig: {
            lobbyName: "Historical lobby",
            origin: "MANUAL",
            resumeToken: "must-never-escape",
          },
          startedAt: status === "FINISHED" || status === "IN_PROGRESS" ? new Date() : null,
          finishedAt: status === "FINISHED" ? new Date() : null,
          finalRevision: status === "FINISHED" ? 5 : null,
          winnerUserId: status === "FINISHED" ? user.id : null,
          winnerSeat: status === "FINISHED" ? "P1" : null,
          participants: {
            create: [
              {
                userId: user.id,
                seat: "P1",
                displayNameSnapshot: "Historical Name",
                outcome: status === "FINISHED" ? "WIN" : null,
              },
              {
                userId: admin.id,
                seat: "P2",
                displayNameSnapshot: "Historical Admin",
                outcome: status === "FINISHED" ? "LOSS" : null,
              },
            ],
          },
          ...(index === 0
            ? {
                actions: {
                  create: Array.from({ length: 5 }, (_, i) => ({
                    revision: i + 1,
                    actorUserId: user.id,
                    actorSeat: "P1" as const,
                    actionType: "endTurn",
                    actionPayload: { type: "endTurn" },
                  })),
                },
                snapshots: {
                  create: {
                    revision: 5,
                    formatVersion: 1,
                    state: { hidden: "must-never-escape" },
                    rngState: { secret: "rng" },
                  },
                },
              }
            : {}),
        },
      });
      matches.push(created.id);
    }
    for (const endpoint of ["users", "matches", "summary"]) {
      expectError(await request(`/api/admin/${endpoint}`), 401, "UNAUTHORIZED");
      expectError(await request(`/api/admin/${endpoint}`, user), 403, "FORBIDDEN");
      assert.equal((await request(`/api/admin/${endpoint}`, mod)).statusCode, 200);
    }
    // Pagination is deterministic even when account creation timestamps tie.
    await db.user.updateMany({
      where: { id: { in: accounts.map((a) => a.id) } },
      data: { createdAt: new Date("2026-01-01T00:00:00Z") },
    });
    const page1 = (await request(`/api/admin/users?search=${prefix}&limit=20&page=1`, mod)).json();
    const page2 = (await request(`/api/admin/users?search=${prefix}&limit=20&page=2`, mod)).json();
    assert.equal(page1.pagination.total, expectedUsers);
    assert.equal(page1.items.length, 20);
    assert.equal(page2.items.length, expectedUsers - 20);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((item) => item.id)).size,
      expectedUsers,
    );
    assert.equal("email" in page1.items[0], false);
    noSecrets(page1);
    for (const search of [user.username, "Searchable"]) {
      const result = (await request(`/api/admin/users?search=${search}`, mod)).json();
      assert.equal(result.items.length, 1);
      assert.equal(result.items[0].id, user.id);
    }
    const detail = (await request(`/api/admin/users/${user.id}`, mod)).json();
    assert.equal(detail.user.ratings.length, 3);
    assert.equal(detail.user.matchCount, matches.length);
    assert.equal("email" in detail.user, false);
    assert.equal(
      (await request(`/api/admin/users/${user.id}`, admin)).json().user.email,
      user.email,
    );
    noSecrets(detail);
    const summary = (await request("/api/admin/summary", mod)).json();
    assert.equal(summary.users.total, baselineUsers + expectedUsers);
    assert.equal(summary.users.byRole.ADMIN, (baselineRoles.ADMIN ?? 0) + 2);
    assert.equal(summary.users.byRole.MODERATOR, (baselineRoles.MODERATOR ?? 0) + 2);
    assert.equal(summary.users.byRole.USER, (baselineRoles.USER ?? 0) + expectedUsers - 4);
    assert.equal(summary.matches.total, baselineMatches + matches.length);
    for (const mode of ["standard", "draft", "classic"])
      assert.equal(summary.matches.byGameMode[mode], (baselineModes[mode] ?? 0) + 2);
    for (const classification of ["CASUAL", "RATED"])
      assert.equal(
        summary.matches.classification[classification],
        (baselineClassification[classification] ?? 0) + 3,
      );
    for (const [status, expected] of [
      ["FINISHED", 2],
      ["IN_PROGRESS", 1],
      ["WAITING", 2],
      ["CANCELLED", 1],
    ] as const)
      assert.equal(summary.matches.byStatus[status], (baselineStatuses[status] ?? 0) + expected);
    // Known fixture counts in the isolated DB; baseline-safe exact aggregate checks below.
    for (const [filter, expected] of [
      ["matchType=RATED", 3],
      ["matchType=CASUAL", 3],
      ["gameMode=standard", 2],
      ["gameMode=draft", 2],
      ["gameMode=classic", 2],
      ["status=FINISHED", 2],
      ["status=IN_PROGRESS", 1],
    ] as const) {
      const result = (
        await request(`/api/admin/matches?participantUserId=${user.id}&${filter}`, mod)
      ).json();
      assert.equal(result.pagination.total, expected, filter);
      noSecrets(result);
    }
    assert.equal(
      (await request(`/api/admin/matches?participantUserId=${liveUser.id}`, mod)).json().items
        .length,
      0,
    );
    assert.equal(
      (await request(`/api/admin/matches?matchId=${matches[0]}`, mod)).json().items.length,
      1,
    );
    const matchDetail = (await request(`/api/admin/matches/${matches[0]}`, mod)).json().match;
    assert.equal(matchDetail.actionCount, 5);
    assert.equal(matchDetail.snapshotCount, 1);
    assert.equal(matchDetail.latestSnapshot.revision, 5);
    assert.equal(matchDetail.durableRevision, 5);
    assert.equal(matchDetail.lobbyName, "Historical lobby");
    assert.equal(matchDetail.origin, "MANUAL");
    assert.equal(matchDetail.participants[0].displayNameSnapshot, "Historical Name");
    assert.equal(JSON.stringify(matchDetail).includes("must-never-escape"), false);
    noSecrets(matchDetail);
    const actionPages = await Promise.all(
      [1, 2, 3].map((page) =>
        request(`/api/admin/matches/${matches[0]}/actions?limit=2&page=${page}`, mod),
      ),
    );
    const actions = actionPages.flatMap((r) => r.json().items);
    assert.deepEqual(
      actions.map((a) => a.revision),
      [1, 2, 3, 4, 5],
    );
    assert(
      actions.every(
        (a) => a.actorUserId === user.id && a.payloadValid && a.actionPayload.type === "endTurn",
      ),
    );
    assert.deepEqual(
      (await request(`/api/admin/matches/${matches[0]}/actions?order=desc&limit=2`, mod))
        .json()
        .items.map((a: { revision: number }) => a.revision),
      [5, 4],
    );
    noSecrets(actions);
    for (const [url, actor] of [
      ["/api/admin/users?limit=101", mod],
      ["/api/admin/matches?gameMode=fake", mod],
      ["/api/admin/matches?createdFrom=2026-10-04T00:00:00Z&createdTo=2026-10-03T00:00:00Z", mod],
      [`/api/admin/matches/${matches[0]}/actions?limit=201`, mod],
      ["/api/admin/users/not-a-uuid", mod],
    ] as const)
      expectError(await request(url, actor), 400, "VALIDATION_ERROR");
    expectError(await request(`/api/admin/users/${randomUUID()}`, mod), 404, "USER_NOT_FOUND");
    expectError(await request(`/api/admin/matches/${randomUUID()}`, mod), 404, "MATCH_NOT_FOUND");
    expectError(
      await request(`/api/admin/matches/${randomUUID()}/actions`, mod),
      404,
      "MATCH_NOT_FOUND",
    );
    expectError(await request(`/api/admin/users/${randomUUID()}`, user), 403, "FORBIDDEN");
    const historicalBefore = await db.match.findMany({
      where: { id: { in: matches } },
      orderBy: { id: "asc" },
      include: {
        participants: { orderBy: { seat: "asc" } },
        actions: { orderBy: { revision: "asc" } },
        snapshots: true,
      },
    });
    const ratingBefore = await db.rating.findMany({
      where: { userId: user.id },
      orderBy: { gameMode: "asc" },
    });
    const ratingHistoryBefore = await db.ratingHistory.findMany({ where: { userId: user.id } });
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      for (const path of [
        "",
        "/actions",
        "/actions/1",
        "/state",
        "/snapshot",
        "/winner",
        "/rating",
      ]) {
        assert.equal(
          (await request(`/api/admin/matches/${matches[0]}${path}`, admin, method, {})).statusCode,
          404,
        );
      }
    }
    for (const [actor, target, code] of [
      [user, liveUser, "FORBIDDEN"],
      [mod, mod2, "INSUFFICIENT_TARGET_ROLE"],
      [mod, admin, "INSUFFICIENT_TARGET_ROLE"],
      [admin, admin2, "INSUFFICIENT_TARGET_ROLE"],
      [mod, mod, "CANNOT_BLOCK_SELF"],
      [admin, admin, "CANNOT_BLOCK_SELF"],
    ] as const)
      expectError(
        await request(`/api/admin/users/${target.id}/block`, actor, "POST", {}),
        403,
        code,
      );
    for (const actor of [user, mod])
      expectError(
        await request(`/api/admin/users/${liveUser.id}/role`, actor, "PATCH", { role: "ADMIN" }),
        403,
        "FORBIDDEN",
      );
    expectError(
      await request(`/api/admin/users/${admin.id}/role`, admin, "PATCH", { role: "USER" }),
      403,
      "CANNOT_CHANGE_OWN_ROLE",
    );
    expectError(
      await request(`/api/admin/users/${liveUser.id}/role`, admin, "PATCH", { role: "OWNER" }),
      400,
      "VALIDATION_ERROR",
    );

    const queued = await connect(),
      queuedTab = await connect();
    for (const client of [queued, queuedTab]) {
      client.send({
        type: "matchmakingSubscribe",
        accessToken: liveUser.token,
        requestId: randomUUID(),
      });
      await client.wait("matchmakingSubscribed");
    }
    assert.equal(
      (await request("/api/matchmaking/queue", liveUser, "POST", { gameMode: "standard" })).json()
        .status,
      "QUEUED",
    );
    const blockLive = await request(`/api/admin/users/${liveUser.id}/block`, mod, "POST", {
      reason: "  <b>abuse</b>  ",
    });
    assert.equal(blockLive.statusCode, 200, blockLive.body);
    assert.equal(blockLive.json().user.blockedReason, "<b>abuse</b>");
    for (const client of [queued, queuedTab]) {
      assert.equal((await client.wait("error")).code, "ACCOUNT_BLOCKED");
      await until(() => client.socket.readyState === WebSocket.CLOSED);
      assert.equal(
        client.messages.some((m) => m.status?.status === "MATCH_FOUND"),
        false,
      );
    }
    const retry = await request(`/api/admin/users/${liveUser.id}/block`, mod, "POST", {
      reason: "different",
    });
    assert.deepEqual(retry.json().user, blockLive.json().user);
    expectError(await request("/api/matchmaking/queue", liveUser), 403, "ACCOUNT_BLOCKED");
    expectError(await request("/api/auth/me", liveUser), 403, "ACCOUNT_BLOCKED");
    expectError(await request("/api/profile", liveUser), 403, "ACCOUNT_BLOCKED");
    expectError(
      await request(`/api/matches/${matches[0]}/actions`, liveUser),
      403,
      "ACCOUNT_BLOCKED",
    );
    expectError(
      await request(`/api/matches/${matches[0]}/replay`, liveUser),
      403,
      "ACCOUNT_BLOCKED",
    );
    const blockedSummary = (await request("/api/admin/summary", mod)).json();
    assert.equal(blockedSummary.users.blocked, baselineBlocked + 1);
    assert.equal(blockedSummary.users.active, baselineUsers + expectedUsers - baselineBlocked - 1);
    expectError(await request("/rooms", liveUser, "POST", {}), 403, "ACCOUNT_BLOCKED");
    expectError(
      await request("/api/auth/login", undefined, "POST", { email: liveUser.email, password }),
      403,
      "ACCOUNT_BLOCKED",
    );
    const refreshResponse = await server.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: `fate_refresh=${liveUser.refresh}` },
    });
    expectError(refreshResponse, 403, "ACCOUNT_BLOCKED");
    assert.equal(
      await db.authSession.count({ where: { userId: liveUser.id, revokedAt: null } }),
      0,
    );
    expectError(
      await request(`/api/admin/users/${liveUser.id}/role`, admin, "PATCH", { role: "ADMIN" }),
      409,
      "BLOCKED_ROLE_TARGET",
    );
    const deniedSocket = await connect();
    deniedSocket.send({
      type: "joinRoom",
      mode: "create",
      roomId: randomUUID(),
      role: "P1",
      accessToken: liveUser.token,
    });
    assert.equal((await deniedSocket.wait("error")).code, "ACCOUNT_BLOCKED");
    await assert.rejects(
      new MatchRepository(db).createWaitingMatch({
        roomId: randomUUID(),
        gameMode: "standard",
        seed: 7,
        isRated: true,
        createdById: admin.id,
        participants: [{ userId: liveUser.id, seat: "P1", displayNameSnapshot: "Blocked" }],
      }),
      PairCreationRolledBack,
    );
    for (let i = 0; i < 2; i++) {
      const unblocked = await request(`/api/admin/users/${liveUser.id}/unblock`, mod, "POST", {});
      assert.equal(unblocked.json().user.blockedAt, null);
      assert.equal(unblocked.json().user.blockedReason, null);
    }
    // Old refresh sessions remain revoked after unblock; a fresh login is required.
    expectError(
      await server.inject({
        method: "POST",
        url: "/api/auth/refresh",
        headers: { cookie: `fate_refresh=${liveUser.refresh}` },
      }),
      401,
      "INVALID_REFRESH_TOKEN",
    );
    assert.equal(
      (await request("/api/auth/login", undefined, "POST", { email: liveUser.email, password }))
        .statusCode,
      200,
    );
    assert.equal((await request("/api/matchmaking/queue", liveUser)).json().status, "NOT_QUEUED");
    const player = await connect(),
      adminPlayer = await connect();
    const roomId = randomUUID();
    player.send({
      type: "joinRoom",
      mode: "create",
      roomId,
      role: "P1",
      accessToken: liveUser.token,
    });
    const playerAck = await player.wait("joinAck");
    adminPlayer.send({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P2",
      accessToken: admin.token,
    });
    await adminPlayer.wait("joinAck");
    adminPlayer.send({
      type: "action",
      action: { type: "move", unitId: "nonexistent", to: { col: 0, row: 0 } },
    });
    const rejected = await until(() =>
      adminPlayer.messages.find((m) => m.type === "error" || (m.type === "actionResult" && !m.ok)),
    );
    assert(rejected);
    const room = getGameRoom(roomId)!;
    const runtimeMatchId = room.matchId!;
    // A command already waiting on the room queue must reauthorize when it executes.
    let release!: () => void;
    const pending = enqueueRoomCommand(
      fateRoomKey(roomId),
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await until(() => !!release);
    player.send({ type: "setReady", ready: true });
    assert.equal(
      (await request(`/api/admin/users/${liveUser.id}/block`, admin, "POST", {})).statusCode,
      200,
    );
    release();
    await pending;
    await until(() => player.socket.readyState === WebSocket.CLOSED);
    assert.equal(room.state.playersReady.P1, false);
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: runtimeMatchId } })).status,
      "WAITING",
    );
    assert.equal(await db.matchAction.count({ where: { matchId: runtimeMatchId } }), 0);
    assert.equal(
      (await request(`/api/admin/users/${liveUser.id}/unblock`, admin, "POST", {})).statusCode,
      200,
    );
    const resumed = await connect();
    resumed.send({
      type: "joinRoom",
      mode: "join",
      roomId,
      role: "P1",
      accessToken: liveUser.token,
      resumeToken: playerAck.resumeToken,
    });
    await resumed.wait("joinAck");
    resumed.send({ type: "setReady", ready: true });
    adminPlayer.send({ type: "setReady", ready: true });
    await until(() => room.state.playersReady.P1 && room.state.playersReady.P2);
    resumed.send({ type: "startGame" });
    await until(
      async () =>
        (await db.match.findUniqueOrThrow({ where: { id: runtimeMatchId } })).status ===
        "IN_PROGRESS",
    );
    const activeActions = await db.matchAction.findMany({
      where: { matchId: runtimeMatchId },
      orderBy: { revision: "asc" },
    });
    const liveRating = await db.rating.findMany({
      where: { userId: liveUser.id },
      orderBy: { gameMode: "asc" },
    });
    const runtimeRevision = room.revision;
    assert.equal((await request(`/api/admin/matches/${runtimeMatchId}`, mod)).statusCode, 200);
    assert.equal(room.revision, runtimeRevision);
    // A failed attempt to authenticate a different occupied seat cannot erase this
    // connection's established account association or its subsequent block checks.
    resumed.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: admin.token, resumeToken: "wrong" });
    assert.equal((await resumed.wait("error")).code, "INVALID_RESUME_TOKEN");
    assert.equal(
      (await request(`/api/admin/users/${liveUser.id}/block`, admin, "POST", {})).statusCode,
      200,
    );
    await until(() => resumed.socket.readyState === WebSocket.CLOSED);
    const activeMatch = await db.match.findUniqueOrThrow({ where: { id: runtimeMatchId } });
    assert.equal(activeMatch.status, "IN_PROGRESS");
    assert.equal(activeMatch.winnerUserId, null);
    assert.equal(activeMatch.finalRevision, null);
    assert.deepEqual(
      await db.matchAction.findMany({
        where: { matchId: runtimeMatchId },
        orderBy: { revision: "asc" },
      }),
      activeActions,
    );
    assert.deepEqual(
      await db.rating.findMany({ where: { userId: liveUser.id }, orderBy: { gameMode: "asc" } }),
      liveRating,
    );
    assert.equal(
      (await request(`/api/admin/users/${liveUser.id}/unblock`, admin, "POST", {})).statusCode,
      200,
    );
    for (const actor of [mod, admin]) {
      assert.equal(
        (await request(`/api/admin/users/${user.id}/block`, actor, "POST", {})).statusCode,
        200,
      );
      assert.equal(
        (await request(`/api/admin/users/${user.id}/unblock`, actor, "POST", {})).statusCode,
        200,
      );
    }
    assert.deepEqual(
      await db.rating.findMany({ where: { userId: user.id }, orderBy: { gameMode: "asc" } }),
      ratingBefore,
    );
    assert.deepEqual(
      await db.ratingHistory.findMany({ where: { userId: user.id } }),
      ratingHistoryBefore,
    );
    assert.deepEqual(
      await db.match.findMany({
        where: { id: { in: matches } },
        orderBy: { id: "asc" },
        include: {
          participants: { orderBy: { seat: "asc" } },
          actions: { orderBy: { revision: "asc" } },
          snapshots: true,
        },
      }),
      historicalBefore,
    );
    assert.equal(
      (await request(`/api/admin/users/${mod2.id}/block`, admin, "POST", {})).statusCode,
      200,
    );
    assert.equal(
      (await request(`/api/admin/users/${mod2.id}/unblock`, admin, "POST", {})).statusCode,
      200,
    );
    assert.equal(
      (await request(`/api/admin/users/${admin2.id}/role`, admin, "PATCH", { role: "USER" }))
        .statusCode,
      200,
    );
    expectError(await request("/api/admin/users", admin2), 403, "FORBIDDEN");
    assert.equal(
      (await request(`/api/admin/users/${admin2.id}/role`, admin, "PATCH", { role: "ADMIN" }))
        .statusCode,
      200,
    );
    assert.equal((await request("/api/admin/users", admin2)).statusCode, 200);
    // Two admins concurrently demoting one another can never remove both admins.
    const demotions = await Promise.all([
      request(`/api/admin/users/${admin.id}/role`, admin2, "PATCH", { role: "USER" }),
      request(`/api/admin/users/${admin2.id}/role`, admin, "PATCH", { role: "USER" }),
    ]);
    assert.equal(demotions.filter((r) => r.statusCode === 200).length, 1);
    assert.equal(demotions.filter((r) => r.statusCode === 403).length, 1);
    assert.equal(
      await db.user.count({ where: { id: { in: [admin.id, admin2.id] }, role: "ADMIN" } }),
      1,
    );
    for (const privilege of [{ role: "ADMIN" }, { isAdmin: true }, { isModerator: true }]) {
      expectError(
        await request("/api/auth/register", undefined, "POST", {
          email: `${prefix}_signup@example.test`,
          username: `${prefix}_signup`,
          password,
          ...privilege,
        }),
        400,
        "VALIDATION_ERROR",
      );
    }
    const promotion = execFileSync(
      process.execPath,
      [
        resolve(__dirname, "../../../../node_modules/tsx/dist/cli.mjs"),
        resolve(__dirname, "../scripts/promoteAdmin.ts"),
        user.username,
      ],
      { encoding: "utf8" },
    );
    assert.match(promotion, /ADMIN role assigned/);
    assert.equal(promotion.includes(password), false);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role, "ADMIN");
    console.log(
      "Admin DB integration passed: HTTP role matrix, pagination/filters, secret exclusion, aggregates, block/session/queue/WS safety, immutable history/ratings, concurrent role changes",
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    const ids = accounts.map((a) => a.id);
    await db.auditLog.deleteMany({ where: { OR: [
      { actorUserId: { in: ids } }, { targetUserId: { in: ids } }, { matchId: { in: matches } },
    ] } });
    await db.match.deleteMany({
      where: { OR: [{ id: { in: matches } }, { createdById: { in: ids } }] },
    });
    await db.ratingHistory.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
    storeTestHooks.reset();
    wsTestHooks.resetWsStateForTests();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
