import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => { const data = readFileSync(resolve(dir, name)); return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("long-move-effects.log"), /# pass 332\b/);
assert.match(log("long-move-sfx.log"), /# pass 66\b/);
assert.match(log("long-move-browser-all.log"), /passed: 84 scenarios/);
assert.match(log("long-move-production.log"), /coverage passed: 327 definitions/);
assert.match(log("long-move-css.log"), /endpoint tone PASS/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/long-movement-report.json"));
assert.equal(report.observations.length, 84); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
if (state.depositedWakeReview) {
  console.log("Preserving the newer deposited movement wake review; v8 remains historical evidence.");
  process.exit(0);
}
const reviewed = new Set(["genghisKhan", "donKihote", "hassan", "jackRipper", "chikatilo"]);
let shared = 0, visual = 0;
for (const row of state.assets) {
  const role = row.filename.split("/").at(-1).replace(/\.png$/, "");
  if (!/^(move_trail|move_arrive|(berserk|centipede|undying|engineering|ex|neo)_move)$/.test(role)) continue;
  shared++;
  row.presentationRevision = "distance-movement-v8";
  row.phase = role === "move_arrive" ? "Single arrival after the final reached walking cue, on its distance-aware shared playback clock"
    : "Continuous confirmed normal/Rider movement cue; 160ms per Chebyshev cell within a 720ms walking budget per batch, preserving actual authorized segments; reduced motion 50ms per segment";
  row.verification.tests = [...new Set([...row.verification.tests,
    "packages/web/src/game/effects/movementPresentation.test.ts: long Rider and Assassin travel keeps a readable shared token/trail clock instead of a 160ms board-wide flash",
    "packages/web/src/game/effects/movementPresentation.test.ts: unequal confirmed walking segments share the distance budget and preserve their actual turn"])];
  row.verification.distanceMovement = { sharedContractVerified: true, profileSpecificLongWalkVerified: reviewed.has(row.heroId),
    scope: "Shared timing contract; direct real-rules short/long browser routes for five hero profiles plus base Rider/Assassin. Does not claim an impossible long walk for one-cell/teleport profiles.",
    evidence: "packages/web/test-results/vfx-expansion-game/long-movement-report.json" };
  if (reviewed.has(row.heroId) && (role === "move_trail" || role === "move_arrive")) {
    // Three-phase visual review covers the traveling strips; terminal arrivals
    // are behavior-checked at their real reached time, not visually re-certified.
    if (role === "move_trail") {
      visual++;
      row.verification.visual.distanceMovementReview = { reviewed: true,
        scope: "Actual dark Board long movement at 25/50/75 percent, together with moving token; not a full manual network match",
        evidence: "packages/web/test-results/vfx-expansion-game/long-move-contact-sheets/" };
    }
  }
}
assert.equal(shared, 64); assert.equal(visual, 5);
state.longMovementReview = { revision: "distance-movement-v8", reviewedAt: "2026-10-20", sharedPngCount: shared,
  directlyReviewedTrailPngCount: visual, effectsTests: 332, sfxTests: 66, browserScenarios: 84,
  causes: ["Every endpoint movement, regardless of distance, was compressed to 160ms", "Interpolated Tailwind tone class names left common base movement trails transparent"],
  summary: "Distance-aware normal/Rider playback clock; shared token/wake/arrival/hazard timing. Literal tone maps preserve common trail colors in production. Existing forced, teleport and transport timing retained; no new rules/PNG/SFX routes." };
state.checks = state.checks.filter(line => !line.startsWith("Long movement v8:"));
state.checks.push("Long movement v8: effects 332/332, SFX 66/66, asset audit, root lint/typecheck/build PASS; generic trail tones and reduced-motion endpoint color survive production CSS scan. Source PNG hashes unchanged (long-move-*.log).");
state.checks.push("Long movement v8: 84/84 actual Board cases: base Rider/Assassin and Genghis/Don/Hassan/Jack/Chikatilo, real short/long actions, both orientations, three recipients, desktop and phone/reduced motion, quarter/mid/three-quarter wake paint, token alignment, single reached arrival, duplicates, snapshot/reconnect and cleanup. Existing movement browser smoke passed including forced/teleport and stake/snare reached timing. Seven long routes visually reviewed in three phases; five thematic trail PNG, two common base effects. Fresh production coverage 327/327. Broader original QA/blockers preserved.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${shared} shared movement PNG routes; ${visual} thematic long trails and two base effects visually reviewed.`);
