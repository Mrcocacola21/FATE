import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { RatingService } from "../services/ratingService";
import { INITIAL_RATING } from "../rating/constants";
import { getRankMetadata } from "../rating/rankTiers";
import { readMatchmakingConfig } from "../matchmaking/config";
import { LobbyNameSchema, ratedCompatibility } from "../lobby/metadata";
import { getGameRoom, listRoomSummaries, storeTestHooks, type GameRoom } from "../store";
import {
  MemoryMatchPersistence,
  testAccessToken,
  testIdentityService,
  testUserIds,
} from "./matchTestSupport";

const logger = { info() {}, error() {} };
const config = readMatchmakingConfig({ MATCHMAKING_MAX_RATING_RANGE: "400" });
function ready(room: GameRoom) {
  room.seats = { P1: "first", P2: "second" };
  room.seatIdentities = {
    P1: { userId: testUserIds.P1, username: "First", displayName: "Max" },
    P2: { userId: testUserIds.P2, username: "Second", displayName: "Polina" },
  };
  room.state = {
    ...room.state,
    seats: { P1: true, P2: true },
    playersReady: { P1: true, P2: true },
  };
}
async function run() {
  storeTestHooks.reset();
  assert.equal(LobbyNameSchema.parse("  Пиво и Fate  "), "Пиво и Fate");
  assert.equal(LobbyNameSchema.parse("<b>Night Games</b>"), "<b>Night Games</b>");
  for (const name of ["  ", "x".repeat(61), "a\nname", "a\u0000name"])
    assert.equal(LobbyNameSchema.safeParse(name).success, false);
  assert.equal(ratedCompatibility({ P1: 1800, P2: 1400 }, config.maxRange, true).eligible, true);
  assert.equal(ratedCompatibility({ P1: 1800, P2: 1350 }, config.maxRange, true).eligible, false);
  // Canonical fallback and batched discovery, including missing rows.
  let batches = 0;
  const ratings = new RatingService({
    userExists: async (id) => ({ id }),
    getRating: async () => null,
    getRatings: async () => {
      batches++;
      return [];
    },
    getHistory: async () => ({ total: 0, items: [] }),
    serializable: async () => {
      throw new Error("unused");
    },
  });
  assert.equal(
    (await ratings.getPlayerRating(testUserIds.P1, "standard")).rating,
    INITIAL_RATING.rating,
  );
  assert.deepEqual(
    [...(await ratings.getPlayerRatings([testUserIds.P1, testUserIds.P2], "standard"))].map(
      ([, value]) => value,
    ),
    [1500, 1500],
  );
  assert.equal(batches, 1);

  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  let p1 = 1800,
    p2 = 1500;
  lifecycle.configureRatedLobbies(
    config,
    async (ids) => new Map(ids.map((id) => [id, id === testUserIds.P1 ? p1 : p2])),
  );
  for (const opponent of [1500, 1400, 1350]) {
    p2 = opponent;
    const room = await lifecycle.createRoom(
      { matchType: "RATED", lobbyName: " Night Games " },
      randomUUID(),
      testUserIds.P1,
    );
    ready(room);
    const before = room.revision;
    const result = await lifecycle.applyAction(room, { type: "startGame" }, "P1");
    assert.equal(result.ok, opponent >= 1400);
    assert.equal(room.lobbyName, "Night Games");
    assert.equal(persistence.matches.get(room.matchId!)!.initialConfig?.lobbyName, "Night Games");
    if (!result.ok) {
      assert.equal(result.code, "RATED_RATING_DIFFERENCE_TOO_LARGE");
      assert.equal(room.revision, before);
      assert.equal(room.state.phase, "lobby");
      assert.equal(room.state.pendingRoll, null);
      assert.equal(room.actionLog.length, 0);
      assert.equal(persistence.matches.get(room.matchId!)!.status, "WAITING");
      assert.equal(room.matchType, "RATED");
    }
  }
  const stale = await lifecycle.createRoom({ matchType: "RATED" }, randomUUID(), testUserIds.P1);
  ready(stale);
  p1 = 1800;
  p2 = 1410;
  await lifecycle.refreshRatedLobbies([stale]);
  assert.equal(stale.ratedCompatibility?.eligible, true);
  p2 = 1390;
  assert.equal((await lifecycle.applyAction(stale, { type: "startGame" }, "P1")).ok, false);
  assert.equal(stale.ratedCompatibility?.difference, 410);
  // A non-default typed maximum drives the real start gate, without a separate 400 constant.
  const customConfig = readMatchmakingConfig({ MATCHMAKING_MAX_RATING_RANGE: "300" });
  lifecycle.configureRatedLobbies(
    customConfig,
    async (ids) => new Map(ids.map((id) => [id, id === testUserIds.P1 ? p1 : p2])),
  );
  const custom = await lifecycle.createRoom({ matchType: "RATED" }, randomUUID(), testUserIds.P1);
  ready(custom);
  p2 = 1499;
  assert.equal((await lifecycle.applyAction(custom, { type: "startGame" }, "P1")).ok, false);
  assert.equal(custom.ratedCompatibility?.maxDifference, 300);
  p2 = 1500;
  assert.equal((await lifecycle.applyAction(custom, { type: "startGame" }, "P1")).ok, true);
  lifecycle.configureRatedLobbies(config, async () => {
    throw new Error("Database unavailable");
  });
  const unavailable = await lifecycle.applyAction(stale, { type: "startGame" }, "P1");
  assert(!unavailable.ok);
  assert.equal(unavailable.code, "RATED_RATING_UNAVAILABLE");
  lifecycle.configureRatedLobbies(
    config,
    async (ids) => new Map(ids.map((id) => [id, id === testUserIds.P1 ? p1 : p2])),
  );
  stale.seatIdentities.P2 = null;
  assert.equal((await lifecycle.applyAction(stale, { type: "startGame" }, "P1")).ok, false);
  stale.seatIdentities.P2 = stale.seatIdentities.P1;
  assert.equal((await lifecycle.applyAction(stale, { type: "startGame" }, "P1")).ok, false);
  const defaults = new RatingService({
    userExists: async (id) => ({ id }),
    getRating: async () => null,
    getRatings: async () => [
      {
        userId: testUserIds.P1,
        gameMode: "standard",
        ...INITIAL_RATING,
        ratedGames: 0,
        rating: 1800,
      },
    ],
    getHistory: async () => ({ total: 0, items: [] }),
    serializable: async () => {
      throw new Error("unused");
    },
  });
  lifecycle.configureRatedLobbies(config, (ids) => defaults.getPlayerRatings(ids, "standard"));
  const missingRow = await lifecycle.createRoom(
    { matchType: "RATED" },
    randomUUID(),
    testUserIds.P1,
  );
  ready(missingRow);
  assert.equal((await lifecycle.applyAction(missingRow, { type: "startGame" }, "P1")).ok, true);
  assert.deepEqual(missingRow.ratedCompatibility?.ratings, { P1: 1800, P2: 1500 });
  // Mandatory regression: the SAME identities fail Standard and pass Draft.
  lifecycle.configureRatedLobbies(
    config,
    async (ids, mode) =>
      new Map(
        ids.map((id) => [
          id,
          mode === "standard"
            ? id === testUserIds.P1
              ? 1900
              : 1300
            : id === testUserIds.P1
              ? 1450
              : 1500,
        ]),
      ),
  );
  const standardGap = await lifecycle.createRoom(
    { matchType: "RATED", gameMode: "standard" },
    randomUUID(),
    testUserIds.P1,
  );
  const draftGap = await lifecycle.createRoom(
    { matchType: "RATED", gameMode: "draft" },
    randomUUID(),
    testUserIds.P1,
  );
  ready(standardGap);
  ready(draftGap);
  await lifecycle.refreshRatedLobbies([standardGap, draftGap]);
  assert.equal(standardGap.ratedCompatibility?.difference, 600);
  assert.equal(draftGap.ratedCompatibility?.difference, 50);
  assert.deepEqual(draftGap.ratedCompatibility?.ratings, { P1: 1450, P2: 1500 });
  assert.equal((await lifecycle.applyAction(standardGap, { type: "startGame" }, "P1")).ok, false);
  assert.equal(await lifecycle.validateStart(draftGap), null);
  // Switching lobby mode must refresh its rating identity before Start.
  draftGap.gameMode = "standard";
  assert.equal(
    (await lifecycle.validateStart(draftGap))?.code,
    "RATED_RATING_DIFFERENCE_TOO_LARGE",
  );
  draftGap.gameMode = "draft";
  assert.equal(await lifecycle.validateStart(draftGap), null);
  const casual = await lifecycle.createRoom({ lobbyName: "Friends" });
  ready(casual);
  p1 = 2000;
  p2 = 1000;
  assert.equal((await lifecycle.applyAction(casual, { type: "startGame" }, "P1")).ok, true);
  const dto = listRoomSummaries().find((room) => room.id === casual.id)!;
  assert.deepEqual(dto.playerNames, { P1: "Max", P2: "Polina" });
  assert.equal(dto.hostName, "Max");
  assert(!JSON.stringify(dto).includes(testUserIds.P1));
  await lifecycle.close();
  storeTestHooks.reset();

  // Real WS bypass: no frontend eligibility or client-supplied ratings are trusted.
  p1 = 1800;
  p2 = 1350;
  const server = await buildServer({
    matchPersistence: persistence,
    connectionIdentity: testIdentityService(),
    ratings: {
      getPlayerRating: async (id, gameMode) => ({
        gameMode,
        userId: id,
        ...INITIAL_RATING,
        rating: id === testUserIds.P1 ? p1 : p2,
        ...getRankMetadata(id === testUserIds.P1 ? p1 : p2),
        ratedGames: 0,
      }),
      getRatingHistory: async () => ({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
    },
    matchmakingActiveMatch: async () => false,
  });
  const sockets: WebSocket[] = [];
  try {
    for (const lobbyName of ["   ", "x".repeat(61), "a\u0000b"]) {
      const response = await server.inject({
        method: "POST",
        url: "/rooms",
        payload: { lobbyName },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "VALIDATION_ERROR");
    }
    const named = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { lobbyName: "  Нічні ігри  " },
    });
    assert.equal(
      (await server.inject({ url: `/rooms/${named.json().roomId}` })).json().lobbyName,
      "Нічні ігри",
    );
    await server.listen({ host: "127.0.0.1", port: 0 });
    const url = `ws://127.0.0.1:${(server.server.address() as { port: number }).port}/ws`;
    const first = new WebSocket(url),
      second = new WebSocket(url);
    sockets.push(first, second);
    await Promise.all(
      sockets.map((socket) => new Promise<void>((resolve) => socket.once("open", resolve))),
    );
    const request = (socket: WebSocket, body: object, expected: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off("message", read);
          reject(new Error(`Timeout: ${expected}`));
        }, 5000);
        function read(data: WebSocket.RawData) {
          const message = JSON.parse(data.toString());
          if (message.type === expected) {
            clearTimeout(timer);
            socket.off("message", read);
            resolve(message);
          }
        }
        socket.on("message", read);
        socket.send(JSON.stringify(body));
      });
    assert.equal(
      (
        await request(
          first,
          {
            type: "joinRoom",
            mode: "create",
            role: "P1",
            accessToken: testAccessToken("P1", "Max"),
            lobbyName: "  ",
          },
          "error",
        )
      ).code,
      "INVALID_LOBBY_NAME",
    );
    const created = await request(
      first,
      {
        type: "joinRoom",
        mode: "create",
        role: "P1",
        accessToken: testAccessToken("P1", "Max"),
        matchType: "RATED",
        lobbyName: "Night Games",
      },
      "roomState",
    );
    const id = created.roomId as string;
    await request(
      second,
      {
        type: "joinRoom",
        mode: "join",
        roomId: id,
        role: "P2",
        accessToken: testAccessToken("P2", "Polina"),
      },
      "roomState",
    );
    await request(first, { type: "setReady", ready: true }, "roomState");
    await request(second, { type: "setReady", ready: true }, "roomState");
    const room = getGameRoom(id)!;
    for (const body of [
      { type: "startGame" },
      { type: "startGame", p1Rating: 0, p2Rating: 0, eligible: true },
    ]) {
      const result = await request(first, body, "actionResult");
      assert.equal(result.ok, false);
      assert.equal(result.code, "RATED_RATING_DIFFERENCE_TOO_LARGE");
      assert.equal(room.state.pendingRoll, null);
      assert.equal(room.actionLog.length, 2); // ready actions only
      assert.equal(persistence.matches.get(room.matchId!)!.status, "WAITING");
    }
    assert.equal(
      (await request(first, { type: "action", action: { type: "startGame" } }, "error")).message,
      "Invalid action type for this channel",
    );
    await request(first, { type: "setGameMode", mode: "draft" }, "roomState");
    assert.equal(
      (await request(first, { type: "startGame" }, "actionResult")).code,
      "RATED_RATING_DIFFERENCE_TOO_LARGE",
    );
    assert.equal(room.draftState, null);
    // Start eligibility can change while seats and routing remain intact.
    p2 = 1400;
    await request(first, { type: "startGame" }, "roomState");
    assert(room.draftState);
    const lookup = (await server.inject({ url: `/rooms/${id}` })).json();
    assert.equal(lookup.ratedCompatibility.eligible, true);
    assert.equal(lookup.lobbyName, "Night Games");
    assert.deepEqual(lookup.playerNames, { P1: "Max", P2: "Polina" });
    console.log(
      "lobby: names, batch/default ratings, inclusive range, stale ratings, guests, same user, Casual, real WS/action/draft bypass protection passed",
    );
  } finally {
    sockets.forEach((socket) => socket.close());
    await server.close();
    storeTestHooks.reset();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
