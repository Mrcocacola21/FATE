import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "./testDatabase";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";

async function run() {
  const url = configureTestDatabase();
  const schema = `modes_migration_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new PrismaClient({ datasources: { db: { url } } });
  const isolatedUrl = new URL(url);
  isolatedUrl.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } } });
  const migrationRoot = resolve(__dirname, "../../prisma/migrations");
  // This helper is deliberately restricted to our generated isolated test schema.
  const migrate = async (sql: string) =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      const statements = sql
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value && value !== "BEGIN" && value !== "COMMIT");
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of readdirSync(migrationRoot)
      .filter((folder) => folder.startsWith("2026") && folder < "20261004000000")
      .sort())
      await migrate(readFileSync(resolve(migrationRoot, folder, "migration.sql"), "utf8"));
    const first = randomUUID(),
      second = randomUUID(),
      matchId = randomUUID();
    for (const userId of [first, second]) {
      await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
      await db.$executeRaw`INSERT INTO "Rating" ("userId", "rating", "ratingDeviation", "volatility", "ratedGames", "updatedAt")
        VALUES (${userId}::uuid, 1830, 65, 0.045, 1, CURRENT_TIMESTAMP)`;
    }
    await db.match.create({
      data: {
        id: matchId,
        gameMode: "draft",
        isRated: true,
        status: "FINISHED",
        seed: 1,
        finishedAt: new Date(),
        ratingProcessedAt: new Date(),
        finalRevision: 2,
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
    for (const [userId, opponentId, result] of [
      [first, second, "WIN"],
      [second, first, "LOSS"],
    ] as const)
      await db.$executeRaw`INSERT INTO "RatingHistory" ("userId", "matchId", "opponentUserId", "result", "ratedGameNumber",
        "ratingBefore", "ratingAfter", "ratingDeviationBefore", "ratingDeviationAfter", "volatilityBefore", "volatilityAfter")
        VALUES (${userId}::uuid, ${matchId}::uuid, ${opponentId}::uuid, ${result}::"MatchOutcome", 1, 1500, 1830, 350, 65, 0.06, 0.045)`;
    const legacyState = await db.$queryRaw`SELECT * FROM "Rating" ORDER BY "userId"`;
    const legacyHistories = await db.$queryRaw<
      { id: string }[]
    >`SELECT * FROM "RatingHistory" ORDER BY "id"`;
    const match = await db.match.findUniqueOrThrow({ where: { id: matchId } });
    await migrate(
      readFileSync(resolve(migrationRoot, "20261004000000_per_mode_ratings/migration.sql"), "utf8"),
    );
    assert.deepEqual(
      await db.$queryRaw`SELECT * FROM "LegacyGlobalRating" ORDER BY "userId"`,
      legacyState,
    );
    assert.equal(await db.rating.count(), 0, "no triple-copy of 1830");
    const afterHistory = await db.ratingHistory.findMany({ orderBy: { id: "asc" } });
    assert.deepEqual(
      afterHistory.map(({ gameMode, ...record }) => {
        assert.equal(gameMode, null);
        return record;
      }),
      legacyHistories,
    );
    assert.deepEqual(await db.match.findUniqueOrThrow({ where: { id: matchId } }), match);
    const ratings = new RatingService(new RatingRepository(db), { info() {}, error() {} });
    for (const state of Object.values((await ratings.getAllPlayerRatings(first)).ratings)) {
      assert.equal(state.rating, 1500);
      assert.equal(state.ratingDeviation, 350);
      assert.equal(state.volatility, 0.06);
      assert.equal(state.ratedGames, 0);
    }
    assert.equal((await ratings.processRatedMatch(matchId)).outcome, "alreadyProcessed");
    assert.equal(await db.rating.count(), 0);
    assert.equal(await db.ratingHistory.count(), 2);
    for (const gameMode of ["standard", "draft", "classic"])
      await db.rating.create({ data: { userId: first, gameMode } });
    await assert.rejects(db.rating.create({ data: { userId: first, gameMode: "draft" } }));
    await assert.rejects(db.rating.create({ data: { userId: first, gameMode: "unknown" } }));
    // Period #1 can independently exist in each mode alongside legacy period #1.
    for (const gameMode of ["standard", "draft", "classic"])
      await db.ratingHistory.create({
        data: {
          userId: first,
          gameMode,
          ratedGameNumber: 1,
          ratingBefore: 1500,
          ratingAfter: 1510,
          ratingDeviationBefore: 350,
          ratingDeviationAfter: 200,
          volatilityBefore: 0.06,
          volatilityAfter: 0.06,
        },
      });
    await assert.rejects(
      db.ratingHistory.create({
        data: {
          userId: first,
          gameMode: "draft",
          ratedGameNumber: 1,
          ratingBefore: 1500,
          ratingAfter: 1510,
          ratingDeviationBefore: 350,
          ratingDeviationAfter: 200,
          volatilityBefore: 0.06,
          volatilityAfter: 0.06,
        },
      }),
    );
    console.log(
      "Legacy migration PostgreSQL: real previous schema/data preserved, fresh independent ladders, legacy history/markers, idempotent recovery and mode constraints passed",
    );
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
