import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => { const data = readFileSync(resolve(dir, name)); return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("projectile-effects.log"), /# pass 350\b/);
assert.match(log("projectile-sfx.log"), /# pass 66\b/);
assert.match(log("projectile-browser.log"), /passed: 333 scenarios/);
assert.match(log("projectile-contrast.log"), /passed: 27 scenarios/);
assert.match(log("projectile-production.log"), /coverage passed: 328 definitions/);
assert.match(log("projectile-build.log"), /built in/);
assert.match(log("projectile-assets.log"), /"spriteDimensions": "PASS"/);
const output = resolve(root, "packages/web/test-results/vfx-expansion-game");
for (const [file, count] of [["projectiles-report.json", 333], ["projectiles-contrast-report.json", 27]]) {
  const report = json(resolve(output, file));
  assert.equal(report.observations.length, count); assert.deepEqual(report.errors, []);
}
const state = json(resolve(dir, "integration-state.json"));
for (const row of state.assets) assert.equal(createHash("sha256").update(readFileSync(resolve(root, "packages/web/src/assets", row.filename))).digest("hex"), row.sha256, row.id);
const projectiles = new Set(["expansion.grand-kaiser.attack_projectile", "expansion.grand-kaiser.engineering_attack",
  "expansion.artemida.attack_projectile", "expansion.jebe.attack_projectile", "expansion.mettaton.attack_projectile",
  "expansion.mettaton.ex_attack", "expansion.mettaton.neo_attack"]);
let count = 0;
for (const row of state.assets) {
  if (!row.effectIds.some(id => projectiles.has(id))) continue;
  count++;
  row.presentationRevision = "readable-projectiles-v14";
  row.triggerRoute = "Accepted projected basic attackResolved -> existing combat playback -> one expansion release, using event-time permitted form and source/target cells";
  row.phase = "Release after final dice hold; distance-based flight 360..780ms (near 360ms, five cells 600ms), ending at confirmed combat outcome. Reduced motion preserves 70ms. No parallel timer or rules delay.";
  row.geometry = { ...row.geometry, layer: "projectile", coordinates: "Committed sourceCell -> targetCell, authored arrow points along the actual destination in either board orientation; current source permission required" };
  row.verification.tests = [...new Set([...row.verification.tests,
    "rangedPresentation.test.ts: all four archers, three ranged forms and base Archer on accepted hit/miss in P1/P2/spectator; exactly one flight after final dice, actual coordinates, distance bounds, no lunge, unchanged rules state and 70ms reduced motion",
    "vfx-expansion-game-smoke.mjs --projectiles-only --phone-motion --dark: 333 real Board cases; 25/50/80% actual flight positions, decoded art, correct phase/layer, miss without damage flash, duplicate, reconnect and cleanup"
  ])];
  row.verification.visual.rangedReview = { reviewed: true,
    scope: "Seven expansion projectile PNG sampled in actual Board at 25/50/80% for owner desktop/phone, plus opponent midpoint contact sheet and both Kaiser vertical/diagonal directions. Automated rules fixtures, not a manual network match; full runtime QA stays open.",
    evidence: "packages/web/test-results/vfx-expansion-game/projectile-contact-sheets/; packages/web/test-results/kaiser-projectile-recording/" };
}
assert.equal(count, 7);
for (const row of state.assets) if (["grand-kaiser", "artemida", "jebe", "mettaton"].includes(row.heroId) && row.filename.endsWith("/attack_impact.png")) {
  row.phase = "Only confirmed hit at existing combat cue.atMs, following the distance-based flight; no impact on miss/dodge/defense";
  row.verification.tests = [...new Set([...row.verification.tests, "rangedPresentation.test.ts and projectiles-report.json: archer impact starts at end of flight, absent on miss"] )];
}
state.rangedReview = { revision: "readable-projectiles-v14", updatedAt: "2026-10-20", sharedExpansionPngCount: count,
  ordinaryProfiles: 8, acceptedRoutes: 37, effectsTests: 350, sfxTests: 66, browserScenarios: 333, finalContrastScenarios: 27,
  productionDefinitions: 328, minFlightMs: 360, maxFlightMs: 780, reducedMotionMs: 70,
  addedFlights: ["base Archer", "gutsArbalet", "gutsCannon", "undyneSpearThrow (normal/Undying three-shot)"],
  preservedSignatureFlights: ["asgoreFireball", "friskPrecisionStrike", "jebeKhansShooter", "odin double Gungnir"],
  visualEvidence: "packages/web/test-results/vfx-expansion-game/projectile-contact-sheets/",
  recording: "packages/web/test-results/kaiser-projectile-recording/kaiser-projectile-repeat.mp4",
  sourcePngChanged: false, manualNetworkMatch: false,
  artworkObservation: "Existing KEEP Undyne throw.png is a straight white stroke with a curved left flare and no distinct pointed spear head; preserved its authored geometry without inventing a new PNG. Frisk Precision remains the existing thin diagonal signature; its complete per-hero animation QA is not claimed by midpoint inspection." };
state.checks = state.checks.filter(line => !line.startsWith("Readable projectiles v14:"));
state.checks.push("Readable projectiles v14: effects 350/350, SFX 66/66, asset audit, root lint/typecheck/build and fresh production coverage 328 definitions PASS (projectile-*.log). 333 real Board scenarios across 37 accepted routes and 27 repeat contrast scenarios, all three recipients and desktop/phone/reduced motion. Seven unchanged expansion projectile PNG, base Archer and real Guts/Undyne ranged flights; hit/miss/duplicates/reconnect/cleanup. Original 296 SHA-256 unchanged; no rules/SFX edits. Midpoint contact sheets and Kaiser normal/x4 recorded; no manual network match or claim of complete per-hero QA.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ranged review for ${count} unchanged expansion PNG, plus base and ability flights.`);
