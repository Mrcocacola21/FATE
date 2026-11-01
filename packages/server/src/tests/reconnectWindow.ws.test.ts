import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { makePlayerView, makeSpectatorView } from "rules";
import { buildServer } from "../index";
import { MemoryMatchPersistence, testAccessToken, testIdentityService } from "./matchTestSupport";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks, type ServerMessage } from "../ws";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { lobbyReconnectGraceMs, reconnectGraceMs } from "../matches/reconnectPolicy";

const realTimeout = setTimeout;
process.env.WS_HEARTBEAT_INTERVAL_MS = "40";

async function until<T>(read: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 1000; i++) {
    const result = read();
    if (result) return result;
    await new Promise(resolve => realTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for reconnect transport");
}

type RoomState = Extract<ServerMessage, { type: "roomState" }>;

async function run() {
  assert(reconnectGraceMs() > lobbyReconnectGraceMs(), "a battle must outlast a lobby seat");
  const memory = new MemoryMatchPersistence();
  const server = await buildServer({ matchPersistence: memory, connectionIdentity: testIdentityService() });
  const sockets: WebSocket[] = [];
  const tokens = { P1: testAccessToken("P1"), P2: testAccessToken("P2") };
  async function connect(options?: WebSocket.ClientOptions) {
    const port = (server.server.address() as { port: number }).port;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, options);
    sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on("message", data => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    return { socket, messages,
      send: (msg: object) => { messages.length = 0; socket.send(JSON.stringify(msg)); },
      wait: (type: ServerMessage["type"]) => until(() => messages.find(m => m.type === type)),
      lastState: () => messages.filter((m): m is RoomState => m.type === "roomState").at(-1),
    };
  }
  type Client = Awaited<ReturnType<typeof connect>>;
  async function lobby(options?: WebSocket.ClientOptions) {
    const roomId = randomUUID();
    const p1 = await connect(options), p2 = await connect();
    p1.send({ type: "joinRoom", mode: "create", roomId, role: "P1", accessToken: tokens.P1 });
    const ack = await p1.wait("joinAck"); assert(ack.type === "joinAck");
    p2.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: tokens.P2 });
    await p2.wait("joinAck");
    p1.send({ type: "setReady", ready: true }); await p1.wait("actionResult");
    p2.send({ type: "setReady", ready: true }); await p2.wait("actionResult");
    return { room: getGameRoom(roomId)!, p1, p2, ack };
  }
  async function start(options?: WebSocket.ClientOptions) {
    const opened = await lobby(options);
    opened.p1.send({ type: "startGame" }); await opened.p1.wait("actionResult");
    const match = memory.matches.get(opened.room.matchId!)!;
    assert.equal(match.status, "IN_PROGRESS");
    return { ...opened, match };
  }
  async function disconnect(client: Client) {
    await new Promise<void>(resolve => { client.socket.once("close", resolve); client.socket.close(); });
  }
  async function advance(roomId: string, ms: number) {
    mock.timers.tick(ms);
    await enqueueRoomCommand(fateRoomKey(roomId), () => undefined);
  }
  const awayOf = (client: Client, seat: "P1" | "P2") => client.lastState()?.meta.disconnectedSeats[seat];

  try {
    await server.listen({ host: "127.0.0.1", port: 0 });

    // Answered without an account lookup or the command queue, so it can never stall.
    const probe = await connect();
    probe.send({ type: "heartbeat" });
    await probe.wait("heartbeatAck");

    // Within the window: same match, same revision, and each side keeps its own projection.
    const first = await start();
    const spectator = await connect();
    spectator.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "spectator" });
    await spectator.wait("joinAck");
    const revision = first.room.revision;
    assert.equal(first.p2.lastState() && awayOf(first.p2, "P1"), null);
    mock.timers.enable({ apis: ["setTimeout"] });
    first.p2.messages.length = 0; spectator.messages.length = 0;
    await disconnect(first.p1);
    await until(() => wsTestHooks.hasSeatGraceToken(first.ack.resumeToken!));
    const remaining = (await until(() => awayOf(first.p2, "P1")))!;
    assert(remaining > lobbyReconnectGraceMs() && remaining <= reconnectGraceMs());
    assert.equal(awayOf(first.p2, "P2"), null);
    assert(await until(() => awayOf(spectator, "P1")), "spectators see who is away");
    for (const client of [first.p2, spectator])
      assert(!JSON.stringify(client.messages).includes(first.ack.resumeToken!), "the resume token stays private");

    await advance(first.room.id, reconnectGraceMs() - 1);
    assert.equal(first.match.status, "IN_PROGRESS", "the window has not ended yet");
    assert.equal(wsTestHooks.seatGraceMs(first.room), reconnectGraceMs());

    first.p2.messages.length = 0; spectator.messages.length = 0;
    const returned = await connect();
    returned.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "P1",
      accessToken: tokens.P1, resumeToken: first.ack.resumeToken });
    const returnedAck = await returned.wait("joinAck");
    assert(returnedAck.type === "joinAck" && returnedAck.seat === "P1");
    assert.equal(returnedAck.resumeToken, first.ack.resumeToken);
    const restored = await until(() => returned.lastState());
    assert.equal(restored.meta.revision, revision);
    assert.deepEqual(restored.view, JSON.parse(JSON.stringify(makePlayerView(first.room.state, "P1"))));
    assert.equal(restored.meta.disconnectedSeats.P1, null);
    assert(!wsTestHooks.hasSeatGraceToken(first.ack.resumeToken!));
    await until(() => first.p2.lastState() && awayOf(first.p2, "P1") === null);
    assert.deepEqual(first.p2.lastState()!.view, JSON.parse(JSON.stringify(makePlayerView(first.room.state, "P2"))));
    await until(() => spectator.lastState() && awayOf(spectator, "P1") === null);
    assert.deepEqual(spectator.lastState()!.view, JSON.parse(JSON.stringify(makeSpectatorView(first.room.state))));

    // The old timer died with the reconnect.
    await advance(first.room.id, 2);
    assert.equal(first.match.status, "IN_PROGRESS");

    // After the window: neutral end, nobody wins, and returning is refused.
    await disconnect(returned);
    await until(() => wsTestHooks.hasSeatGraceToken(first.ack.resumeToken!));
    await advance(first.room.id, reconnectGraceMs() + 1);
    mock.timers.reset();
    assert.equal(first.match.status, "CANCELLED");
    assert.equal(first.match.finishReason, "SERVER_RECONNECT_GRACE_EXPIRED");
    assert.equal(first.match.result, undefined);
    assert.equal(getGameRoom(first.room.id), undefined);
    await first.p2.wait("joinRejected");
    const late = await connect();
    late.send({ type: "joinRoom", mode: "join", roomId: first.room.id, role: "P1",
      accessToken: tokens.P1, resumeToken: first.ack.resumeToken });
    const refused = await late.wait("joinRejected");
    assert(refused.type === "joinRejected");
    await disconnect(first.p2); await disconnect(spectator);

    // A link that went silent sends no close: pings must end it for the window to start.
    const silent = await start({ autoPong: false });
    await until(() => wsTestHooks.hasSeatGraceToken(silent.ack.resumeToken!));
    await until(() => awayOf(silent.p2, "P1"));
    assert.equal(silent.match.status, "IN_PROGRESS");
    silent.p2.send({ type: "leaveRoom" });
    await silent.p2.wait("leftRoom");
    assert.equal(silent.match.status, "CANCELLED");

    // A lobby seat is released on the short window, keeping the room open for someone else.
    const open = await lobby();
    assert.equal(wsTestHooks.seatGraceMs(open.room), lobbyReconnectGraceMs());
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(open.p2);
    const p2Token = open.room.seatTokens.P2!;
    await until(() => wsTestHooks.hasSeatGraceToken(p2Token));
    await advance(open.room.id, lobbyReconnectGraceMs() + 1);
    mock.timers.reset();
    assert.equal(open.room.seats.P2, null);
    assert(!wsTestHooks.hasSeatGraceToken(p2Token));
    open.p1.send({ type: "leaveRoom" });
    await open.p1.wait("leftRoom");

    // The match starts while a seat is away on the lobby window: it gets the battle window.
    const racing = await lobby();
    mock.timers.enable({ apis: ["setTimeout"] });
    const racingToken = racing.room.seatTokens.P2!;
    await disconnect(racing.p2);
    await until(() => wsTestHooks.hasSeatGraceToken(racingToken));
    racing.p1.send({ type: "startGame" }); await racing.p1.wait("actionResult");
    const racingMatch = memory.matches.get(racing.room.matchId!)!;
    assert.equal(racingMatch.status, "IN_PROGRESS");
    await advance(racing.room.id, lobbyReconnectGraceMs() + 1);
    assert.equal(racingMatch.status, "IN_PROGRESS", "the lobby window must not end a started match");
    assert(wsTestHooks.hasSeatGraceToken(racingToken));
    await advance(racing.room.id, reconnectGraceMs() + 1);
    mock.timers.reset();
    assert.equal(racingMatch.status, "CANCELLED");
    console.log("reconnect window WS: within window, expiry, silent link, lobby window, start during lobby window passed");
  } finally {
    mock.timers.reset();
    for (const socket of sockets) socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests(); storeTestHooks.reset();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
