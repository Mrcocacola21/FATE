import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "docs/assets/vfx-workflow");
const results = resolve(root, "packages/web/test-results/vfx-expansion-game");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const log = name => { const bytes = readFileSync(resolve(dir, name)); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8"); };
const state = readJson(resolve(dir, "integration-state.json"));
if (state.revealSelectionReview) { console.log("Newer reveal/selection review exists; preserving it."); process.exit(0); }
const matrix = readJson(resolve(results, "staging-report.json"));
assert.equal(matrix.observations.length, 402); assert.deepEqual(matrix.errors, []);
for (const name of ["cold-portrait-report.json", "expired-portrait-report.json"]) {
  const result = readJson(resolve(results, name));
  assert.equal(result.observations.length, 1); assert.deepEqual(result.errors, []);
}
assert.match(log("aura-entry-effects.log"), /# pass 325\b/);
assert.match(log("aura-entry-browser-all.log"), /passed: 402 scenarios/);
assert.match(log("aura-entry-production.log"), /coverage passed: 327 definitions/);
const prefix = "packages/web/src/features/vfx/";
const entries = ["deploymentComposition.test.tsx: cold portrait cannot leave deploy or commander field playing alone; token DOM survives cue and cleanup",
  "deploymentComposition.test.tsx: portrait finishing after deployment expires does not cause a late appearance flash"];
let deploys = 0, auras = 0;
for (const row of state.assets) {
  const deploy = row.filename.endsWith("/deploy.png");
  const aura = row.filename.endsWith("/commander_aura.png") && row.integrationStatus === "verified";
  if (!deploy && !aura) continue;
  row.presentationRevision = "living-aura-entry-v4";
  row.verification.tests = [...new Set(row.verification.tests.filter(name => !name.includes("stays a compact marker")))];
  row.verification.visual.auraEntryReview = { reviewed: true, revision: "living-aura-entry-v4",
    scope: "Fresh actual Board midpoints for 28 deployments and six aura profiles. Genghis entrance 16/80/180/360/560ms and living field 0/1400/2800ms reviewed separately. Not a full manual network match.",
    evidence: ["packages/web/test-results/vfx-expansion-game/staging-contact-sheets/", "packages/web/test-results/vfx-expansion-game/aura-live-move.genghisKhan-*.png"] };
  if (deploy) {
    deploys++;
    const duration = row.phase.match(/(\d+)ms/)?.[1]; assert(duration, row.id);
    row.phase = `Confirmed unitPlaced; ${duration}ms shared entrance/light/strip composition around the already decoded portrait. Cold portrait suppresses optional VFX until ready, catches up to original phase, never restarts after expiry.`;
    row.triggerRoute = "Projected unitPlaced -> placement frame -> stable UnitDeploymentContent; portrait and light share entrance envelope; portrait element preserved through start/cleanup; no detached VfxLayer deploy";
    row.geometry = { ...row.geometry, attachment: "One continuously animated composition containing persistent portrait subtree, soft bloom/wisps and thematic strip behind it" };
    row.verification.tests.push(...entries.map(name => prefix + name));
    row.verification.browserDeploy = { passed: true, firstPaint: "decoded pixels, not just img DOM; common entrance envelope opacity >= 0.4; shared duration; stable portrait through expiry",
      matrix: "402 actual Board staging cases, P1/P2/spectator and desktop/phone reduced motion",
      coldCounterexamples: "HTTP portrait deliberately held; no aura/deploy alone; released within phase and after expiry, no late flash",
      evidence: ["packages/web/test-results/vfx-expansion-game/staging-report.json", "packages/web/test-results/vfx-expansion-game/cold-portrait-report.json", "packages/web/test-results/vfx-expansion-game/expired-portrait-report.json"] };
    row.cleanup = "Cue expires on shared playback clock; portrait subtree remains mounted. Pending portrait decode cannot replay an expired entrance; permission/session loss cancels subscriptions and art.";
  } else {
    auras++;
    row.triggerRoute = "Permitted actual Polkovodets source -> UnitStatusVfx -> CommanderAura; follows rendered/motion position only, waits for authorized portrait pixels; CSS breathing, traveling edge light and outward wave";
    row.phase = "Persistent radius-one field; no one-shot on snapshot/reconnect; reduced motion keeps static field, no traveling light/waves";
    row.geometry = { placement: "area", anchorMode: "followRenderedUnit", radius: 1, metric: "Chebyshev", widthCells: 3, heightCells: 3,
      cells: "all eight neighbors including diagonals, clipped at board edges; not derived from visible targets", originalPng: "subtle inner signature, not stretched to substitute for field coverage" };
    row.verification.tests.push(prefix + "expansionPresentation.test.tsx: commander aura waits for the rendered token and covers all eight radius-one neighbors",
      prefix + "deploymentComposition.test.tsx: commander field includes diagonals, clips at board edges and mirrors exact cell geometry", prefix + entries[0]);
    row.cleanup = "State/permission/source death or removal unmounts field and its CSS animations; rendered position and portrait decode required; no JS animation timers or event replays.";
  }
  row.verification.tests = [...new Set(row.verification.tests)];
}
assert.equal(deploys, 28); assert.equal(auras, 6);
if (state.deploySyncReview) state.deploySyncReview.supersededBy = "living-aura-entry-v4";
state.auraEntryReview = { revision: "living-aura-entry-v4", reviewedAt: "2026-10-20", deployPngCount: deploys, auraPngCount: auras,
  stagingScenarios: 402, coldScenarios: 2, effectsTests: 325,
  summary: "Restored living 3x3 radius-one commander fields. Portrait warming, decoded-pixel guard, stable portrait DOM and one continuous entrance envelope replace separate portrait/strip staging." };
state.checks = state.checks.filter(line => !line.startsWith("Aura/entry v4:"));
state.checks.push("Aura/entry v4: 325/325 effects tests, presentation asset audit, root lint/typecheck/build PASS; source PNG hashes unchanged (aura-entry-*.log).");
state.checks.push("Aura/entry v4: 402/402 real Board cases, decoded portraits and stable DOM checked, six commander fields cover all radius-one neighbors, both board orientations/phone reduced motion, duplicate/reconnect/expiry. Two controlled cold/expired portrait cases and a 2-scene dark Genghis aura/entrance timeline passed. Fresh production coverage 327/327. Full manual network match remains open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${deploys} continuous deployments and ${auras} living radius-one fields; preserved blockers.`);
