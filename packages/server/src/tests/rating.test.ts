import assert from "node:assert/strict";
import { assertDocumentedResponse } from "./assertDocumentedResponse";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { INITIAL_RATING } from "../rating/constants";
import { eligibleRatingPlayers, type RatingMatch } from "../rating/eligibility";
import { RatingError } from "../rating/ratingError";
import { getRankMetadata } from "../rating/rankTiers";
import { RatingService } from "../services/ratingService";
import { ratingRoutes } from "../routes/ratingRoutes";

import { testGlicko2Calculations } from "./unitCases/glicko2";

async function run() {
  const reference = testGlicko2Calculations();
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
  const defaultRating = await service.getPlayerRating(a, "standard");
  assert.deepEqual(defaultRating, {
    userId: a,
    gameMode: "standard",
    ...INITIAL_RATING,
    ratedGames: 0,
    ...getRankMetadata(INITIAL_RATING.rating),
  });

  let reads = 0;
  const server = Fastify();
  await server.register(ratingRoutes, {
    prefix: "/api",
    ratings: {
      getPlayerRating: async (id, mode) => {
        reads++;
        return service.getPlayerRating(id, mode);
      },
      getRatingHistory: service.getRatingHistory.bind(service),
    },
  });
  try {
    const response = await server.inject({ url: `/api/users/${a}/rating` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), defaultRating);
    assertDocumentedResponse("PlayerModeRating", response.json());
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
