import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const input = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const output = path.join(input, "commander-art-contact-sheets");
mkdirSync(output, { recursive: true });
const rows = JSON.parse(readFileSync(path.join(input, "commander-report.json"), "utf8")).observations
  .filter(row => row.viewport === "desktop" && row.recipient === "P1" && row.id.startsWith("move."));
for (const phase of [0, 1400, 2800]) {
  const tiles = [];
  for (const [index, row] of rows.entries()) {
    const file = path.join(input, `aura-live-${row.id}-${phase}.png`), meta = await sharp(file).metadata();
    const x = row.unitRect.x - row.boardRect.x + row.unitRect.width / 2;
    const y = row.unitRect.y - row.boardRect.y + row.unitRect.height / 2;
    const crop = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - 320, Math.round(x - 160))),
      top: Math.max(0, Math.min(meta.height - 280, Math.round(y - 140))), width: 320, height: 280 }).png().toBuffer();
    const left = index % 3 * 320, top = Math.floor(index / 3) * 304;
    const label = Buffer.from(`<svg width="320" height="24"><rect width="320" height="24" fill="#20232a"/><text x="8" y="17" fill="white" font-family="Arial" font-size="13">${row.id.replace(/^move\./, "")} / ${phase}ms</text></svg>`);
    tiles.push({ input: label, left, top }, { input: crop, left, top: top + 24 });
  }
  await sharp({ create: { width: 960, height: Math.ceil(rows.length / 3) * 304, channels: 4, background: "#20232a" } })
    .composite(tiles).png().toFile(path.join(output, `aura-art-${phase}.png`));
}
console.log(`Saved original-art aura review: ${rows.length} commanders, three phases.`);
