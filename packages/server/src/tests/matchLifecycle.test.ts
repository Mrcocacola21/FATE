import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MatchLifecycle, MatchCreationError } from "../persistence/matchLifecycle";
import { getGameRoom, listGameRooms, storeTestHooks, type GameRoom } from "../store";
import { MemoryMatchPersistence, testIdentityService, testAccessToken } from "./matchTestSupport";
import { enqueueRoomCommand, fateRoomKey, getQueuedFateRoomIds } from "../roomQueue";
import { wsTestHooks } from "../ws";

const logs: object[] = [];
const logger = {
  info: (data: object) => logs.push(data),
  error: (data: object) => logs.push(data),
};

function ready(room: GameRoom) {
  room.seats = { P1: "one", P2: "two" };
  room.seatIdentities = {
    P1: { userId: randomUUID(), username: "Replacement", displayName: null },
    P2: { userId: randomUUID(), username: "Second", displayName: null },
  };
  room.state = {
    ...room.state,
    seats: { P1: true, P2: true },
    playersReady: { P1: true, P2: true },
  };
}
function prepareVictory(room: GameRoom) {
  room.state = {
    ...room.state,
    phase: "battle",
    pendingRoll: null,
    currentPlayer: "P1",
    ruleDeclaration: {
      ...room.state.ruleDeclaration,
      selectedRuleId: "normal_rule",
      setupComplete: true,
    },
    units: Object.fromEntries(
      Object.entries(room.state.units).map(([id, unit]) => [
        id,
        unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
      ]),
    ),
  };
}

async function run() {
  storeTestHooks.reset();
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  const room = await lifecycle.createRoom({ seed: 42 });
  assert(room.matchId && room.matchId !== room.id);
  const match = persistence.matches.get(room.matchId)!;
  assert.equal(match.status, "WAITING");
  assert.equal(match.roomId, room.id);
  assert.equal(match.seed, 42);

  const testRoom = await lifecycle.createRoom({ roomMode: "test" });
  assert.equal(testRoom.matchId, null);
  assert.equal(persistence.matches.size, 1);
  await lifecycle.syncParticipant(testRoom, "P1", "Sandbox");
  await lifecycle.applyAction(testRoom, { type: "endTurn" }, "P1");
  assert.equal(persistence.calls.length, 1);

  persistence.fail.add("create");
  const failedId = randomUUID();
  await assert.rejects(lifecycle.createRoom({}, failedId), MatchCreationError);
  assert.equal(getGameRoom(failedId), undefined);
  persistence.fail.clear();

  // The room is not discoverable or joinable while the database is still establishing it.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = new MatchLifecycle(logger, {
    ...bindPersistence(persistence),
    createWaitingMatch: async (input) => {
      await gate;
      return persistence.createWaitingMatch(input);
    },
  });
  const stagedId = randomUUID();
  const creating = delayed.createRoom({}, stagedId);
  assert.equal(getGameRoom(stagedId), undefined);
  assert(!listGameRooms().some((r) => r.id === stagedId));
  release();
  await creating;
  await delayed.close();

  await lifecycle.syncParticipant(room, "P1", "First");
  await lifecycle.syncParticipant(room, "P1", "Replacement");
  await lifecycle.syncParticipant(room, "P1", undefined, true);
  assert.equal(match.participants.size, 1);
  assert.equal(match.participants.get("P1")?.displayNameSnapshot, "Replacement");
  assert.equal(match.participants.get("P1")?.userId, null);
  persistence.fail.add("participant");
  room.seats.P2 = "two";
  await lifecycle.syncParticipant(room, "P2", "Second");
  assert.equal(room.seats.P2, "two");
  persistence.fail.clear();
  await lifecycle.retryPending();
  assert.equal(match.participants.size, 2);

  assert.equal((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok, false);
  assert.equal(match.status, "WAITING");
  ready(room);
  persistence.fail.add("start");
  assert.equal((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok, true);
  assert(room.state.pendingRoll);
  assert.equal(match.status, "WAITING");
  await lifecycle.syncParticipant(room, "P1", "Must not replace competitor");
  persistence.fail.clear();
  await lifecycle.retryPending();
  assert.equal(match.status, "IN_PROGRESS");
  assert(match.startedAt);
  assert.equal(match.participants.get("P1")?.displayNameSnapshot, "Replacement");

  const before = persistence.calls.length;
  const pending = room.state.pendingRoll!;
  await lifecycle.applyAction(
    room,
    { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player },
    pending.player,
  );
  assert.equal(
    persistence.calls.length,
    before,
    "ordinary pending rolls must not query PostgreSQL",
  );
  prepareVictory(room);
  persistence.fail.add("finish");
  const ended = await lifecycle.applyAction(room, { type: "endTurn" }, "P1");
  assert(ended.ok);
  assert.equal(room.state.phase, "ended");
  const finalRevision = room.revision;
  persistence.fail.clear();
  await lifecycle.retryPending();
  assert.equal(match.status, "FINISHED");
  assert.equal(match.result?.finalRevision, finalRevision);
  assert.equal(match.result?.winnerSeat, "P1");
  assert.equal(match.result?.winnerUserId, room.seatIdentities.P1!.userId);
  assert.equal(match.result?.loserUserId, room.seatIdentities.P2!.userId);
  assert.equal(match.result?.loserSeat, "P2");
  assert.equal(match.result?.turnCount, room.state.gameOver!.endedAtTurn);
  assert.equal(match.result?.finishReason, "allEnemyUnitsDefeated");
  assert.equal(match.participants.size, 2);
  await lifecycle.removeRoom(room);
  assert.equal(match.status, "FINISHED");

  // A start and finish that both fail are reconciled in order with their original timestamps.
  const lagged = await lifecycle.createRoom();
  ready(lagged);
  persistence.fail.add("start");
  await lifecycle.applyAction(lagged, { type: "startGame" }, "P1");
  prepareVictory(lagged);
  await lifecycle.applyAction(lagged, { type: "endTurn" }, "P1");
  assert.equal(persistence.matches.get(lagged.matchId!)!.status, "WAITING");
  persistence.fail.clear();
  await lifecycle.retryPending();
  assert.equal(persistence.matches.get(lagged.matchId!)!.status, "FINISHED");

  const waiting = await lifecycle.createRoom();
  waiting.lastActivityAt = 0;
  const active = await lifecycle.createRoom();
  ready(active);
  await lifecycle.applyAction(active, { type: "startGame" }, "P1");
  active.lastActivityAt = 0;
  await lifecycle.cleanup({ now: Date.now(), roomTtlMs: 1000 });
  assert.equal(getGameRoom(waiting.id), undefined);
  assert.equal(persistence.matches.get(waiting.matchId!)!.status, "CANCELLED");
  assert.equal(getGameRoom(active.id), undefined);
  assert.equal(persistence.matches.get(active.matchId!)!.status, "IN_PROGRESS");

  // Cleanup protects an in-flight command, and queues release after failures.
  const protectedRoom = await lifecycle.createRoom();
  protectedRoom.lastActivityAt = 0;
  await enqueueRoomCommand(fateRoomKey(protectedRoom.id), async () => {
    await lifecycle.cleanup({ now: Date.now(), roomTtlMs: 1000 });
    assert.equal(getGameRoom(protectedRoom.id), protectedRoom);
  });
  await assert.rejects(
    enqueueRoomCommand("fate:reject-test", () => {
      throw new Error("expected");
    }),
  );
  await enqueueRoomCommand("fate:reject-test", () => undefined);
  assert(!getQueuedFateRoomIds().has("reject-test"));
  assert(logs.some((data) => (data as { event?: string }).event === "match:persistence_failed"));
  await lifecycle.close();

  // Production/default wiring has no memory fallback when PostgreSQL is missing.
  const previous = process.env.DATABASE_URL;
  storeTestHooks.reset();
  delete process.env.DATABASE_URL;
  process.env.LOG_LEVEL = "silent";
  const server = await buildServer();
  try {
    for (const url of ["/rooms", "/api/games"]) {
      const count = listGameRooms().length;
      const response = await server.inject({ method: "POST", url, payload: {} });
      assert.equal(response.statusCode, 503);
      assert.equal(listGameRooms().length, count);
      assert(!response.body.includes("DATABASE_URL"));
    }
    assert.equal((await server.inject({ url: "/health" })).statusCode, 200);
    const unavailableResult = await server.inject({ url: `/api/matches/${randomUUID()}` });
    assert.equal(unavailableResult.statusCode, 503);
    assert.equal(unavailableResult.json().error.code, "MATCH_PERSISTENCE_UNAVAILABLE");
    assert(!unavailableResult.body.includes("DATABASE_URL"));
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    storeTestHooks.reset();
  }
  console.log("match lifecycle runtime and failure tests passed");
  await testDisconnectDuringCreation();
}

async function testDisconnectDuringCreation() {
  const persistence = new MemoryMatchPersistence();
  let entered!: () => void;
  let release!: () => void;
  const enteredCreation = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = await buildServer({
    connectionIdentity: testIdentityService(),
    matchPersistence: {
      ...bindPersistence(persistence),
      createWaitingMatch: async (input) => {
        entered();
        await gate;
        return persistence.createWaitingMatch(input);
      },
    },
  });
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  const socket = new WebSocket(address.replace("http:", "ws:") + "/ws");
  const id = randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ type: "joinRoom", mode: "create", roomId: id, role: "P1", accessToken: testAccessToken("P1") }));
    await enteredCreation;
    assert.equal(getGameRoom(id), undefined);
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.close();
    await closed;
    release();
    await enqueueRoomCommand(fateRoomKey(id), () => undefined);
    assert.equal(
      getGameRoom(id),
      undefined,
      "disconnected creator must not leave a ghost runtime seat",
    );
    assert.equal(Array.from(persistence.matches.values())[0].status, "CANCELLED");
    assert(!wsTestHooks.getActiveFateRoomIds().has(id));
  } finally {
    release();
    socket.terminate();
    await server.close();
    wsTestHooks.resetWsStateForTests();
    storeTestHooks.reset();
  }
  console.log("disconnect during persistent room creation passed");
}

function bindPersistence(p: MemoryMatchPersistence): MatchPersistenceBindings {
  return {
    createWaitingMatch: p.createWaitingMatch.bind(p),
    syncParticipant: p.syncParticipant.bind(p),
    removeWaitingParticipant: p.removeWaitingParticipant.bind(p),
    updateWaitingGameMode: p.updateWaitingGameMode.bind(p),
    markStarted: p.markStarted.bind(p),
    finalizeMatch: p.finalizeMatch.bind(p),
    appendAcceptedAction: p.appendAcceptedAction.bind(p),
    markCancelled: p.markCancelled.bind(p),
  };
}
type MatchPersistenceBindings = import("../services/matchService").MatchPersistence;

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
