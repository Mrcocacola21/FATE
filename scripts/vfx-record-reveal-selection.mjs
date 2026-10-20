import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expansionStagingProfile } from "../packages/web/src/features/vfx/expansionStaging.ts";
import { deploymentRevealFractions, selectionRingBounds } from "../packages/web/src/features/vfx/expansionPresence.generated.ts";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "docs/assets/vfx-workflow");
const results = resolve(root, "packages/web/test-results/vfx-expansion-game");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const log = name => { const bytes = readFileSync(resolve(dir, name)); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8"); };
const matrix = json(resolve(results, "staging-report.json"));
assert.equal(matrix.observations.length, 402); assert.deepEqual(matrix.errors, []);
const selected = matrix.observations.filter(row => row.selectionRect);
assert.equal(selected.length, 39);
assert.match(log("reveal-selection-effects.log"), /# pass 326\b/);
assert.match(log("reveal-selection-browser-all.log"), /passed: 402 scenarios/);
assert.match(log("reveal-selection-production.log"), /coverage passed: 327 definitions/);
for (const name of ["cold-portrait-report.json", "expired-portrait-report.json"]) {
  const result = json(resolve(results, name));
  assert.equal(result.observations.length, 1); assert.deepEqual(result.errors, []);
}
const snapshot = json(resolve(results, "snapshot-first-report.json"));
assert.equal(snapshot.observations.length, 168); assert.deepEqual(snapshot.errors, []);
assert.match(log("reveal-selection-snapshot-first.log"), /passed: 168 scenarios/);
const capture = json(resolve(root, "packages/web/test-results/kaiser-reveal-selection/recording.json"));
assert.deepEqual(capture.errors, []); assert.equal(capture.clips.length, 2);
const state = json(resolve(dir, "integration-state.json"));
const revision = "reveal-selection-v5";
let deploys = 0, rings = 0;
for (const row of state.assets) {
  const deploy = row.filename.endsWith("/deploy.png"), ring = row.filename.endsWith("/select_ring.png");
  if (!deploy && !ring) continue;
  row.presentationRevision = revision;
  row.verification.visual.revealSelectionReview = {
    reviewed: true, revision,
    scope: deploy ? "Actual Board midpoint of all 28 placements; Kaiser live server/placeUnit real-clock recording reviewed as a frame sequence. Not a full manual network match for every hero."
      : "Actual Board local selection for all 29 profiles plus six forms and four Chicken variants; visible contour at cell boundary reviewed in 39 source scenes.",
    evidence: deploy ? ["packages/web/test-results/vfx-expansion-game/staging-contact-sheets/", "packages/web/test-results/kaiser-reveal-selection/kaiser-normal-deploy-slow4x.mp4"]
      : ["packages/web/test-results/vfx-expansion-game/selection-contact-sheets/"],
  };
  if (deploy) {
    deploys++;
    const profile = expansionStagingProfile(row.heroId), fraction = deploymentRevealFractions[row.heroId];
    assert(fraction > 0 && fraction < 1, row.id);
    row.triggerRoute = "Projected unitPlaced -> existing placement playback; session/plan/frame zero published before paint -> stable UnitDeploymentContent; one attached strip, no detached deploy";
    row.phase = `Confirmed unitPlaced; ${profile.deployDuration}ms shared composition; portrait opacity 0 -> 1 by ${Math.round(profile.deployDuration * fraction)}ms (authored brightest-frame center ${fraction}). Remains fully visible through light/strip fade. Reduced motion shortens portrait reveal to at most 120ms. Placement queue does not wait for art.`;
    row.geometry = { ...row.geometry, widthCells: profile.deployWidth, heightCells: profile.deployHeight,
      attachment: "Persistent portrait subtree with soft light and enlarged thematic strip behind it; portrait size unchanged", revealFraction: fraction };
    row.verification.browserDeploy = { ...row.verification.browserDeploy, revision,
      firstPaint: "Decoded portrait and strip attached together, no polling/retry. Portrait opacity sampled at 0/half/peak/after: 0/~0.5/1/1; procedural light peaks at the same instant.",
      matrix: "402 actual Board cases: all 28 placements, movement/forms, P1/P2/spectator, desktop and phone/reduced motion; duplicate/reconnect/cleanup; unchanged cold/expired portrait guards" };
  } else {
    rings++;
    row.triggerRoute = "Explicit local Board.selectedUnitId -> SelectedUnitVfx -> authorized renderedUnits/motion position; no ring before rendered token, no server event";
    row.phase = "Persistent static local selection; during actual deployment follows portrait opacity on the same cue clock; no render-triggered one-shot";
    row.geometry = { placement: "unit", anchorMode: "followRenderedUnit", layer: "status", widthCells: 1, heightCells: 1,
      visibleContourCells: .98, authoredAlphaBounds: selectionRingBounds[row.heroId],
      fitting: "Transparent canvas padding normalized independently per axis; visible contour reaches 1%/99% of cell; cell clips outer glow",
      readability: "Outer radial band only, center masked clear; above token backing but below HP/decision UI; selected thematic units use a quieter fallback outline" };
    row.projectedStateFields = [...new Set([...row.projectedStateFields, "renderedUnits[id].position", "visualMotionByUnitId[id].position/opacity"])];
    row.verification.tests.push("packages/web/src/features/vfx/expansionPresentation.test.tsx: selection follows rendered motion, waits for its token, and fits the visible contour to the cell");
    row.verification.browserSelection = { passed: true, scenes: 39, profiles: 29, forms: 6, chickenVariants: 4,
      evidence: "packages/web/test-results/vfx-expansion-game/staging-report.json", checks: "real local cell click, contour canvas enlarged, static artwork, deselect/reconnect cleanup; selected deploy ring fades with token, cannot precede decoded portrait" };
  }
  row.verification.tests = [...new Set(row.verification.tests)];
}
assert.equal(deploys, 28); assert.equal(rings, 29);
state.revealSelectionReview = { revision, reviewedAt: "2026-10-20", deployPngCount: deploys, selectionPngCount: rings,
  effectsTests: 326, stagingScenarios: 402, selectionScenes: 39,
  summary: "Portrait reveals from zero opacity to full at authored flash peak. Deploy lasts ~20% longer, artwork extent ~9% larger, portrait unchanged. Selection visible contour fills 98% of cell and follows rendered token." };
if (state.auraEntryReview) state.auraEntryReview.deploySupersededBy = revision;
if (state.kaiserCaptureReview) {
  state.kaiserCaptureReview.status = "resolved_selection_before_rendered_token";
  state.kaiserCaptureReview.resolvedBy = revision;
  state.kaiserCaptureReview.resolution = "The separate early ring was local select_ring anchored to ahead PlayerView, while portrait waited for snapshot reconciliation. Selection now requires rendered token and follows its motion. debugSpawnUnit still has events=[] and does not invent a deploy; confirmed placeUnit has genuine unitPlaced and the new reveal.";
  state.kaiserCaptureReview.updatedRecordings = capture.clips.flatMap(clip => ["packages/web/test-results/kaiser-reveal-selection/" + clip.id + ".mp4", "packages/web/test-results/kaiser-reveal-selection/" + clip.id + "-slow4x.mp4"]);
}
if (state.nextBatchBeforeKaiserCapture) state.nextBatch = state.nextBatchBeforeKaiserCapture;
state.checks = state.checks.filter(line => !line.startsWith("Reveal/selection v5:"));
state.checks.push("Reveal/selection v5: effects 326/326, asset audit, root lint/typecheck/build PASS; all 296 source PNG hashes preserved (reveal-selection-*.log).");
state.checks.push("Reveal/selection v5: 402/402 actual Board cases; portrait opacity 0/half/peak/after and shared light peak, no first-frame retry; selection contour all 29 profiles and 39 hero/form/Chicken scenes; both orientations, phone/reduced motion, P1/P2/spectator, duplicate/reconnect/cleanup. Fresh production coverage 327/327. Actual server Kaiser spawn and placeUnit recorded separately with real clocks; source events retained.");
state.checks.push("Reveal/selection v5: 168/168 placements with ahead snapshot; two controlled cold/expired portrait counterexamples passed on current source. Selection opacity follows token reveal and its masked center leaves portraits clear; source PNGs unchanged.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${deploys} reveals and ${rings} enlarged selection rings; source inventory and blockers preserved.`);
