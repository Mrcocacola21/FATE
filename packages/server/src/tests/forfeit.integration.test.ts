import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { databaseFixture } from "./helpers/databaseFixture";
import { testAccessToken, testIdentityService } from "./matchTestSupport";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks, type ServerMessage } from "../ws";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { ReplayService } from "../services/replayService";

// Real timers: fake ones would also stall the database client under test.
process.env.RECONNECT_GRACE_MS = "1500";
process.env.LOBBY_RECONNECT_GRACE_MS = "1500";

async function until<T>(read: () => Promise<T | undefined | false> | T | undefined | false): Promise<T> {
  for (let i = 0; i < 1000; i++) {
    const result = await read();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the forfeit");
}

async function run() {
  const fixture = databaseFixture();
  const server = await buildServer({ connectionIdentity: testIdentityService(), matchRecovery: false });
  const sockets: WebSocket[] = [];
  const replay = new ReplayService(new MatchRepository(fixture.db), new MatchActionRepository(fixture.db),
    new MatchSnapshotService(new MatchSnapshotRepository(fixture.db)));
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
  async function start(tokens: { P1: string; P2: string }, gameMode = "classic") {
    const roomId = randomUUID();
    const p1 = await connect(), p2 = await connect();
    p1.send({ type: "joinRoom", mode: "create", roomId, role: "P1", accessToken: tokens.P1, matchType: "RATED", gameMode });
    await p1.wait("joinAck");
    p2.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: tokens.P2 });
    await p2.wait("joinAck");
    p1.send({ type: "setReady", ready: true }); await p1.wait("actionResult");
    p2.send({ type: "setReady", ready: true }); await p2.wait("actionResult");
    p1.send({ type: "startGame" }); await p1.wait("actionResult");
    const room = getGameRoom(roomId)!;
    fixture.matches.push(room.matchId!);
    return { room, matchId: room.matchId!, p1, p2 };
  }
  const disconnect = (client: Awaited<ReturnType<typeof connect>>) =>
    new Promise<void>(resolve => { client.socket.once("close", resolve); client.socket.close(); });
  const row = (id: string) => fixture.db.match.findUniqueOrThrow({ where: { id }, include: { participants: true } });
  async function assertForfeit(matchId: string, loser: "P1" | "P2", reason: string, userIds: { P1: string; P2: string }) {
    const winner = loser === "P1" ? "P2" : "P1";
    await until(async () => (await row(matchId)).status === "FINISHED");
    const match = await row(matchId);
    assert.equal(match.finishReason, reason);
    assert.equal(match.winnerSeat, winner);
    assert.equal(match.loserSeat, loser);
    assert.equal(match.winnerUserId, userIds[winner]);
    assert.equal(match.loserUserId, userIds[loser]);
    assert.equal(match.participants.find(p => p.seat === winner)?.outcome, "WIN");
    assert.equal(match.participants.find(p => p.seat === loser)?.outcome, "LOSS");
    // Exactly-once rating, the winner up and the loser down, exactly like a win on the board.
    await until(async () => await fixture.db.ratingHistory.count({ where: { matchId } }) === 2);
    const history = await fixture.db.ratingHistory.findMany({ where: { matchId } });
    const change = (id: string) => {
      const entry = history.find(item => item.userId === id)!;
      return Number(entry.ratingAfter) - Number(entry.ratingBefore);
    };
    assert(change(userIds[winner]) > 0, "the winner gains rating");
    assert(change(userIds[loser]) < 0, "the loser pays rating");
    // The forfeit is journaled, so history replays to the same terminal state.
    assert.equal((await replay.validateFinalDeterminism(matchId)).deterministic, true);
    const action = await fixture.db.matchAction.findFirstOrThrow({ where: { matchId }, orderBy: { revision: "desc" } });
    assert.equal(action.actionType, "forfeitMatch");
    assert.equal(action.actorSeat, loser);
  }

  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const [one, two] = [await fixture.user("forfeitOne"), await fixture.user("forfeitTwo")];
    const ids = { P1: one.id, P2: two.id };
    const tokens = { P1: testAccessToken("P1", "forfeitOne", one.id), P2: testAccessToken("P2", "forfeitTwo", two.id) };

    // The window expires with the opponent present: over a pending initiative roll.
    const expired = await start(tokens);
    assert(expired.room.state.pendingRoll, "the absent player's roll must not hold the result back");
    await disconnect(expired.p2);
    await assertForfeit(expired.matchId, "P2", "disconnect", ids);
    assert.equal(expired.room.state.gameOver?.reason, "disconnect");
    await expired.p1.wait("roomState");
    await disconnect(expired.p1);
    await until(() => !getGameRoom(expired.room.id));
    // Too late: the room is gone and the player is told the match is over.
    const late = await connect();
    late.send({ type: "joinRoom", mode: "join", roomId: expired.room.id, role: "P2", accessToken: tokens.P2 });
    const refused = await late.wait("joinRejected");
    assert(refused.type === "joinRejected" && refused.reason === "match_finished");
    await disconnect(late);

    // Pressing leave is a loss too, and both players can start again right away.
    const left = await start(tokens);
    left.p1.send({ type: "leaveRoom" });
    await left.p1.wait("leftRoom");
    await assertForfeit(left.matchId, "P1", "surrender", ids);
    await disconnect(left.p1); await disconnect(left.p2);
    await until(() => !getGameRoom(left.room.id));

    // Both gone: no winner to name and no rating to move.
    const bothGone = await start(tokens);
    await disconnect(bothGone.p1); await disconnect(bothGone.p2);
    await until(async () => (await row(bothGone.matchId)).status === "CANCELLED");
    const neutral = await row(bothGone.matchId);
    assert.equal(neutral.finishReason, "SERVER_RECONNECT_GRACE_EXPIRED");
    assert.equal(neutral.winnerSeat, null);
    assert.equal(await fixture.db.ratingHistory.count({ where: { matchId: bothGone.matchId } }), 0);
    console.log("forfeit integration: expired window, leave, ratings, replay, late return, both gone passed");
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests(); storeTestHooks.reset();
    await fixture.dispose();
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
