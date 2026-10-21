import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const dir = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const normalized = process.argv.includes("--normalized");
const output = path.join(dir, normalized ? "normalized-target-cut-timelines" : "target-cut-timelines"); mkdirSync(output, { recursive: true });
const report = JSON.parse(readFileSync(path.join(dir, normalized ? "normalized-timeline-report.json" : "melee-timeline-report.json"), "utf8"));
for (const viewport of ["desktop", "phone"]) {
  const rows = report.observations.filter(row => row.recipient === "P1" && row.viewport === viewport);
  for (let page = 0; page * 3 < rows.length; page++) {
    const group = rows.slice(page * 3, (page + 1) * 3), tiles = [];
    for (const [index, row] of group.entries()) {
      const label = Buffer.from(`<svg width="960" height="24"><rect width="960" height="24" fill="#20232a"/><text x="8" y="17" fill="white" font-family="Arial" font-size="12">${row.id} / ${viewport} / 60%, 80%, contact, +40ms</text></svg>`);
      tiles.push({ input: label, left: 0, top: index * 204 });
      for (const [phase, frame] of row.slashFrames.entries()) {
        const file = path.join(dir, `cut-${viewport}-${row.id}-${frame.fraction.toFixed(2)}.png`);
        const meta = await sharp(file).metadata();
        const width = viewport === "phone" ? 150 : 240, height = viewport === "phone" ? 112 : 180;
        const left = Math.max(0, Math.min(meta.width - width, Math.round(frame.target.x - width / 2)));
        const top = Math.max(0, Math.min(meta.height - height, Math.round(frame.target.y - height / 2)));
        const input = await sharp(file).extract({ left, top, width, height }).resize(240, 180).png().toBuffer();
        tiles.push({ input, left: phase * 240, top: index * 204 + 24 });
      }
    }
    await sharp({ create: { width: 960, height: group.length * 204, channels: 4, background: "#20232a" } })
      .composite(tiles).png().toFile(path.join(output, `${viewport}-${page + 1}.png`));
  }
  console.log(`Saved ${rows.length} ${viewport} target-cut timelines.`);
}
