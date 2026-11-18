import assert from "node:assert/strict";
import test from "node:test";
import {
  PAGE_TURN_MS,
  foldAt,
  foldPolygon,
  liftedCorner,
  mirrorMatrix,
  riffleBetween,
  turnDirection,
  turnSchedule,
} from "./pageTurn";

const W = 800;
const H = 600;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("the corner starts at the top left, dips down first and ends past the bottom right", () => {
  const start = liftedCorner(W, H, 0);
  // Barely lifted: a few pixels from the corner.
  assert.ok(Math.hypot(start[0], start[1]) < 5);
  const early = liftedCorner(W, H, 0.25);
  assert.ok(early[1] > 0 && early[0] > 0, "moves down and to the right");
  const end = liftedCorner(W, H, 1);
  assert.ok(end[0] > W && end[1] > H, "ends beyond the bottom right");
});

test("a flat page keeps everything; a finished turn leaves nothing behind", () => {
  const atStart = foldPolygon(W, H, foldAt(W, H, 0), "page");
  assert.equal(atStart.length >= 4, true);
  assert.equal(foldPolygon(W, H, foldAt(W, H, 0), "flap").length <= 3, true);
  assert.equal(foldPolygon(W, H, foldAt(W, H, 1), "page").length, 0);
});

test("halfway, the top-left corner is on the flap and the bottom-right stays on the page", () => {
  const fold = foldAt(W, H, 0.4);
  const side = ([x, y]: readonly [number, number]) =>
    (x - fold.mid[0]) * fold.normal[0] + (y - fold.mid[1]) * fold.normal[1];
  assert.ok(side([0, 0]) < 0);
  assert.ok(side([W, H]) > 0);
  const flap = foldPolygon(W, H, fold, "flap");
  assert.ok(flap.some(([x, y]) => x === 0 && y === 0));
});

test("mirroring across the fold sends the page corner onto the lifted corner", () => {
  for (const progress of [0.1, 0.5, 0.8]) {
    const fold = foldAt(W, H, progress);
    const [a, b, c, d, e, f] = mirrorMatrix(fold);
    const mirrored = [a * 0 + c * 0 + e, b * 0 + d * 0 + f];
    const lifted = liftedCorner(W, H, progress);
    assert.ok(close(mirrored[0], lifted[0]) && close(mirrored[1], lifted[1]), `at ${progress}`);
  }
});

test("going up the menu turns back; down, unknown or outside the menu turns forward", () => {
  assert.equal(turnDirection(3, 1), "backward");
  assert.equal(turnDirection(1, 3), "forward");
  assert.equal(turnDirection(-1, 2), "forward");
  assert.equal(turnDirection(2, -1), "forward");
});

test("a jump riffles through the sections in between, at most three, nearest the target last", () => {
  assert.deepEqual(riffleBetween(0, 1), []);
  assert.deepEqual(riffleBetween(0, 3), [1, 2]);
  assert.deepEqual(riffleBetween(4, 1), [3, 2]);
  assert.deepEqual(riffleBetween(0, 6), [3, 4, 5]);
  assert.deepEqual(riffleBetween(6, 0), [3, 2, 1]);
  assert.deepEqual(riffleBetween(-1, 4), []);
});

test("a riffle staggers shorter sheets and still ends within a second", () => {
  assert.deepEqual(turnSchedule(1), { duration: PAGE_TURN_MS, stagger: 0, total: PAGE_TURN_MS });
  const riffle = turnSchedule(4);
  assert.ok(riffle.duration < PAGE_TURN_MS && riffle.stagger > 0);
  assert.equal(riffle.total, riffle.duration + 3 * riffle.stagger);
  assert.ok(riffle.total < 1000);
});
