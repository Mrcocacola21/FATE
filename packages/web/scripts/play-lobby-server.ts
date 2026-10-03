// Local browser fixture: real transport, queue and persistence lifecycle; no database.
import { buildServer } from "../../server/src/index";
import {
  MemoryMatchPersistence,
  testAccessToken,
  testIdentityService,
  testUserIds,
} from "../../server/src/tests/matchTestSupport";
import { INITIAL_RATING } from "../../server/src/rating/constants";
import { randomUUID } from "node:crypto";

async function main() {
  let games = 3,
    firstRating = 1800,
    secondRating = 1500;
  const first = testAccessToken("P1", "Max"),
    second = testAccessToken("P2", "Polina");
  const queuedFirstId = randomUUID(),
    queuedSecondId = randomUUID();
  const queuedFirst = testAccessToken("P1", "Aster", queuedFirstId),
    queuedSecond = testAccessToken("P2", "Bram", queuedSecondId);
  const server = await buildServer({
    matchPersistence: new MemoryMatchPersistence(),
    connectionIdentity: testIdentityService(),
    matchmakingActiveMatch: async () => false,
    ratings: {
      getPlayerRating: async (id) => ({
        userId: id,
        ...INITIAL_RATING,
        rating: id === testUserIds.P1 ? firstRating : secondRating,
        ratedGames: games,
      }),
      getRatingHistory: async () => ({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
    },
  });
  server.get("/fixture/credentials", async () => ({
    first,
    second,
    userId: testUserIds.P1,
    secondId: testUserIds.P2,
    queuedFirst,
    queuedSecond,
    queuedFirstId,
    queuedSecondId,
  }));
  server.post<{ Body: { ratedGames?: number; first?: number; second?: number } }>(
    "/fixture/ratings",
    async (request) => {
      games = request.body.ratedGames ?? games;
      firstRating = request.body.first ?? firstRating;
      secondRating = request.body.second ?? secondRating;
      return { ok: true };
    },
  );
  await server.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
  process.once("SIGTERM", () => {
    void server.close();
  });
  process.once("SIGINT", () => {
    void server.close();
  });
}
void main();
