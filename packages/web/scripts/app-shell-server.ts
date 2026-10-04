// Browser fixture: existing in-memory persistence/identity test doubles, real
// room lifecycle and WebSocket handlers. No database connection is required.
import {
  MemoryMatchPersistence,
  testIdentityService,
  testAccessToken,
  testUserIds,
} from "../../server/src/tests/matchTestSupport";
import { buildServer } from "../../server/src/index";
import { INITIAL_RATING } from "../../server/src/rating/constants";
import { getRankMetadata } from "../../server/src/rating/rankTiers";
import { randomUUID } from "node:crypto";

async function main() {
  const server = await buildServer({ matchPersistence: new MemoryMatchPersistence(), connectionIdentity: testIdentityService(),
    matchmakingActiveMatch: async () => false,
    ratings: { getPlayerRating: async userId => ({ userId, ...INITIAL_RATING, ratedGames: 0, ...getRankMetadata(INITIAL_RATING.rating) }),
      getRatingHistory: async () => ({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }) } });
  const accessToken = testAccessToken("P1", "Commander");
  const p2AccessToken = testAccessToken("P2", "Opponent");
  const extraUserId = randomUUID();
  const extraAccessToken = testAccessToken("P1", "Commander", extraUserId);
  const extraP2AccessToken = testAccessToken("P2", "Opponent", randomUUID());
  server.get("/shell-test/credentials", async () => ({ accessToken, p2AccessToken, userId: testUserIds.P1, extraUserId, extraAccessToken, extraP2AccessToken }));
  await server.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
  process.once("SIGTERM", () => {
    void server.close();
  });
  process.once("SIGINT", () => {
    void server.close();
  });
}
void main();
