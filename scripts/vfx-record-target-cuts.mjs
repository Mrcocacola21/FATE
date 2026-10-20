import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
if (json(resolve(dir, "integration-state.json")).tokenLungeReview) {
  console.log("Keeping newer adjacent token-lunge evidence alongside the v11 target cut.");
  process.exit(0);
}
const log = name => {
  const bytes = readFileSync(resolve(dir, name));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8");
};
assert.match(log("melee-effects.log"), /# pass 338\b/);
assert.match(log("melee-sfx.log"), /# pass 66\b/);
assert.match(log("melee-browser.log"), /passed: 270 scenarios/);
assert.match(log("melee-timeline.log"), /passed: 81 scenarios/);
assert.match(log("melee-production.log"), /coverage passed: 327 definitions/);
for (const [name, count] of [["swings-report.json", 270], ["melee-timeline-report.json", 81]]) {
  const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game", name));
  assert.equal(report.observations.length, count); assert.deepEqual(report.errors, []);
}
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  count++;
  row.presentationRevision = "target-cut-v11";
  row.phase = "Shared combat contact: last min(90ms, contact) draws the cut across the defender, followed by 80ms decay. Reduced motion uses the existing nonempty static frame in the 70ms contact window. No extra gameplay or SFX timer.";
  row.geometry = { ...row.geometry, placement: "cell", anchorMode: "event", layer: "impact",
    scaleCells: 1.3, anchorPoint: { x: .5, y: .5 },
    coordinates: "Projected targetCell center; fixed projected source-to-target facing, accounting for board flip. Entire trace reflected on X and Y about its own center. Cut progressively reveals through the defender portrait; no rigid moving arc at the attacker. Miss offsets 0.65 cell perpendicular to the attack." };
  row.verification.tests = [...new Set([...row.verification.tests,
    "VfxLayer.test.tsx: one target-centered cue, missing target/hidden attacker suppression; all eight facing directions in both board orientations",
    "vfx-expansion-game-smoke.mjs --swings-only --phone-motion --dark: 270 real Board cases; 27 PNG, vertical/diagonal/miss examples, three recipients and viewports; fixed X/Y reflection, target center/facing, shared contact, duplicates, reconnect and cleanup",
    "vfx-expansion-game-smoke.mjs --swings-only --melee-timeline --phone-motion --dark: 81 Board cases; progressive clip reveal and decay, no rigid swinging-weapon transform, hit/miss separation"
  ])];
  row.verification.targetCut = { sharedContractVerified: true, realRulesRouteVerified: true,
    evidence: "packages/web/test-results/vfx-expansion-game/swings-report.json; melee-timeline-report.json" };
  row.verification.visual.targetCutReview = { reviewed: true,
    scope: "All 27 PNG at actual owner Board release samples on desktop and animated phone. Nine representative timelines, including vertical/diagonal and miss, inspected separately. Guts portrait cut captured at 60fps and x4 slow motion. Automated other-recipient/reduced-motion assertions; not full manual network-match QA.",
    evidence: "packages/web/test-results/vfx-expansion-game/swing-contact-sheets/; target-cut-timelines/; packages/web/test-results/target-cut-recording/" };
}
assert.equal(count, 27);
state.targetCutReview = { revision: "target-cut-v11", reviewedAt: "2026-10-20", sharedPngCount: count,
  directlyReviewedPngCount: count, effectsTests: 338, sfxTests: 66, browserScenarios: 270, timelineScenarios: 81,
  summary: "Cut draws directly across defender portrait, mirrored on both axes; fixed facing follows projected attack vector in both orientations. Preserves authoritative contact, SFX, miss distinction and cleanup; no wielded rigid crescent." };
state.checks = state.checks.filter(line => !line.startsWith("Target cuts v11:"));
state.checks.push("Target cuts v11: effects 338/338; SFX 66/66; asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (melee-*.log). 270 real Board swing scenarios plus 81 timeline cases: 27 PNG, three recipients, desktop/phone/reduced motion; target-centered trace, fixed X/Y reflection, attack facing, hit/miss, phase, duplicate, reconnect and cleanup. All 27 PNG sampled visually on desktop/phone; nine representative timelines inspected, Guts recorded normal/x4. Full manual network QA and original blockers preserved.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${count} target-centered cuts with mirrored art and recipient-safe facing.`);
