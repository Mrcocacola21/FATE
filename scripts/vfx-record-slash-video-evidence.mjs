import assert from "node:assert/strict";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const artifacts = "packages/web/test-results/all-slashes-review";
const recording = JSON.parse(readFileSync(resolve(root, artifacts, "recording.json"), "utf8"));
assert.equal(recording.status, "complete"); assert.equal(recording.records.length, 27);
assert.deepEqual(recording.errors, []);
assert(statSync(resolve(root, artifacts, "all-slashes.mp4")).size > 0);
assert(statSync(resolve(root, artifacts, "index.html")).size > 0);
const state = JSON.parse(readFileSync(resolve(dir, "integration-state.json"), "utf8"));
for (const clip of recording.records) {
  assert(clip.painted && clip.lunged);
  for (const file of [clip.normal, clip.slow, clip.review]) assert(statSync(resolve(root, artifacts, file)).size > 0);
  const row = state.assets.find(row => row.effectIds.includes(clip.effectId)); assert(row);
  row.verification.visual.slashRecording = {
    normal: `${artifacts}/${clip.normal}`, slow: `${artifacts}/${clip.slow}`, combined: `${artifacts}/${clip.review}`,
    scope: "Actual current Board, P1 projection of accepted adjacent hit, 72 shared-clock frames at 60fps; normal then x4, silent. Not a manual network match.",
    userReviewPending: true,
  };
}
state.slashVideoReview = { recordedAt: "2026-10-20", clipCount: 27, frameCountPerClip: 72, userReviewPending: true,
  overview: `${artifacts}/all-slashes.mp4`, gallery: `${artifacts}/index.html`, index: `${artifacts}/README_RU.md`,
  metadata: `${artifacts}/recording.json`, manualNetworkMatch: false };
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log("Recorded 27 individual slash videos; user visual review remains pending.");
