import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => {
  const bytes = readFileSync(resolve(dir, name));
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8");
};
for (const [name, pattern] of [["facing-reference-effects.log", /# pass 355\b/],
  ["facing-reference-browser.log", /passed: 162 scenarios/], ["facing-reference-assets.log", /"spriteDimensions": "PASS"/],
  ["facing-reference-production.log", /coverage passed: 330 definitions/], ["facing-reference-build.log", /built in/]]) assert.match(log(name), pattern, name);
for (const name of ["facing-reference-lint.log", "facing-reference-typecheck.log"]) assert.doesNotMatch(log(name), /error TS\d|npm error|\d+ problems/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/direction-reference-report.json"));
assert.equal(report.observations.length, 162); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  assert.equal(createHash("sha256").update(readFileSync(resolve(root, "packages/web/src/assets", row.filename))).digest("hex"), row.sha256);
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  count++;
  row.presentationRevision = "slash-facing-reference-v17";
  row.geometry.coordinates = "Corrected reference: both axes inverted relative to v16, verified with Genghis Khan (4,4) to (5,4). Projected targetCell center; facing is selected in screen space after board flip, relative to the approved rightward cut: right unchanged, left horizontal reflection, up one vertical reflection, down two vertical reflections (identity); diagonal cuts use +/-45deg intermediate poses. Trace, sprite and glint share the same reflection; no gameplay position changes.";
  row.geometry.facing = { reference: "Corrected rightward cut: both axes inverted relative to v16, verified on Genghis Khan (4,4) to (5,4)",
    space: "screen after recipient board flip", right: "reference", left: "horizontal reflection", up: "vertical reflection",
    down: "two vertical reflections (identity)", diagonals: "45deg intermediate poses using the appropriate side reflection" };
  row.verification.tests = [...new Set([...row.verification.tests,
    "VfxLayer.test.tsx: transformed sweep landmarks for eight directions, both board orientations and reduced motion; horizontal vs vertical reflection differs from 180deg rotation",
    "vfx-expansion-game-smoke.mjs --swings-only --facing-only --reference-facing --phone-motion --dark: 162 accepted actual Board cases; all eight directions plus miss, source/target center, reflection matrix, token lunge, contact, duplicate/reconnect/cleanup, P1/P2/spectator"
  ])];
  row.verification.visual.facingReferenceReview = { reviewed: true,
    evidence: "packages/web/test-results/vfx-expansion-game/facing-reference-contact-sheets/desktop-genghisKhan.png; phone-genghisKhan.png; desktop-guts.png; phone-guts.png",
    scope: "Eight-direction shared renderer sampled visually with Genghis Khan and Guts on the actual Board, desktop and phone. All 27 melee PNG share this orientation contract; this is not a new individual review of every PNG or a manual network match." };
}
assert.equal(count, 27);
state.slashFacingReferenceReview = { revision: "slash-facing-reference-v17", updatedAt: "2026-10-21", sharedMeleePngCount: count,
  effectsTests: 355, browserScenarios: 162, productionDefinitions: 330,
  summary: "The v16 rightward cut is inverted on both axes to correct the baseline, explicitly checked on Genghis Khan (4,4) to (5,4). Left reflects horizontally; up once vertically; down twice vertically (identity), following the user's final clarification. Diagonals use 45deg intermediate poses. Screen-space direction is recomputed after board flip; same trace/contact/lunge and outcome ownership.",
  visualEvidence: "packages/web/test-results/vfx-expansion-game/facing-reference-contact-sheets/",
  sourcePngChanged: false, manualNetworkMatch: false, fullRuntimeQa: false };
state.checks = state.checks.filter(line => !line.startsWith("Slash reference v17:"));
state.checks.push("Slash reference v17: effects 355/355, actual Board 162 cases (Genghis Khan and Guts, eight directions plus miss, three recipients, desktop/phone/reduced motion), assets, root lint/typecheck/build and fresh production 330 definitions PASS (facing-reference-*.log). Shared orientation updated for 27 melee PNG; eight-direction Genghis Khan and Guts desktop/phone sheets inspected. No PNG/rules/SFX changes; prior blockers and full manual unique-animation/network QA stay open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded corrected rightward reference and directional reflections for ${count} melee PNG; inventory coverage unchanged.`);
