import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type MatchOutcome, type MatchStatus } from "@prisma/client";
import { buildServer } from "../index";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRepository } from "../repositories/matchRepository";
import { StatisticsRepository } from "../repositories/statisticsRepository";
import { MatchService } from "../services/matchService";
import { PlayerStatisticsService } from "../services/playerStatisticsService";
import type { PlayerStatisticsDTO } from "../statistics/playerStatistics";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const url = configureTestDatabase(); // Refuses production, hosted DBs and non-test databases.
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [{ emit: "event", level: "query" }],
  });
  const queries: string[] = [];
  db.$on("query", (event) => queries.push(event.query));
  const warnings: object[] = [];
  const service = new PlayerStatisticsService(new StatisticsRepository(db), {
    warn: (data) => warnings.push(data),
  });
  const server = await buildServer({ playerStatistics: service, matchRecovery: false });
  const users: string[] = [],
    matches: string[] = [];
  const prefix = `statistics-${randomUUID()}`;
  const logger = { info: () => {}, error: () => {} };
  const lifecycle = new MatchLifecycle(logger, new MatchService(new MatchRepository(db), logger));
  const idPrefix = randomUUID().slice(0, 24);
  try {
    for (let i = 0; i < 5; i++)
      users.push(
        (
          await db.user.create({
            data: { email: `${prefix}-${i}@example.test`, passwordHash: "private-hash" },
          })
        ).id,
      );
    const [a, b, creator, empty, tied] = users;
    const create = async (
      outcome: MatchOutcome | null,
      options: {
        mode?: string;
        status?: MatchStatus;
        day?: number | null;
        duration?: number | null;
        turns?: number | null;
        userId?: string;
        id?: string;
      } = {},
    ) => {
      const match = await db.match.create({
        data: {
          id: options.id,
          status: options.status ?? "FINISHED",
          gameMode: options.mode ?? "classic",
          seed: 13,
          createdById: creator,
          // Creation chronology deliberately differs from completion chronology.
          createdAt: new Date("2026-02-01T00:00:00Z"),
          startedAt: new Date("2026-01-01T00:00:00Z"),
          finishedAt: options.day === null ? null : new Date(Date.UTC(2026, 0, options.day ?? 2)),
          durationMs: options.duration ?? null,
          turnCount: options.turns ?? null,
          finalRevision: 999,
          participants: {
            create: [
              {
                userId: options.userId ?? a,
                seat: "P1",
                displayNameSnapshot: "Historical player",
                outcome,
                resultData: { secret: "private history", heroId: "untrusted-hero" },
              },
              {
                userId: b,
                seat: "P2",
                displayNameSnapshot: "Historical opponent",
                outcome: outcome === "WIN" ? "LOSS" : outcome === "LOSS" ? "WIN" : outcome,
              },
            ],
          },
        },
      });
      matches.push(match.id);
      return match;
    };
    const outcomes: MatchOutcome[] = [
      "WIN",
      "WIN",
      "LOSS",
      "LOSS",
      "LOSS",
      "WIN",
      "WIN",
      "WIN",
      "WIN",
    ];
    // Insert backwards to prove that retrieval orders by completion, not insertion.
    for (let i = outcomes.length - 1; i >= 0; i--)
      await create(outcomes[i], {
        day: i + 2,
        mode: i < 4 ? "classic" : "standard",
        duration: i === 0 ? 1000 : i === 2 ? 3000 : null,
        turns: i === 0 ? 10 : i === 2 ? 20 : null,
      });
    const get = async (id: string) => {
      const response = await server.inject({ url: `/api/users/${id}/statistics` });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.headers["cache-control"], "no-store");
      return response.json() as PlayerStatisticsDTO;
    };
    const beforeDraw = await get(a);
    assert.deepEqual(beforeDraw.overall, {
      gamesPlayed: 9,
      wins: 6,
      losses: 3,
      draws: 0,
      winRate: 6 / 9,
      averageDurationMs: 2000,
      durationSampleSize: 2,
      averageTurns: 15,
      turnCountSampleSize: 2,
      currentStreak: { type: "WIN", count: 4 },
      longestWinStreak: 4,
      longestLossStreak: 3,
    });
    for (const status of ["WAITING", "IN_PROGRESS", "CANCELLED"] as const)
      await create("WIN", { status, day: 20, duration: 100000, turns: 100 });
    await create(null, { day: 21, duration: 100000, turns: 100 });
    await create("LOSS", { day: null, duration: 100000, turns: 100 });
    const invalidSamples = await create("DRAW", { mode: "draft", day: 11, duration: -1, turns: 0 });
    await create("DRAW", { mode: "draft", day: 12 });
    queries.length = 0;
    const all = await get(a);
    const smallQueryCount = queries.filter((query) => /^SELECT/.test(query)).length;
    assert(smallQueryCount <= 3, `Expected bounded projection reads, got ${smallQueryCount}`);
    assert(
      !queries.some((query) =>
        /MatchAction|MatchSnapshot|AuthSession|Profile|resultData|initialConfig|passwordHash|email/.test(
          query,
        ),
      ),
    );
    assert.deepEqual(all.overall, {
      ...beforeDraw.overall,
      gamesPlayed: 11,
      draws: 2,
      winRate: 6 / 11,
      currentStreak: { type: "DRAW", count: 2 },
    });
    assert.deepEqual(all.byGameMode, [
      {
        gameMode: "standard",
        gamesPlayed: 5,
        wins: 4,
        losses: 1,
        draws: 0,
        winRate: 0.8,
        averageDurationMs: null,
        durationSampleSize: 0,
        averageTurns: null,
        turnCountSampleSize: 0,
      },
      {
        gameMode: "classic",
        gamesPlayed: 4,
        wins: 2,
        losses: 2,
        draws: 0,
        winRate: 0.5,
        averageDurationMs: 2000,
        durationSampleSize: 2,
        averageTurns: 15,
        turnCountSampleSize: 2,
      },
      {
        gameMode: "draft",
        gamesPlayed: 2,
        wins: 0,
        losses: 0,
        draws: 2,
        winRate: 0,
        averageDurationMs: null,
        durationSampleSize: 0,
        averageTurns: null,
        turnCountSampleSize: 0,
      },
    ]);
    assert(warnings.some((entry) => (entry as { excludedMatches?: number }).excludedMatches === 2));
    assert.equal(
      all.byGameMode.reduce((sum, group) => sum + group.gamesPlayed, 0),
      all.overall.gamesPlayed,
    );
    const opponent = await get(b);
    assert.equal(opponent.overall.wins, all.overall.losses);
    assert.equal(opponent.overall.losses, all.overall.wins);
    assert.equal(opponent.overall.draws, all.overall.draws);
    for (const id of [empty, creator]) {
      const zero = await get(id);
      assert.deepEqual(zero, {
        userId: id,
        overall: {
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          averageDurationMs: null,
          durationSampleSize: 0,
          averageTurns: null,
          turnCountSampleSize: 0,
          currentStreak: { type: null, count: 0 },
          longestWinStreak: 0,
          longestLossStreak: 0,
        },
        byGameMode: [],
      });
    }
    const missing = await server.inject({ url: `/api/users/${randomUUID()}/statistics` });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    assert.equal((await server.inject({ url: "/api/users/invalid/statistics" })).statusCode, 400);

    // Tied finishedAt values use ascending persisted match IDs, not insert order.
    await create("LOSS", { userId: tied, id: `${idPrefix}000000000002` });
    await create("WIN", { userId: tied, id: `${idPrefix}000000000001`, mode: "standard" });
    const tieStats = await get(tied);
    assert.deepEqual(tieStats.overall.currentStreak, { type: "LOSS", count: 1 });
    assert.deepEqual(
      tieStats.byGameMode.map((group) => group.gameMode),
      ["classic", "standard"],
    );
    assert.equal(tieStats.overall.averageTurns, null); // finalRevision=999 is not turns.

    // Test rooms do not create Match or Participant records at any lifecycle boundary.
    const testRoom = await lifecycle.createRoom({ roomMode: "test", seed: 13 }, randomUUID(), a);
    assert.equal(testRoom.matchId, null);
    await lifecycle.syncParticipant(testRoom, "P1", "Test player");
    await lifecycle.syncGameMode(testRoom);
    lifecycle.recordAcceptedAction(testRoom);
    await lifecycle.removeRoom(testRoom);
    assert.equal(await db.match.findUnique({ where: { roomId: testRoom.id } }), null);
    assert.deepEqual(await get(a), all);
    // Profile changes and arbitrary result JSON hero IDs cannot rewrite aggregates.
    await db.profile.create({
      data: {
        userId: a,
        username: `Stats_${randomUUID().slice(0, 8)}`,
        displayName: "Changed player",
      },
    });
    await db.matchParticipant.update({
      where: { matchId_seat: { matchId: invalidSamples.id, seat: "P1" } },
      data: { resultData: { heroId: "changed-current-hero" } },
    });
    assert.deepEqual(await get(a), all);
    assert.doesNotMatch(
      JSON.stringify(all),
      /email|passwordHash|token|resultData|initialConfig|GameState|MatchAction|MatchSnapshot|byHero|byFigureSet|rating|private history|untrusted-hero/,
    );

    for (let i = 0; i < 100; i++) await create(i % 2 ? "LOSS" : "WIN", { userId: empty, day: 15 });
    queries.length = 0;
    const hundred = await get(empty);
    assert.equal(hundred.overall.gamesPlayed, 100);
    assert.equal(hundred.overall.winRate, 0.5);
    assert.equal(queries.filter((query) => /^SELECT/.test(query)).length, smallQueryCount);
    assert(!queries.some((query) => /MatchAction|MatchSnapshot|Profile|resultData/.test(query)));
    console.log(
      `player statistics PostgreSQL aggregates, eligibility, relative results, legacy data, ties, test rooms, privacy and bounded reads passed (${smallQueryCount} SELECTs for both 11 and 100 games)`,
    );
  } finally {
    await lifecycle.close();
    await server.close();
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
