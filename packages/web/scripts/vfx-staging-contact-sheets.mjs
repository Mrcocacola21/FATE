import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const input = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const output = path.join(input, "staging-contact-sheets");
mkdirSync(output, { recursive: true });
const report = JSON.parse(readFileSync(path.join(input, "staging-report.json"), "utf8"));
const rows = report.observations.filter(o => o.viewport === "desktop" && o.recipient === "P1" && o.activeArt);
for (let page = 0; page * 8 < rows.length; page++) {
  const tiles = [];
  const group = rows.slice(page * 8, (page + 1) * 8);
  for (const [index, row] of group.entries()) {
    const samples = [{ suffix: "", rect: row.unitRect, label: row.id },
      ...(row.arrivalArt ? [{ suffix: ".arrival", rect: row.arrivalArt.unitRect, label: `${row.id} / arrive` }] : [])];
    for (const [column, sample] of samples.entries()) {
      const file = path.join(input, `desktop-${row.id}${sample.suffix}.png`);
      const meta = await sharp(file).metadata();
      const centerX = sample.rect.x - row.boardRect.x + sample.rect.width / 2;
      const centerY = sample.rect.y - row.boardRect.y + sample.rect.height / 2;
      const width = Math.min(220, meta.width), height = Math.min(180, meta.height);
      const crop = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - width, Math.round(centerX - width / 2))),
        top: Math.max(0, Math.min(meta.height - height, Math.round(centerY - height / 2))), width, height }).png().toBuffer();
      const left = (index % 2) * 440 + column * 220, top = Math.floor(index / 2) * 208;
      const title = Buffer.from(`<svg width="220" height="28"><rect width="220" height="28" fill="#20232a"/><text x="6" y="19" fill="white" font-family="Arial" font-size="12">${sample.label}</text></svg>`);
      tiles.push({ input: title, left, top }, { input: crop, left, top: top + 28 });
    }
  }
  await sharp({ create: { width: 880, height: Math.ceil(group.length / 2) * 208, channels: 4, background: "#20232a" } })
    .composite(tiles).png().toFile(path.join(output, `staging-${page + 1}.png`));
}
console.log(`Saved ${Math.ceil(rows.length / 8)} actual Board contact sheets (${rows.length} scenes).`);
