import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => {
  const data = readFileSync(resolve(dir, name));
  return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8");
};
assert.match(log("wake-effects.log"), /# pass 334\b/);
assert.match(log("wake-browser-all.log"), /passed: 126 scenarios/);
assert.match(log("wake-staging.log"), /passed: 67 scenarios/);
assert.match(log("wake-production.log"), /coverage passed: 327 definitions/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/long-movement-report.json"));
assert.equal(report.observations.length, 126); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
const reviewed = new Set(["genghisKhan", "donKihote", "hassan", "jackRipper", "chikatilo"]);
let shared = 0, visual = 0;
for (const row of state.assets) {
  const role = row.filename.split("/").at(-1).replace(/\.png$/, "");
  if (!/^(move_trail|(berserk|centipede|undying|engineering|ex|neo)_move)$/.test(role)) continue;
  shared++;
  if (row.presentationRevision !== "deposited-movement-wake-v9") {
    row.geometry.widthCells *= 0.65;
    row.geometry.heightCells *= 0.75;
  }
  row.geometry.coordinates = "Fixed deposits on the confirmed cue.from -> cue.to segment, emitted after passage using token travel time; screen foot +0.28 cell, 240ms decay per fragment, bounded 3..32 fragments in one cue";
  row.presentationRevision = "deposited-movement-wake-v9";
  row.phase = "Fixed deposits emitted at passed positions on the confirmed normal/Rider segment, on the token playback clock; each fades over 240ms. Arrival stays at reached time, residue does not delay movement. Reduced motion hides the wake.";
  row.verification.tests = [...new Set([...row.verification.tests,
    "packages/web/src/features/vfx/movementWake.test.ts: distance density, emission follows travel time, bounded fragments, no emission beyond endpoint",
    "packages/web/src/features/vfx/VfxLayer.test.tsx: one cue owns fixed deposits in both orientations, loss of permission and reduced motion remove them",
    "packages/web/src/game/effects/movementPresentation.test.ts: residue lifetime does not extend token motion or arrival time"])];
  row.verification.depositedWake = { sharedContractVerified: true,
    profileSpecificLongWalkVerified: reviewed.has(row.heroId) && role === "move_trail",
    evidence: "packages/web/test-results/vfx-expansion-game/long-movement-report.json",
    scope: "35 shared trail/form assets; 67 owner desktop deployment/movement cases include every profile/form. Long/short recipient tests exercise five eligible hero profiles and two base classes, not impossible long walks for teleport/one-cell profiles." };
  if (reviewed.has(row.heroId) && role === "move_trail") {
    visual++;
    row.verification.visual.depositedWakeReview = { reviewed: true,
      scope: "Actual dark Board long walking, 25/50/75 percent: stationary fading wake behind the token; desktop and animated phone. Not full manual network-match QA.",
      evidence: "packages/web/test-results/vfx-expansion-game/long-move-contact-sheets/" };
  }
}
assert.equal(shared, 35); assert.equal(visual, 5);
state.depositedWakeReview = { revision: "deposited-movement-wake-v9", reviewedAt: "2026-10-20",
  sharedTrailPngCount: shared, directlyReviewedTrailPngCount: visual, effectsTests: 334,
  browserScenarios: 126, allProfileOwnerScenarios: 67,
  summary: "Replaced token-attached sliding artwork with spatially spaced stationary deposits. One existing semantic cue/clock; bounded fragments, 240ms decay, no new timer or rules/SFX/PNG changes." };
state.checks = state.checks.filter(line => !line.startsWith("Deposited wake v9:"));
state.checks.push("Deposited wake v9: effects 334/334; asset audit, root lint/typecheck/build PASS (wake-*.log). 126 real Board long/short cases: desktop, animated phone, phone/reduced motion, P1/P2/spectator; stationary fragments, transparent future/expired deposits, visible passed positions, actual token positions, one unchanged arrival, duplicates, reconnect/snapshot, cleanup. All 67 profile/form owner desktop staging cases PASS. Fresh production coverage 327/327. Five thematic trail PNG visually reviewed in three phases on desktop and animated phone; broader original QA and blockers preserved.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${shared} deposited trail/form routes, ${visual} individually reviewed trail PNG.`);
