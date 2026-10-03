import assert from "node:assert/strict";
import test from "node:test";
import { createQueueStore } from "./store";
import { parseMatchmakingStatus } from "../api/matchmakingApi";
import { ApiError } from "../api/client";
import type { MatchmakingStatus } from "./types";

const waiting: MatchmakingStatus = {
  status: "QUEUED",
  joinedAt: "2026-10-03T10:00:00Z",
  waitMs: 30000,
  rating: 1500,
  currentRange: 200,
  gameMode: "classic",
  available: true,
};
const found: MatchmakingStatus = {
  status: "MATCH_FOUND",
  matchId: "match",
  roomId: "room",
  seat: "P2",
  gameMode: "classic",
  matchType: "RATED",
  opponent: { displayName: "Opponent" },
};
test("restore preserves server queue progress; Find uses mode only and Cancel clears state", async () => {
  const modes: string[] = [];
  let connected = 0,
    cancelled = 0;
  const queue = createQueueStore(
    {
      status: async () => waiting,
      rating: async () => 1500,
      join: async (mode) => {
        modes.push(mode);
        return waiting;
      },
      cancel: async () => {
        cancelled++;
        return { status: "NOT_QUEUED" };
      },
    },
    async () => {
      connected++;
    },
  );
  queue.owner("alice");
  await queue.restore();
  assert.deepEqual(queue.state.getState().status, waiting);
  await queue.join("classic");
  assert.deepEqual(modes, ["classic"]);
  assert.equal(connected, 1);
  await queue.cancel();
  assert.equal(cancelled, 1);
  assert.equal(queue.state.getState().status.status, "NOT_QUEUED");
});
test("newer Match Found wins over slow HTTP; stale events after cancel cannot requeue", async () => {
  let resolve!: (s: MatchmakingStatus) => void;
  const queue = createQueueStore(
    {
      status: async () => waiting,
      rating: async () => 1500,
      join: () =>
        new Promise((r) => {
          resolve = r;
        }),
      cancel: async () => ({ status: "NOT_QUEUED" }),
    },
    async () => undefined,
  );
  queue.owner("alice");
  const joining = queue.join("classic");
  await Promise.resolve();
  await Promise.resolve();
  queue.event({ type: "matchmakingFound", revision: 10, status: found });
  resolve(waiting);
  await joining;
  assert.deepEqual(queue.state.getState().status, found);
  queue.event({ type: "matchmakingStatus", revision: 11, status: { status: "NOT_QUEUED" } });
  queue.event({ type: "matchmakingStatus", revision: 9, status: waiting });
  assert.equal(queue.state.getState().status.status, "NOT_QUEUED");
});
test("logout/account change discards in-flight responses and old events", async () => {
  let resolve!: (s: MatchmakingStatus) => void;
  const queue = createQueueStore(
    {
      status: () =>
        new Promise((r) => {
          resolve = r;
        }),
      rating: async () => 1500,
      join: async () => waiting,
      cancel: async () => ({ status: "NOT_QUEUED" }),
    },
    async () => undefined,
  );
  queue.owner("alice");
  const request = queue.restore();
  queue.owner(null);
  resolve(waiting);
  await request;
  queue.event({ type: "matchmakingFound", revision: 12, status: found });
  assert.equal(queue.state.getState().status.status, "NOT_QUEUED");
});
test("join error clears busy state and exposes an actionable code", async () => {
  const queue = createQueueStore(
    {
      status: async () => ({ status: "NOT_QUEUED" }),
      rating: async () => 1500,
      join: async () => {
        throw new ApiError("MATCHMAKING_ALREADY_IN_MATCH");
      },
      cancel: async () => ({ status: "NOT_QUEUED" }),
    },
    async () => undefined,
  );
  queue.owner("alice");
  await queue.join("classic");
  assert.equal(queue.state.getState().busy, false);
  assert.equal(queue.state.getState().error, "MATCHMAKING_ALREADY_IN_MATCH");
});
test("HTTP-confirmed cancellation establishes a revision floor for delayed queued events", async () => {
  const queue = createQueueStore({ status: async () => waiting, rating: async () => 1500,
    join: async () => waiting, cancel: async () => ({ status: "NOT_QUEUED", revision: 4 }) }, async () => undefined);
  queue.owner("alice"); queue.event({ type: "matchmakingStatus", revision: 2, status: waiting });
  await queue.cancel();
  queue.event({ type: "matchmakingStatus", revision: 3, status: waiting });
  assert.equal(queue.state.getState().status.status, "NOT_QUEUED");
  queue.event({ type: "matchmakingStatus", revision: 5, status: waiting });
  assert.equal(queue.state.getState().status.status, "QUEUED", "A genuinely new join in another tab remains visible");
});
test("status decoder rejects untrusted malformed events and returns safe opponent data", () => {
  assert.deepEqual(
    parseMatchmakingStatus({ ...found, opponent: { displayName: "Opponent", email: "private" } }),
    found,
  );
  assert.throws(() => parseMatchmakingStatus({ ...found, matchType: "CASUAL" }));
  assert.throws(() => parseMatchmakingStatus({ ...waiting, rating: Infinity }));
  assert.throws(() => parseMatchmakingStatus({ ...waiting, currentRange: -1 }));
});
