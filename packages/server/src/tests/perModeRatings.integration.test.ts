import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { GAME_MODE_IDS } from "rules";
import { configureTestDatabase } from "./testDatabase";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { LeaderboardService } from "../services/leaderboardService";
import { INITIAL_RATING } from "../rating/constants";
import { ratingHistoryQuerySchema } from "../rating/historySchema";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { getRankMetadata } from "../rating/rankTiers";
import { calculateRating } from "../rating/glicko2";
import { buildServer } from "../index";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { readMatchmakingConfig } from "../matchmaking/config";
import { deleteGameRoom, type GameRoom } from "../store";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const other = new PrismaClient({ datasources: { db: { url } } });
  const logger = { info() {}, error() {} };
  const ratings = new RatingService(new RatingRepository(db), logger);
  const concurrentRatings = new RatingService(new RatingRepository(other), logger);
  const leaderboard = new LeaderboardService(new LeaderboardRepository(db), { minRatedGames: 5 });
  const server = await buildServer({ ratings, leaderboard, matchRecovery: false });
  const users: string[] = [],
    matches: string[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const key = `modes_${randomUUID().replace(/-/g, "")}`;
      users.push(
        (
          await db.user.create({
            data: { email: `${key}@example.test`, profile: { create: { username: key } } },
          })
        ).id,
      );
    }
    const [a, b, c, d] = users;
    const fresh = await ratings.getAllPlayerRatings(a);
    for (const mode of GAME_MODE_IDS) {
      assert.deepEqual(fresh.ratings[mode], {
        userId: a,
        gameMode: mode,
        ...INITIAL_RATING,
        ratedGames: 0,
        ...getRankMetadata(INITIAL_RATING.rating),
      });
    }
    assert.equal(
      await db.rating.count({ where: { userId: a } }),
      0,
      "reads do not materialize defaults",
    );
    const create = async (gameMode: string, isRated = true, first = a, second = b) => {
      const match = await db.match.create({
        data: {
          gameMode,
          isRated,
          status: "FINISHED",
          seed: 1,
          finishedAt: new Date(),
          finalRevision: 3,
          finishReason: "allEnemyUnitsDefeated",
          winnerSeat: "P1",
          loserSeat: "P2",
          winnerUserId: first,
          loserUserId: second,
          participants: {
            create: [
              { userId: first, seat: "P1", displayNameSnapshot: "A", outcome: "WIN" },
              { userId: second, seat: "P2", displayNameSnapshot: "B", outcome: "LOSS" },
            ],
          },
        },
      });
      matches.push(match.id);
      return match;
    };
    await db.rating.createMany({
      data: users.flatMap((userId) =>
        GAME_MODE_IDS.map((gameMode) => ({ userId, gameMode, ...INITIAL_RATING })),
      ),
    });
    // FULL Glicko states plus timestamps in other modes must stay byte-for-byte identical.
    for (const gameMode of GAME_MODE_IDS) {
      const untouched = await db.rating.findMany({
        where: { userId: { in: [a, b] }, gameMode: { not: gameMode } },
        orderBy: [{ userId: "asc" }, { gameMode: "asc" }],
      });
      const match = await create(gameMode);
      const before = await ratings.getPlayerRating(a, gameMode);
      await ratings.processRatedMatch(match.id);
      const winner = await ratings.getPlayerRating(a, gameMode),
        loser = await ratings.getPlayerRating(b, gameMode);
      assert(winner.rating > before.rating && loser.rating < 1500);
      assert.equal(winner.ratedGames, 1);
      assert(winner.ratingDeviation < INITIAL_RATING.ratingDeviation);
      assert.deepEqual(
        await db.rating.findMany({
          where: { userId: { in: [a, b] }, gameMode: { not: gameMode } },
          orderBy: [{ userId: "asc" }, { gameMode: "asc" }],
        }),
        untouched,
      );
      const history = await ratings.getRatingHistory(
        a,
        ratingHistoryQuerySchema.parse({ gameMode }),
      );
      assert.equal(history.items.length, 1);
      assert.equal(history.items[0].gameMode, gameMode);
      assert.equal(history.items[0].ratingBefore, before.rating);
      const snapshot = await db.rating.findMany({ where: { userId: { in: [a, b] } } });
      await Promise.all([
        ratings.processRatedMatch(match.id),
        concurrentRatings.processRatedMatch(match.id),
      ]);
      assert.deepEqual(await db.rating.findMany({ where: { userId: { in: [a, b] } } }), snapshot);
      assert.equal(await db.ratingHistory.count({ where: { matchId: match.id } }), 2);
      const casual = await create(gameMode, false);
      assert.equal((await ratings.processRatedMatch(casual.id)).outcome, "ineligible");
      assert.deepEqual(await db.rating.findMany({ where: { userId: { in: [a, b] } } }), snapshot);
      assert.equal(await db.ratingHistory.count({ where: { matchId: casual.id } }), 0);
    }
    // Many Standard periods do not train Draft/Classic RD or volatility.
    const otherModes = await db.rating.findMany({
      where: { userId: c, gameMode: { not: "standard" } },
      orderBy: { gameMode: "asc" },
    });
    for (let i = 0; i < 8; i++)
      await ratings.processRatedMatch((await create("standard", true, c, d)).id);
    assert.deepEqual(
      await db.rating.findMany({
        where: { userId: c, gameMode: { not: "standard" } },
        orderBy: { gameMode: "asc" },
      }),
      otherModes,
    );
    // Different-mode updates sharing both players both commit without cross-mode writes.
    const draft = await create("draft", true, c, d),
      classic = await create("classic", true, c, d);
    await Promise.all([
      ratings.processRatedMatch(draft.id),
      concurrentRatings.processRatedMatch(classic.id),
    ]);
    for (const mode of ["draft", "classic"] as const) {
      const state = await ratings.getPlayerRating(c, mode);
      assert.equal(state.ratedGames, 1);
      assert(
        Math.abs(
          state.rating -
            calculateRating(INITIAL_RATING, [{ opponent: INITIAL_RATING, score: 1 }]).rating,
        ) < 1e-10,
      );
    }
    // Independent rankings/qualification and metrics. User A's modes differ widely.
    for (const [gameMode, rating, ratedGames] of [
      ["standard", 1800, 10],
      ["draft", 900, 2],
      ["classic", 2010, 5],
    ] as const)
      await db.rating.update({
        where: { userId_gameMode: { userId: a, gameMode } },
        data: { rating, ratedGames },
      });
    const all = await ratings.getAllPlayerRatings(a);
    assert.equal(all.ratings.standard.rankTier, "BLACK_MOON");
    assert.equal(all.ratings.draft.rankTier, "HALF");
    assert.equal(all.ratings.classic.rankTier, "DESTINY");
    for (const [gameMode, rating, ratedGames] of [
      ["standard", 1700, 10],
      ["draft", 950, 2],
      ["classic", 2150, 5],
    ] as const)
      await db.rating.update({
        where: { userId_gameMode: { userId: b, gameMode } },
        data: { rating, ratedGames },
      });
    assert.equal(
      (
        await leaderboard.getLeaderboard(leaderboardQuerySchema.parse({ gameMode: "draft" }))
      ).items.some((row) => row.user.id === a),
      false,
    );
    assert.equal(
      (
        await leaderboard.getLeaderboard(
          leaderboardQuerySchema.parse({ gameMode: "draft", status: "provisional" }),
        )
      ).items.find((row) => row.user.id === a)?.ratingRank,
      null,
    );
    const standardBoard = await leaderboard.getLeaderboard(
      leaderboardQuerySchema.parse({ gameMode: "standard" }),
    );
    assert(standardBoard.items.find((row) => row.user.id === a)?.ratingRank);
    assert(
      standardBoard.items.find((row) => row.user.id === a)!.ratingRank! <
        standardBoard.items.find((row) => row.user.id === b)!.ratingRank!,
    );
    const classicBoard = await leaderboard.getLeaderboard(
      leaderboardQuerySchema.parse({ gameMode: "classic" }),
    );
    assert.equal(classicBoard.items.find((row) => row.user.id === a)?.rating, 2010);
    assert(
      classicBoard.items.find((row) => row.user.id === a)!.ratingRank! >
        classicBoard.items.find((row) => row.user.id === b)!.ratingRank!,
    );
    const draftBoard = await leaderboard.getLeaderboard(
      leaderboardQuerySchema.parse({ gameMode: "draft", status: "provisional" }),
    );
    assert(
      draftBoard.items.findIndex((row) => row.user.id === b) <
        draftBoard.items.findIndex((row) => row.user.id === a),
    );
    const cBoard = standardBoard.items.find((row) => row.user.id === c)!;
    assert.equal(cBoard.ratedGames, 8);
    assert.equal(cBoard.wins, 8);
    assert.equal(cBoard.winRate, 1);
    // Public API: modes validated, selected/default responses and all three histories separated.
    const response = await server.inject({ url: `/api/users/${a}/ratings` });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(Object.keys(response.json().ratings).sort(), [...GAME_MODE_IDS].sort());
    for (const mode of GAME_MODE_IDS) {
      assert.equal(
        (await server.inject({ url: `/api/users/${a}/rating?gameMode=${mode}` })).json().rating,
        all.ratings[mode].rating,
      );
      const history = (
        await server.inject({ url: `/api/users/${a}/rating/history?gameMode=${mode}` })
      ).json();
      assert.equal(history.items.length, 1);
      assert.equal(history.items[0].gameMode, mode);
    }
    for (const path of ["rating", "rating/history"])
      assert.equal(
        (await server.inject({ url: `/api/users/${a}/${path}?gameMode=STANDARD` })).statusCode,
        400,
      );
    assert.equal(
      (await server.inject({ url: "/api/leaderboard?gameMode=unknown" })).statusCode,
      400,
    );
    // Mandatory DB regression: same users, Standard gap 600 blocks; Draft gap 50 allows.
    for (const [userId, standard, draft] of [
      [a, 1900, 1450],
      [b, 1300, 1500],
    ] as const)
      for (const [gameMode, rating] of [
        ["standard", standard],
        ["draft", draft],
      ] as const)
        await db.rating.update({
          where: { userId_gameMode: { userId, gameMode } },
          data: { rating },
        });
    const lifecycle = new MatchLifecycle(logger, new MatchService(new MatchRepository(db), logger));
    lifecycle.configureRatedLobbies(
      readMatchmakingConfig({ MATCHMAKING_MAX_RATING_RANGE: "400" }),
      (ids, mode) => ratings.getPlayerRatings(ids, mode),
    );
    const rooms: GameRoom[] = [];
    try {
      for (const gameMode of ["standard", "draft"] as const) {
        const room = await lifecycle.createRoom({ gameMode, matchType: "RATED" }, randomUUID(), a);
        rooms.push(room);
        matches.push(room.matchId!);
        room.seats = { P1: "first", P2: "second" };
        room.seatIdentities = {
          P1: { userId: a, username: "A", displayName: null },
          P2: { userId: b, username: "B", displayName: null },
        };
        room.state = {
          ...room.state,
          seats: { P1: true, P2: true },
          playersReady: { P1: true, P2: true },
        };
      }
      await lifecycle.refreshRatedLobbies(rooms);
      assert.equal(rooms[0].ratedCompatibility?.difference, 600);
      assert.equal(rooms[1].ratedCompatibility?.difference, 50);
      assert.equal((await lifecycle.applyAction(rooms[0], { type: "startGame" }, "P1")).ok, false);
      assert.equal(await lifecycle.validateStart(rooms[1]), null);
      assert.deepEqual(rooms[1].ratedCompatibility?.ratings, { P1: 1450, P2: 1500 });
      await db.rating.update({ where: { userId_gameMode: { userId: b, gameMode: "draft" } }, data: { rating: 1850 } });
      assert.equal(await lifecycle.validateStart(rooms[1]), null, "exact 400-point boundary is allowed");
      await db.rating.update({ where: { userId_gameMode: { userId: b, gameMode: "draft" } }, data: { rating: 1850.0001 } });
      assert.equal((await lifecycle.validateStart(rooms[1]))?.code, "RATED_RATING_DIFFERENCE_TOO_LARGE", "fractional gap uses full precision");
      // Discovery cannot authorize a later start after ratings become incompatible.
      await db.rating.update({
        where: { userId_gameMode: { userId: b, gameMode: "draft" } },
        data: { rating: 1950 },
      });
      assert.equal(
        (await lifecycle.validateStart(rooms[1]))?.code,
        "RATED_RATING_DIFFERENCE_TOO_LARGE",
      );
      assert.equal(
        await db.ratingHistory.count({
          where: { matchId: { in: rooms.map((room) => room.matchId!) } },
        }),
        0,
      );
    } finally {
      await lifecycle.close();
      rooms.forEach((room) => deleteGameRoom(room.id));
    }
    console.log(
      "Per-mode PostgreSQL: defaults, all Rated/Casual modes, independent full state/RD, history, idempotence, cross-mode concurrency, rank/qualification, metrics and public APIs passed",
    );
  } finally {
    await server.close();
    await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await Promise.all([db.$disconnect(), other.$disconnect()]);
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
