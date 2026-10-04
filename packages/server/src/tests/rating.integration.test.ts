import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type MatchOutcome, type Prisma } from "@prisma/client";
import { buildServer } from "../index";
import { getRankMetadata } from "../rating/rankTiers";
import { INITIAL_RATING } from "../rating/constants";
import { calculateRating } from "../rating/glicko2";
import { RatingRepository } from "../repositories/ratingRepository";
import { MatchRepository } from "../repositories/matchRepository";
import { RatingService } from "../services/ratingService";
import { MatchService } from "../services/matchService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { extractPersistentMatchResult, type FinishedMatchInput } from "../persistence/matchResult";
import { storeTestHooks } from "../store";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const url = configureTestDatabase();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [{ level: "query", emit: "event" }],
  });
  const otherDb = new PrismaClient({ datasources: { db: { url } } });
  const queries: string[] = [];
  db.$on("query", (event) => queries.push(event.query));
  const logs: { event?: string; retryCount?: number }[] = [];
  const logger = {
    info: (data: object) => logs.push(data),
    error: (data: object) => logs.push(data),
  };
  const ratings = new RatingService(new RatingRepository(db), logger);
  const otherRatings = new RatingService(new RatingRepository(otherDb), logger);
  const service = new MatchService(new MatchRepository(db), logger);
  const server = await buildServer({ matchPersistence: service, ratings });
  const users: string[] = [],
    matches: string[] = [];
  const prefix = `rating-${randomUUID()}`;
  let lifecycle: MatchLifecycle | undefined;
  const dropTrigger = async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase15_rating_failure ON "Match"');
    await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS phase15_rating_failure()");
  };
  try {
    for (let i = 0; i < 18; i++)
      users.push((await db.user.create({ data: { email: `${prefix}-${i}@example.test` } })).id);
    const create = async (
      a: string | null,
      b: string | null,
      options: {
        fields?: Partial<Prisma.MatchUncheckedCreateInput>;
        outcomes?: [MatchOutcome | null, MatchOutcome | null];
      } = {},
    ) => {
      const match = await db.match.create({
        data: {
          status: "FINISHED",
          isRated: true,
          gameMode: "standard",
          seed: 13,
          startedAt: new Date("2026-10-03T08:00:00Z"),
          finishedAt: new Date("2026-10-03T08:03:00Z"),
          winnerSeat: "P1",
          loserSeat: "P2",
          winnerUserId: a,
          loserUserId: b,
          finishReason: "allEnemyUnitsDefeated",
          finalRevision: 3,
          turnCount: 2,
          ...options.fields,
          participants: {
            create: [
              {
                seat: "P1",
                userId: a,
                displayNameSnapshot: "P1",
                outcome: options.outcomes ? options.outcomes[0] : "WIN",
              },
              {
                seat: "P2",
                userId: b,
                displayNameSnapshot: "P2",
                outcome: options.outcomes ? options.outcomes[1] : "LOSS",
              },
            ],
          },
        },
      });
      matches.push(match.id);
      return match;
    };
    const state = async (a: string, b: string, id: string) => ({
      ratings: await db.rating.findMany({
        where: { userId: { in: [a, b] } },
        orderBy: { userId: "asc" },
      }),
      histories: await db.ratingHistory.findMany({
        where: { matchId: id },
        orderBy: { userId: "asc" },
      }),
      match: await db.match.findUniqueOrThrow({ where: { id } }),
    });
    const [a, b, c] = users;
    const first = await create(a, b);
    assert.equal(await db.rating.count({ where: { userId: { in: [a, b] } } }), 0);
    assert.equal((await ratings.processRatedMatch(first.id)).outcome, "processed");
    const firstState = await state(a, b, first.id);
    assert.equal(firstState.ratings.length, 2);
    assert.equal(firstState.histories.length, 2);
    assert(firstState.match.ratingProcessedAt);
    const winner = firstState.ratings.find((r) => r.userId === a)!;
    const loser = firstState.ratings.find((r) => r.userId === b)!;
    assert(winner.rating > 1500 && loser.rating < 1500);
    assert.equal(winner.ratedGames, 1);
    assert.equal(loser.ratedGames, 1);
    for (const [player, score] of [
      [winner, 1],
      [loser, 0],
    ] as const) {
      const expected = calculateRating(INITIAL_RATING, [{ opponent: INITIAL_RATING, score }]);
      for (const key of ["rating", "ratingDeviation", "volatility"] as const)
        assert(
          Math.abs(player[key] - expected[key]) < 1e-10,
          "both calculations use original opponent",
        );
    }
    for (let i = 0; i < 3; i++)
      assert.equal((await ratings.processRatedMatch(first.id)).alreadyProcessed, true);
    assert.deepEqual(await state(a, b, first.id), firstState);

    // Duplicate deliveries from separate clients/pools initialize exactly once.
    const duplicate = await create(users[3], users[4]);
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? ratings : otherRatings).processRatedMatch(duplicate.id),
      ),
    );
    assert.equal(outcomes.filter((r) => r.outcome === "processed").length, 1);
    assert.equal(outcomes.filter((r) => r.alreadyProcessed).length, 7);
    const duplicateState = await state(users[3], users[4], duplicate.id);
    assert.equal(duplicateState.histories.length, 2);
    assert(duplicateState.ratings.every((r) => r.ratedGames === 1));

    // Distinct matches sharing an established player cannot overwrite an update.
    const shared1 = await create(a, c);
    const shared2 = await create(a, users[5]);
    await Promise.all([
      ratings.processRatedMatch(shared1.id),
      otherRatings.processRatedMatch(shared2.id),
    ]);
    assert.equal(
      (
        await db.rating.findUniqueOrThrow({
          where: { userId_gameMode: { userId: a, gameMode: "standard" } },
        })
      ).ratedGames,
      3,
    );
    for (const id of [c, users[5]])
      assert.equal(
        (
          await db.rating.findUniqueOrThrow({
            where: { userId_gameMode: { userId: id, gameMode: "standard" } },
          })
        ).ratedGames,
        1,
      );
    // Also race lazy initialization of the SAME player across different matches.
    const lazy1 = await create(users[6], users[7]);
    const lazy2 = await create(users[6], users[8]);
    await Promise.all([
      ratings.processRatedMatch(lazy1.id),
      otherRatings.processRatedMatch(lazy2.id),
    ]);
    assert.equal(
      (
        await db.rating.findUniqueOrThrow({
          where: { userId_gameMode: { userId: users[6], gameMode: "standard" } },
        })
      ).ratedGames,
      2,
    );
    for (const id of [a, users[6]]) {
      const chain = await db.ratingHistory.findMany({
        where: { userId: id },
        orderBy: { ratedGameNumber: "asc" },
      });
      const current = await db.rating.findUniqueOrThrow({
        where: { userId_gameMode: { userId: id, gameMode: "standard" } },
      });
      for (let i = 1; i < chain.length; i++) {
        assert.equal(chain[i].ratedGameNumber, chain[i - 1].ratedGameNumber! + 1);
        for (const [before, after] of [
          ["ratingBefore", "ratingAfter"],
          ["ratingDeviationBefore", "ratingDeviationAfter"],
          ["volatilityBefore", "volatilityAfter"],
        ] as const)
          assert.equal(chain[i][before], chain[i - 1][after]);
      }
      const latest = chain[chain.length - 1];
      assert.equal(latest.ratingAfter, current.rating);
      assert.equal(latest.ratingDeviationAfter, current.ratingDeviation);
      assert.equal(latest.volatilityAfter, current.volatility);
      assert(chain.every((h) => matches.includes(h.matchId!) && h.opponentUserId && h.result));
    }
    assert(
      logs.some((entry) => entry.event === "rating:retry"),
      "real PostgreSQL conflicts exercise retries",
    );

    // Failure at the LAST write rolls back both ratings and both histories.
    const fault = await create(users[9], users[10]);
    const beforeFault = await state(users[9], users[10], fault.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION phase15_rating_failure() RETURNS trigger AS $$
      BEGIN IF NEW."id" = '${fault.id}'::uuid AND NEW."ratingProcessedAt" IS NOT NULL
      THEN RAISE EXCEPTION 'phase15 simulated final-write failure'; END IF; RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      'CREATE TRIGGER phase15_rating_failure BEFORE UPDATE ON "Match" FOR EACH ROW EXECUTE FUNCTION phase15_rating_failure()',
    );
    await assert.rejects(ratings.processRatedMatch(fault.id));
    assert.deepEqual(await state(users[9], users[10], fault.id), beforeFault);
    await dropTrigger();
    // Recovery with another process/client uses persisted result, without runtime.
    assert.equal((await otherRatings.processRatedMatch(fault.id)).outcome, "processed");

    // A corrupt persisted numeric state cannot cause any one-sided update.
    const numeric = await create(users[9], users[10]);
    const validVolatility = (
      await db.rating.findUniqueOrThrow({
        where: { userId_gameMode: { userId: users[9], gameMode: "standard" } },
      })
    ).volatility;
    await db.$executeRaw`UPDATE "Rating" SET "volatility" = 'NaN'::double precision WHERE "userId" = ${users[9]}::uuid`;
    // Read the sentinel as text: Prisma itself cannot decode PostgreSQL NaN.
    const numericRatings = () => db.$queryRaw`SELECT "userId", "rating", "ratingDeviation",
      "volatility"::text AS "volatility", "ratedGames", "updatedAt" FROM "Rating"
      WHERE "userId" IN (${users[9]}::uuid, ${users[10]}::uuid) ORDER BY "userId"`;
    const beforeNumeric = await numericRatings();
    await assert.rejects(ratings.processRatedMatch(numeric.id), /RATING_INVALID_STATE/);
    assert.deepEqual(await numericRatings(), beforeNumeric);
    assert.equal(await db.ratingHistory.count({ where: { matchId: numeric.id } }), 0);
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: numeric.id } })).ratingProcessedAt,
      null,
    );
    await db.rating.update({
      where: { userId_gameMode: { userId: users[9], gameMode: "standard" } },
      data: { volatility: validVolatility },
    });

    // Exclusions must not materialize even default rows or change ratedGames.
    for (const fields of [
      { isRated: false },
      { status: "CANCELLED" as const },
      { status: "IN_PROGRESS" as const },
      { status: "WAITING" as const },
      ...["test", "debug", "sandbox", "heartbreak"].map((gameMode) => ({ gameMode })),
      { finishReason: "debug" },
    ]) {
      const excluded = await create(users[11], users[12], { fields });
      const before = await state(users[11], users[12], excluded.id);
      assert.equal((await ratings.processRatedMatch(excluded.id)).outcome, "ineligible");
      assert.deepEqual(await state(users[11], users[12], excluded.id), before);
    }
    const guest = await create(null, users[11]);
    assert.equal((await ratings.processRatedMatch(guest.id)).outcome, "ineligible");
    assert.equal(await db.rating.count({ where: { userId: { in: [users[11], users[12]] } } }), 0);
    // The pre-existing unique(matchId,userId) constraint additionally rejects self-play.
    await assert.rejects(
      create(users[11], users[11]),
      (error: unknown) => (error as { code?: string }).code === "P2002",
    );
    for (const outcomes of [
      ["WIN", "WIN"],
      ["LOSS", "LOSS"],
      [null, null],
      ["DRAW", "LOSS"],
    ] as [MatchOutcome | null, MatchOutcome | null][]) {
      const invalid = await create(users[11], users[12], { outcomes });
      const before = await state(users[11], users[12], invalid.id);
      await assert.rejects(ratings.processRatedMatch(invalid.id), /RATING_INVALID_RESULT/);
      assert.deepEqual(await state(users[11], users[12], invalid.id), before);
    }
    const wrongWinner = await create(users[11], users[12], { fields: { winnerUserId: users[12] } });
    await assert.rejects(ratings.processRatedMatch(wrongWinner.id), /RATING_INVALID_RESULT/);
    await assert.rejects(ratings.processRatedMatch(randomUUID()), /RATING_MATCH_NOT_FOUND/);
    const draw = await create(users[11], users[12], {
      outcomes: ["DRAW", "DRAW"],
      fields: {
        winnerSeat: null,
        loserSeat: null,
        winnerUserId: null,
        loserUserId: null,
        finishReason: "chessMutualKingDefeat",
      },
    });
    await ratings.processRatedMatch(draw.id);
    for (const id of [users[11], users[12]])
      assert.equal((await ratings.getPlayerRating(id, "standard")).rating, 1500);
    assert(
      (await db.ratingHistory.findMany({ where: { matchId: draw.id } })).every(
        (h) => h.result === "DRAW",
      ),
    );

    // Partial/corrupt prior history is a domain error, never a silent double award.
    const brokenHistory = duplicateState.histories[0];
    await db.ratingHistory.delete({ where: { id: brokenHistory.id } });
    await assert.rejects(ratings.processRatedMatch(duplicate.id), /RATING_INCONSISTENT_HISTORY/);
    assert.deepEqual(
      (await state(users[3], users[4], duplicate.id)).ratings,
      duplicateState.ratings,
    );

    // Finalization crash gap: FINISHED commits, rating fails; repeating completion repairs it.
    const ratedInput = {
      roomId: `${prefix}-trusted-rated`,
      gameMode: "standard",
      seed: 13,
      isRated: true,
    };
    const final = await service.createWaitingMatch(ratedInput);
    matches.push(final.id);
    assert.equal((await service.createWaitingMatch(ratedInput)).id, final.id);
    await assert.rejects(
      service.createWaitingMatch({ ...ratedInput, isRated: false }),
      /different or started match/,
    );
    await service.markStarted(final.id, {
      gameMode: "standard",
      startedAt: new Date("2026-10-03T08:00:00Z"),
      participants: (["P1", "P2"] as const).map((seat, i) => ({
        seat,
        userId: users[13 + i],
        displayNameSnapshot: seat,
      })),
    });
    const result: FinishedMatchInput = {
      finishedAt: new Date("2026-10-03T08:03:00Z"),
      finalRevision: 3,
      winnerSeat: "P1",
      loserSeat: "P2",
      winnerUserId: users[13],
      loserUserId: users[14],
      finishReason: "allEnemyUnitsDefeated",
      turnCount: 2,
      participants: (["P1", "P2"] as const).map((seat, i) => ({
        seat,
        userId: users[13 + i],
        outcome: i ? "LOSS" : "WIN",
        resultData: { version: 1, remainingUnits: i ? 0 : 1, remainingHealth: i ? 0 : 5 },
      })),
    };
    const failingService = new MatchService(new MatchRepository(db), logger, undefined, undefined, {
      processRatedMatch: async () => {
        throw new Error("simulated crash before rating transaction");
      },
    });
    await assert.rejects(failingService.finalizeMatch(final.id, result));
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: final.id } })).status,
      "FINISHED",
    );
    assert.equal(await db.ratingHistory.count({ where: { matchId: final.id } }), 0);
    await service.finalizeMatch(final.id, result);
    assert.equal(await db.ratingHistory.count({ where: { matchId: final.id } }), 2);
    await service.finalizeMatch(final.id, result);
    assert.equal((await ratings.getPlayerRating(users[13], "standard")).ratedGames, 1);

    // Real normal-room action journal, finalization, rating failure/retry, and drain.
    let failRatingOnce = true;
    const runtimeService = new MatchService(new MatchRepository(db), logger, undefined, undefined, {
      processRatedMatch: async (id) => {
        if (failRatingOnce) {
          failRatingOnce = false;
          throw new Error("temporary rating failure");
        }
        return ratings.processRatedMatch(id);
      },
    });
    lifecycle = new MatchLifecycle(logger, runtimeService);
    const room = await lifecycle.createRoom(
      { seed: 13, matchType: "RATED" },
      randomUUID(),
      users[15],
    );
    matches.push(room.matchId!);
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: room.matchId! } })).isRated,
      true,
    );
    room.seats = { P1: "one", P2: "two" };
    room.seatIdentities = {
      P1: { userId: users[15], username: "Alice", displayName: null },
      P2: { userId: users[16], username: "Bob", displayName: null },
    };
    await lifecycle.syncParticipant(room, "P1", "Alice");
    await lifecycle.syncParticipant(room, "P2", "Bob");
    room.state = {
      ...room.state,
      seats: { P1: true, P2: true },
      playersReady: { P1: true, P2: true },
    };
    assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
    room.state = {
      ...room.state,
      phase: "battle",
      pendingRoll: null,
      ruleDeclaration: {
        ...room.state.ruleDeclaration,
        selectedRuleId: "normal_rule",
        setupComplete: true,
      },
      units: Object.fromEntries(
        Object.entries(room.state.units).map(([id, unit]) => [
          id,
          unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
        ]),
      ),
    };
    assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
    await lifecycle.drainActions(room.matchId!);
    assert.equal(
      (await db.match.findUniqueOrThrow({ where: { id: room.matchId! } })).status,
      "FINISHED",
    );
    assert.equal(await db.ratingHistory.count({ where: { matchId: room.matchId! } }), 0);
    await lifecycle.retryPending();
    assert(await lifecycle.drainActions(room.matchId!));
    assert.equal(await db.ratingHistory.count({ where: { matchId: room.matchId! } }), 2);
    assert.equal(
      (
        await db.matchAction.findFirstOrThrow({
          where: { matchId: room.matchId! },
          orderBy: { revision: "desc" },
        })
      ).revision,
      room.revision,
    );
    assert.equal(
      (
        await db.matchSnapshot.findFirstOrThrow({
          where: { matchId: room.matchId! },
          orderBy: { revision: "desc" },
        })
      ).revision,
      room.revision,
    );
    await service.finalizeMatch(room.matchId!, extractPersistentMatchResult(room, new Date()));
    assert.equal((await ratings.getPlayerRating(users[15], "standard")).ratedGames, 1);
    const testRoom = await lifecycle.createRoom({ roomMode: "test", seed: 13 }, randomUUID(), a);
    assert.equal(testRoom.matchId, null);
    await lifecycle.syncParticipant(testRoom, "P1", "Alice");
    await lifecycle.syncGameMode(testRoom);
    lifecycle.recordAcceptedAction(testRoom);
    await lifecycle.removeRoom(testRoom);
    assert.equal(await db.match.findUnique({ where: { roomId: testRoom.id } }), null);

    // Public reads synthesize defaults without INSERT and leave rating/history untouched.
    const snapshot = await db.rating.findMany({
      where: { userId: { in: users } },
      orderBy: { userId: "asc" },
    });
    const historySnapshot = await db.ratingHistory.findMany({
      where: { userId: { in: users } },
      orderBy: { id: "asc" },
    });
    queries.length = 0;
    const get = await server.inject({ url: `/api/users/${users[17]}/rating` });
    assert.equal(get.statusCode, 200, get.body);
    assert.deepEqual(get.json(), {
      userId: users[17],
      gameMode: "standard",
      ...INITIAL_RATING,
      ratedGames: 0,
      ...getRankMetadata(INITIAL_RATING.rating),
    });
    assert.equal(get.headers["cache-control"], "no-store");
    const historyResponse = await server.inject({
      url: `/api/users/${a}/rating/history?page=1&limit=2`,
    });
    assert.equal(historyResponse.statusCode, 200);
    const history = historyResponse.json();
    assert.deepEqual(history.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
    assert.deepEqual(
      history.items.map((h: { ratedGameNumber: number }) => h.ratedGameNumber),
      [3, 2],
    );
    assert.equal(
      (await server.inject({ url: `/api/users/${a}/rating/history?page=2&limit=2` })).json()
        .items[0].ratedGameNumber,
      1,
    );
    assert.equal(
      (await server.inject({ url: `/api/users/${randomUUID()}/rating` })).statusCode,
      404,
    );
    assert.equal(
      (await server.inject({ url: `/api/users/${randomUUID()}/rating/history` })).statusCode,
      404,
    );
    await server.inject({ url: `/api/users/${a}/statistics` });
    await server.inject({ url: `/api/matches/${first.id}` });
    assert(
      !queries.some((q) => /^\s*(INSERT|UPDATE|DELETE)/.test(q)),
      "all GET operations stay read-only",
    );
    assert.deepEqual(
      await db.rating.findMany({ where: { userId: { in: users } }, orderBy: { userId: "asc" } }),
      snapshot,
    );
    assert.deepEqual(
      await db.ratingHistory.findMany({ where: { userId: { in: users } }, orderBy: { id: "asc" } }),
      historySnapshot,
    );
    assert.equal(
      await db.rating.findUnique({
        where: { userId_gameMode: { userId: users[17], gameMode: "standard" } },
      }),
      null,
    );
    assert.doesNotMatch(historyResponse.body, /email|password|token|session|initialConfig/);
    // Audit ownership still prevents deletion; Match deletion preserves both histories.
    await assert.rejects(
      db.user.delete({ where: { id: a } }),
      (error: unknown) => (error as { code?: string }).code === "P2003",
    );
    await db.match.delete({ where: { id: first.id } });
    const preserved = await db.ratingHistory.findMany({
      where: { id: { in: firstState.histories.map((h) => h.id) } },
    });
    assert.equal(preserved.length, 2);
    assert(preserved.every((h) => h.matchId === null));
    console.log(
      "rating PostgreSQL: reference pre-states, atomic rollback, duplicate delivery, shared-player races, lazy initialization, coherent history, exclusions, draw, crash recovery, lifecycle drain/retry, read-only API and audit constraints passed",
    );
  } finally {
    await dropTrigger();
    await lifecycle?.close();
    await server.close();
    await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await otherDb.$disconnect();
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
