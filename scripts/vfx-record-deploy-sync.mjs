// Run after the deploy first-frame matrix and manual contact-sheet review.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "docs/assets/vfx-workflow");
const resultDir = resolve(root, "packages/web/test-results/vfx-expansion-game");
const load = file => JSON.parse(readFileSync(file, "utf8"));
const state = load(resolve(dir, "integration-state.json"));
if (state.auraEntryReview) {
  console.log("Living aura/entry v4 supersedes this recorder; use vfx-record-aura-entry.mjs.");
  process.exit(0);
}
const matrix = load(resolve(resultDir, "staging-report.json"));
const snapshot = load(resolve(resultDir, "snapshot-first-report.json"));
assert.equal(matrix.observations.length, 402);
assert.equal(snapshot.observations.length, 168);
assert.deepEqual(matrix.errors, []);
assert.deepEqual(snapshot.errors, []);
const effectsLog = readFileSync(resolve(dir, "deploy-sync-effects.log"));
assert.match(effectsLog.toString(effectsLog[0] === 0xff && effectsLog[1] === 0xfe ? "utf16le" : "utf8"), /# pass 321\b/, "effects suite must pass before recording evidence");
const prefix = "packages/web/src/features/vfx/expansionPresentation.test.tsx: ";
const addTest = (row, name) => { row.verification.tests = [...new Set([...row.verification.tests, prefix + name])]; };
let deploys = 0, auras = 0;
for (const row of state.assets) {
  if (row.filename.endsWith("/deploy.png")) {
    deploys++;
    const oldDuration = row.phase.match(/(\d+)ms/)?.[1];
    assert(oldDuration, row.id);
    row.presentationRevision = "deploy-token-sync-v3";
    row.triggerRoute = "Projected unitPlaced -> placement playback frame zero + useBoardVfx before paint -> UnitDeploymentContent; no detached deploy in VfxLayer";
    row.phase = `Confirmed unitPlaced; token already visible on frame zero; token and artwork share ${oldDuration}ms playback duration, start and expiry; reduced motion keeps token readable`;
    row.geometry = { ...row.geometry, attachment: "Inside rendered token composition; ground artwork behind portrait, HP and tactical UI above", coordinates: "authorized unitPlaced.position applied by placement queue at event start" };
    addTest(row, "placement enters at frame zero with its attached art, without delaying the next placement");
    row.verification.browserDeploy = { passed: true, firstFrameMs: 16, scenariosPerHero: 12,
      scope: "normal and snapshot-before-event delivery; P1/P2/spectator; desktop and phone reduced motion; hidden Chikatilo suppressed; duplicate/reconnect/expiry",
      evidence: ["packages/web/test-results/vfx-expansion-game/staging-report.json", "packages/web/test-results/vfx-expansion-game/snapshot-first-report.json"] };
    row.verification.visual.stagingReview = { reviewed: true, scope: "Fresh real Board deploy midpoint, attached token; all 28 actual placements. First-frame continuity separately asserted in browser; full animated network match remains open.", evidence: "packages/web/test-results/vfx-expansion-game/staging-contact-sheets/" };
    if (row.heroId === "genghisKhan") row.verification.visual.deployTimeline = { reviewed: true, framesMs: [16, 80, 180, 360, 560], scope: "Dark real Board with adjacent tokens, snapshot-first delivery", evidence: "packages/web/test-results/vfx-expansion-game/timeline-deploy.genghisKhan-*.png" };
    row.cleanup = "Existing shared cue expiry; component removed on token/permission/session loss; no placement animation delay added to rules or next playback item";
  }
  if (row.filename.endsWith("/commander_aura.png") && row.integrationStatus === "verified") {
    auras++;
    row.presentationRevision = "deploy-token-sync-v3";
    row.geometry = { placement: "unit", anchorMode: "followRenderedUnit", scaleCells: 1.5, opacity: 0.28, meaning: "compact commander marker; not a painted tactical radius" };
    row.projectedStateFields = [...new Set([...row.projectedStateFields, "rendered visualUnits.position or motion.position; never ahead-snapshot position fallback"])];
    addTest(row, "commander art waits for the rendered token and stays a compact marker");
  }
}
assert.equal(deploys, 28); assert.equal(auras, 6);
state.deploySyncReview = { revision: "deploy-token-sync-v3", pngCount: deploys + auras, deployPngCount: deploys,
  stagingScenarios: matrix.observations.length, snapshotFirstScenarios: snapshot.observations.length,
  summary: "Token and deploy share one composition from first playback frame. Compact commander markers wait for rendered position. Placement-only warmup avoids battle-strip eviction. No PNG, rules or sound timing changes." };
state.checks = state.checks.filter(line => !line.startsWith("Deploy sync v3:"));
state.checks.push("Deploy sync v3: 321/321 test:effects; presentation assets, root lint/typecheck/build PASS (deploy-sync-*.log). PNG hashes unchanged.");
state.checks.push("Deploy sync v3: real Board matrix 402/402 + snapshot-before-event deployments 168/168; no extra frame polling; desktop/phone reduced motion, P1/P2/spectator. All 28 deployment midpoints reviewed; Genghis dark-board sequence reviewed at 16/80/180/360/560ms. Fresh production coverage: deploy-sync-production.log.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${deploys} synchronized deploys and ${auras} compact commander markers; prior blockers preserved.`);
