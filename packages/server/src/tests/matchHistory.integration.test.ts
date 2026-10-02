import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type MatchOutcome } from "@prisma/client";
import { buildServer } from "../index";
import { MatchHistoryRepository } from "../repositories/matchHistoryRepository";
import { MatchHistoryService } from "../services/matchHistoryService";
import { requireTestDatabaseUrl } from "./testDatabase";
import type { MatchHistoryItemDTO } from "../services/matchHistoryService";

async function run() {
  const url = requireTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [{ emit: "event", level: "query" }],
  });
  const sql: string[] = [];
  db.$on("query", (event) => sql.push(event.query));
  const history = new MatchHistoryService(new MatchHistoryRepository(db));
  const server = await buildServer({ matchHistory: history });
  const users: string[] = [],
    ids: string[] = [];
  const prefix = `history-${randomUUID()}`;
  try {
    for (let i = 0; i < 4; i++)
      users.push(
        (
          await db.user.create({
            data: {
              email: `${prefix}-${i}@example.test`,
              passwordHash: "private-hash",
              profile:
                i === 2
                  ? undefined
                  : {
                      create: {
                        username: `History_${randomUUID().slice(0, 8)}`,
                        displayName: "Current renamed identity",
                      },
                    },
            },
          })
        ).id,
      );
    const [a, b, c, emptyUser] = users;
    const create = async (
      outcome: MatchOutcome | null,
      mode: string,
      day: number | null,
      opponent = b,
      status: "FINISHED" | "WAITING" | "IN_PROGRESS" | "CANCELLED" = "FINISHED",
    ) => {
      const match = await db.match.create({
        data: {
          status,
          gameMode: mode,
          seed: 13,
          createdById: c,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          startedAt: new Date("2026-01-01T12:00:00Z"),
          finishedAt:
            day === null ? null : new Date(`2026-01-${String(day).padStart(2, "0")}T12:03:00Z`),
          durationMs: day === null ? null : 180000,
          finalRevision: day === null ? null : 42,
          turnCount: day === null ? null : 18,
          finishReason: "allEnemyUnitsDefeated",
          participants: {
            create: [
              {
                userId: a,
                seat: "P1",
                displayNameSnapshot: "Historical Alice",
                outcome,
                resultData: { secret: "not public" },
              },
              {
                userId: opponent,
                seat: "P2",
                displayNameSnapshot: "Historical Opponent",
                outcome: outcome === "WIN" ? "LOSS" : outcome === "LOSS" ? "WIN" : outcome,
              },
            ],
          },
        },
      });
      ids.push(match.id);
      return match;
    };
    const first = await create("WIN", "standard", 2);
    await create("WIN", "standard", 3, c);
    await create("WIN", "classic", 4);
    await create("LOSS", "classic", 4);
    await create("LOSS", "draft", 6);
    await create("DRAW", "classic", 7);
    await create(null, "standard", null);
    for (const status of ["WAITING", "IN_PROGRESS", "CANCELLED"] as const)
      await create(null, "standard", 8, b, status);
    const get = async (userId: string, query = "") => {
      const response = await server.inject({
        url: `/api/users/${userId}/matches${query ? `?${query}` : ""}`,
      });
      assert.equal(response.statusCode, 200, response.body);
      return response.json() as {
        items: MatchHistoryItemDTO[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
    };
    sql.length = 0;
    const all = await get(a);
    // One existence query, one count and bounded relation selects, independent of page size.
    assert(sql.filter((query) => /^SELECT/.test(query)).length <= 7);
    assert(!sql.some((query) => /MatchAction|MatchSnapshot|AuthSession/.test(query)));
    assert.equal(all.pagination.total, 7);
    assert(all.items.every((item) => item.status === "FINISHED"));
    const expected = [...all.items].sort(
      (x, y) => (y.finishedAt ?? "").localeCompare(x.finishedAt ?? "") || y.id.localeCompare(x.id),
    );
    assert.deepEqual(
      all.items.map((item) => item.id),
      expected.map((item) => item.id),
    );
    const p1 = await get(a, "page=1&limit=3"),
      p2 = await get(a, "page=2&limit=3"),
      p3 = await get(a, "page=3&limit=3");
    assert.equal(p1.pagination.totalPages, 3);
    assert.equal(p1.items.length, 3);
    assert.equal(p2.items.length, 3);
    assert.equal(p3.items.length, 1);
    assert.deepEqual(
      [...p1.items, ...p2.items, ...p3.items].map((item) => item.id),
      all.items.map((item) => item.id),
    );
    assert.equal(new Set([...p1.items, ...p2.items, ...p3.items].map((item) => item.id)).size, 7);
    assert.equal((await get(a, "result=WIN")).pagination.total, 3);
    assert.equal((await get(a, "result=LOSS")).pagination.total, 2);
    assert.equal((await get(a, "result=DRAW")).pagination.total, 1);
    assert.equal((await get(a, "gameMode=classic")).pagination.total, 3);
    const combined = await get(a, "result=WIN&gameMode=classic");
    assert.equal(combined.pagination.total, 1);
    assert(combined.items.every((item) => item.result === "WIN" && item.gameMode === "classic"));
    assert.equal((await get(b)).items.find((item) => item.id === first.id)?.result, "LOSS");
    const creatorHistory = await get(c);
    assert.equal(creatorHistory.pagination.total, 1); // Creator alone is not participation.
    assert.equal(creatorHistory.items[0].opponent?.displayName, "Historical Alice");
    assert.equal(all.items.find((item) => item.opponent?.userId === c)?.opponent?.username, null);
    assert.equal(all.items.find((item) => !item.finishedAt)?.durationMs, null);
    assert.deepEqual((await get(emptyUser)).pagination, {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    assert.equal((await get(a, "page=100")).items.length, 0);
    const missing = await server.inject({ url: `/api/users/${randomUUID()}/matches` });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    await db.profile.update({
      where: { userId: b },
      data: { username: `Renamed_${randomUUID().slice(0, 8)}`, displayName: "New Bob" },
    });
    const renamed = (await get(a)).items.find((item) => item.id === first.id)!;
    assert.equal(renamed.opponent?.displayName, "Historical Opponent");
    assert(renamed.opponent?.username?.startsWith("Renamed_"));
    const details = await server.inject({ url: `/api/matches/${first.id}` });
    assert.equal(details.statusCode, 200);
    assert.equal(details.json().participants[1].displayName, "Historical Opponent");
    assert.equal(details.json().participants[1].username, renamed.opponent?.username);
    assert.doesNotMatch(
      JSON.stringify(all),
      /email|passwordHash|AuthSession|token|resumeToken|connId|resultData|GameState|seed|not public/,
    );
    await db.user.delete({ where: { id: b } });
    const removed = (await get(a)).items.find((item) => item.id === first.id)!;
    assert.equal(removed.opponent?.userId, null);
    assert.equal(removed.opponent?.displayName, "Historical Opponent");
    assert.equal(removed.opponent?.username, null);
    console.log(
      "match history PostgreSQL participation, filters, tied sorting, pagination, snapshots, legacy, deletion and public privacy tests passed",
    );
  } finally {
    await server.close();
    await db.match.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
