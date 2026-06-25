import assert from "node:assert/strict";
import test from "node:test";
import { simplifyEffectsForReducedMotion } from "./boardEffects";
import {
  enqueueBoardEffects,
  pruneExpiredBoardEffects,
  shouldProcessEffectBatch,
} from "./effectQueue";

test("queued effects respect delay and expire automatically", () => {
  const queued = enqueueBoardEffects({
    current: [],
    incoming: [
      {
        kind: "cellPulse",
        cells: [{ col: 1, row: 1 }],
        tone: "attack",
        durationMs: 400,
        delayMs: 100,
      },
    ],
    now: 1_000,
    sequenceStart: 0,
  });

  assert.equal(queued.effects[0]?.startedAt, 1_100);
  assert.equal(queued.effects[0]?.expiresAt, 1_500);
  assert.equal(pruneExpiredBoardEffects(queued.effects, 1_499).length, 1);
  assert.equal(pruneExpiredBoardEffects(queued.effects, 1_500).length, 0);
});

test("event batches are processed only once in increasing log order", () => {
  assert.equal(shouldProcessEffectBatch(10, 11), true);
  assert.equal(shouldProcessEffectBatch(10, 10), false);
  assert.equal(shouldProcessEffectBatch(10, 9), false);
});

test("reduced motion replaces beams and movement trails with static pulses", () => {
  const simplified = simplifyEffectsForReducedMotion([
    {
      kind: "beam",
      from: { col: 1, row: 1 },
      to: { col: 5, row: 1 },
      tone: "attack",
      durationMs: 900,
    },
    {
      kind: "movementTrail",
      path: [
        { col: 2, row: 2 },
        { col: 2, row: 3 },
        { col: 2, row: 4 },
      ],
      tone: "move",
      durationMs: 900,
    },
  ]);

  assert.deepEqual(
    simplified.map((effect) => effect.kind),
    ["cellPulse", "cellPulse"],
  );
  assert.ok(simplified.every((effect) => effect.durationMs === 550));
});
