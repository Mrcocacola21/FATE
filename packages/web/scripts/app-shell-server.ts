// Browser fixture: existing in-memory persistence/identity test doubles, real
// room lifecycle and WebSocket handlers. No database connection is required.
import {
  buildTestServer,
  testAccessToken,
  testUserIds,
} from "../../server/src/tests/matchTestSupport";

async function main() {
  const server = await buildTestServer();
  const accessToken = testAccessToken("P1", "Commander");
  const p2AccessToken = testAccessToken("P2", "Opponent");
  server.get("/shell-test/credentials", async () => ({ accessToken, p2AccessToken, userId: testUserIds.P1 }));
  await server.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
  process.once("SIGTERM", () => {
    void server.close();
  });
  process.once("SIGINT", () => {
    void server.close();
  });
}
void main();
