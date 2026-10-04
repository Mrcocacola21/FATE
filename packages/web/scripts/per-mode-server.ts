// Loopback test DB only: real rating/lobby/leaderboard services for browser QA.
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../server/src/tests/testDatabase";
import { buildServer } from "../../server/src/index";
import { testAccessToken, testIdentityService } from "../../server/src/tests/matchTestSupport";
import { RatingRepository } from "../../server/src/repositories/ratingRepository";
import { RatingService } from "../../server/src/services/ratingService";
import { MatchRepository } from "../../server/src/repositories/matchRepository";
import { MatchService } from "../../server/src/services/matchService";
import { GAME_MODE_IDS } from "rules";
import { randomUUID } from "node:crypto";

async function main() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const ids = [randomUUID(), randomUUID()];
  const suffix = randomUUID().slice(0, 8);
  for (const [i, id] of ids.entries()) {
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        profile: { create: { username: `Modes${i}_${suffix}`, displayName: i ? "Polina" : "Max" } },
        ratings: {
          create: GAME_MODE_IDS.map((gameMode) => ({
            gameMode,
            rating:
              gameMode === "standard"
                ? i
                  ? 1300
                  : 1800
                : gameMode === "draft"
                  ? i
                    ? 950
                    : 900
                  : i
                    ? 2050
                    : 2010,
            ratedGames: gameMode === "standard" ? 10 : gameMode === "draft" ? 2 : 5,
            ratingDeviation: gameMode === "standard" ? 64 : gameMode === "draft" ? 180 : 82,
          })),
        },
      },
    });
  }
  const ratings = new RatingService(new RatingRepository(db), { info() {}, error() {} });
  const server = await buildServer({
    ratings,
    matchPersistence: new MatchService(new MatchRepository(db)),
    connectionIdentity: testIdentityService(),
    matchmakingActiveMatch: async () => false,
  });
  const profile = await db.profile.findUniqueOrThrow({ where: { userId: ids[0] } });
  server.get("/fixture/credentials", async () => ({
    first: testAccessToken("P1", "Max", ids[0]),
    second: testAccessToken("P2", "Polina", ids[1]),
    ids,
    profile: {
      ...profile,
      id: ids[0],
      email: "fixture@example.test",
      createdAt: profile.createdAt.toISOString(),
    },
  }));
  server.post("/fixture/draft-ratings", async () => {
    for (const [i, userId] of ids.entries())
      await db.rating.update({
        where: { userId_gameMode: { userId, gameMode: "draft" } },
        data: { rating: i ? 1500 : 1450, ratedGames: 2 },
      });
    return { ok: true };
  });
  server.post("/fixture/finish-draft", async () => {
    const before = await db.rating.findMany({
      where: { userId: ids[0] },
      orderBy: { gameMode: "asc" },
    });
    const match = await db.match.create({
      data: {
        gameMode: "draft",
        isRated: true,
        status: "FINISHED",
        seed: 1,
        finishedAt: new Date(),
        finalRevision: 2,
        finishReason: "allEnemyUnitsDefeated",
        winnerUserId: ids[0],
        loserUserId: ids[1],
        winnerSeat: "P1",
        loserSeat: "P2",
        participants: {
          create: ids.map((userId, i) => ({
            userId,
            seat: i ? "P2" : "P1",
            displayNameSnapshot: i ? "Polina" : "Max",
            outcome: i ? "LOSS" : "WIN",
          })),
        },
      },
    });
    await ratings.processRatedMatch(match.id);
    return {
      before,
      after: await db.rating.findMany({ where: { userId: ids[0] }, orderBy: { gameMode: "asc" } }),
    };
  });
  await server.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
