import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
const input = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const output = path.join(input, "swing-contact-sheets"); mkdirSync(output, { recursive: true });
const report = JSON.parse(readFileSync(path.join(input, "swings-report.json"), "utf8"));
const fixtures = JSON.parse(readFileSync(path.join(input, "fixtures.json"), "utf8"));
for (const viewport of ["desktop", "phone"]) {
  const rows = report.observations.filter(row => row.recipient === "P1" && row.viewport === viewport);
  for (let page = 0; page * 8 < rows.length; page++) {
    const group = rows.slice(page * 8, (page + 1) * 8), tiles = [];
    for (const [index, row] of group.entries()) {
      const event = fixtures[row.id].recipients.P1.events.find(event => event.type === "attackResolved");
      const unit = row.unitRect, board = row.boardRect;
      const x = unit.x - board.x + unit.width / 2 + (event.targetCell.col - event.sourceCell.col) * unit.width * .35;
      const y = unit.y - board.y + unit.height / 2 - (event.targetCell.row - event.sourceCell.row) * unit.height * .35;
      const file = path.join(input, `${viewport}-${row.id}.png`), meta = await sharp(file).metadata();
      const width = viewport === "phone" ? 160 : 240, height = viewport === "phone" ? 120 : 180;
      const crop = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - width, Math.round(x - width / 2))),
        top: Math.max(0, Math.min(meta.height - height, Math.round(y - height / 2))), width, height }).resize(240, 180).png().toBuffer();
      const left = (index % 2) * 240, top = Math.floor(index / 2) * 204;
      const label = Buffer.from(`<svg width="240" height="24"><rect width="240" height="24" fill="#20232a"/><text x="8" y="17" fill="white" font-family="Arial" font-size="12">${row.id.replace(/^swing\./, "")} / ${viewport}</text></svg>`);
      tiles.push({ input: label, left, top }, { input: crop, left, top: top + 24 });
    }
    await sharp({ create: { width: 480, height: Math.ceil(group.length / 2) * 204, channels: 4, background: "#20232a" } })
      .composite(tiles).png().toFile(path.join(output, `${viewport}-${page + 1}.png`));
  }
  console.log(`Saved ${rows.length} actual ${viewport} melee swing scenes.`);
}
