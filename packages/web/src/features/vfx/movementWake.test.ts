import assert from "node:assert/strict";
import test from "node:test";
import { MOVEMENT_WAKE_FADE_MS, movementWakeSamples } from "./movementWake";

test("deposited wake samples follow traveled distance and the existing movement clock", () => {
  for (const [distance, duration] of [[1, 160], [2, 320], [8, 720], [Math.hypot(8, 8), 720]]) {
    const samples = movementWakeSamples(distance, duration);
    assert(samples.length >= 3 && samples.length <= 32);
    for (const [index, sample] of samples.entries()) {
      assert(Math.abs(sample.atMs - sample.fraction * duration) < 1e-9);
      assert(sample.fraction >= 0 && sample.fraction < 1, "no deposit beyond the reached endpoint");
      if (index) {
        assert(sample.atMs > samples[index - 1].atMs);
        assert((sample.fraction - samples[index - 1].fraction) * distance < 0.4);
      }
    }
    assert(samples[samples.length - 1].atMs + MOVEMENT_WAKE_FADE_MS < duration + MOVEMENT_WAKE_FADE_MS);
  }
  assert.equal(movementWakeSamples(100, 720).length, 32, "bounded DOM even for an invalid oversize preview");
});
