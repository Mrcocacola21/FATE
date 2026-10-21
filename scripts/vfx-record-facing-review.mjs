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
for (const [name, pattern] of [["facing-effects.log", /# pass 355\b/],
  ["facing-browser.log", /passed: 81 scenarios/], ["facing-assets.log", /"spriteDimensions": "PASS"/],
  ["facing-production.log", /coverage passed: 330 definitions/], ["facing-build.log", /built in/]]) assert.match(log(name), pattern, name);
for (const name of ["facing-lint.log", "facing-typecheck.log"]) assert.doesNotMatch(log(name), /error TS\d|npm error|\d+ problems/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/direction-report.json"));
assert.equal(report.observations.length, 81); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  assert.equal(createHash("sha256").update(readFileSync(resolve(root, "packages/web/src/assets", row.filename))).digest("hex"), row.sha256);
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  count++;
  row.presentationRevision = "slash-facing-v16";
  row.geometry.coordinates = "Projected targetCell center; facing is selected in screen space after board flip, relative to the approved rightward cut: right unchanged, left/up horizontal reflection, down vertical reflection; diagonal cuts use +/-45deg intermediate poses. Trace, sprite and glint share the same reflection; no gameplay position changes.";
  row.geometry.facing = { reference: "Approved rightward cut, including its existing local X/Y reflection",
    space: "screen after recipient board flip", right: "reference", left: "horizontal reflection", up: "horizontal reflection",
    down: "vertical reflection", diagonals: "45deg intermediate poses using the appropriate side reflection" };
  row.verification.tests = [...new Set([...row.verification.tests,
    "VfxLayer.test.tsx: transformed sweep landmarks for eight directions, both board orientations and reduced motion; horizontal vs vertical reflection differs from 180deg rotation",
    "vfx-expansion-game-smoke.mjs --swings-only --facing-only --phone-motion --dark: 81 accepted actual Board cases; all eight directions plus miss, source/target center, reflection matrix, token lunge, contact, duplicate/reconnect/cleanup, P1/P2/spectator"
  ])];
  row.verification.visual.facingReview = { reviewed: true,
    evidence: "packages/web/test-results/vfx-expansion-game/facing-contact-sheets/desktop.png; phone.png",
    scope: "Eight-direction shared renderer sampled visually with Guts on the actual Board, desktop and phone. All 27 melee PNG share this orientation contract; this is not a new individual review of every PNG or a manual network match." };
}
assert.equal(count, 27);
state.slashFacingReview = { revision: "slash-facing-v16", updatedAt: "2026-10-21", sharedMeleePngCount: count,
  effectsTests: 355, browserScenarios: 81, productionDefinitions: 330,
  summary: "Right is the approved baseline. Left/up reflect horizontally; down only vertically as explicitly clarified by the user. Diagonals use 45deg intermediate poses. Screen-space direction is recomputed after board flip; same trace/contact/lunge and outcome ownership.",
  visualEvidence: "packages/web/test-results/vfx-expansion-game/facing-contact-sheets/",
  sourcePngChanged: false, manualNetworkMatch: false, fullRuntimeQa: false };
state.checks = state.checks.filter(line => !line.startsWith("Slash facing v16:"));
state.checks.push("Slash facing v16: effects 355/355, actual Board 81 cases (eight directions plus miss, three recipients, desktop/phone/reduced motion), assets, root lint/typecheck/build and fresh production 330 definitions PASS (facing-*.log). Shared orientation updated for 27 melee PNG; eight-direction Guts desktop/phone sheets inspected. No PNG/rules/SFX changes; prior blockers and full manual unique-animation/network QA stay open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded directional reflections for ${count} melee PNG; inventory coverage unchanged.`);
