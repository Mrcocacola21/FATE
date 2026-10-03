import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { INITIAL_RATING } from "../rating/constants";
import { calculateRating, Glicko2Error } from "../rating/glicko2";
import { eligibleRatingPlayers, type RatingMatch } from "../rating/eligibility";
import type { Glicko2OpponentResult } from "../rating/types";
import { RatingError } from "../rating/ratingError";
import { RatingService } from "../services/ratingService";
import { ratingRoutes } from "../routes/ratingRoutes";

export function officialExample() {
  return calculateRating(
    { rating: 1500, ratingDeviation: 200, volatility: 0.06 },
    [
      { opponent: { rating: 1400, ratingDeviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, ratingDeviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, ratingDeviation: 300, volatility: 0.06 }, score: 0 },
    ],
    { tau: 0.5 },
  );
}
const near = (actual: number, expected: number, tolerance: number) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} vs ${expected}`);

async function run() {
  const reference = officialExample();
  // The publication rounds intermediate values; full precision differs by ~0.0093.
  near(reference.rating, 1464.06, 0.02);
  near(reference.ratingDeviation, 151.52, 0.005);
  near(reference.volatility, 0.05999, 0.00001);
  // Full-precision regression values catch using old/approximate volatility.
  near(reference.rating, 1464.0506705393013, 0.00000001);
  near(reference.ratingDeviation, 151.51652412385727, 0.00000001);
  near(reference.volatility, 0.059995984286488495, 0.000000000001);
  const original = structuredClone(INITIAL_RATING);
  const win = calculateRating(original, [{ opponent: original, score: 1 }]);
  const loss = calculateRating(original, [{ opponent: original, score: 0 }]);
  const draw = calculateRating(original, [{ opponent: original, score: 0.5 }]);
  assert(win.rating > 1500 && loss.rating < 1500);
  near(win.rating - 1500, 1500 - loss.rating, 1e-10);
  near(draw.rating, 1500, 1e-10);
  assert(
    win.ratingDeviation < original.ratingDeviation &&
      draw.ratingDeviation < original.ratingDeviation,
  );
  for (const after of [win, loss, draw, reference]) {
    assert(after.ratingDeviation > 0 && after.volatility > 0);
    assert(Object.values(after).every(Number.isFinite));
  }
  assert.deepEqual(original, INITIAL_RATING);
  const established = { ...original, ratingDeviation: 30 };
  const low = calculateRating(established, [{ opponent: original, score: 1 }]);
  assert(win.rating - original.rating > low.rating - established.rating);
  const upset = calculateRating(
    { ...established, rating: 1000 },
    Array.from({ length: 10 }, () => ({
      opponent: { ...established, rating: 2000 },
      score: 1 as const,
    })),
  );
  assert(upset.volatility > established.volatility, "large delta exercises alternate bracket");
  const empty = calculateRating(original, []);
  assert.equal(empty.rating, original.rating);
  assert.equal(empty.volatility, original.volatility);
  assert(empty.ratingDeviation > original.ratingDeviation);
  for (const key of ["rating", "ratingDeviation", "volatility"] as const) {
    for (const value of [NaN, Infinity, -Infinity, ...(key === "rating" ? [] : [0, -1])]) {
      const bad = { ...original, [key]: value };
      assert.throws(() => calculateRating(bad, []), Glicko2Error);
      assert.throws(() => calculateRating(original, [{ opponent: bad, score: 1 }]), Glicko2Error);
    }
  }
  for (const score of [-1, 0.1, 2, NaN, Infinity])
    assert.throws(
      () => calculateRating(original, [{ opponent: original, score } as Glicko2OpponentResult]),
      Glicko2Error,
    );
  for (const tau of [0, -1, NaN, Infinity])
    assert.throws(() => calculateRating(original, [], { tau }), Glicko2Error);
  for (const epsilon of [0, -1, NaN, Infinity])
    assert.throws(() => calculateRating(original, [], { epsilon }), Glicko2Error);
  for (const maxIterations of [0, -1, 1.5, Infinity])
    assert.throws(() => calculateRating(original, [], { maxIterations }), Glicko2Error);
  assert.throws(
    () => calculateRating(original, [{ opponent: original, score: 1 }], { maxIterations: 1 }),
    /did not converge/,
  );
  assert.throws(
    () =>
      calculateRating(original, [
        { opponent: { ...original, rating: Number.MAX_VALUE }, score: 1 },
      ]),
    Glicko2Error,
  );

  const a = randomUUID(),
    b = randomUUID();
  const match: RatingMatch = {
    id: randomUUID(),
    isRated: true,
    ratingProcessedAt: null,
    status: "FINISHED",
    gameMode: "standard",
    finishedAt: new Date(),
    finalRevision: 3,
    winnerSeat: "P1",
    loserSeat: "P2",
    winnerUserId: a,
    loserUserId: b,
    finishReason: "allEnemyUnitsDefeated",
    participants: [
      { seat: "P1", userId: a, outcome: "WIN" },
      { seat: "P2", userId: b, outcome: "LOSS" },
    ],
  };
  assert.deepEqual(
    eligibleRatingPlayers(match)?.map((p) => p.score),
    [1, 0],
  );
  for (const status of ["WAITING", "IN_PROGRESS", "CANCELLED"] as const)
    assert.equal(eligibleRatingPlayers({ ...match, status }), null);
  assert.equal(eligibleRatingPlayers({ ...match, isRated: false }), null);
  for (const gameMode of ["test", "debug", "sandbox", "heartbreak"])
    assert.equal(eligibleRatingPlayers({ ...match, gameMode }), null);
  assert.equal(
    eligibleRatingPlayers({
      ...match,
      participants: [{ ...match.participants[0], userId: b }, match.participants[1]],
    }),
    null,
  );
  assert.equal(
    eligibleRatingPlayers({
      ...match,
      participants: [{ ...match.participants[0], userId: null }, match.participants[1]],
    }),
    null,
  );
  assert.equal(eligibleRatingPlayers({ ...match, participants: [match.participants[0]] }), null);
  for (const outcome of ["WIN", "LOSS", null] as const)
    assert.throws(
      () =>
        eligibleRatingPlayers({
          ...match,
          participants: match.participants.map((p) => ({ ...p, outcome })),
        }),
      /RATING_INVALID_RESULT/,
    );
  assert.throws(
    () => eligibleRatingPlayers({ ...match, winnerUserId: b }),
    /RATING_INVALID_RESULT/,
  );
  assert.throws(
    () => eligibleRatingPlayers({ ...match, finalRevision: null }),
    /RATING_INVALID_RESULT/,
  );
  assert.deepEqual(
    eligibleRatingPlayers({
      ...match,
      winnerSeat: null,
      loserSeat: null,
      winnerUserId: null,
      loserUserId: null,
      finishReason: "chessMutualKingDefeat",
      participants: match.participants.map((p) => ({ ...p, outcome: "DRAW" })),
    })?.map((p) => p.score),
    [0.5, 0.5],
  );

  let attempts = 0;
  const repository = {
    userExists: async () => ({ id: a }),
    getRating: async () => null,
    getHistory: async () => ({ total: 0, items: [] }),
    serializable: async <T>(): Promise<T> => {
      attempts++;
      throw new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: "6.19.0",
      });
    },
  };
  const logger = { info() {}, error() {} };
  const service = new RatingService(repository, logger);
  await assert.rejects(service.processRatedMatch(match.id), /RATING_TRANSACTION_CONFLICT/);
  assert.equal(attempts, 5);
  for (const sqlstate of ["40001", "40P01"]) {
    attempts = 0;
    repository.serializable = async () => {
      attempts++;
      throw new Prisma.PrismaClientKnownRequestError("raw conflict", {
        code: "P2010",
        clientVersion: "6.19.0",
        meta: { code: sqlstate },
      });
    };
    await assert.rejects(service.processRatedMatch(match.id), /RATING_TRANSACTION_CONFLICT/);
    assert.equal(attempts, 5);
  }
  for (const code of ["P2002", "P2010"]) {
    attempts = 0;
    repository.serializable = async () => {
      attempts++;
      throw new Prisma.PrismaClientKnownRequestError("integrity failure", {
        code,
        clientVersion: "6.19.0",
        meta: { code: "23505" },
      });
    };
    await assert.rejects(service.processRatedMatch(match.id));
    assert.equal(attempts, 1);
  }
  attempts = 0;
  repository.serializable = async () => {
    attempts++;
    throw new RatingError("RATING_INVALID_RESULT");
  };
  await assert.rejects(service.processRatedMatch(match.id), /RATING_INVALID_RESULT/);
  assert.equal(attempts, 1);
  const defaultRating = await service.getPlayerRating(a);
  assert.deepEqual(defaultRating, { userId: a, ...INITIAL_RATING, ratedGames: 0 });

  let reads = 0;
  const server = Fastify();
  await server.register(ratingRoutes, {
    prefix: "/api",
    ratings: {
      getPlayerRating: async (id) => {
        reads++;
        return service.getPlayerRating(id);
      },
      getRatingHistory: service.getRatingHistory.bind(service),
    },
  });
  try {
    const response = await server.inject({ url: `/api/users/${a}/rating` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), defaultRating);
    assert.equal(reads, 1);
    assert.equal((await server.inject({ url: "/api/users/invalid/rating" })).statusCode, 400);
    const history = await server.inject({ url: `/api/users/${a}/rating/history?page=2&limit=5` });
    assert.deepEqual(history.json(), {
      items: [],
      pagination: { page: 2, limit: 5, total: 0, totalPages: 0 },
    });
    for (const query of [
      "page=0",
      "limit=101",
      "limit=1.5",
      "tau=0.5",
      "page=21474837",
      "limit=-1",
    ])
      assert.equal(
        (await server.inject({ url: `/api/users/${a}/rating/history?${query}` })).statusCode,
        400,
      );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: `/api/users/${a}/rating`,
          payload: { winner: a },
        })
      ).statusCode,
      404,
    );
    assert.doesNotMatch(response.body, /email|password|token|session/);
    assert.equal(reads, 1, "invalid requests must not invoke service");
  } finally {
    await server.close();
  }
  console.log("Glicko-2 official example:", reference);
  console.log(
    "rating algorithm, numeric validation, convergence, eligibility, retry bounds and public API tests passed",
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
