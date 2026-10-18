import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MatchLifecycle } from "../../persistence/matchLifecycle";
import { MemoryMatchPersistence } from "../matchTestSupport";
import { getGameRoom, deleteGameRoom, storeTestHooks } from "../../store";
import { enqueueRoomCommand, fateRoomKey } from "../../roomQueue";
import { reconnectGraceMs } from "../../matches/reconnectPolicy";

const logger = { info() {}, error() {} };
async function setup() {
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, memory);
  const room = await lifecycle.createRoom();
  room.seats = { P1: "one", P2: "two" };
  room.seatIdentities = { P1: { userId: randomUUID(), username: "one", displayName: null },
    P2: { userId: randomUUID(), username: "two", displayName: null } };
  room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
  await lifecycle.drainActions();
  return { memory, lifecycle, room };
}

test("queued reconnect wins over an already fired recovery timeout; timeout winner cannot be revived", async t => {
  const { memory, lifecycle, room } = await setup();
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    lifecycle.startRecoveryGrace(room);
    const connected = enqueueRoomCommand(fateRoomKey(room.id), () => {
      lifecycle.participantConnected(room, "P1"); lifecycle.participantConnected(room, "P2");
    });
    // Timeout fires while reconnect is queued first. Its identity check runs under the same queue.
    t.mock.timers.tick(reconnectGraceMs() + 1);
    await connected;
    await enqueueRoomCommand(fateRoomKey(room.id), () => undefined);
    assert.equal(memory.matches.get(room.matchId!)!.status, "IN_PROGRESS");
    lifecycle.startRecoveryGrace(room);
    t.mock.timers.tick(reconnectGraceMs() + 1);
    await enqueueRoomCommand(fateRoomKey(room.id), () => lifecycle.participantConnected(room, "P1"));
    assert.equal(getGameRoom(room.id), undefined);
    assert.equal(memory.matches.get(room.matchId!)!.status, "CANCELLED");
    assert.equal(memory.calls.filter(call => call === "interrupt").length, 1);
    assert.equal((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok, false);
  } finally {
    t.mock.timers.reset(); await lifecycle.close(); storeTestHooks.reset();
  }
});

test("interruption failure blocks actions until retry commits; duplicate cleanup is harmless", async () => {
  const { memory, lifecycle, room } = await setup();
  try {
    memory.fail.add("interrupt");
    await enqueueRoomCommand(fateRoomKey(room.id), () => lifecycle.interruptRoom(room, "SERVER_PARTICIPANT_LEFT"));
    assert.equal(getGameRoom(room.id), room);
    assert.equal((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok, false);
    memory.fail.clear();
    await lifecycle.retryPending();
    assert.equal(getGameRoom(room.id), undefined);
    const count = memory.calls.length;
    await lifecycle.interruptRoom(room, "SERVER_RECONNECT_GRACE_EXPIRED");
    await lifecycle.retryPending();
    assert.equal(memory.calls.length, count);
    assert.equal(memory.matches.get(room.matchId!)!.status, "CANCELLED");
  } finally { await lifecycle.close(); storeTestHooks.reset(); }
});

test("a missing runtime with a failed local journal converges to neutral interruption", async () => {
  const { memory, lifecycle, room } = await setup();
  try {
    lifecycle.actionQueue.fail(room.matchId!, "MATCH_ACTION_WRITE_FAILED");
    deleteGameRoom(room.id);
    assert(await lifecycle.prepareMissingRoom(room.matchId!));
    assert.equal(memory.matches.get(room.matchId!)!.status, "CANCELLED");
    assert.equal(memory.matches.get(room.matchId!)!.result, undefined);
  } finally { await lifecycle.close(); storeTestHooks.reset(); }
});
