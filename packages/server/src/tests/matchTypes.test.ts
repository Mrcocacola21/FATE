import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { assertSeatIdentity } from "../auth/connectionIdentity";
import { MatchTypeError } from "../matches/matchType";
import { storeTestHooks, getGameRoom } from "../store";
import {
  MemoryMatchPersistence,
  testAccessToken,
  testIdentityService,
  testUserIds,
} from "./matchTestSupport";

async function run() {
  storeTestHooks.reset();
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle({ info() {}, error() {} }, persistence);
  const casual = await lifecycle.createRoom();
  assert.equal(casual.matchType, "CASUAL");
  assert.equal(persistence.matches.get(casual.matchId!)!.isRated, false);
  const rated = await lifecycle.createRoom({ matchType: "RATED" }, randomUUID(), testUserIds.P1);
  assert.equal(rated.matchType, "RATED");
  assert.equal(persistence.matches.get(rated.matchId!)!.isRated, true);
  assert.equal(Reflect.set(rated, "matchType", "CASUAL"), false);
  assert.equal(rated.matchType, "RATED");
  await assert.rejects(lifecycle.createRoom({ matchType: "RATED" }), MatchTypeError);
  await assert.rejects(
    lifecycle.createRoom({ matchType: "RATED", roomMode: "test" }, randomUUID(), testUserIds.P1),
    /Test rooms/,
  );
  const sandbox = await lifecycle.createRoom({ roomMode: "test" });
  assert.equal(sandbox.matchType, "CASUAL");
  assert.equal(sandbox.matchId, null);
  assert.throws(() => assertSeatIdentity(rated, "P1", null, ""), /Rated|Sign in/);
  rated.seatIdentities.P1 = { userId: testUserIds.P1, username: "First", displayName: null };
  assert.throws(
    () => assertSeatIdentity(rated, "P2", rated.seatIdentities.P1, ""),
    (e: unknown) => (e as { code: string }).code === "RATED_MATCH_SAME_USER",
  );
  const invalidStart = await lifecycle.applyAction(rated, { type: "startGame" }, "P1");
  assert.equal(invalidStart.ok, false);
  assert.equal(invalidStart.code, "RATED_MATCH_INVALID_PARTICIPANTS");
  assert.equal(rated.state.phase, "lobby");
  await lifecycle.close();

  const server = await buildServer({
    matchPersistence: persistence,
    connectionIdentity: testIdentityService(),
  });
  const token = testAccessToken("P1");
  const headers = { authorization: `Bearer ${token}` };
  let socket: WebSocket | undefined;
  try {
    for (const url of ["/rooms", "/api/games"]) {
      const response = await server.inject({ method: "POST", url, payload: {} });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().matchType, "CASUAL");
      assert.equal(
        (await server.inject({ method: "POST", url, payload: { matchType: "RATED" } })).statusCode,
        400,
      );
      assert.equal(
        (
          await server.inject({ method: "POST", url, headers, payload: { matchType: "invalid" } })
        ).json().error.code,
        "INVALID_MATCH_TYPE",
      );
    }
    const created = await server.inject({
      method: "POST",
      url: "/rooms",
      headers,
      payload: { matchType: "RATED", gameMode: "classic" },
    });
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().roomId;
    assert.equal(created.json().matchType, "RATED");
    assert.equal(getGameRoom(id)!.gameMode, "classic");
    assert.equal((await server.inject({ url: `/rooms/${id}` })).json().matchType, "RATED");
    assert.equal(
      (await server.inject({ url: "/rooms" })).json().find((r: { id: string }) => r.id === id)
        .matchType,
      "RATED",
    );
    assert.equal((await server.inject({ url: "/rooms/missing" })).statusCode, 404);
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address() as { port: number };
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
    const messages: Record<string, unknown>[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve) => socket!.once("open", resolve));
    const request = async (body: object, type: string) => {
      messages.length = 0;
      socket!.send(JSON.stringify(body));
      const deadline = Date.now() + 5000;
      while (!messages.some((m) => m.type === type) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10));
      const response = messages.find((m) => m.type === type);
      assert(response, JSON.stringify(messages));
      return response;
    };
    const base = { type: "joinRoom", mode: "join", roomId: id, role: "spectator" };
    assert.equal(
      (await request({ ...base, matchType: "CASUAL" }, "error")).code,
      "MATCH_TYPE_IMMUTABLE",
    );
    assert.equal(
      (await request({ ...base, role: "P2" }, "error")).code,
      "RATED_MATCH_REQUIRES_AUTHENTICATION",
    );
    const snapshot = await request(base, "roomState");
    assert.equal((snapshot.meta as { matchType: string }).matchType, "RATED");
    assert.equal(messages.find((m) => m.type === "joinAck")!.matchType, "RATED");
    assert.equal(
      (
        await request(
          { type: "joinRoom", mode: "create", role: "P1", accessToken: token, matchType: "bogus" },
          "error",
        )
      ).code,
      "INVALID_MATCH_TYPE",
    );
    const createdSocket = await request(
      { type: "joinRoom", mode: "create", role: "P1", accessToken: token, matchType: "RATED" },
      "roomState",
    );
    assert.equal((createdSocket.meta as { matchType: string }).matchType, "RATED");
    const socketRoom = getGameRoom(createdSocket.roomId as string)!;
    assert.equal(persistence.matches.get(socketRoom.matchId!)!.isRated, true);
    console.log(
      "match types: safe defaults, persistence, immutable metadata, REST/WS validation, public lookup/spectating and participant eligibility passed",
    );
  } finally {
    socket?.close();
    await server.close();
    storeTestHooks.reset();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
