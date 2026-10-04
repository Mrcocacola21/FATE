import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { INITIAL_RATING } from "../rating/constants";
import { getRankMetadata } from "../rating/rankTiers";
import { MemoryMatchPersistence } from "./matchTestSupport";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks } from "../ws";

type Message = {
  type: string;
  requestId?: string;
  code?: string;
  isHost?: boolean;
  meta?: { gameModeLocked?: boolean };
  status?: {
    status: string;
    matchId: string;
    roomId: string;
    seat: "P1" | "P2";
    matchType: string;
  };
};
async function until<T>(get: () => T | undefined | false): Promise<T> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const value = get();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for matchmaking transport");
}
async function run() {
  process.env.LOG_LEVEL = "silent";
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  const persistence = new MemoryMatchPersistence();
  const identities = Object.fromEntries(
    ["A", "B", "C"].map((name) => [
      name,
      { userId: randomUUID(), username: name, displayName: name },
    ]),
  );
  const server = await buildServer({
    matchPersistence: persistence,
    connectionIdentity: { verify: async (token) => (token ? (identities[token] ?? null) : null) },
    ratings: {
      getPlayerRating: async (id, gameMode) => ({
        gameMode,
        userId: id,
        ...INITIAL_RATING,
        ratedGames: 0,
        ...getRankMetadata(INITIAL_RATING.rating),
      }),
      getRatingHistory: async () => ({
        items: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
    },
    matchmakingActiveMatch: async () => false,
  });
  const clients: { socket: WebSocket; messages: Message[] }[] = [];
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const request = (method: "POST" | "DELETE" | "GET", token = "A", payload?: object) =>
    server.inject({
      method,
      url: "/api/matchmaking/queue",
      headers: headers(token),
      ...(payload ? { payload } : {}),
    });
  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const port = (server.server.address() as { port: number }).port;
    const connect = async (token: string) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`),
        messages: Message[] = [];
      socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
      await new Promise<void>((resolve) => socket.once("open", resolve));
      const client = { socket, messages };
      clients.push(client);
      socket.send(
        JSON.stringify({ type: "matchmakingSubscribe", accessToken: token, requestId: token }),
      );
      await until(() => messages.find((m) => m.type === "matchmakingSubscribed"));
      return client;
    };
    const a = await connect("A"),
      tab2 = await connect("A");
    assert.equal((await server.inject({ url: "/api/matchmaking/queue" })).statusCode, 401);
    assert.equal(
      (await request("POST", "A", { gameMode: "standard", rating: 9999 })).statusCode,
      400,
    );
    assert.equal((await request("POST", "A", { gameMode: "bogus" })).statusCode, 400);
    const first = await request("POST", "A", { gameMode: "classic" });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().rating, 1500);
    const repeated = await Promise.all(
      Array.from({ length: 5 }, () => request("POST", "A", { gameMode: "classic" })),
    );
    assert(repeated.every((r) => r.json().joinedAt === first.json().joinedAt));
    assert.equal((await request("GET")).json().gameMode, "classic");
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/rooms",
          headers: headers("A"),
          payload: { matchType: "RATED" },
        })
      ).json().error.code,
      "MATCHMAKING_IN_QUEUE",
    );
    a.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "create",
        role: "P1",
        accessToken: "A",
        matchType: "RATED",
      }),
    );
    await until(() => a.messages.find((m) => m.code === "MATCHMAKING_IN_QUEUE"));
    assert.equal((await request("DELETE")).json().status, "NOT_QUEUED");
    assert.equal((await request("DELETE")).json().status, "NOT_QUEUED");
    await request("POST", "A", { gameMode: "classic" });
    const b = await connect("B");
    await request("POST", "B", { gameMode: "classic" });
    const foundA = (await until(() => a.messages.find((m) => m.type === "matchmakingFound")))
      .status!;
    const foundB = (await until(() => b.messages.find((m) => m.type === "matchmakingFound")))
      .status!;
    await until(() => tab2.messages.find((m) => m.type === "matchmakingFound"));
    assert.equal(foundA.roomId, foundB.roomId);
    assert.equal(foundA.matchId, foundB.matchId);
    assert.notEqual(foundA.seat, foundB.seat);
    assert.equal(foundA.matchType, "RATED");
    assert.equal(persistence.matches.size, 1);
    assert.equal(persistence.matches.get(foundA.matchId)?.participants.size, 2);
    assert.equal((await request("DELETE")).json().status, "MATCH_FOUND");
    assert.equal(
      (await request("POST", "A", { gameMode: "classic" })).json().matchId,
      foundA.matchId,
    );
    const c = await connect("C");
    c.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: foundA.roomId,
        role: foundA.seat,
        accessToken: "C",
      }),
    );
    await until(() => c.messages.find((m) => m.code === "SEAT_OWNED_BY_ANOTHER_USER"));
    const room = getGameRoom(foundA.roomId)!;
    const competitors = [
      [a, "A", foundA.seat],
      [b, "B", foundB.seat],
    ] as const;
    // P2 arriving first must not rewrite the persisted P1 host assignment.
    for (const [client, token, seat] of [...competitors].sort((left, right) =>
      right[2].localeCompare(left[2]),
    )) {
      client.socket.send(
        JSON.stringify({
          type: "joinRoom",
          mode: "join",
          roomId: foundA.roomId,
          role: seat,
          accessToken: token,
        }),
      );
      const ack = await until(() => client.messages.find((m) => m.type === "joinAck"));
      assert.equal(ack.isHost, seat === "P1");
      assert.equal(room.hostSeat, "P1");
      assert.equal(room.state.hostPlayerId, "P1");
      const snapshot = await until(() => client.messages.find((m) => m.type === "roomState"));
      assert.equal(snapshot.meta?.gameModeLocked, true);
      if (seat === "P2") assert.equal(room.hostConnId, null);
    }
    const [hostClient, hostToken] = competitors.find((player) => player[2] === "P1")!;
    assert.equal(room.hostConnId, room.seats.P1);
    hostClient.socket.send(JSON.stringify({ type: "setGameMode", mode: "standard" }));
    await until(() => hostClient.messages.find((message) => message.code === "mode_locked"));
    assert.equal(room.gameMode, "classic");
    hostClient.socket.send(JSON.stringify({ type: "leaveRoom" }));
    await until(() => hostClient.messages.find((message) => message.type === "leftRoom"));
    assert.equal(room.hostSeat, "P1");
    assert.equal(room.hostConnId, null);
    hostClient.messages.length = 0;
    hostClient.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: room.id,
        role: "P1",
        accessToken: hostToken,
      }),
    );
    const resumedHost = await until(() =>
      hostClient.messages.find((message) => message.type === "joinAck"),
    );
    assert.equal(resumedHost.isHost, true);
    assert.equal(room.hostConnId, room.seats.P1);
    assert.equal(room.seatIdentities[foundA.seat]?.userId, identities.A.userId);
    assert.equal(room.seatIdentities[foundB.seat]?.userId, identities.B.userId);
    a.socket.send(JSON.stringify({ type: "setReady", ready: true }));
    b.socket.send(JSON.stringify({ type: "setReady", ready: true }));
    await until(() => room.state.playersReady.P1 && room.state.playersReady.P2);
    (room.hostSeat === foundA.seat ? a : b).socket.send(JSON.stringify({ type: "startGame" }));
    await until(() => persistence.matches.get(foundA.matchId)?.status === "IN_PROGRESS");
    assert(persistence.actions.size > 0); // Ordinary accepted-action journal.
    const queued = await request("POST", "B", { gameMode: "classic" });
    assert.equal(queued.json().status, "MATCH_FOUND"); // Existing established assignment is idempotent.
    assert(!JSON.stringify(foundA).includes("accessToken"));
    console.log(
      "Matchmaking HTTP/WebSocket: authentication, spoof rejection, multi-tab delivery, one atomic Match, reserved seats and normal start/journal passed",
    );
  } finally {
    for (const client of clients) client.socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests();
    storeTestHooks.reset();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
