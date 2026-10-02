import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { mock } from "node:test";
import WebSocket from "ws";
import { buildServer } from "../index";
import {
  assertSeatIdentity,
  ConnectionIdentityService,
  hasDistinctPlayerIdentities,
} from "../auth/connectionIdentity";
import type { UserWithProfile } from "../repositories/userRepository";
import { createGameRoomWithId, getGameRoom, storeTestHooks } from "../store";
import { wsTestHooks, type ServerMessage } from "../ws";
import { MemoryMatchPersistence, testTokens } from "./matchTestSupport";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";

async function run() {
  process.env.LOG_LEVEL = "silent";
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  const userA: string = randomUUID(),
    userB: string = randomUUID();
  let profileName = "Alice Profile";
  let accountReads = 0,
    verifications = 0;
  const identities = new ConnectionIdentityService(testTokens, {
    findAccountById: async (id) => {
      accountReads++;
      if (![userA, userB].includes(id)) return null;
      return {
        id,
        profile: {
          username: id === userA ? "alice" : "bob",
          displayName: id === userA ? profileName : "  ",
        },
      } as UserWithProfile;
    },
  });
  const persistence = new MemoryMatchPersistence();
  const server = await buildServer({
    matchPersistence: persistence,
    connectionIdentity: {
      verify: (token) => {
        verifications++;
        return identities.verify(token);
      },
    },
  });
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  const sockets: WebSocket[] = [];
  async function connect() {
    const socket = new WebSocket(address.replace("http:", "ws:") + "/ws");
    sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return {
      socket,
      messages,
      send: (message: object) => {
        messages.length = 0;
        socket.send(JSON.stringify(message));
      },
      wait: async (type: ServerMessage["type"]) => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const message = messages.find((m) => m.type === type);
          if (message) return message;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error(`Timed out waiting for ${type}`);
      },
    };
  }
  const tokenA = testTokens.signAccessToken(userA),
    tokenB = testTokens.signAccessToken(userB);
  try {
    const p1 = await connect();
    const id = randomUUID();
    p1.send({ type: "joinRoom", mode: "create", roomId: id, role: "P1" });
    assert.equal(((await p1.wait("error")) as { code: string }).code, "AUTH_REQUIRED");
    assert.equal(getGameRoom(id), undefined);
    p1.send({
      type: "joinRoom",
      mode: "create",
      roomId: id,
      role: "P1",
      accessToken: tokenA,
      userId: userB,
      name: "Forged Name",
    });
    const ack = await p1.wait("joinAck");
    assert(ack.type === "joinAck" && ack.resumeToken);
    const room = getGameRoom(id)!;
    const match = persistence.matches.get(room.matchId!)!;
    assert.equal(room.seatIdentities.P1?.userId, userA);
    assert.equal(match.createdById, userA);
    assert.equal(match.participants.get("P1")?.userId, userA);
    assert.equal(match.participants.get("P1")?.displayNameSnapshot, profileName);
    const state = await p1.wait("roomState");
    assert(state.type === "roomState");
    assert.equal(state.meta.playerNames.P1, profileName);
    assert(!JSON.stringify(state).includes(tokenA));
    assert(!JSON.stringify(room).includes(tokenA));
    assert.notEqual(room.seats.P1, userA);

    const other = await connect();
    const join = { type: "joinRoom", mode: "join", roomId: id, role: "P2" };
    other.send({ ...join, accessToken: tokenA });
    assert.equal(((await other.wait("error")) as { code: string }).code, "USER_ALREADY_IN_MATCH");
    assert.equal(match.participants.size, 1);
    for (const token of [
      "invalid",
      jwt.sign({ type: "access" }, testTokens.config.accessSecret, {
        subject: userB,
        expiresIn: -1,
      }),
      testTokens.signRefreshToken(userB, randomUUID(), new Date(Date.now() + 60000)),
      testTokens.signAccessToken(randomUUID()),
      jwt.sign({ type: "refresh" }, testTokens.config.accessSecret, {
        subject: userB,
        expiresIn: 60,
      }),
    ]) {
      other.send({ ...join, accessToken: token });
      const error = await other.wait("error");
      assert(error.type === "error" && error.code === "INVALID_ACCESS_TOKEN");
      assert(!JSON.stringify(error).includes(token));
    }
    other.send(join);
    assert.equal(((await other.wait("error")) as { code: string }).code, "AUTH_REQUIRED");
    other.send({ ...join, accessToken: tokenB, userId: userA, name: "Fake Bob" });
    await other.wait("joinAck");
    assert.equal(match.participants.get("P2")?.userId, userB);
    assert.equal(match.participants.get("P2")?.displayNameSnapshot, "bob");
    assert(hasDistinctPlayerIdentities(room));
    const anonymous = await connect();
    anonymous.send({ ...join, role: "spectator" });
    await anonymous.wait("joinAck");
    const authenticated = await connect();
    authenticated.send({ ...join, role: "spectator", accessToken: tokenA });
    await authenticated.wait("joinAck");
    assert.equal(match.participants.size, 2);
    assert(wsTestHooks.getRoomConnectionIdentities(id).some((identity) => identity === null));
    assert(
      wsTestHooks.getRoomConnectionIdentities(id).filter((identity) => identity?.userId === userA)
        .length === 2,
    );
    const anonymousView = await anonymous.wait("roomState"),
      authenticatedView = await authenticated.wait("roomState");
    assert(anonymousView.type === "roomState" && authenticatedView.type === "roomState");
    assert.deepEqual(anonymousView.view, authenticatedView.view);
    anonymous.send({ type: "switchRole", role: "P1" });
    assert.equal(((await anonymous.wait("error")) as { code: string }).code, "AUTH_REQUIRED");
    anonymous.send({ type: "action", action: { type: "endTurn" } });
    const spectatorAction = await anonymous.wait("actionResult");
    assert(spectatorAction.type === "actionResult" && !spectatorAction.ok);
    assert.equal(persistence.actions.size, 0);

    p1.send({ type: "setReady", ready: true });
    await p1.wait("actionResult");
    other.send({ type: "setReady", ready: true });
    await other.wait("actionResult");
    const identityP2 = room.seatIdentities.P2;
    room.seatIdentities.P2 = null;
    p1.send({ type: "startGame" });
    const missingIdentity = await p1.wait("actionResult");
    assert(missingIdentity.type === "actionResult" && !missingIdentity.ok);
    assert.equal(match.status, "WAITING");
    assert.equal(persistence.actions.size, 0, "rejected start and readiness are not durable actions");
    room.seatIdentities.P2 = identityP2;
    p1.send({ type: "startGame" });
    await p1.wait("actionResult");
    assert.equal(match.status, "IN_PROGRESS");
    assert.equal(persistence.actions.size, 1);
    assert.equal([...persistence.actions.values()][0].actorUserId, userA);
    assert(room.participantsLocked);
    const participantBefore = JSON.stringify(Array.from(match.participants));
    const ownerConnection = room.seats.P1;
    const closed = new Promise((resolve) => p1.socket.once("close", resolve));
    p1.socket.close();
    await closed;
    await enqueueRoomCommand(fateRoomKey(id), () => undefined);
    const graceDeadline = Date.now() + 3000;
    while (!wsTestHooks.hasSeatGraceToken(ack.resumeToken) && Date.now() < graceDeadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert(wsTestHooks.hasSeatGraceToken(ack.resumeToken));
    const resumed = await connect();
    const resume = { ...join, role: "P1", resumeToken: ack.resumeToken };
    resumed.send({ ...resume, accessToken: tokenB });
    assert.equal(
      ((await resumed.wait("error")) as { code: string }).code,
      "RESUME_IDENTITY_MISMATCH",
    );
    assert.equal(room.seats.P1, ownerConnection);
    assert(wsTestHooks.hasSeatGraceToken(ack.resumeToken));
    resumed.send({ ...resume, accessToken: tokenA, resumeToken: "wrong" });
    assert.equal(((await resumed.wait("error")) as { code: string }).code, "INVALID_RESUME_TOKEN");
    profileName = "Changed Profile";
    resumed.send({ ...resume, accessToken: tokenA });
    await resumed.wait("joinAck");
    assert.notEqual(room.seats.P1, ownerConnection);
    assert(!wsTestHooks.hasSeatGraceToken(ack.resumeToken));
    assert.equal(JSON.stringify(Array.from(match.participants)), participantBefore);
    assert.equal(match.status, "IN_PROGRESS");
    assert.equal(persistence.actions.size, 1, "reconnect cannot append a duplicate start");
    const resumedState = await resumed.wait("roomState");
    assert(resumedState.type === "roomState");
    assert.equal(resumedState.meta.playerNames.P1, "Alice Profile");
    resumed.send({ type: "switchRole", role: "spectator" });
    assert.equal(((await resumed.wait("error")) as { code: string }).code, "MATCH_IDENTITY_LOCKED");

    // Advance the JWT clock past expiration without waiting real minutes.
    const now = Date.now;
    Date.now = () => now() + (testTokens.config.accessTtlSeconds + 1) * 1000;
    const readsBefore = accountReads,
      verifiesBefore = verifications,
      callsBefore = persistence.calls.length;
    try {
      assert.throws(() => testTokens.verifyAccessToken(tokenA));
      const pending = room.state.pendingRoll!;
      const actor = pending.player === "P1" ? resumed : other;
      actor.send({ type: "resolvePendingRoll", pendingRollId: pending.id });
      const action = await actor.wait("actionResult");
      assert(action.type === "actionResult" && action.ok);
      assert.equal(accountReads, readsBefore);
      assert.equal(verifications, verifiesBefore);
      assert.equal(persistence.calls.length, callsBefore);
      assert.equal(persistence.actions.size, 2);
      const rollRecord = [...persistence.actions.values()].find((entry) => entry.actionType === "resolvePendingRoll")!;
      assert.equal(rollRecord.actorUserId, pending.player === "P1" ? userA : userB);
      assert.equal(rollRecord.actorSeat, pending.player);
      assert(!JSON.stringify([...persistence.actions.values()]).includes(ack.resumeToken!));
      const fresh = await connect();
      fresh.send({ ...resume, accessToken: tokenA });
      assert.equal(((await fresh.wait("error")) as { code: string }).code, "INVALID_ACCESS_TOKEN");
    } finally {
      Date.now = now;
    }

    // Grace expires only transport occupancy after start; durable identity cannot be replaced.
    const expiredRoom = createGameRoomWithId(randomUUID(), { hostConnId: "expired-conn" });
    expiredRoom.participantsLocked = true;
    expiredRoom.seatIdentities.P1 = { userId: userA, username: "alice", displayName: null };
    expiredRoom.seatTokens.P1 = "expired-resume";
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      wsTestHooks.scheduleSeatGrace(expiredRoom, {
        channel: "fate",
        roomId: expiredRoom.id,
        role: "P1",
        seat: "P1",
        connId: "expired-conn",
        resumeToken: "expired-resume",
      });
      mock.timers.tick(Number(process.env.RECONNECT_GRACE_MS ?? 45000) + 1);
      await enqueueRoomCommand(fateRoomKey(expiredRoom.id), () => undefined);
      assert.equal(expiredRoom.seats.P1, null);
      assert.equal(expiredRoom.seatIdentities.P1.userId, userA);
      assert.equal(expiredRoom.seatTokens.P1, "expired-resume");
      assert.throws(
        () =>
          assertSeatIdentity(
            expiredRoom,
            "P1",
            { userId: userB, username: "bob", displayName: null },
            "expired-resume",
          ),
        (error: unknown) => (error as { code: string }).code === "RESUME_IDENTITY_MISMATCH",
      );
      assert.doesNotThrow(() =>
        assertSeatIdentity(
          expiredRoom,
          "P1",
          { userId: userA, username: "alice", displayName: null },
          "expired-resume",
        ),
      );
    } finally {
      mock.timers.reset();
    }
    console.log(
      "authenticated multiplayer identity, forgery, spectators, reconnect and action isolation passed",
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests();
    storeTestHooks.reset();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
