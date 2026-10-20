import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
if (json(resolve(dir, "integration-state.json")).targetCutReview) {
  console.log("Target cuts v11 supersede v10 geometry; keeping the newer integration evidence.");
  process.exit(0);
}
const log = name => { const data = readFileSync(resolve(dir, name)); return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("swing-effects.log"), /# pass 336\b/);
assert.match(log("swing-sfx.log"), /# pass 66\b/);
assert.match(log("swing-rules.log"), /rules: 3 suite executions passed/);
assert.match(log("swing-contract.log"), /contract: \d+ suite executions passed/);
assert.match(log("swing-browser.log"), /passed: 261 scenarios/);
assert.match(log("swing-production.log"), /coverage passed: 327 definitions/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/swings-report.json"));
assert.equal(report.observations.length, 261); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  const role = row.filename.split("/").at(-1).replace(/\.png$/, "");
  if (!/^(attack_swing|berserk_swing|centipede_attack|undying_swing)$/.test(role)) continue;
  count++;
  row.presentationRevision = "attack-swings-v10";
  row.phase = "One release on the combat attackAtMs -> outcome atMs clock: 210ms normal / 70ms reduced motion; hit/miss release shared, damage impact only at confirmed hit";
  row.geometry = { ...row.geometry, placement: "cell", anchorMode: "event", layer: "impact",
    scaleCells: 1.45, anchorPoint: { x: .15, y: .5 },
    coordinates: "Projected event sourceCell is the rotation pivot; +X authored weapon extends toward projected targetCell. No route/target reconstructed from hidden state." };
  row.verification.tests = [...new Set([...row.verification.tests,
    "packages/web/src/features/vfx/expansionPresentation.test.tsx: melee release ends on the shared normal/reduced-motion outcome for hit and miss",
    "packages/web/scripts/vfx-expansion-fixtures.ts + vfx-expansion-game-smoke.mjs --swings-only --phone-motion: real rules-produced attacks for all 27 swing PNG, three recipients, desktop/phone/reduced motion; pivot, direction, phase, duplicate, cleanup and reconnect checks"])];
  if (role === "berserk_swing") {
    row.triggerRoute = "Accepted Guts Berserk attack mode=single -> attackResolved.attackSignature=gutsBerserkSingle -> shared combat release; refusal/cancel/AoE excluded";
    row.verification.tests.push("packages/web/src/features/vfx/expansionPresentation.test.tsx: real accepted Guts Berserk single vs prior unannotated roll context preserves complete state, RNG draws and SFX requests for every recipient; refused selection and AoE stay distinct");
    row.verification.tests = [...new Set(row.verification.tests)];
  }
  row.verification.attackSwing = { sharedContractVerified: true, realRulesRouteVerified: true,
    evidence: "packages/web/test-results/vfx-expansion-game/swings-report.json" };
  row.verification.visual.attackSwingReview = { reviewed: true,
    scope: "Actual dark Board owner desktop and animated-phone release midpoints, all 27 PNG. Vertical/diagonal Guts examples also viewed. P2 facing and reduced-motion alignment verified by browser assertions; not full manual animation/network-match QA.",
    evidence: "packages/web/test-results/vfx-expansion-game/swing-contact-sheets/" };
}
assert.equal(count, 27);
state.attackSwingReview = { revision: "attack-swings-v10", reviewedAt: "2026-10-20", sharedPngCount: count,
  directlyReviewedPngCount: count, effectsTests: 336, sfxTests: 66, browserScenarios: 261,
  signal: "attackResolved.attackSignature=gutsBerserkSingle only after accepted single mode, existing visibility/projection; no isBasicAttack or SFX route changes",
  summary: "All 24 ordinary swings + 3 form swings have real-rules Board coverage. Restored actual Guts Berserk single release; corrected 100ms minimum overrun of the 70ms reduced-motion phase; source-pivoted 1.45-cell arcs extend into the attack lane." };
state.checks = state.checks.filter(line => !line.startsWith("Attack swings v10:"));
state.checks.push("Attack swings v10: effects 336/336; SFX 66/66; full rules 3 suites and contract PASS; asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (swing-*.log). Real Board 261 scenarios: 27 swing PNG + vertical/diagonal examples, P1/P2/spectator and desktop/animated phone/phone reduced motion; direction, source pivot, shared release/outcome, no early impact, no duplicate and cleanup/reconnect. All 27 source PNG visually reviewed on actual owner Board desktop/phone release midpoints. Full-animation/manual-network QA and earlier blockers preserved.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${count} real-rules melee swing routes and their scoped visual review.`);
