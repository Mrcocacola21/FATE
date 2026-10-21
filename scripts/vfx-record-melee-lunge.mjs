import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
if (json(resolve(dir, "integration-state.json")).readableMeleeReview) {
  console.log("Keeping newer readable-melee timing and verification.");
  process.exit(0);
}
const log = name => { const bytes = readFileSync(resolve(dir, name)); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("lunge-effects.log"), /# pass 341\b/);
assert.match(log("lunge-browser.log"), /passed: 270 scenarios/);
assert.match(log("lunge-production.log"), /coverage passed: 327 definitions/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/swings-report.json"));
assert.equal(report.observations.length, 270); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  count++;
  row.presentationRevision = "adjacent-melee-lunge-v12";
  row.tokenPresentation = "Only adjacent accepted melee: shared combat RAF samples 0.035-cell anticipation, 0.24-cell thrust at contact, 7.5% directional stretch, 80ms smooth return. Source token only; tactical cell, selection/aura/status anchors and target cut remain fixed. Reduced motion, projectiles and distance>1 excluded.";
  row.verification.tests = [...new Set([...row.verification.tests,
    "combatPlayback.test.ts: adjacent hit/miss anticipation/contact/return, unchanged tactical position and impact clock; diagonal normalization; distant/projectile/special/hidden/missing geometry and reduced-motion exclusions",
    "vfx-expansion-game-smoke.mjs --swings-only --phone-motion --dark: 270 Board scenarios assert bounded target-facing token thrust in both orientations, no thrust in reduced motion, natural return and reconnect cleanup"
  ])];
  row.verification.visual.adjacentLungeReview = { reviewed: true,
    scope: "Owner Board desktop/phone samples of all 27 melee PNG, including forms; Guts vertical/diagonal/miss examples and normal/x4 stepped 60fps recording. Other recipients and reduced motion checked by browser assertions; full manual network-match QA remains open.",
    evidence: "packages/web/test-results/vfx-expansion-game/swing-contact-sheets/; packages/web/test-results/melee-lunge-recording/" };
}
assert.equal(count, 27);
state.tokenLungeReview = { revision: "adjacent-melee-lunge-v12", reviewedAt: "2026-10-20", sharedPngCount: count,
  effectsTests: 341, browserScenarios: 270, sourcePngChanged: false,
  scope: "Adjacent accepted thematic melee releases and common basic melee classes; unit-tested common route, 27 thematic releases exercised on Board; no attack movement at distance>1 or for projectiles/reduced motion." };
state.checks = state.checks.filter(line => !line.startsWith("Adjacent melee lunge v12:"));
state.checks.push("Adjacent melee lunge v12: 341 effects tests, 270 real Board scenarios, asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (lunge-*.log). Small directional token thrust peaks at unchanged contact, returns over 80ms; no tactical movement, additional timer, projectile thrust or reduced-motion travel. All 27 thematic releases sampled on desktop/phone; Guts recorded normal/x4. Rules, SFX routes, PNG and wider QA/blockers preserved.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded adjacent token lunge alongside ${count} unchanged target-cut PNG.`);
