import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type MatchOutcome, type Prisma } from "@prisma/client";
import { buildServer } from "../index";
import { RatingRepository } from "../repositories/ratingRepository";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { RatingService } from "../services/ratingService";
import { LeaderboardService } from "../services/leaderboardService";
import type { LeaderboardQuery } from "../leaderboard/querySchema";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const url = configureTestDatabase();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [{ emit: "event", level: "query" }],
  });
  const queries: string[] = [];
  db.$on("query", (event) => queries.push(event.query));
  const prefix = `lb_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const users: string[] = [],
    matches: string[] = [];
  const ratings = new RatingService(new RatingRepository(db), { info() {}, error() {} });
  const repository = new LeaderboardRepository(db);
  const service = new LeaderboardService(repository, { minRatedGames: 5 });
  const server = await buildServer({ leaderboard: service });
  const defaults: LeaderboardQuery = {
    gameMode: "standard",
    status: "qualified",
    page: 1,
    limit: 100,
    sort: "rating",
    order: "desc",
  };
  try {
    const createUser = async (name?: string) => {
      const user = await db.user.create({
        data: {
          email: `${prefix}-${users.length}@example.test`,
          ...(name
            ? {
                profile: {
                  create: {
                    username: `${prefix}_${name}`,
                    displayName: `Current ${name}`,
                    avatarUrl: null,
                  },
                },
              }
            : {}),
          ratings: { create: { gameMode: "standard" } },
        },
      });
      users.push(user.id);
      return user.id;
    };
    const opponent = await createUser(); // Missing profile must not produce a broken profile link.
    const a = await createUser("A"),
      b = await createUser("B"),
      c = await createUser("C");
    const zero = await createUser("Zero"),
      performance = await createUser("RatedOnly"),
      draws = await createUser("Draws");
    const newcomers = await createUser("OneGameLeader");
    const createMatch = async (
      userId: string,
      outcome: MatchOutcome,
      fields: Partial<Prisma.MatchUncheckedCreateInput> = {},
      process = true,
    ) => {
      const draw = outcome === "DRAW";
      const winner = outcome === "WIN" ? userId : opponent;
      const loser = outcome === "LOSS" ? userId : opponent;
      const match = await db.match.create({
        data: {
          status: "FINISHED",
          isRated: true,
          gameMode: "standard",
          seed: 1,
          finishedAt: new Date("2026-10-03T08:00:00Z"),
          finalRevision: 2,
          finishReason: draw ? "chessMutualKingDefeat" : "allEnemyUnitsDefeated",
          winnerSeat: draw ? null : outcome === "WIN" ? "P1" : "P2",
          loserSeat: draw ? null : outcome === "WIN" ? "P2" : "P1",
          winnerUserId: draw ? null : winner,
          loserUserId: draw ? null : loser,
          ...fields,
          participants: {
            create: [
              { userId, seat: "P1", outcome, displayNameSnapshot: "Old player identity" },
              {
                userId: opponent,
                seat: "P2",
                outcome: draw ? "DRAW" : outcome === "WIN" ? "LOSS" : "WIN",
                displayNameSnapshot: "Opponent",
              },
            ],
          },
        },
      });
      matches.push(match.id);
      if (process) await ratings.processRatedMatch(match.id);
      return match.id;
    };
    const play = async (userId: string, count: number, wins = count, drawCount = 0) => {
      for (let i = 0; i < count; i++)
        await createMatch(userId, i < wins ? "WIN" : i < wins + drawCount ? "DRAW" : "LOSS");
    };
    await play(a, 10, 6);
    await play(b, 6, 4);
    await play(c, 4, 4);
    await play(performance, 5, 3);
    await play(draws, 5, 2, 1);
    await play(newcomers, 1);
    const recent = new Date("2026-10-03T09:00:00Z");
    await db.match.update({
      where: { id: matches[matches.length - 2] },
      data: { finishedAt: recent },
    });
    // Casual wins and future timestamps never affect competitive statistics/activity.
    for (let i = 0; i < 100; i++)
      await createMatch(
        performance,
        "WIN",
        { isRated: false, finishedAt: new Date("2026-10-04T10:00:00Z") },
        false,
      );
    const pending = await createMatch(
      performance,
      "WIN",
      { finishedAt: new Date("2026-10-05T10:00:00Z") },
      false,
    );
    for (const gameMode of ["test", "debug", "sandbox"])
      await createMatch(performance, "WIN", { gameMode }, true);
    await createMatch(performance, "WIN", { finishReason: "debugFinish" }, true);
    await createMatch(performance, "WIN", { status: "CANCELLED" }, true);
    const extra: string[] = [];
    for (let i = 0; i < 25; i++) {
      const user = await createUser(`Player${i}`);
      extra.push(user);
      await play(user, 5, i % 6);
    }
    // Controlled values test precise sorting without changing persisted game counters.
    await db.rating.update({
      where: { userId_gameMode: { userId: a, gameMode: "standard" } },
      data: { rating: 1600.12345, ratingDeviation: 80 },
    });
    await db.rating.update({
      where: { userId_gameMode: { userId: b, gameMode: "standard" } },
      data: { rating: 1700, ratingDeviation: 90 },
    });
    await db.rating.update({
      where: { userId_gameMode: { userId: c, gameMode: "standard" } },
      data: { rating: 1650, ratingDeviation: 60 },
    });
    await db.rating.update({
      where: { userId_gameMode: { userId: newcomers, gameMode: "standard" } },
      data: { rating: 9999 },
    });
    for (const userId of [performance, draws, ...extra])
      await db.rating.update({
        where: { userId_gameMode: { userId: userId, gameMode: "standard" } },
        data: { rating: 1550, ratingDeviation: 100 },
      });
    await db.rating.update({
      where: { userId_gameMode: { userId: extra[0], gameMode: "standard" } },
      data: { rating: 1600.12345, ratingDeviation: 70 },
    });
    const snapshot = async () => ({
      ratings: await db.rating.findMany({
        where: { userId: { in: users } },
        orderBy: { userId: "asc" },
      }),
      histories: await db.ratingHistory.findMany({
        where: { userId: { in: users } },
        orderBy: { id: "asc" },
      }),
      matches: await db.match.findMany({ where: { id: { in: matches } }, orderBy: { id: "asc" } }),
    });
    const before = await snapshot();
    queries.length = 0;
    const result = await service.getLeaderboard(defaults);
    assert.equal(
      queries.filter((q) => /SELECT|WITH candidates/.test(q)).length,
      2,
      "bounded query count, no N+1",
    );
    assert.equal(
      queries.some((q) => /INSERT|UPDATE|DELETE/.test(q)),
      false,
    );
    assert.equal(result.items.length, 29);
    assert.equal(result.items[0].user.id, b);
    assert.equal(result.items[1].user.id, extra[0], "lower RD breaks equal precise ratings");
    assert.equal(result.items[2].user.id, a);
    assert.equal(result.items[2].rating, 1600.12345);
    assert(result.items.every((p) => p.status === "QUALIFIED" && p.gamesUntilQualified === 0));
    assert(!result.items.some((p) => [c, newcomers, zero, opponent].includes(p.user.id)));
    const equal = result.items.filter((p) => p.rating === 1550).map((p) => p.user.id);
    assert.deepEqual(equal, [...equal].sort(), "UUID tie break is deterministic");
    assert.deepEqual((await service.getLeaderboard(defaults)).items, result.items);
    const rated = result.items.find((p) => p.user.id === performance)!;
    assert.deepEqual(
      [rated.ratedGames, rated.wins, rated.losses, rated.draws, rated.winRate],
      [5, 3, 2, 0, 0.6],
    );
    assert.equal(rated.lastActivity, "2026-10-03T08:00:00.000Z");
    assert.equal(
      rated.user.displayName,
      "Current RatedOnly",
      "current profile, not historical snapshot",
    );
    assert.equal(rated.performanceAvailable, true);
    const drawn = result.items.find((p) => p.user.id === draws)!;
    assert.deepEqual(
      [drawn.ratedGames, drawn.wins, drawn.losses, drawn.draws, drawn.winRate],
      [5, 2, 2, 1, 0.4],
    );
    assert.equal(drawn.lastActivity, recent.toISOString());
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: pending } })).ratingProcessedAt,
      null,
    );
    const provisional = await service.getLeaderboard({ ...defaults, status: "provisional" });
    assert.deepEqual(
      provisional.items.map((p) => p.user.id),
      [newcomers, c],
    );
    assert(provisional.items.every((p) => p.ratingRank === null));
    assert.deepEqual(
      provisional.items.map((p) => p.gamesUntilQualified),
      [4, 1],
    );
    const canonicalRanks = new Map(result.items.map((p) => [p.user.id, p.ratingRank]));
    for (const sort of ["rating", "gamesPlayed", "winRate", "lastActivity"] as const) {
      for (const order of ["asc", "desc"] as const) {
        const sorted = await service.getLeaderboard({ ...defaults, sort, order });
        assert(sorted.items.every((p) => p.ratingRank === canonicalRanks.get(p.user.id)));
        const values = sorted.items.map((p) =>
          sort === "gamesPlayed"
            ? p.ratedGames
            : sort === "lastActivity"
              ? Date.parse(p.lastActivity!)
              : p[sort]!,
        );
        assert(
          values.every(
            (v, i) => i === 0 || (order === "desc" ? values[i - 1] >= v : values[i - 1] <= v),
          ),
          `${sort} ${order}`,
        );
        assert.deepEqual(
          (await service.getLeaderboard({ ...defaults, sort, order })).items,
          sorted.items,
        );
      }
    }
    const first = await service.getLeaderboard({ ...defaults, limit: 20 });
    const second = await service.getLeaderboard({ ...defaults, limit: 20, page: 2 });
    assert.deepEqual(first.pagination, { page: 1, limit: 20, total: 29, totalPages: 2 });
    assert.equal(second.items[0].ratingRank, 21);
    assert.deepEqual([...first.items, ...second.items], result.items);
    assert.equal(
      (await service.getLeaderboard({ ...defaults, page: 3, limit: 20 })).items.length,
      0,
    );
    const custom = await new LeaderboardService(repository, { minRatedGames: 7 }).getLeaderboard(
      defaults,
    );
    assert.deepEqual(
      custom.items.map((p) => p.user.id),
      [a],
    );
    for (const route of [
      "/api/leaderboard",
      "/api/leaderboard?status=provisional",
      "/api/leaderboard?page=2&limit=20&sort=winRate&order=asc",
    ]) {
      const response = await server.inject({ url: route });
      assert.equal(response.statusCode, 200);
      assert.doesNotMatch(
        response.body,
        /email|password|token|session|volatility|resultData|initialConfig/,
      );
    }
    assert.deepEqual(
      await snapshot(),
      before,
      "leaderboard never mutates state/history or processes pending matches",
    );
    // Rating counters survive Match deletion. Do not claim missing results as losses or inflate WR.
    const missingId = (
      await db.matchParticipant.findFirstOrThrow({
        where: { userId: performance, match: { isRated: true, ratingProcessedAt: { not: null } } },
      })
    ).matchId;
    await db.match.delete({ where: { id: missingId } });
    const incomplete = (await service.getLeaderboard(defaults)).items.find(
      (p) => p.user.id === performance,
    )!;
    assert.equal(incomplete.ratedGames, 5);
    assert.equal(incomplete.performanceAvailable, false);
    assert.deepEqual(
      [
        incomplete.wins,
        incomplete.losses,
        incomplete.draws,
        incomplete.winRate,
        incomplete.lastActivity,
      ],
      [null, null, null, null, null],
    );
    for (const order of ["asc", "desc"] as const)
      assert.equal(
        (await service.getLeaderboard({ ...defaults, sort: "winRate", order })).items.slice(-1)[0]
          .user.id,
        performance,
      );
    console.log(
      "Leaderboard local DB/API: qualification, rated-only 3W/2L + 100 casual wins, draws, processed integrity, deterministic ties/all sorts, global ranks/pagination, privacy, 2 queries, read-only and deletion handling passed",
    );
  } finally {
    await server.close();
    await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
