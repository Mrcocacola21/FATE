import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = path.join(root, "packages/web/test-results/melee-art-audit");
mkdirSync(dir, { recursive: true });
const state = JSON.parse(readFileSync(path.join(root, "docs/assets/vfx-workflow/integration-state.json"), "utf8"));
const rows = state.assets.filter(row => /\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename));
const metrics = [];
for (let page = 0; page * 5 < rows.length; page++) {
  const tiles = [], group = rows.slice(page * 5, page * 5 + 5);
  for (const [index, row] of group.entries()) {
    const file = path.join(root, "packages/web/src/assets", row.filename), meta = await sharp(file).metadata();
    const count = meta.width / meta.height, label = Buffer.from(`<svg width="768" height="24"><rect width="768" height="24" fill="#171717"/><text x="8" y="17" fill="white" font-family="Arial" font-size="13">${row.id} / raw frames 0,2,4,6,8,10</text></svg>`);
    tiles.push({ input: label, left: 0, top: index * 160 });
    const samples = [];
    for (const [column, frame] of [0, 2, 4, 6, 8, 10].entries()) {
      if (frame >= count) continue;
      const tile = sharp(file).extract({ left: frame * meta.height, top: 0, width: meta.height, height: meta.height });
      tiles.push({ input: await tile.clone().resize(128, 128).png().toBuffer(), left: column * 128, top: index * 160 + 24 });
      const { data, info } = await tile.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let weight = 0, x = 0, y = 0, xx = 0, yy = 0, xy = 0;
      for (let j = 0; j < data.length; j += info.channels) {
        const w = data[j + 3] / 255, px = (j / info.channels) % info.width, py = Math.floor(j / info.channels / info.width);
        weight += w; x += px * w; y += py * w; xx += px * px * w; yy += py * py * w; xy += px * py * w;
      }
      const cx = x / weight, cy = y / weight;
      samples.push({ frame, weight, centroid: [cx, cy], angle: Math.atan2(2 * (xy / weight - cx * cy), xx / weight - cx * cx - yy / weight + cy * cy) * 90 / Math.PI });
    }
    metrics.push({ id: row.id, effectId: row.effectIds[0], samples });
  }
  await sharp({ create: { width: 768, height: group.length * 160, channels: 4, background: "#272727" } }).composite(tiles).png()
    .toFile(path.join(dir, `raw-${page + 1}.png`));
}
writeFileSync(path.join(dir, "raw-metrics.json"), JSON.stringify(metrics, null, 2));
console.log(`Audited ${rows.length} unchanged melee strips; raw frames and alpha geometry in ${dir}`);
