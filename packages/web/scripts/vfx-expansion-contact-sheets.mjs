import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const web = fileURLToPath(new URL("../", import.meta.url));
const input = path.join(web, "test-results/vfx-coverage/browser-production");
const output = path.join(input, "contact-sheets");
mkdirSync(output, { recursive: true });
const state = JSON.parse(readFileSync(path.join(web, "../../docs/assets/vfx-workflow/integration-state.json"), "utf8"));
for (const hero of [...new Set(state.assets.map(a => a.heroId))]) {
  const assets = state.assets.filter(a => a.heroId === hero);
  const tiles = [];
  for (const [index, asset] of assets.entries()) {
    const key = asset.effectIds[0];
    const screenshot = path.join(input, `${key}.png`);
    const manifest = JSON.parse(readFileSync(path.join(web, "src/assets/vfx/heroes", hero, "expansion/manifest.json"), "utf8"));
    const meta = manifest.assets.find(a => a.id === asset.id);
    const projectile = meta.geometry === "projectile";
    const crop = await sharp(screenshot).extract({ left: projectile ? 333 : 248, top: projectile ? 191 : 248, width: 224, height: 224 }).toBuffer();
    const title = Buffer.from(`<svg width="224" height="30"><rect width="224" height="30" fill="#20232a"/><text x="6" y="20" font-family="Arial" font-size="12" fill="white">${asset.filename.split("/").at(-1)}</text></svg>`);
    tiles.push({ input: crop, left: (index % 3) * 224, top: Math.floor(index / 3) * 254 + 30 });
    tiles.push({ input: title, left: (index % 3) * 224, top: Math.floor(index / 3) * 254 });
  }
  await sharp({ create: { width: 672, height: Math.ceil(assets.length / 3) * 254, channels: 4, background: "#20232a" } })
    .composite(tiles).png().toFile(path.join(output, `${hero}.png`));
}
writeFileSync(path.join(output, "README.txt"), "Crops of fresh production browser midpoint screenshots on Board. These sheets support artwork inspection; they do not prove runtime trigger reachability or full animation QA.\n");
console.log(`Generated contact sheets for ${new Set(state.assets.map(a => a.heroId)).size} profiles.`);
