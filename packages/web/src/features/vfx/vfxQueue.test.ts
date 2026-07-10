import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueBoardVfx,
  getInitialVfxLogIndex,
  pruneExpiredBoardVfx,
  rememberProcessedVfxRequests,
  shouldProcessVfxBatch,
  simplifyVfxForReducedMotion,
} from "./vfxQueue";
import type { BoardVfxRequest } from "./vfxTypes";

const request: BoardVfxRequest = {
  id: "event-1",
  effectId: "portal",
  placement: "cell",
  sourceCell: { col: 1, row: 1 },
  durationMs: 400,
  delayMs: 100,
};

test("queued VFX dedupe by stable request id and expire automatically", () => {
  const processedIds = new Set<string>();
  const queued = enqueueBoardVfx({
    current: [],
    incoming: [request, request],
    now: 1_000,
    processedIds,
  });

  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.startedAt, 1_100);
  assert.equal(queued[0]?.expiresAt, 1_500);
  assert.equal(pruneExpiredBoardVfx(queued, 1_499).length, 1);
  assert.equal(pruneExpiredBoardVfx(queued, 1_500).length, 0);

  rememberProcessedVfxRequests(processedIds, queued);
  const replay = enqueueBoardVfx({
    current: [],
    incoming: [request],
    now: 2_000,
    processedIds,
  });
  assert.equal(replay.length, 0);
});

test("processed VFX bookkeeping stays outside the enqueue updater", () => {
  const first = enqueueBoardVfx({
    current: [],
    incoming: [request],
    now: 1_000,
  });
  const strictModeRepeat = enqueueBoardVfx({
    current: [],
    incoming: [request],
    now: 1_000,
  });

  assert.equal(first.length, 1);
  assert.equal(strictModeRepeat.length, 1);
});

test("VFX batches are processed only once in increasing log order", () => {
  assert.equal(shouldProcessVfxBatch(5, 6), true);
  assert.equal(shouldProcessVfxBatch(5, 5), false);
  assert.equal(shouldProcessVfxBatch(5, 4), false);
});

test("initial reconnect baseline skips old event history and allows later batches", () => {
  const baseline = getInitialVfxLogIndex({ logIndex: 20 });

  assert.equal(baseline, 20);
  assert.equal(shouldProcessVfxBatch(baseline, 20), false);
  assert.equal(shouldProcessVfxBatch(baseline, 21), true);
  assert.equal(getInitialVfxLogIndex(null), -1);
});

test("reduced motion simplifies path and hides line-only VFX", () => {
  const simplified = simplifyVfxForReducedMotion([
    {
      id: "path",
      effectId: "tralala",
      placement: "path",
      path: [
        { col: 1, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 3 },
      ],
    },
    {
      id: "line",
      effectId: "phantasmTrace",
      placement: "line",
      sourceCell: { col: 1, row: 1 },
      targetCell: { col: 4, row: 1 },
    },
  ]);

  assert.deepEqual(
    simplified.map((effect) => effect.placement),
    ["cell", "cell"],
  );
  assert.ok(simplified.every((effect) => effect.durationMs === 450));
});
