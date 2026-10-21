import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => { const b = readFileSync(resolve(dir, name)); return b.toString(b[0] === 0xff && b[1] === 0xfe ? "utf16le" : "utf8"); };
for (const [name, pattern] of [
  ["outcome-effects.log", /# pass 355\b/], ["outcome-sfx.log", /# pass 66\b/],
  ["outcome-rules.log", /rules: 3 suite executions passed/], ["outcome-contract.log", /contract: 20 suite executions passed/],
  ["outcome-production.log", /coverage passed: 330 definitions/], ["outcome-build.log", /built in/],
  ["outcome-assets.log", /"spriteDimensions": "PASS"/],
]) assert.match(log(name), pattern, name);
for (const name of ["outcome-lint.log", "outcome-typecheck.log"]) assert.doesNotMatch(log(name), /error TS\d|npm error|\d+ problems/);
const output = resolve(root, "packages/web/test-results/vfx-expansion-game");
for (const [file, count] of [["outcomes-report.json", 405], ["swings-report.json", 270],
  ["outcome-projectiles-report.json", 72], ["signature-report.json", 18]]) {
  const report = json(resolve(output, file)); assert.equal(report.observations.length, count, file); assert.deepEqual(report.errors, []);
}
const state = json(resolve(dir, "integration-state.json"));
for (const row of state.assets) assert.equal(createHash("sha256").update(readFileSync(resolve(root, "packages/web/src/assets", row.filename))).digest("hex"), row.sha256, row.id);
let melee = 0, projectiles = 0, impacts = 0, defenses = 0;
for (const row of state.assets) {
  if (row.integrationStatus !== "verified") continue;
  const role = row.filename.split("/").pop().replace(/\.png$/, "");
  const isMelee = ["attack_swing", "berserk_swing", "centipede_attack", "undying_swing"].includes(role);
  const isProjectile = ["attack_projectile", "engineering_attack", "ex_attack", "neo_attack"].includes(role);
  const isDefense = ["auto_defense", "bunker_absorb", "clean_soul_break"].includes(role);
  if (!(isMelee || isProjectile || isDefense || role === "attack_impact")) continue;
  melee += Number(isMelee); projectiles += Number(isProjectile); impacts += Number(role === "attack_impact"); defenses += Number(isDefense);
  row.presentationRevision = "attack-outcome-v15";
  row.verification.tests = [...new Set([...row.verification.tests,
    "attackOutcome.test.tsx: all 29 hero palettes and 35 release profiles on hit/miss; one release, exact result phase, existing special defense/reduction without generic miss duplication, source/target permission cleanup; committed event-cell attack/hit survives a known final-death snapshot, live hidden units remain suppressed",
    "attackOutcomeFacts.test.ts: 44 accepted attack routes plus River no-attack counterexample; riderPath signature, accepted prevention, positive actual damage reductions, recipient projection and unchanged RNG",
    "Actual Board: outcomes-report.json 405 cases; swings-report.json 270 cases; outcome-projectiles-report.json 72 Kaiser cases; signature-report.json 18 native Zoro cases; duplicate/reconnect/expiry and desktop/phone/reduced motion"
  ])];
  if (isMelee) {
    row.phase = "Same centered target cut for confirmed hit or miss: 420ms contact, 260ms progressive trace, 220ms recovery (70ms reduced motion). Hit/ordinary themed miss/special protection is independently selected at contact. Real riderPath attacks use one cut per authorized target, not prospective path occupants.";
    row.geometry.missOffsetCells = 0;
    row.verification.visual.outcomeReview = { reviewed: true, evidence: "packages/web/test-results/vfx-expansion-game/outcome-contact-sheets/swings-desktop.png; swings-phone.png",
      scope: "Fresh owner desktop/phone pre-contact samples for all 27 PNG; both orientations and reduced motion checked by actual Board smoke. Complete manual per-hero animation/network QA remains open." };
  }
  if (isProjectile && !row.phase.includes("Gesture is independent of the result")) row.phase += " Gesture is independent of the result: miss keeps its flight and gets a defender-themed guard; confirmed special protection replaces that ordinary guard.";
  if (role === "attack_impact") row.phase = "Exactly one ordinary hit accent at confirmed contact, including zero-damage hits and actual reduction; absent on ordinary or ability-prevented misses. Artemida's double confirmation remains an additional distinct accent.";
  if (isDefense) {
    row.phase = "Confirmed special protection at the existing outcome cue, replacing the ordinary miss guard. Generic dice misses never select this hero PNG. Bunker/reduction may accompany a confirmed hit.";
    if (["guts", "undyne"].includes(row.heroId) && role === "auto_defense" && !row.triggerRoute.includes("positive attackResolved.damageReductions")) row.triggerRoute += "; positive attackResolved.damageReductions for this hero's active form also plays the existing protective accent at contact";
  }
}
assert.equal(melee, 27); assert.equal(projectiles, 7);
state.attackOutcomeReview = { revision: "attack-outcome-v15", updatedAt: "2026-10-21", ordinaryMissPalettes: 29,
  releaseProfiles: 35, sharedMeleePngCount: melee, sharedProjectilePngCount: projectiles, hitPngCount: impacts, protectivePngCount: defenses,
  effectsTests: 355, sfxTests: 66, rulesSuites: 3, contractSuites: 20, productionDefinitions: 330,
  browserScenarios: { outcomes: 405, swings: 270, kaiserProjectiles: 72, nativeZoro: 18, total: 765 },
  newCommonDefinitions: ["basicSlash: existing combat_launch.png; base melee and Rider forms without an authored melee strip", "missShield: shared existing Pipoya cyan guard, runtime defender hue for all 29 profiles"],
  semanticFacts: ["attackSignature=riderPath from authoritative queued path attack, source-redacted as other signatures",
    "preventedBy=berserkerAutoDefense/odinMuninn/asgoreBravery only on accepted prevention; target-permission redacted",
    "damageReductions for Guts Berserk / Undyne Undying only for a positive actual cap; target-permission redacted; Bunker keeps its existing exact absorption field"],
  existingKeep: "Native Zoro Santoryu stays the only release (no extra basicSlash); normal Odin Gungnir and all existing ability casts/accents remain. Attack hit and defense have separate owners; no SFX routing or art bytes changed.",
  finalDeathPlayback: "A permitted event-anchored attack/hit keeps its committed cell when the final projected snapshot already marks its unit dead. Live hidden units and following statuses stay suppressed. Native Zoro hit fixture is lethal and checked for all three recipients and desktop/phone/reduced motion.",
  riderProfiles: ["base Rider", "Genghis Khan", "Don Quixote", "Odin", "Mettaton NEO", "Kaiser Engineering", "Kaneki Centipede"],
  riderCounterexample: "River Person has no incidental path attacks in current rules; no invented slash/target/roll.",
  visualEvidence: "packages/web/test-results/vfx-expansion-game/outcome-contact-sheets/; signature-desktop-P1-signature.zoro.hit.png and .miss.png",
  sourcePngChanged: false, manualNetworkMatch: false, fullRuntimeQa: false };
state.checks = state.checks.filter(line => !line.startsWith("Attack outcome v15:"));
state.checks.push("Attack outcome v15: effects 355/355, SFX 66/66, full rules 3 suites, network/OpenAPI contracts 20 suites, assets, root lint/typecheck/build and fresh production 330 definitions PASS (outcome-*.log). 765 actual Board cases: 405 result/defense/palette, 270 melee, 72 Kaiser flight and 18 native Zoro hit/miss. All 29 guard palettes and 27 melee PNG sampled visually; exact prevention/reduction/path semantics preserve results/RNG/resources. No PNG or SFX edits; 296 SHA-256 unchanged. Three previous blockers and full manual network/unique-animation QA remain open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded attack outcome review: ${melee} melee, ${projectiles} projectile, ${impacts} hit, ${defenses} protective PNG; inventory coverage unchanged.`);
