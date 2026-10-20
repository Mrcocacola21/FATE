import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const input = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const output = path.join(input, "long-move-contact-sheets");
mkdirSync(output, { recursive: true });
const phone = process.argv.includes("--phone"), prefix = phone ? "phone-" : "";
const rows = JSON.parse(readFileSync(path.join(input, "long-movement-report.json"), "utf8")).observations
  .filter(row => row.viewport === (phone ? "phone" : "desktop") && row.recipient === "P1" && row.id.endsWith(".long"));
for (let page = 0; page * 4 < rows.length; page++) {
  const group = rows.slice(page * 4, (page + 1) * 4), tiles = [];
  for (const [rowIndex, row] of group.entries()) for (const [column, sample] of row.samples.entries()) {
    const file = path.join(input, `${prefix}${row.id}-${sample.fraction}.png`), meta = await sharp(file).metadata();
    const x = sample.unitRect.x - (sample.boardRect ?? row.boardRect).x + sample.unitRect.width / 2;
    // Older reports recorded the final viewport offset only. These long-move
    // fixtures are horizontal, so their first local row center remains valid.
    const y = sample.boardRect ? sample.unitRect.y - sample.boardRect.y + sample.unitRect.height / 2
      : row.samples[0].unitRect.y - row.boardRect.y + row.samples[0].unitRect.height / 2;
    const crop = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - 260, Math.round(x - 130))),
      top: Math.max(0, Math.min(meta.height - 160, Math.round(y - 80))), width: 260, height: 160 }).png().toBuffer();
    const left = column * 260, top = rowIndex * 184;
    const label = Buffer.from(`<svg width="260" height="24"><rect width="260" height="24" fill="#20232a"/><text x="8" y="17" fill="white" font-family="Arial" font-size="12">${row.id.replace(/^longmove\./, "")} / ${sample.fraction * 100}%</text></svg>`);
    tiles.push({ input: label, left, top }, { input: crop, left, top: top + 24 });
  }
  await sharp({ create: { width: 780, height: group.length * 184, channels: 4, background: "#20232a" } })
    .composite(tiles).png().toFile(path.join(output, `${prefix}long-move-${page + 1}.png`));
}
console.log(`Saved ${rows.length} long movements in three actual Board phases.`);
