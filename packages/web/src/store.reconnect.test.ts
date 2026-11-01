import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { PlayerView } from "rules";
import { useGameStore } from "./store";
import { authStore } from "./auth/authStore";
import { ApiError } from "./api/client";
import { loadRoomSession, saveRoomSession } from "./roomSession";
import type { RoomMeta, ServerMessage } from "./ws";
import {
  formatReconnectCountdown,
  getDisconnectedSeat,
} from "./game/components/MinimalBattleStatus";

class MockSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockSocket[] = [];
  readyState = 0;
  sent: Array<{ type: string; roomId?: string; role?: string; resumeToken?: string }> = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() {
    MockSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  open() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.();
  }
  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.();
  }
  fail() {
    this.readyState = MockSocket.CLOSED;
    this.onerror?.(new Error("unreachable"));
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
  currentPlayer: "P2",
  roundNumber: 1,
  turnNumber: 1,
} as unknown as PlayerView;
const session = { roomId: "room", role: "P1", seat: "P1", resumeToken: "resume", roomMode: "normal" } as const;
const latestSocket = () => MockSocket.instances[MockSocket.instances.length - 1];
const flush = () => new Promise(resolve => setImmediate(resolve));

function snapshot(revision: number, disconnectedSeats?: RoomMeta["disconnectedSeats"]): ServerMessage {
  return {
    type: "roomState",
    roomId: "room",
    streamId: "S",
    view,
    you: { role: "P1", seat: "P1", isHost: false, canControlTestRoom: false },
    meta: { ...useGameStore.getState().roomMeta!, revision, disconnectedSeats },
  };
}
const ack = (socket: MockSocket) =>
  socket.emit({ type: "joinAck", roomId: "room", role: "P1", seat: "P1", isHost: false, resumeToken: "resume" });

/** Runs one reconnect attempt to the point the room has been rejoined. */
async function rejoin() {
  mock.timers.tick(10_000);
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  const join = socket.sent.find(message => message.type === "joinRoom");
  assert.equal(join?.resumeToken, "resume");
  assert.equal(join?.roomId, "room");
  ack(socket);
  socket.emit(snapshot(7));
  return socket;
}

let storage: Map<string, string>;
const previousAuth = authStore.getState();
const previousStore = useGameStore.getState();
beforeEach(() => {
  storage = new Map();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      location: { protocol: "http:", host: "localhost", pathname: "/", search: "", hash: "" },
    },
  });
  Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: MockSocket });
  MockSocket.instances = [];
  useGameStore.getState().resetGameState();
  useGameStore.setState({ joined: false, roomId: null, role: null, seat: null, resumeToken: null, fetchRooms: async () => {} });
  authStore.setState({ status: "authenticated", getValidAccessToken: async () => "access" });
  saveRoomSession(session);
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
});
afterEach(async () => {
  storage.clear();
  latestSocket()?.close();
  mock.timers.tick(10_000);
  mock.timers.reset();
  await flush();
  useGameStore.setState(previousStore);
  authStore.setState(previousAuth, true);
  Reflect.deleteProperty(globalThis, "WebSocket");
  Reflect.deleteProperty(globalThis, "window");
});

test("a reload during an outage shows the match and keeps trying while the token cannot refresh", async () => {
  let online = false;
  let refreshAttempts = 0;
  authStore.setState({
    getValidAccessToken: async () => {
      refreshAttempts += 1;
      if (!online) throw new ApiError("NETWORK_ERROR");
      return "access";
    },
  });
  // The mount and auth effects both resume; neither may leave an unhandled rejection.
  await Promise.all([useGameStore.getState().resumeRoom(), useGameStore.getState().resumeRoom()]);
  assert.equal(useGameStore.getState().roomId, "room", "the stored seat opens the match screen");
  assert.equal(useGameStore.getState().joined, false);
  assert.equal(MockSocket.instances.length, 0);

  for (let outage = 0; outage < 5; outage++) {
    mock.timers.tick(10_000);
    await flush();
  }
  assert.equal(refreshAttempts, 6, "each failed refresh schedules the next attempt");
  assert.ok(loadRoomSession(), "a network failure never forgets the seat");

  online = true;
  await rejoin();
  assert.equal(useGameStore.getState().joined, true);
  assert.equal(useGameStore.getState().hasSnapshot, true);
});

test("a lost socket keeps the board under the banner until the snapshot replaces it", async () => {
  void useGameStore.getState().resumeRoom();
  await flush();
  const first = latestSocket();
  first.open();
  await flush();
  ack(first);
  first.emit(snapshot(5));

  first.close();
  let state = useGameStore.getState();
  assert.equal(state.joined, false);
  assert.equal(state.connectionStatus, "disconnected");
  assert.equal(state.roomId, "room");
  assert.equal(state.hasSnapshot, true);
  assert.equal(state.roomState?.phase, "battle");

  // Failing attempts do not lose the board or the seat.
  mock.timers.tick(10_000);
  await flush();
  latestSocket().fail();
  await flush();
  assert.equal(useGameStore.getState().hasSnapshot, true);
  assert.ok(loadRoomSession());

  mock.timers.tick(10_000);
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  ack(socket);
  assert.equal(useGameStore.getState().hasSnapshot, true, "no loading flash between ack and snapshot");
  socket.emit(snapshot(8));
  state = useGameStore.getState();
  assert.equal(state.joined, true);
  assert.equal(state.roomMeta?.revision, 8);
});

test("an unanswered heartbeat ends a dead socket; any message keeps it alive", async () => {
  void useGameStore.getState().resumeRoom();
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  ack(socket);
  socket.emit(snapshot(5));

  for (let beat = 0; beat < 3; beat++) {
    mock.timers.tick(10_000);
    socket.emit({ type: "heartbeatAck" });
  }
  assert.equal(socket.sent.filter(message => message.type === "heartbeat").length, 3);
  assert.equal(useGameStore.getState().connectionStatus, "connected");

  mock.timers.tick(10_000);
  assert.equal(useGameStore.getState().connectionStatus, "connected", "one probe is still in flight");
  mock.timers.tick(10_000);
  assert.equal(useGameStore.getState().connectionStatus, "disconnected");
  assert.equal(socket.readyState, MockSocket.CLOSED);

  await rejoin();
  assert.equal(useGameStore.getState().joined, true);
});

test("a rejected rejoin on a live socket is retried unless the seat is truly gone", async () => {
  void useGameStore.getState().resumeRoom();
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  const joins = () => socket.sent.filter(message => message.type === "joinRoom").length;
  assert.equal(joins(), 1);
  socket.emit({ type: "error", code: "DATABASE_UNAVAILABLE", message: "Database unavailable" });
  mock.timers.tick(10_000);
  await flush();
  assert.equal(joins(), 2);

  socket.emit({ type: "error", code: "RESUME_IDENTITY_MISMATCH", message: "Another account" });
  mock.timers.tick(10_000);
  await flush();
  assert.equal(joins(), 2);
});

test("the opponent's countdown comes from the server's remaining time", async () => {
  void useGameStore.getState().resumeRoom();
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  ack(socket);
  const before = Date.now();
  socket.emit(snapshot(5, { P1: null, P2: 125_000 }));
  const deadlines = useGameStore.getState().seatReconnectDeadlines;
  assert.equal(deadlines.P1, null);
  assert.ok(deadlines.P2! >= before + 125_000);
  assert.deepEqual(getDisconnectedSeat(deadlines, "P1"), { seat: "P2", deadline: deadlines.P2 });
  assert.equal(getDisconnectedSeat(deadlines, "P2"), null, "never your own seat");
  assert.equal(formatReconnectCountdown(125_000), "2:05");
  assert.equal(formatReconnectCountdown(-5), "0:00");

  socket.emit(snapshot(5, { P1: null, P2: null }));
  assert.equal(useGameStore.getState().seatReconnectDeadlines.P2, null, "the return clears it");
});

test("after the window the match ends for this client and retries stop", async () => {
  void useGameStore.getState().resumeRoom();
  await flush();
  const socket = latestSocket();
  socket.open();
  await flush();
  socket.emit({ type: "joinRejected", reason: "match_interrupted", message: "MATCH_INTERRUPTED" });
  const state = useGameStore.getState();
  assert.equal(state.joinError, "MATCH_INTERRUPTED");
  assert.equal(state.roomId, null);
  assert.equal(loadRoomSession(), null);

  const attempts = MockSocket.instances.length;
  socket.close();
  mock.timers.tick(60_000);
  await flush();
  assert.equal(MockSocket.instances.length, attempts);
});
