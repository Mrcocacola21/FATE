import assert from "node:assert/strict";
import { assertDocumentedResponse } from "./assertDocumentedResponse";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Prisma } from "@prisma/client";
import { AuthError } from "../auth/authErrors";
import { DatabaseConfigurationError } from "../db/client";
import type { StatisticsResultRow } from "../repositories/statisticsRepository";
import { statisticsRoutes } from "../routes/statisticsRoutes";
import { PlayerStatisticsService } from "../services/playerStatisticsService";
import {
  calculateStreaks,
  calculateSummary,
} from "../statistics/playerStatistics";

import { testStatisticsCalculations } from "./unitCases/statistics";

async function run() {
  const rows = testStatisticsCalculations();
  const a = randomUUID(),
    empty = randomUUID();
  let reads = 0;
  const warnings: object[] = [];
  const legacy: StatisticsResultRow[] = [
    { ...rows[0], outcome: null },
    { ...rows[0], match: { ...rows[0].match, finishedAt: null } },
  ];
  const service = new PlayerStatisticsService(
    {
      userExists: async (id) => (id === a || id === empty ? { id } : null),
      findFinishedResults: async (id) => {
        reads++;
        return id === a ? [...rows, ...legacy] : [];
      },
    },
    { warn: (data) => warnings.push(data) },
  );
  await assert.rejects(
    service.getPlayerStatistics(randomUUID()),
    (error: unknown) => error instanceof AuthError && error.code === "USER_NOT_FOUND",
  );
  assert.equal(reads, 0);
  const stats = await service.getPlayerStatistics(a);
  assert.equal(stats.overall.gamesPlayed, 5);
  assert.deepEqual(warnings, [
    { event: "statistics:invalid_history", userId: a, excludedMatches: 2 },
  ]);
  const zero = await service.getPlayerStatistics(empty);
  assert.deepEqual(zero.overall, { ...calculateSummary([]), ...calculateStreaks([]) });
  assert.deepEqual(zero.byGameMode, []);
  assert.deepEqual(Object.keys(stats).sort(), ["byGameMode", "overall", "userId"]);

  const server = Fastify();
  await server.register(statisticsRoutes, { prefix: "/api", playerStatistics: service });
  try {
    const response = await server.inject({ url: `/api/users/${a}/statistics` });
    assert.equal(response.statusCode, 200); // Public access without credentials.
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.json(), stats);
    assertDocumentedResponse("PlayerStatistics", response.json());
    assertDocumentedResponse("PlayerStatistics", zero);
    assert.doesNotMatch(
      response.body,
      /email|passwordHash|token|resultData|initialConfig|GameState|MatchAction|MatchSnapshot|rating|byHero|byFigureSet/,
    );
    for (const id of ["bad-id", "123", "null"]) {
      const invalid = await server.inject({ url: `/api/users/${id}/statistics` });
      assert.equal(invalid.statusCode, 400);
      assert.equal(invalid.json().error.code, "VALIDATION_ERROR");
    }
    const missing = await server.inject({ url: `/api/users/${randomUUID()}/statistics` });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "USER_NOT_FOUND");
    assert.deepEqual((await server.inject({ url: `/api/users/${empty}/statistics` })).json(), zero);
  } finally {
    await server.close();
  }

  for (const [error, status, code] of [
    [new Error("secret database credentials"), 500, "INTERNAL_SERVER_ERROR"],
    [new DatabaseConfigurationError(), 503, "DATABASE_UNAVAILABLE"],
    [
      new Prisma.PrismaClientKnownRequestError("private diagnostic", {
        code: "P1001",
        clientVersion: "test",
      }),
      503,
      "DATABASE_UNAVAILABLE",
    ],
  ] as const) {
    const unavailable = Fastify();
    await unavailable.register(statisticsRoutes, {
      playerStatistics: {
        getPlayerStatistics: async () => {
          throw error;
        },
      },
    });
    try {
      const response = await unavailable.inject({ url: `/users/${a}/statistics` });
      assert.equal(response.statusCode, status);
      assert.equal(response.json().error.code, code);
      assert.doesNotMatch(response.body, /secret|credentials|private diagnostic/);
    } finally {
      await unavailable.close();
    }
  }
  console.log(
    "player statistics aggregates, partial samples, streaks, modes, legacy diagnostics, public API, validation and privacy tests passed",
  );
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
