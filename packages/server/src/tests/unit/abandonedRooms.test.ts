import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { MatchLifecycle } from "../../persistence/matchLifecycle";
import { activeMatchIdleMs, lobbyReconnectGraceMs, reconnectGraceMs } from "../../matches/reconnectPolicy";
import { getGameRoom, storeTestHooks, type GameRoom } from "../../store";
import { MemoryMatchPersistence } from "../matchTestSupport";

const logger = { info: () => undefined, error: () => undefined };
const identity = (userId: string) => ({ userId, username: userId, displayName: userId, avatarUrl: null }) as GameRoom["seatIdentities"]["P1"];

async function startedRoom(lifecycle: MatchLifecycle) {
  const room = await lifecycle.createRoom();
  room.seats = { P1: "one", P2: "two" };
  room.seatIdentities = { P1: identity("user-one"), P2: identity("user-two") };
  room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
  return room;
}

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

afterEach(() => {
  mock.timers.reset();
  storeTestHooks.reset();
});

test("a long database outage at the moment of victory delays the record, never loses it", async () => {
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  const room = await startedRoom(lifecycle);
  const match = persistence.matches.get(room.matchId!)!;
  prepareVictory(room);
  persistence.fail.add("finish");
  assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
  assert.equal(room.state.phase, "ended");

  // Far more passes than the fast attempts: ~5 seconds apart in production.
  for (let pass = 0; pass < 12; pass++) await lifecycle.retryPending();
  assert.equal(match.status, "IN_PROGRESS");

  persistence.fail.clear();
  mock.timers.enable({ apis: ["Date"], now: Date.now() + 10 * 60_000 });
  await lifecycle.retryPending();
  assert.equal(match.status, "FINISHED");
  assert.equal(match.result?.winnerSeat, "P1");
  assert.equal(match.result?.winnerUserId, "user-one");
  await lifecycle.close();
});

test("a started match with no accepted action for the idle limit ends without a result", async () => {
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  const room = await startedRoom(lifecycle);
  const match = persistence.matches.get(room.matchId!)!;
  let told = 0;
  lifecycle.onInterrupted = () => { told += 1; };

  await lifecycle.sweepAbandonedRooms(Date.now() + activeMatchIdleMs() - 60_000);
  assert.equal(match.status, "IN_PROGRESS", "a slow decision is not abandonment");

  await lifecycle.sweepAbandonedRooms(Date.now() + activeMatchIdleMs() + 60_000);
  assert.equal(match.status, "CANCELLED");
  assert.equal(match.finishReason, "SERVER_MATCH_IDLE");
  assert.equal(match.result, undefined);
  assert.equal(getGameRoom(room.id), undefined);
  assert.equal(told, 1);
  await lifecycle.close();
});

test("the idle limit never touches a finished match", async () => {
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  const room = await startedRoom(lifecycle);
  const match = persistence.matches.get(room.matchId!)!;
  prepareVictory(room);
  assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
  await lifecycle.drainActions();
  assert.equal(match.status, "FINISHED");

  await lifecycle.sweepAbandonedRooms(Date.now() + activeMatchIdleMs() * 2);
  assert.equal(match.status, "FINISHED");
  assert.equal(match.result?.winnerSeat, "P1");
  assert.equal(match.finishReason, undefined);
  await lifecycle.close();
});

test("a lobby nobody occupies closes, sooner than a matched pair's; an occupied one stays", async () => {
  const persistence = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, persistence);
  const empty = await lifecycle.createRoom();
  const occupied = await lifecycle.createRoom();
  occupied.seats.P1 = "host";
  const watched = await lifecycle.createRoom();
  watched.spectators.add("viewer");
  const reserved = await lifecycle.createRoom();
  reserved.reservedUserIds = { P1: "user-one", P2: "user-two" };
  const emptyMatch = persistence.matches.get(empty.matchId!)!;
  const reservedMatch = persistence.matches.get(reserved.matchId!)!;

  await lifecycle.sweepAbandonedRooms(Date.now() + lobbyReconnectGraceMs() - 5_000);
  assert(getGameRoom(empty.id), "a just created lobby has time to receive its creator");

  await lifecycle.sweepAbandonedRooms(Date.now() + lobbyReconnectGraceMs() + 5_000);
  assert.equal(getGameRoom(empty.id), undefined);
  assert.equal(emptyMatch.status, "CANCELLED");
  for (const room of [occupied, watched, reserved]) assert(getGameRoom(room.id));

  // A pair nobody showed up for must not keep both players out of the rated queue.
  await lifecycle.sweepAbandonedRooms(Date.now() + reconnectGraceMs() + 5_000);
  assert.equal(getGameRoom(reserved.id), undefined);
  assert.equal(reservedMatch.status, "CANCELLED");
  for (const room of [occupied, watched]) assert(getGameRoom(room.id));
  await lifecycle.close();
});
