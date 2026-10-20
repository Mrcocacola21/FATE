import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { commanderAuraBounds } from "../packages/web/src/features/vfx/expansionPresence.generated.ts";
const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, "docs/assets/vfx-workflow");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const log = name => { const bytes = readFileSync(resolve(dir, name)); return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf16le" : "utf8"); };
assert.match(log("aura-art-effects.log"), /# pass 326\b/);
assert.match(log("aura-art-browser-all.log"), /passed: 72 scenarios/);
assert.match(log("aura-art-live.log"), /passed: 12 scenarios/);
assert.match(log("aura-art-production.log"), /coverage passed: 327 definitions/);
const matrix = json(resolve(root, "packages/web/test-results/vfx-expansion-game/commander-report.json"));
assert.equal(matrix.observations.length, 72); assert.deepEqual(matrix.errors, []);
const state = json(resolve(dir, "integration-state.json"));
const revision = "commander-original-art-v6";
const rows = state.assets.filter(row => row.filename.endsWith("/commander_aura.png") && row.integrationStatus === "verified");
assert.equal(rows.length, 6);
for (const row of rows) {
  row.presentationRevision = revision;
  row.triggerRoute = "Permitted actual Polkovodets source -> UnitStatusVfx -> CommanderAura; follows rendered/motion position; waits for decoded authorized portrait. Original PNG normalized to radius-one board footprint and animated around its fixed center.";
  row.phase = "Persistent projected state; original artwork rotates over 40s and breathes over 6s; reduced motion keeps static opacity 0.32; snapshot/reconnect do not create one-shots";
  row.geometry = { placement: "area", anchorMode: "followRenderedUnit", layer: "ground", radius: 1, metric: "Chebyshev", widthCells: 3, heightCells: 3,
    cells: "all eight adjacent cells including diagonals; board-edge clipping retained", originalPng: "primary living ring, not an offset inner marker",
    authoredAlphaBounds: commanderAuraBounds[row.heroId], fitting: "Normalize transparent padding and authored ellipse to centered board-plane contour, 1%/99% bounds, fixed orbit center 150/150 in 300-unit field" };
  row.verification.tests = [...new Set([...row.verification.tests,
    "packages/web/src/features/vfx/deploymentComposition.test.tsx: commander field includes diagonals, clips at board edges and mirrors exact cell geometry (six authored contour fits)"])];
  row.verification.browserAura = { passed: true, matrixScenarios: 72, timelineScenarios: 12,
    checks: "six commanders; P1/P2/spectator, both orientations, phone/reduced motion, movement/deploy/reconnect/cleanup; original PNG orbit changes continuously while center stays fixed; quiet cell wash and art opacity constrained",
    evidence: ["packages/web/test-results/vfx-expansion-game/commander-report.json", "docs/assets/vfx-workflow/aura-art-live.log"] };
  row.verification.visual.commanderArtReview = { reviewed: true, revision,
    scope: "Actual Board dark-theme frames of all six original PNG aura rings at 0/1400/2800ms. Source art unchanged; not a full manual network match.",
    evidence: ["packages/web/test-results/vfx-expansion-game/commander-art-contact-sheets/aura-art-0.png", "packages/web/test-results/vfx-expansion-game/commander-art-contact-sheets/aura-art-1400.png", "packages/web/test-results/vfx-expansion-game/commander-art-contact-sheets/aura-art-2800.png"] };
  row.cleanup = "State/permission/source death/removal/session replacement unmounts the field and CSS animations; no new JS timers. Rendered position and decoded permitted portrait required.";
}
state.commanderArtReview = { revision, reviewedAt: "2026-10-20", pngCount: rows.length, effectsTests: 326, matrixScenarios: 72, timelineScenarios: 12,
  summary: "The original PNG is now the centered, living radius-one ring. Quiet cell wash (0.005), dim radial wash (0.002–0.018), no separate traveling rectangular frame or outward wave. Art opacity 0.27–0.38; 40s orbit, 6s breath; reduced motion static." };
if (state.auraEntryReview) state.auraEntryReview.auraSupersededBy = revision;
state.checks = state.checks.filter(line => !line.startsWith("Commander art v6:"));
state.checks.push("Commander art v6: effects 326/326, presentation asset audit, root lint/typecheck/build PASS; source inventory remains 296 PNG / 29 profiles with unchanged SHA-256 (aura-art-*.log).");
state.checks.push("Commander art v6: actual Board 72/72 commander cases + 12/12 dark original-art timeline cases; fixed visual center, six styles, both orientations, P1/P2/spectator and phone/reduced motion. All six original rings viewed in three phases. Fresh production coverage 327/327. The three existing rules/art blockers and broader full-animation QA remain open.");
writeFileSync(resolve(dir, "integration-state.json"), JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${rows.length} living original-art commander rings; blockers preserved.`);
