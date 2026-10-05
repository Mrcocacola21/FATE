import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { AuthError } from "../auth/authErrors";
import { matchHistoryQuerySchema } from "../matches/historySchema";
import type { HistoryMatch } from "../repositories/matchHistoryRepository";
import { MatchHistoryService, toMatchHistoryItem } from "../services/matchHistoryService";
import { matchHistoryRoutes } from "../routes/matchHistoryRoutes";

async function run() {
  const a = randomUUID(),
    b = randomUUID();
  const match: HistoryMatch = {
    id: randomUUID(),
    status: "FINISHED",
    isRated: false,
    gameMode: "classic",
    createdAt: new Date("2026-01-01T12:00:00Z"),
    startedAt: new Date("2026-01-01T12:01:00Z"),
    finishedAt: new Date("2026-01-01T12:04:00Z"),
    durationMs: 180000,
    finishReason: "allEnemyUnitsDefeated",
    finalRevision: 42,
    turnCount: 18,
    participants: [
      {
        userId: a,
        seat: "P1",
        displayNameSnapshot: "Old Alice",
        outcome: "WIN",
        user: { profile: null },
      },
      {
        userId: b,
        seat: "P2",
        displayNameSnapshot: "Old Bob",
        outcome: "LOSS",
        user: { profile: { username: "Bob_now", avatarUrl: null } },
      },
    ],
  };
  assert.deepEqual(matchHistoryQuerySchema.parse({}), { page: 1, limit: 20 });
  for (const query of [
    { page: "-1" },
    { page: "0" },
    { page: "1.5" },
    { page: "1e2" },
    { page: "" },
    { page: "21474837" },
    { limit: "101" },
    { limit: "0" },
    { result: "banana" },
    { gameMode: "unknown" },
    { status: "WAITING" },
    { limit: ["1", "2"] },
  ])
    assert.equal(matchHistoryQuerySchema.safeParse(query).success, false);
  for (const result of ["WIN", "LOSS", "DRAW"])
    assert(matchHistoryQuerySchema.safeParse({ result }).success);
  const item = toMatchHistoryItem(match, a);
  assert.equal(item.result, "WIN");
  assert.equal(item.matchType, "CASUAL");
  assert.equal(toMatchHistoryItem({ ...match, isRated: true }, a).matchType, "RATED");
  assert.equal(item.opponent?.displayName, "Old Bob");
  assert.equal(item.opponent?.username, "Bob_now");
  assert.equal(item.durationMs, 180000);
  assert.equal(toMatchHistoryItem(match, b).result, "LOSS");
  assert.equal(toMatchHistoryItem(match, b).opponent?.username, null);
  const guest = {
    ...match,
    durationMs: null,
    finishedAt: null,
    participants: [match.participants[0], { ...match.participants[1], userId: null, user: null }],
  };
  assert.equal(toMatchHistoryItem(guest, a).opponent?.displayName, "Old Bob");
  assert.equal(toMatchHistoryItem(guest, a).opponent?.userId, null);
  assert.equal(
    toMatchHistoryItem({ ...guest, participants: [guest.participants[0]] }, a).opponent,
    null,
  );
  let queries = 0;
  const service = new MatchHistoryService({
    userExists: async (id) => (id === a || id === b ? { id } : null),
    findUserHistory: async (_id, query) => {
      queries++;
      assert.equal(query.page, 1);
      return { items: [match], total: 1 };
    },
  });
  await assert.rejects(
    service.getUserMatchHistory(randomUUID(), { page: 1, limit: 20 }),
    (error: unknown) => error instanceof AuthError && error.code === "USER_NOT_FOUND",
  );
  assert.equal(queries, 0);
  const server = Fastify();
  await server.register(matchHistoryRoutes, { prefix: "/api", matchHistory: service });
  try {
    const response = await server.inject({ url: `/api/users/${a}/matches` });
    assert.equal(response.statusCode, 200); // Public, no Authorization header.
    assert.deepEqual(response.json().pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
    assert.equal(response.json().items[0].result, "WIN");
    for (const query of [
      "page=-100",
      "page=0",
      "limit=999999",
      "result=banana",
      "gameMode=test",
      "status=CANCELLED",
      "page=1&page=2",
    ])
      assert.equal(
        (await server.inject({ url: `/api/users/${a}/matches?${query}` })).json().error.code,
        "VALIDATION_ERROR",
      );
    assert.equal((await server.inject({ url: "/api/users/bad-id/matches" })).statusCode, 400);
    const missing = await server.inject({ url: `/api/users/${randomUUID()}/matches` });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    assert.equal(
      (await server.inject({ url: `/api/users/${b}/matches` })).json().items[0].result,
      "LOSS",
    );
    assert.doesNotMatch(
      response.body,
      /email|passwordHash|AuthSession|token|resumeToken|connId|GameState|resultData|seed/,
    );
  } finally {
    await server.close();
  }
  const unavailable = Fastify();
  await unavailable.register(matchHistoryRoutes, {
    matchHistory: {
      getUserMatchHistory: async () => {
        throw new Error("private diagnostic");
      },
    },
  });
  try {
    const response = await unavailable.inject({ url: `/users/${a}/matches` });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /private diagnostic/);
  } finally {
    await unavailable.close();
  }
  console.log(
    "match history validation, relative outcomes, legacy DTOs, public HTTP access and privacy tests passed",
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
