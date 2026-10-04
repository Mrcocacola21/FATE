import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  configureTestDatabase();

  const [{ PrismaClient }, { MatchRepository, UserRepository }] = await Promise.all([
    import("@prisma/client"),
    import("../repositories"),
  ]);
  const database = new PrismaClient();
  const users = new UserRepository(database);
  const matches = new MatchRepository(database);
  const suffix = randomUUID();
  const createdUserIds: string[] = [];
  let matchId: string | undefined;

  try {
    const firstUser = await users.create({
      email: `p1-${suffix}@example.test`,
      profile: { username: `p1-${suffix}`, displayName: "Player One" },
    });
    createdUserIds.push(firstUser.id);
    const secondUser = await users.create({
      email: `p2-${suffix}@example.test`,
      profile: { username: `p2-${suffix}`, displayName: "Player Two" },
    });
    createdUserIds.push(secondUser.id);

    assert.equal(
      (await database.profile.findUnique({ where: { userId: firstUser.id } }))?.userId,
      firstUser.id,
    );
    await assert.rejects(() => users.create({ email: firstUser.email }));

    const match = await matches.create({
      roomId: `integration-${suffix}`,
      gameMode: "standard",
      seed: 42,
      createdById: firstUser.id,
    });
    matchId = match.id;

    await database.matchParticipant.createMany({
      data: [
        {
          matchId,
          userId: firstUser.id,
          seat: "P1",
          displayNameSnapshot: "Player One",
        },
        {
          matchId,
          userId: secondUser.id,
          seat: "P2",
          displayNameSnapshot: "Player Two",
        },
      ],
    });
    await assert.rejects(() =>
      database.matchParticipant.create({
        data: { matchId: match.id, seat: "P1", displayNameSnapshot: "Duplicate" },
      }),
    );

    await database.matchAction.createMany({
      data: [
        { matchId, revision: 2, actorSeat: "P2", actionType: "endTurn", actionPayload: {} },
        { matchId, revision: 1, actorSeat: "P1", actionType: "move", actionPayload: {} },
      ],
    });
    const revisions = await database.matchAction.findMany({
      where: { matchId },
      orderBy: { revision: "asc" },
      select: { revision: true },
    });
    assert.deepEqual(revisions, [{ revision: 1 }, { revision: 2 }]);
    await assert.rejects(() =>
      database.matchAction.create({
        data: { matchId: match.id, revision: 1, actionType: "duplicate", actionPayload: {} },
      }),
    );

    const snapshot = await database.matchSnapshot.create({
      data: { matchId, revision: 2, state: { phase: "battle" }, rngState: { seed: 42 } },
    });
    assert.equal(
      (
        await database.matchSnapshot.findUnique({
          where: { matchId_revision: { matchId, revision: 2 } },
        })
      )?.id,
      snapshot.id,
    );

    const rating = await database.rating.create({
      data: { userId: firstUser.id, gameMode: "standard" },
    });
    assert.deepEqual(
      {
        rating: rating.rating,
        ratingDeviation: rating.ratingDeviation,
        volatility: rating.volatility,
        ratedGames: rating.ratedGames,
      },
      { rating: 1500, ratingDeviation: 350, volatility: 0.06, ratedGames: 0 },
    );
    await assert.rejects(() =>
      database.rating.create({ data: { userId: firstUser.id, gameMode: "standard" } }),
    );

    const history = await database.ratingHistory.create({
      data: {
        userId: firstUser.id,
        matchId,
        ratingBefore: 1500,
        ratingAfter: 1512,
        ratingDeviationBefore: 350,
        ratingDeviationAfter: 340,
        volatilityBefore: 0.06,
        volatilityAfter: 0.06,
      },
    });
    assert.equal(history.matchId, matchId);
  } finally {
    if (matchId) {
      await database.ratingHistory.deleteMany({ where: { matchId } });
      await database.match.deleteMany({ where: { id: matchId } });
    }
    if (createdUserIds.length > 0) {
      await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await database.$disconnect();
  }

  console.log("database integration tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
