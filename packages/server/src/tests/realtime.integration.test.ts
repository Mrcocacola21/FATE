import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { makePlayerView, makeSpectatorView } from "rules";
import { buildServer } from "../index";
import { getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks, broadcastRoomState, broadcastActionResult } from "../ws";
import { testTokens } from "./matchTestSupport";
import { databaseFixture } from "./helpers/databaseFixture";
import { connectWs, type WsClient } from "./helpers/wsClient";
import { eventually } from "./helpers/eventually";

test("real PostgreSQL WS lifecycle: seats, safe projections, rejection, durable action, reconnect, block and matchmaking", async () => {
  const fixture = databaseFixture();
  const { db } = fixture;
  process.env.JWT_ACCESS_SECRET = testTokens.config.accessSecret;
  process.env.JWT_REFRESH_SECRET = testTokens.config.refreshSecret;
  storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
  const clients: WsClient[] = [];
  const server = await buildServer({ roomSeed: () => 37 });
  const token = (id: string) => testTokens.signAccessToken(id);
  try {
    const [a, b, outsider, admin] = await Promise.all([
      fixture.user("RealtimeA"), fixture.user("RealtimeB"), fixture.user("Outsider"), fixture.user("Admin", "ADMIN"),
    ]);
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    const connect = async () => { const client = await connectWs(address.replace("http:", "ws:") + "/ws"); clients.push(client); return client; };
    const p1 = await connect();
    p1.send({ type: "joinRoom", mode: "create", role: "P1", gameMode: "classic", matchType: "CASUAL", accessToken: token(a.id) });
    const ack = await p1.wait("joinAck");
    assert.equal(ack.seat, "P1");
    const roomId = ack.roomId, room = getGameRoom(roomId)!;
    fixture.matches.push(room.matchId!);
    const p2 = await connect(), spectator = await connect(), thief = await connect();
    p2.send({ type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: token(b.id) });
    assert.equal((await p2.wait("joinAck")).seat, "P2");
    spectator.send({ type: "joinRoom", mode: "join", roomId, role: "spectator" });
    assert.equal((await spectator.wait("joinAck")).role, "spectator");
    assert.equal(await db.matchParticipant.count({ where: { matchId: room.matchId! } }), 2);
    const revision = room.revision;
    spectator.send({ type: "action", action: { type: "endTurn" } });
    const denied = await spectator.wait("actionResult");
    assert.equal(denied.ok, false); assert.equal(denied.code, "NOT_SEATED");
    assert.equal(room.revision, revision);
    assert.equal(await db.matchAction.count({ where: { matchId: room.matchId! } }), 0);

    const ready = async (client: WsClient, seat: "P1" | "P2") => {
      client.send({ type: "setReady", ready: true });
      await client.waitFor(message => message.type === "roomState" && message.meta.ready[seat], `ready ${seat}`);
    };
    await ready(p1, "P1"); await ready(p2, "P2");
    p1.send({ type: "startGame" });
    await p1.waitFor(message => message.type === "roomState" && !!message.meta.pendingRoll, "initiative requested");
    const pending = room.state.pendingRoll!;
    assert(pending);
    const before = room.revision;
    const actor = pending.player === "P1" ? p1 : p2;
    actor.send({ type: "action", action: { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id } });
    assert.equal((await actor.wait("actionResult")).ok, true);
    const frames = await Promise.all([p1, p2, spectator].map(client => client.waitFor(message => message.type === "roomState" && message.meta.revision === before + 1, "action projection")));
    const projections = [makePlayerView(room.state, "P1"), makePlayerView(room.state, "P2"), makeSpectatorView(room.state)];
    for (const [index, frame] of frames.entries()) {
      assert(frame.type === "roomState");
      assert.deepEqual(frame.view, JSON.parse(JSON.stringify(projections[index])));
      assert(!JSON.stringify(frame).includes(testTokens.config.accessSecret));
      assert(!JSON.stringify(frame).includes('"rngState"'));
    }
    await eventually(async () => await db.matchAction.findUnique({
      where: { matchId_revision: { matchId: room.matchId!, revision: before + 1 } },
    }) ?? false, "accepted action persisted asynchronously");
    const rejectedRevision = room.revision;
    actor.send({ type: "action", action: { type: "resolvePendingRoll", player: pending.player, pendingRollId: "stale-roll" } });
    assert.equal((await actor.wait("actionResult")).ok, false);
    assert.equal(room.revision, rejectedRevision);
    assert.equal(await db.matchAction.count({ where: { matchId: room.matchId!, revision: rejectedRevision + 1 } }), 0);

    // Seed actual private/public marker fixtures for the transport projection boundary.
    // Restore the journal-backed live state before accepting further gameplay.
    const liveState = room.state;
    room.state = { ...liveState, stakeMarkers: [
      { id: "private-stake", owner: "P1", position: { col: 2, row: 3 }, createdAt: 1, isRevealed: false },
      { id: "public-stake", owner: "P1", position: { col: 5, row: 6 }, createdAt: 2, isRevealed: true },
    ] };
    try {
      for (const client of [p1, p2, spectator]) client.messages.length = 0;
      broadcastRoomState(room);
      const privateFrames = await Promise.all([p1, p2, spectator].map(client => client.wait("roomState")));
      assert.deepEqual(privateFrames[0].view.stakeMarkers, [
        { position: { col: 2, row: 3 }, isRevealed: false },
        { position: { col: 5, row: 6 }, isRevealed: true },
      ]);
      for (const frame of privateFrames.slice(1))
        assert.deepEqual(frame.view.stakeMarkers, [{ position: { col: 5, row: 6 }, isRevealed: true }]);
      for (const client of [p1, p2, spectator]) client.messages.length = 0;
      broadcastActionResult({ gameId: roomId, ok: true, events: [
        { type: "stakesPlaced", owner: "P1", positions: [{ col: 2, row: 3 }], hiddenFromOpponent: true },
      ] });
      const privateEvents = await Promise.all([p1, p2, spectator].map(client => client.wait("actionResult")));
      assert.equal(privateEvents[0].events.length, 1);
      const safePlacementNotice = [{ type: "hiddenSetupCompleted", owner: "P1", ability: "hidden" }];
      assert.deepEqual(privateEvents[1].events, safePlacementNotice);
      assert.deepEqual(privateEvents[2].events, safePlacementNotice);
    } finally { room.state = liveState; }

    await p1.close();
    thief.send({ type: "joinRoom", mode: "join", roomId, role: "P1", accessToken: token(outsider.id) });
    assert.equal((await thief.wait("error")).code, "SEAT_OWNED_BY_ANOTHER_USER");
    const resumed = await connect();
    resumed.send({ type: "joinRoom", mode: "join", roomId, role: "P1", accessToken: token(a.id), resumeToken: ack.resumeToken });
    assert.equal((await resumed.wait("joinAck")).seat, "P1");
    const current = await resumed.wait("roomState");
    assert.equal(current.meta.revision, rejectedRevision);
    assert.deepEqual(current.view, JSON.parse(JSON.stringify(makePlayerView(room.state, "P1"))));
    const closure = once(resumed.socket, "close");
    const blocked = await server.inject({ method: "POST", url: `/api/admin/users/${a.id}/block`, headers: { authorization: `Bearer ${token(admin.id)}` }, payload: { reason: "Synthetic test" } });
    assert.equal(blocked.statusCode, 200, blocked.body);
    await closure;
    const blockedConnection = await connect();
    blockedConnection.send({ type: "joinRoom", mode: "join", roomId, role: "P1", accessToken: token(a.id) });
    assert.equal((await blockedConnection.wait("error")).code, "ACCOUNT_BLOCKED");
    assert.equal(room.revision, rejectedRevision);
    assert.equal(await db.auditLog.count({ where: { targetUserId: a.id, eventType: "USER_BLOCKED" } }), 1);

    const [q1, q2] = await Promise.all([fixture.user("QueueA"), fixture.user("QueueB")]);
    const queued = await Promise.all([connect(), connect()]);
    for (const [index, client] of queued.entries()) {
      client.send({ type: "matchmakingSubscribe", accessToken: token([q1, q2][index].id), requestId: `queue-${index}` });
      await client.wait("matchmakingSubscribed");
      const response = await server.inject({ method: "POST", url: "/api/matchmaking/queue", headers: { authorization: `Bearer ${token([q1, q2][index].id)}` }, payload: { gameMode: "draft" } });
      assert.equal(response.statusCode, 200, response.body);
    }
    const found = await Promise.all(queued.map(client => client.wait("matchmakingFound")));
    assert(found[0].status.status === "MATCH_FOUND" && found[1].status.status === "MATCH_FOUND");
    assert.equal(found[0].status.matchId, found[1].status.matchId);
    assert.notEqual(found[0].status.seat, found[1].status.seat);
    fixture.matches.push(found[0].status.matchId);
    const match = await db.match.findUniqueOrThrow({ where: { id: found[0].status.matchId }, include: { participants: true } });
    assert.equal(match.isRated, true); assert.equal(match.gameMode, "draft"); assert.equal(match.participants.length, 2);
    assert.equal(await db.match.count({ where: { roomId: match.roomId! } }), 1);
    for (const [index, client] of queued.entries()) {
      const status = found[index].status;
      assert(status.status === "MATCH_FOUND");
      client.send({ type: "joinRoom", mode: "join", roomId: status.roomId, role: status.seat, accessToken: token([q1, q2][index].id) });
      assert.equal((await client.wait("joinAck")).seat, status.seat);
    }
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
    storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
    await fixture.dispose();
  }
});
