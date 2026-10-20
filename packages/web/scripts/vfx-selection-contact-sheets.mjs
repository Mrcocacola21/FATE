import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const input = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const output = path.join(input, "selection-contact-sheets");
mkdirSync(output, { recursive: true });
const rows = JSON.parse(readFileSync(path.join(input, "staging-report.json"), "utf8")).observations
  .filter(row => row.viewport === "desktop" && row.recipient === "P1" && row.selectionRect);
for (let page = 0; page * 12 < rows.length; page++) {
  const group = rows.slice(page * 12, (page + 1) * 12), tiles = [];
  for (const [index, row] of group.entries()) {
    const file = path.join(input, `selection-${row.id}.png`), meta = await sharp(file).metadata();
    const x = row.selectionRect.x - row.boardRect.x + row.selectionRect.width / 2;
    const y = row.selectionRect.y - row.boardRect.y + row.selectionRect.height / 2;
    const crop = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - 180, Math.round(x - 90))),
      top: Math.max(0, Math.min(meta.height - 160, Math.round(y - 80))), width: 180, height: 160 }).png().toBuffer();
    const left = index % 4 * 180, top = Math.floor(index / 4) * 186;
    const label = Buffer.from(`<svg width="180" height="26"><rect width="180" height="26" fill="#20232a"/><text x="5" y="18" fill="white" font-family="Arial" font-size="11">${row.id.replace(/^move\./, "")}</text></svg>`);
    tiles.push({ input: label, left, top }, { input: crop, left, top: top + 26 });
  }
  await sharp({ create: { width: 720, height: Math.ceil(group.length / 4) * 186, channels: 4, background: "#20232a" } })
    .composite(tiles).png().toFile(path.join(output, `selection-${page + 1}.png`));
}
console.log(`Saved selection review for ${rows.length} actual Board hero/form scenes.`);
