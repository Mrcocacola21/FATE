import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(import.meta.dirname, "../docs/assets/vfx-workflow");
const log = name => { const data = readFileSync(resolve(dir, name)); return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("commander-badge-effects.log"), /# pass 329\b/);
assert.match(log("commander-badge-i18n.log"), /# pass 5\b/);
assert.match(log("commander-badge-browser.log"), /passed: 72 scenarios/);
assert.match(log("commander-badge-production.log"), /coverage passed: 327 definitions/);
const state = JSON.parse(readFileSync(resolve(dir, "integration-state.json"), "utf8"));
const rows = state.assets.filter(row => row.filename.endsWith("/commander_aura.png") && row.integrationStatus === "verified");
assert.equal(rows.length, 6);
const tests = [
  "commander support badge matches rules for all six commanders, diagonals, allies and non-stacking",
  "commander badge clears with range, death, removal, unsupported hero and False Trail; snapshot is silent",
  "commander support never infers a concealed source or decorates a hidden enemy",
].map(name => "packages/web/src/features/vfx/UnitStatusVfx.test.tsx: " + name);
for (const row of rows) {
  row.recipientBadge = { kind: "commanderAura", icon: "SVG banner", tone: "positive", runtime: "resolveUnitStatuses(projected unit, recipient, permitted PlayerView) -> StatusBadges and selected-unit summary",
    eligibility: "living adjacent ally within Chebyshev radius 1; excludes self and False Trail; one badge for overlapping commanders; only permitted visible sources considered",
    cleanup: "Recomputed from snapshot; disappears on leaving range, source/recipient death/removal/off-board or loss of permission; no event, timer, animation or sound" };
  row.verification.tests = [...new Set([...row.verification.tests, ...tests])];
  row.verification.commanderBadge = { behaviorVerified: true, rulesParity: "getPolkovodetsSource checked for all six sources, real owner/opponent/spectator projections; hidden/tracked source counterexamples",
    browser: "72 actual Board commander scenarios; Genghis deploy gives exactly two flag badges to neighboring allies, none to self, across both orientations/desktop/phone reduced motion",
    visual: { reviewed: true, scope: "Actual dark Board: two adjacent allies under Genghis aura; shared icon rendering for all six source styles",
      evidence: "packages/web/test-results/vfx-expansion-game/desktop-deploy.genghisKhan.png" } };
}
state.commanderBadgeReview = { revision: "commander-recipient-badge-v7", reviewedAt: "2026-10-20", sourceProfiles: 6,
  effectsTests: 329, i18nTests: 5, browserScenarios: 72, summary: "Small static positive banner badge on permitted allies under commander support; localized +1 damage label and selected-unit summary; no stacking, no hidden-source inference, no gameplay change." };
state.checks = state.checks.filter(line => !line.startsWith("Commander badge v7:"));
state.checks.push("Commander badge v7: effects 329/329, i18n 5/5, presentation asset audit, root lint/typecheck/build PASS. Actual Board commander smoke 72/72; exactly two neighboring ally flag icons in Genghis placement, none on self; owner/opponent/spectator, orientations and phone/reduced motion. Fresh production coverage 327/327 (commander-badge-*.log). No rules, events, PNG or SFX changes.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log("Recorded recipient badges for six commander aura sources; inventory and blockers unchanged.");
