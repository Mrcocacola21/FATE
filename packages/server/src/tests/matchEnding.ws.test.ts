import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MemoryMatchPersistence, testAccessToken, testIdentityService } from "./matchTestSupport";
import { getGameRoom, storeTestHooks, type GameRoom } from "../store";
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
  throw new Error("Timed out waiting for the match to end");
}

/** Everything of P2 is dead: the next accepted action of P1 is the real, normal victory. */
function prepareVictory(room: GameRoom) {
  room.state = {
    ...room.state,
    phase: "battle",
    pendingRoll: null,
    currentPlayer: "P1",
    ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
    units: Object.fromEntries(Object.entries(room.state.units).map(([id, unit]) => [
      id, unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
    ])),
  };
}

async function run() {
  const memory = new MemoryMatchPersistence();
  const server = await buildServer({ matchPersistence: memory, connectionIdentity: testIdentityService(),
    // Rated rooms read both ratings before starting; this suite runs without a database.
    ratings: { getPlayerRatings: async (ids: string[]) => new Map(ids.map(id => [id, 1500])) } as never,
  });
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
  type Client = Awaited<ReturnType<typeof connect>>;
  async function start(matchType?: "RATED") {
    const roomId = randomUUID();
    const p1 = await connect(), p2 = await connect();
    p1.send({ type: "joinRoom", mode: "create", roomId, role: "P1", accessToken: tokens.P1, matchType, gameMode: matchType ? "classic" : undefined });
    const p1Ack = await p1.wait("joinAck"); assert(p1Ack.type === "joinAck");
    p2.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: tokens.P2 });
    const p2Ack = await p2.wait("joinAck"); assert(p2Ack.type === "joinAck");
    p1.send({ type: "setReady", ready: true }); await p1.wait("actionResult");
    p2.send({ type: "setReady", ready: true }); await p2.wait("actionResult");
    p1.send({ type: "startGame" });
    const started = await p1.wait("actionResult");
    assert(started.type === "actionResult" && started.ok, JSON.stringify(started));
    const room = getGameRoom(roomId)!;
    await until(() => room.participantsLocked);
    return { room, match: memory.matches.get(room.matchId!)!, p1, p2, p2Token: p2Ack.resumeToken! };
  }
  async function disconnect(client: Client) {
    await new Promise<void>(resolve => { client.socket.once("close", resolve); client.socket.close(); });
  }
  async function win(game: Awaited<ReturnType<typeof start>>) {
    prepareVictory(game.room);
    game.p1.send({ type: "action", action: { type: "endTurn" } });
    await until(() => game.room.state.phase === "ended");
    await until(() => game.match.status === "FINISHED");
    assert.equal(game.match.result?.winnerSeat, "P1");
    assert.equal(game.match.result?.loserSeat, "P2");
    assert.equal(game.match.result?.winnerUserId, game.room.seatIdentities.P1!.userId);
    assert.equal(game.match.result?.loserUserId, game.room.seatIdentities.P2!.userId);
    assert.equal(game.match.finishReason, undefined, "a victory is not an interruption");
  }

  try {
    await server.listen({ host: "127.0.0.1", port: 0 });

    // The loser is away when the winning action lands: the win does not wait for them.
    const away = await start();
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(away.p2);
    await until(() => wsTestHooks.hasSeatGraceToken(away.p2Token));
    await win(away);
    const interruptsBefore = memory.calls.filter(call => call === "interrupt").length;

    // They come back inside the window and see the finished battle, not a broken room.
    const returned = await connect();
    returned.send({ type: "joinRoom", mode: "join", roomId: away.room.id, role: "P2",
      accessToken: tokens.P2, resumeToken: away.p2Token });
    await returned.wait("joinAck");
    const finalState = await returned.wait("roomState");
    assert(finalState.type === "roomState" && finalState.view.phase === "ended");
    assert.equal(finalState.view.gameOver?.winnerPlayerId, "P1");

    // Everyone leaves: the expired windows only close the room, the result stays.
    await disconnect(returned);
    await disconnect(away.p1);
    await until(() => wsTestHooks.hasSeatGraceToken(away.room.seatTokens.P1!) && wsTestHooks.hasSeatGraceToken(away.p2Token));
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(away.room.id), () => undefined);
    mock.timers.reset();
    assert.equal(away.match.status, "FINISHED");
    assert.equal(away.match.result?.winnerSeat, "P1");
    assert.equal(memory.calls.filter(call => call === "interrupt").length, interruptsBefore);
    assert.equal(getGameRoom(away.room.id), undefined, "a finished room nobody occupies closes");

    // Neither player is held in a match any more, and a late return is refused cleanly.
    const late = await connect();
    late.send({ type: "joinRoom", mode: "join", roomId: away.room.id, role: "P2",
      accessToken: tokens.P2, resumeToken: away.p2Token });
    const refused = await late.wait("joinRejected");
    assert(refused.type === "joinRejected" && refused.reason === "room_not_found");
    await disconnect(late);
    for (const seat of ["P1", "P2"] as const) {
      const created = await server.inject({ method: "POST", url: "/rooms", payload: {},
        headers: { authorization: `Bearer ${tokens[seat]}` } });
      assert.equal(created.statusCode, 201, `${seat} is free for the next match`);
    }

    // Casual never forfeits and says so; Rated does, and the client cannot trigger it itself.
    const casual = await start();
    casual.p1.send({ type: "joinRoom", mode: "join", roomId: casual.room.id, role: "P1", accessToken: tokens.P1 });
    const casualState = await casual.p1.wait("roomState");
    assert(casualState.type === "roomState" && casualState.meta.forfeitOnLeave === false);
    casual.p1.send({ type: "leaveRoom" });
    await casual.p1.wait("leftRoom");
    assert.equal(casual.match.status, "CANCELLED");
    assert.equal(casual.match.result, undefined);
    await disconnect(casual.p1); await disconnect(casual.p2);

    const rated = await start("RATED");
    rated.p1.send({ type: "joinRoom", mode: "join", roomId: rated.room.id, role: "P1", accessToken: tokens.P1 });
    const ratedState = await rated.p1.wait("roomState");
    assert(ratedState.type === "roomState" && ratedState.meta.forfeitOnLeave === true);
    const revisionBefore = rated.room.revision;
    rated.p1.send({ type: "action", action: { type: "forfeitMatch", player: "P2", reason: "surrender" } });
    const forged = await rated.p1.wait("error");
    assert(forged.type === "error" && forged.code === "INVALID_PAYLOAD");
    assert.equal(rated.room.revision, revisionBefore, "a client cannot forfeit for anyone");
    assert.notEqual(rated.room.state.phase, "ended");

    // The window runs out with the opponent still here: they win, over the pending roll.
    assert(rated.room.state.pendingRoll);
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(rated.p2);
    await until(() => wsTestHooks.hasSeatGraceToken(rated.p2Token));
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(rated.room.id), () => undefined);
    mock.timers.reset();
    await until(() => rated.match.status === "FINISHED");
    assert.equal(rated.match.result?.winnerSeat, "P1");
    assert.equal(rated.match.result?.loserSeat, "P2");
    assert.equal(rated.match.result?.finishReason, "disconnect");
    await until(() => rated.p1.messages.some(m => m.type === "roomState" && m.view.phase === "ended"));
    await disconnect(rated.p1);

    // Pressing leave loses immediately, with no window at all.
    const left = await start("RATED");
    left.p2.send({ type: "leaveRoom" });
    await left.p2.wait("leftRoom");
    await until(() => left.match.status === "FINISHED");
    assert.equal(left.match.result?.winnerSeat, "P1");
    assert.equal(left.match.result?.loserSeat, "P2");
    assert.equal(left.match.result?.finishReason, "surrender");
    await disconnect(left.p1); await disconnect(left.p2);

    // Both gone: nobody is there to win, whichever timer happens to fire first.
    const bothGone = await start("RATED");
    const bothGoneToken = bothGone.room.seatTokens.P1!;
    mock.timers.enable({ apis: ["setTimeout"] });
    await disconnect(bothGone.p1); await disconnect(bothGone.p2);
    await until(() => wsTestHooks.hasSeatGraceToken(bothGoneToken) && wsTestHooks.hasSeatGraceToken(bothGone.p2Token));
    mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(bothGone.room.id), () => undefined);
    mock.timers.reset();
    assert.equal(bothGone.match.status, "CANCELLED");
    assert.equal(bothGone.match.result, undefined);

    console.log("match ending WS: win with the loser away, return to the result, windows after a win, players released, Rated forfeits passed");
  } finally {
    mock.timers.reset();
    for (const socket of sockets) socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests(); storeTestHooks.reset();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
