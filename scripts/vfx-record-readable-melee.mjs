import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => { const data = readFileSync(resolve(dir, name)); return data.toString(data[0] === 0xff && data[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("readable-effects.log"), /# pass 345\b/);
assert.match(log("readable-sfx.log"), /# pass 66\b/);
assert.match(log("readable-browser.log"), /passed: 270 scenarios/);
assert.match(log("readable-production.log"), /coverage passed: 327 definitions/);
const report = json(resolve(root, "packages/web/test-results/vfx-expansion-game/swings-report.json"));
assert.equal(report.observations.length, 270); assert.deepEqual(report.errors, []);
const state = json(resolve(dir, "integration-state.json"));
let count = 0;
for (const row of state.assets) {
  if (!/\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename)) continue;
  count++;
  row.presentationRevision = "readable-melee-v13";
  row.phase = "Shared melee lead 420ms (previously 210); progressive target cut over last 260ms, 220ms sprite decay and token return. Total 640ms. SFX and confirmed hit/miss/HP use that same combat plan. Existing final-dice overlap is preserved; no server wait. Reduced motion remains 70ms, projectiles keep prior timing.";
  row.tokenPresentation = "Adjacent melee only: 0.035-cell anticipation, 0.24-cell contact thrust, 7.5% directional stretch and 220ms smooth return on existing combat RAF; tactical cell and aura/selection remain fixed.";
  row.verification.tests = [...new Set([...row.verification.tests,
    "combatPlayback.test.ts + expansionPresentation.test.tsx: readable 420ms melee contact, 640ms complete gesture; no early HP change, unchanged projectile 210ms and reduced-motion 70ms; source/target authorization, hit/miss and Guts real rules/SFX route preserved",
    "VfxLayer.test.tsx: target trace 260ms and recovery 220ms on one cue, with missing target and hidden attacker suppression",
    "vfx-expansion-game-smoke.mjs --swings-only --phone-motion --dark: 270 Board scenarios at the new 420ms melee contact, all 27 PNG; recipient/orientation, lunge, miss, duplicate, reconnect and cleanup"
  ])];
  row.verification.visual.readableTempoReview = { reviewed: true,
    scope: "Current owner desktop/phone samples for all 27 PNG, plus a Guts full-gesture stepped-60fps recording. Does not close full animation/network QA for every hero.",
    evidence: "packages/web/test-results/vfx-expansion-game/swing-contact-sheets/; packages/web/test-results/readable-melee-recording/" };
  if (row.verification.visual.slashRecording) row.verification.visual.slashRecording.supersededBy = "readable-melee-v13; older 27-clip gallery preserves the faster capture for comparison";
}
assert.equal(count, 27);
state.readableMeleeReview = { revision: "readable-melee-v13", updatedAt: "2026-10-20", sharedPngCount: count,
  contactMs: 420, traceMs: 260, recoveryMs: 220, completeGestureMs: 640, effectsTests: 345, sfxTests: 66, browserScenarios: 270,
  recording: "packages/web/test-results/readable-melee-recording/slash-normal.mp4", sourcePngChanged: false };
if (state.slashVideoReview) state.slashVideoReview.supersededBy = "readable-melee-v13";
const oldGallery = resolve(root, "packages/web/test-results/all-slashes-review");
const oldRecording = json(resolve(oldGallery, "recording.json"));
oldRecording.supersededBy = "readable-melee-v13: this footage preserves the earlier faster timing";
writeFileSync(resolve(oldGallery, "recording.json"), JSON.stringify(oldRecording, null, 2) + "\n");
const galleryHtml = readFileSync(resolve(oldGallery, "index.html"), "utf8");
if (!galleryHtml.includes("data-recording-archive")) writeFileSync(resolve(oldGallery, "index.html"), galleryHtml.replace("<h1>",
  '<p data-recording-archive style="padding:16px;border:1px solid #bf8d35">Архив прежнего быстрого темпа. В игре удар уже замедлен; <a href="../readable-melee-recording/slash-normal-repeat.mp4">новая запись на обычной скорости</a>.</p><h1>'));
state.checks = state.checks.filter(line => !line.startsWith("Readable melee v13:"));
state.checks.push("Readable melee v13: effects 345/345, SFX 66/66, asset audit, root lint/typecheck/build and fresh production 327 definitions PASS (readable-*.log). All 270 real Board cases pass at 420ms melee contact, 260ms trace and 220ms return/decay; ranged and reduced motion keep timing. All 27 PNG sampled on desktop/phone; new Guts normal/x4 capture. Rules, PNG, SFX routing and wider QA/blockers preserved; earlier 27-clip gallery is historical faster footage.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded readable shared melee timing for ${count} unchanged PNG.`);
