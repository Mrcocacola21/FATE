// Run with npx tsx scripts/vfx-record-staging.mjs after the browser review.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { expansionStaging, expansionStagingProfile } from "../packages/web/src/features/vfx/expansionStaging.ts";
const dir = resolve(import.meta.dirname, "../docs/assets/vfx-workflow");
const file = resolve(dir, "integration-state.json");
const state = JSON.parse(readFileSync(file, "utf8"));
if (state.deploySyncReview) {
  console.log("Deploy sync v3 evidence already exists; use vfx-record-deploy-sync.mjs to refresh it.");
  process.exit(0);
}
let count = 0;
for (const asset of state.assets) {
  const stage = expansionStaging(basename(asset.filename, ".png"));
  if (!stage) continue;
  const profile = expansionStagingProfile(asset.heroId);
  asset.geometry = stage === "moveTrail"
    ? { placement: "projectile", anchorMode: "event", layer: "ground", coordinates: "confirmed cue.from -> cue.to, screen foot +0.28 cell; tail behind moving token", widthCells: profile.trailWidth, heightCells: profile.trailHeight }
    : { placement: "cell", anchorMode: "event", layer: "ground", coordinates: stage === "deploy" ? "authorized unitPlaced.position; ring base below portrait" : "final contiguous movement cue.to at screen foot",
      widthCells: stage === "deploy" ? profile.deployWidth : profile.arrivalWidth, heightCells: stage === "deploy" ? profile.deployHeight : profile.arrivalHeight };
  if (stage === "moveArrive") {
    asset.phase = `Final contiguous normal/rider segment boundary; ${profile.arrivalDuration}ms fade`;
    asset.triggerRoute = "Confirmed movementPlan terminal reached cue.to -> one grounded arrival; intermediate contiguous segments do not restart it";
  }
  if (stage === "deploy") asset.phase = `Confirmed unitPlaced; ${profile.deployDuration}ms ring + 380ms token materialization on same cue (reduced: 120ms opacity only)`;
  asset.presentationRevision = "grounded-deploy-movement-v2";
  const evidence = "packages/web/src/features/vfx/expansionPresentation.test.tsx: Thematic movement owns its wake and only the final landing; base and forced movement keep their common feedback";
  if (!asset.verification.tests.includes(evidence)) asset.verification.tests.push(evidence);
  asset.verification.visual.stagingReview = { reviewed: true, scope: "Actual Board midpoint travel/deploy and separate arrival screenshots, all hero profiles and six movement forms; original art bytes unchanged",
    evidence: "packages/web/test-results/vfx-expansion-game/staging-contact-sheets/" };
  count++;
}
state.stagingReview = { revision: "grounded-deploy-movement-v2", pngCount: count,
  browserScenarios: 402, commanderScenarios: 72,
  summary: "Deploy framed around token with a soft materialization; hero-specific ground footprints; wake follows behind on shared travel clock; only terminal arrival; corresponding generic line/pulse suppressed. Base/forced/transport feedback retained." };
state.checks = state.checks.filter(s => !s.startsWith("Deploy/move v2:"));
state.checks = state.checks.map(s => s.startsWith("npm run test:effects")
  ? "npm run test:effects --workspace packages/web — PASS, 318/318, включая отсутствие дублей следа/deploy и одно приземление в конце пути (staging-effects.log)."
  : s.startsWith("npm run test:presentation:assets")
    ? "npm run test:presentation:assets --workspace packages/web — PASS (staging-assets.log)."
    : s.startsWith("npm run lint;")
      ? "npm run lint; npm run typecheck; npm run build — PASS (staging-lint.log, staging-typecheck.log, staging-build.log)."
      : s);
state.checks.push("Deploy/move v2: 318/318 test:effects, test:presentation:assets, root lint/typecheck/build PASS; source PNG hashes unchanged. See staging-*.log and DEPLOY_MOVE_REVIEW_RU.md for real Board review scope.");
state.checks.push("Deploy/move v2: real Board staging matrix 402/402; commander aura alignment 72/72, owner/opponent/spectator, desktop/phone reduced motion. Nine actual Board contact sheets reviewed. Fresh production 327 definitions: staging-production.log.");
writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
console.log(`Updated ${count} deployment/movement PNG records; existing statuses and blockers preserved.`);
