import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflow = resolve(root, "docs/assets/vfx-workflow");
const statePath = resolve(workflow, "integration-state.json");
const previous = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const old = new Map((previous.assets ?? []).map(row => [row.id, row]));
const assetRoot = resolve(root, "packages/web/src/assets");
const reports = ["vfx_expansion_import_2026-10-19.json", "vfx_hero_topup_import_2026-10-19.json"]
  .flatMap(file => JSON.parse(readFileSync(resolve(root, "docs/assets", file), "utf8")).files);
const assets = [];
const errors = [];
for (const heroId of readdirSync(resolve(assetRoot, "vfx/heroes")).sort()) {
  const folder = resolve(assetRoot, "vfx/heroes", heroId, "expansion");
  if (!existsSync(folder)) continue;
  const manifest = JSON.parse(readFileSync(resolve(folder, "manifest.json"), "utf8"));
  const pngs = readdirSync(folder).filter(file => file.endsWith(".png"));
  const declared = new Set();
  for (const asset of manifest.assets) {
    declared.add(asset.filename.split("/").at(-1));
    const bytes = readFileSync(resolve(assetRoot, asset.filename));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== asset.sha256) errors.push(`${asset.id}: manifest SHA mismatch`);
    if (bytes.readUInt32BE(16) !== asset.frameWidth * asset.frames || bytes.readUInt32BE(20) !== asset.frameHeight)
      errors.push(`${asset.id}: frame layout mismatch`);
    // Import reports are historical provenance, never runtime status.
    if (!reports.some(row => JSON.stringify(row).includes(sha256))) errors.push(`${asset.id}: SHA absent from import reports`);
    const prior = old.get(asset.id);
    const unchanged = prior?.sha256 === sha256;
    assets.push({
      id: asset.id, heroId, filename: asset.filename, sha256,
      requestedRoleOrAbilityRefs: asset.requestedRoleOrAbilityRefs,
      effectIds: [], triggerRoute: null, phase: asset.phase, geometry: asset.geometry,
      visibility: { declared: asset.sourceVisibility, runtime: null },
      integrationStatus: "inventoried",
      verification: { tests: [], visual: { reviewed: false, evidence: [] } },
      blocker: null,
      ...(unchanged ? prior : {}),
      ...(!unchanged && prior ? { invalidatedBySha256: prior.sha256 } : {}),
    });
  }
  for (const png of pngs) if (!declared.has(png)) errors.push(`${heroId}/${png}: missing manifest entry`);
}
mkdirSync(workflow, { recursive: true });
const state = { ...previous, schemaVersion: 1, inventoryDate: "2026-10-19", assets,
  inventoryVerification: { pngCount: assets.length, heroCount: new Set(assets.map(row => row.heroId)).size, errors },
  knownExternalBlockers: ["undyne/shift.png: Direction Shift mechanic absent; outside expansion scope"],
  nextBatch: previous.nextBatch ?? "Infrastructure and Zoro (6 PNG), then Griffith/Femto" };
writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log(JSON.stringify(state.inventoryVerification));
if (errors.length) process.exitCode = 1;
