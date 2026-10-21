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
for (const [name, pattern] of [["effects", /# pass 357\b/], ["browser", /passed: 387 scenarios/],
  ["timeline", /passed: 81 scenarios/], ["assets", /"spriteDimensions": "PASS"/],
  ["production", /coverage passed: 330 definitions/], ["build", /built in/]]) assert.match(log(`melee-normalization-${name}.log`), pattern, name);
for (const name of ["lint", "typecheck"]) assert.doesNotMatch(log(`melee-normalization-${name}.log`), /error TS\d|npm error|\d+ problems/);
const output = resolve(root, "packages/web/test-results/vfx-expansion-game");
for (const [file, count] of [["melee-normalization-report.json", 387], ["normalized-timeline-report.json", 81]]) {
  const report = json(resolve(output, file)); assert.equal(report.observations.length, count); assert.deepEqual(report.errors, []);
}
const fixtures = json(resolve(output, "fixtures.json"));
const orientations = Object.assign({}, ...Object.values(fixtures).map(fixture => fixture.meleeArtwork));
assert.equal(Object.keys(orientations).length, 27);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  assert.equal(createHash("sha256").update(readFileSync(resolve(root, "packages/web/src/assets", row.filename))).digest("hex"), row.sha256);
  row.verification.tests = row.verification.tests.map(line => line.replace("--facing-reference-only", "--facing-only --reference-facing"));
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  const orientation = orientations[row.effectIds[0]];
  assert(orientation, row.id); count++;
  row.presentationRevision = "melee-artwork-normalization-v18";
  row.geometry.artworkOrientation = { ...orientation, canonicalDiagonal: "bottomLeft <-> topRight",
    source: "packages/web/src/features/vfx/meleeArtwork.ts" };
  row.geometry.coordinates = "Projected targetCell center. Each strip is first normalized around its own center to the bottom-left/top-right diagonal, with reveal starting at its actual bottom-left or top-right end. Guts reverses its authored crescent; Genghis keeps the accepted reference. Then the existing screen-space direction applies after board flip: right reference, left H, up V, down V twice (identity), diagonals +/-45deg. No shared global correction of all artwork.";
  row.geometry.facing.reference = "Per-asset normalized bottom-left/top-right stroke, not the raw PNG orientation";
  row.verification.tests = [...new Set([...row.verification.tests,
    "meleeArtwork.test.tsx: actual PNG alpha principal axis after per-file rotation follows the reference diagonal; renderer applies authored rotation/reveal; Guts and Genghis retain independent opposite growth",
    "Actual Board melee-normalization-report.json: 387 cases, all 27 melee PNG and Guts/Genghis eight directions plus miss; three recipients, desktop/phone/reduced motion, source/target geometry, art transform/reveal, contact, duplicate/reconnect/expiry",
    "normalized-timeline-report.json: 81 representative progressive reveal/contact/decay cases, including Guts reverse crescent and Luche flat authored stroke"
  ])];
  row.verification.visual.meleeNormalization = { reviewed: true,
    evidence: "packages/web/test-results/melee-art-audit/raw-*.png; packages/web/test-results/vfx-expansion-game/normalized-swing-contact-sheets/; normalized-facing-contact-sheets/; normalized-target-cut-timelines/",
    scope: "All 27 raw strips sampled at six real frames and all 27 normalized reference attacks inspected on the actual Board, desktop and phone; Guts/Genghis directions and representative timelines inspected. Full individual animation/network QA remains open." };
}
assert.equal(count, 27);
state.meleeNormalizationReview = { revision: "melee-artwork-normalization-v18", updatedAt: "2026-10-21",
  sharedMeleePngCount: count, effectsTests: 357, browserScenarios: 387, timelineScenarios: 81, productionDefinitions: 330,
  summary: "Per-PNG authored rotation and matching BL/TR reveal replace the incorrect common artwork orientation. Canonical stroke connects bottom-left and top-right; Guts restores 180deg reverse growth, Genghis remains 0deg. Nearly horizontal files are rotated individually. Existing direction poses and contact/outcome/SFX ownership remain.",
  sourcePngChanged: false, manualNetworkMatch: false, fullRuntimeQa: false };
state.checks = state.checks.filter(line => !line.startsWith("Melee normalization v18:"));
state.checks.push("Melee normalization v18: effects 357/357 including actual PNG geometry; Board 387 cases covering all 27 melee strips plus 81 reveal/contact/decay timeline cases; assets, root lint/typecheck/build and fresh production 330 definitions PASS (melee-normalization-*.log). All 27 raw strips and normalized reference attacks visually sampled on desktop/phone. PNG/SFX/rules unchanged; prior blockers and full manual unique-animation/network QA remain open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded individual artwork normalization for ${count} melee PNG; inventory coverage unchanged.`);
