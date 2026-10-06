import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerView } from "rules";
import { presentationSession, useGameStore } from "./store";
import type { PlayerRole, RoomStateMessage, ServerMessage } from "./ws";
import { MAX_PRESENTATION_BATCHES } from "./game/effects/presentationSession";

class MockSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    MockSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }
  emit(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const view = {
  boardSize: 9,
  units: {},
  pendingCombatQueueCount: 0,
  phase: "battle",
  currentPlayer: "P1",
  roundNumber: 1,
  turnNumber: 1,
} as unknown as PlayerView;
function roomSnapshot(
  revision: number,
  streamId = "S",
  roomId = "room",
  role: PlayerRole = "spectator",
): RoomStateMessage {
  return {
    type: "roomState",
    roomId,
    streamId,
    view,
    you: {
      role,
      seat: role === "spectator" ? undefined : role,
      isHost: false,
      canControlTestRoom: false,
    },
    meta: { ...useGameStore.getState().roomMeta!, revision },
  };
}
function ack(socket: MockSocket, roomId = "room", role: PlayerRole = "spectator") {
  socket.emit({
    type: "joinAck",
    roomId,
    role,
    seat: role === "spectator" ? undefined : role,
    isHost: false,
  });
}
function result(socket: MockSocket, revision: number, streamId = "S", eventId = `e${revision}`) {
  socket.emit({
    type: "actionResult",
    ok: true,
    revision,
    streamId,
    events: [{ type: "roundStarted", roundNumber: 1, eventId }],
  });
}
async function connected() {
  const pending = useGameStore.getState().connect();
  const socket = MockSocket.instances[MockSocket.instances.length - 1];
  socket.readyState = MockSocket.OPEN;
  socket.onopen?.();
  await pending;
  return socket;
}
async function withSocket(run: (socket: MockSocket) => void | Promise<void>) {
  const previous = useGameStore.getState();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: MockSocket });
  useGameStore.getState().resetGameState();
  useGameStore.setState({
    joined: false,
    roomId: null,
    role: null,
    resumeToken: null,
    fetchRooms: async () => {},
  });
  MockSocket.instances = [];
  try {
    await run(await connected());
  } finally {
    useGameStore.getState().resetGameState();
    useGameStore.setState({ joined: false, roomId: null, role: null, resumeToken: null });
    MockSocket.instances[MockSocket.instances.length - 1]?.close();
    // Let the shared connection's harmless deferred resume check finish.
    await new Promise((resolve) => setTimeout(resolve, 5));
    useGameStore.setState(previous);
    if (descriptor) Object.defineProperty(globalThis, "WebSocket", descriptor);
    else Reflect.deleteProperty(globalThis, "WebSocket");
  }
}

test("WS initial_snapshot_establishes_silent_baseline and live snapshot preserves same-revision result", async () => {
  await withSocket((socket) => {
    ack(socket);
    result(socket, 99);
    socket.emit(roomSnapshot(100));
    assert.equal(useGameStore.getState().presentationHydration, "live");
    assert.equal(presentationSession.baselineRevision, 100);
    assert.deepEqual(useGameStore.getState().pendingEventBatches, []);
    assert.equal(useGameStore.getState().roomState?.phase, "battle");
    socket.emit(roomSnapshot(101));
    result(socket, 101);
    assert.equal(presentationSession.baselineRevision, 100);
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [101],
    );
  });
});

test("WS prebaseline_results_are_buffered_then_filtered", async () => {
  await withSocket((socket) => {
    ack(socket);
    result(socket, 400);
    result(socket, 401);
    assert.deepEqual(useGameStore.getState().pendingEventBatches, []);
    socket.emit(roomSnapshot(400));
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [401],
    );
    assert.equal(useGameStore.getState().pendingEventBatches[0].view?.phase, "battle");
  });
});

test("WS multiple_fast_batches_are_not_lost_before_react_commit and IDs dedupe", async () => {
  await withSocket((socket) => {
    ack(socket);
    socket.emit(roomSnapshot(299));
    for (const revision of [300, 301, 302]) result(socket, revision);
    result(socket, 302);
    const queued = useGameStore.getState().pendingEventBatches;
    assert.deepEqual(
      queued.map((batch) => batch.revision),
      [300, 301, 302],
    );
    result(socket, 303, "S", "e300");
    const afterRebroadcast = useGameStore.getState().pendingEventBatches;
    assert.deepEqual(afterRebroadcast[afterRebroadcast.length - 1]?.events, []);
    result(socket, 304);
    useGameStore.getState().acknowledgeEventBatches(queued);
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [303, 304],
    );
  });
});

test("WS reconnect_snapshot_suppresses_old_results and stale_socket_callback_is_ignored", async () => {
  await withSocket(async (socketA) => {
    ack(socketA);
    socketA.emit(roomSnapshot(100));
    result(socketA, 101);
    const old = useGameStore.getState().pendingEventBatches[0];
    const lateMessage = socketA.onmessage!;
    const lateClose = socketA.onclose!;
    const lateError = socketA.onerror!;
    socketA.close();
    assert.equal(old.presentationToken?.cancelled, true);
    assert.equal(useGameStore.getState().presentationHydration, "awaitingBaseline");
    const socketB = await connected();
    ack(socketB);
    socketB.emit(roomSnapshot(200));
    for (const revision of [199, 200, 201, 201]) result(socketB, revision);
    const key = useGameStore.getState().presentationSessionKey;
    lateMessage({
      data: JSON.stringify({
        type: "actionResult",
        ok: true,
        streamId: "S",
        revision: 999,
        events: [{ type: "roundStarted", roundNumber: 1, eventId: "late" }],
      }),
    });
    lateClose();
    lateError();
    assert.equal(useGameStore.getState().presentationSessionKey, key);
    assert.equal(useGameStore.getState().connectionStatus, "connected");
    assert.equal(presentationSession.highestReceivedRevision, 201);
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [201],
    );
  });
});

test("WS role_change_clears_old_private_presentation and old recipient snapshot", async () => {
  await withSocket((socket) => {
    ack(socket, "room", "P1");
    socket.emit(roomSnapshot(100, "S", "room", "P1"));
    result(socket, 101);
    const old = useGameStore.getState().pendingEventBatches[0];
    ack(socket, "room", "spectator");
    assert.equal(old.presentationToken?.cancelled, true);
    assert.equal(useGameStore.getState().roomState, null);
    assert.deepEqual(useGameStore.getState().events, []);
    assert.deepEqual(useGameStore.getState().pendingEventBatches, []);
    socket.emit(roomSnapshot(102));
    assert.equal(useGameStore.getState().role, "spectator");
    result(socket, 101);
    assert.deepEqual(useGameStore.getState().pendingEventBatches, []);
    ack(socket, "room", "P2");
    socket.emit(roomSnapshot(103, "S", "room", "P2"));
    result(socket, 104);
    assert.equal(useGameStore.getState().pendingEventBatches.length, 1);
  });
});

test("WS room and stream changes reset presentation revision domain", async () => {
  await withSocket((socket) => {
    ack(socket);
    socket.emit(roomSnapshot(900));
    result(socket, 901);
    const old = useGameStore.getState().pendingEventBatches[0];
    socket.emit(roomSnapshot(3, "S2"));
    assert.equal(old.presentationToken?.cancelled, true);
    assert.deepEqual(useGameStore.getState().pendingEventBatches, []);
    assert.equal(presentationSession.baselineRevision, 3);
    result(socket, 4, "S2");
    result(socket, 902, "S");
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [4],
    );
    const next = useGameStore.getState().pendingEventBatches[0];
    ack(socket, "B");
    assert.equal(next.presentationToken?.cancelled, true);
    socket.emit(roomSnapshot(1, "S3", "B"));
    result(socket, 2, "S3");
    socket.emit(roomSnapshot(903, "S", "room"));
    assert.equal(useGameStore.getState().roomId, "B");
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [2],
    );
  });
});

test("WS ingress stays bounded when no board consumes it", async () => {
  await withSocket((socket) => {
    ack(socket);
    socket.emit(roomSnapshot(0));
    for (let revision = 1; revision <= MAX_PRESENTATION_BATCHES * 2; revision++)
      result(socket, revision);
    assert.equal(useGameStore.getState().pendingEventBatches.length, MAX_PRESENTATION_BATCHES);
    assert.equal(presentationSession.highestReceivedRevision, MAX_PRESENTATION_BATCHES * 2);
    result(socket, 1);
    assert.equal(useGameStore.getState().pendingEventBatches.length, MAX_PRESENTATION_BATCHES);
  });
});
