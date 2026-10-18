import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MemoryMatchPersistence, testAccessToken, testIdentityService } from "./matchTestSupport";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks, type ServerMessage } from "../ws";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { reconnectGraceMs } from "../matches/reconnectPolicy";
const realTimeout = setTimeout;

async function until<T>(read: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 1000; i++) {
    const result = read();
    if (result) return result;
    await new Promise(resolve => realTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for lifecycle transport");
}

async function run() {
  const memory = new MemoryMatchPersistence();
  const server = await buildServer({ matchPersistence: memory, connectionIdentity: testIdentityService() });
  const sockets: WebSocket[] = [];
  const tokens = { P1: testAccessToken("P1"), P2: testAccessToken("P2") };
  async function connect() {
    const port = (server.server.address() as { port: number }).port;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on("message", data => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    return { socket, messages,
      send: (msg: object) => { messages.length = 0; socket.send(JSON.stringify(msg)); },
      wait: (type: ServerMessage["type"]) => until(() => messages.find(m => m.type === type)),
    };
  }
  async function start() {
    const roomId = randomUUID();
    const p1 = await connect(), p2 = await connect();
    p1.send({ type: "joinRoom", mode: "create", roomId, role: "P1", accessToken: tokens.P1 });
    const ack = await p1.wait("joinAck"); assert(ack.type === "joinAck");
    p2.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: tokens.P2 });
    await p2.wait("joinAck");
    p1.send({ type: "setReady", ready: true }); await p1.wait("actionResult");
    p2.send({ type: "setReady", ready: true }); await p2.wait("actionResult");
    p1.send({ type: "startGame" }); await p1.wait("actionResult");
    const room = getGameRoom(roomId)!;
    const match = memory.matches.get(room.matchId!)!;
    assert.equal(match.status, "IN_PROGRESS");
    return { room, match, p1, p2, ack };
  }
  async function disconnect(client: Awaited<ReturnType<typeof connect>>) {
    await new Promise<void>(resolve => { client.socket.once("close", resolve); client.socket.close(); });
  }
  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const first = await start();
    const revision = first.room.revision;
    const initialState = structuredClone(first.room.state);
    const actionCount = memory.actions.size;
    // Visibility/online refresh can re-send joinRoom on the current transport.
    // It must refresh the snapshot, never leave the active competitor seat.
    const connection = first.room.seats.P1;
    for (let refresh = 0; refresh < 2; refresh++) {
      first.p1.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "P1",
        accessToken: tokens.P1, resumeToken: first.ack.resumeToken });
      await until(() => first.p1.messages.find(m => m.type === "joinAck" || m.type === "joinRejected"));
      assert.equal(first.match.status, "IN_PROGRESS", "same-connection refresh must not abandon the match");
      assert(!first.p1.messages.some(m => m.type === "error" || m.type === "joinRejected"));
      assert(!first.p2.messages.some(m => m.type === "joinRejected"));
      assert.equal(first.room.seats.P1, connection);
      assert.equal(first.room.revision, revision);
      assert.deepEqual(first.room.state, initialState);
      assert.equal(memory.actions.size, actionCount);
    }
    const spectator = await connect();
    spectator.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "spectator" });
    await spectator.wait("joinAck"); await disconnect(spectator);
    assert.equal(first.match.status, "IN_PROGRESS", "spectators cannot abandon a match");
    await disconnect(first.p1);
    await until(() => wsTestHooks.hasSeatGraceToken(first.ack.resumeToken!));
    const denied = await server.inject({ method: "POST", url: "/rooms", payload: {},
      headers: { authorization: `Bearer ${tokens.P1}` } });
    assert.equal(denied.statusCode, 409, "live grace must block another match");
    const spectatorCreator = await connect();
    spectatorCreator.send({ type: "joinRoom", mode: "create", roomId: randomUUID(), role: "spectator", accessToken: tokens.P1 });
    const creationError = await spectatorCreator.wait("error");
    assert(creationError.type === "error" && creationError.code === "MATCHMAKING_ALREADY_IN_MATCH");
    // Fresh authenticated tab can discover/reclaim its own seat without an old browser token.
    const returned = await connect();
    returned.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "P1", accessToken: tokens.P1 });
    await returned.wait("joinAck");
    assert.equal(first.room.revision, revision);
    assert(!wsTestHooks.hasSeatGraceToken(first.ack.resumeToken!));
    const replacement = await connect();
    replacement.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "P1", accessToken: tokens.P1 });
    await replacement.wait("joinAck");
    await disconnect(returned);
    mock.timers.enable({ apis: ["setTimeout"] });
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(first.room.id), () => undefined);
    mock.timers.reset();
    assert.equal(first.match.status, "IN_PROGRESS", "replaced tab closing cannot expire the current seat");
    const ownerToken = first.room.seatTokens.P1!;
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(replacement);
    await until(() => wsTestHooks.hasSeatGraceToken(ownerToken));
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(first.room.id), () => undefined);
    mock.timers.reset();
    assert.equal(first.match.status, "CANCELLED");
    assert.equal(first.match.finishReason, "SERVER_RECONNECT_GRACE_EXPIRED");
    assert.equal(first.match.result, undefined);
    assert.equal(getGameRoom(first.room.id), undefined);
    assert.equal(memory.calls.filter(c => c === "interrupt").length, 1);
    await first.p2.wait("joinRejected");
    const unlocked = await server.inject({ method: "POST", url: "/rooms", payload: {},
      headers: { authorization: `Bearer ${tokens.P1}` } });
    assert.equal(unlocked.statusCode, 201);

    const second = await start();
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(second.p1); await disconnect(second.p2);
    await until(() => wsTestHooks.hasSeatGraceToken(second.ack.resumeToken!));
    // Wait for both server-side close handlers before advancing fake time.
    await until(() => wsTestHooks.hasSeatGraceToken(second.room.seatTokens.P2!));
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(second.room.id), () => undefined);
    mock.timers.reset();
    assert.equal(second.match.status, "CANCELLED");
    assert.equal(second.match.result, undefined, "callback order must never fabricate a winner");
    assert.equal(memory.calls.filter(c => c === "interrupt").length, 2);

    const third = await start();
    third.p1.send({ type: "leaveRoom" });
    await third.p1.wait("leftRoom");
    assert.equal(third.match.status, "CANCELLED");
    assert.equal(third.match.finishReason, "SERVER_PARTICIPANT_LEFT");
    assert.equal(third.match.result, undefined);
    console.log("stale lifecycle WS: reconnect, authenticated reclaim, tab replacement, spectator, grace, both gone, explicit leave passed");
  } finally {
    mock.timers.reset();
    for (const socket of sockets) socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests(); storeTestHooks.reset();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
