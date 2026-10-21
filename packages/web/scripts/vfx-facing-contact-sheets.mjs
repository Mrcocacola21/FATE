import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = fileURLToPath(new URL("../test-results/vfx-expansion-game/", import.meta.url));
const normalized = process.argv.includes("--normalized");
const reference = normalized || process.argv.includes("--reference");
const report = JSON.parse(readFileSync(path.join(dir, normalized ? "melee-normalization-report.json" : reference ? "direction-reference-report.json" : "direction-report.json"), "utf8"));
const fixtures = JSON.parse(readFileSync(path.join(dir, "fixtures.json"), "utf8"));
const output = path.join(dir, normalized ? "normalized-facing-contact-sheets" : reference ? "facing-reference-contact-sheets" : "facing-contact-sheets");
mkdirSync(output, { recursive: true });
assert.equal(report.observations.length, normalized ? 387 : reference ? 162 : 81);
assert.deepEqual(report.errors, []);
for (const hero of reference ? ["guts", "genghisKhan"] : ["guts"]) for (const viewport of ["desktop", "phone"]) {
  const rows = report.observations.filter(row => row.recipient === "P1" && row.viewport === viewport && row.id.split(".")[1] === hero &&
    (!normalized || fixtures[row.id].expected[0] === `expansion.${hero}.attack_swing`));
  const tiles = [];
  for (const [index, row] of rows.entries()) {
    const fixture = fixtures[row.id], frame = fixture.recipients.P1;
    const attack = frame.events.find(event => event.type === "attackResolved");
    const source = frame.before.units[fixture.sourceId].position, target = attack.targetCell;
    const x = row.unitRect.x - row.boardRect.x + row.unitRect.width / 2 + (target.col - source.col) * row.unitRect.width;
    const y = row.unitRect.y - row.boardRect.y + row.unitRect.height / 2 - (target.row - source.row) * row.unitRect.height;
    const file = path.join(dir, `${viewport}-${row.id}.png`), meta = await sharp(file).metadata();
    const width = viewport === "phone" ? 130 : 220, height = viewport === "phone" ? 105 : 175;
    const input = await sharp(file).extract({ left: Math.max(0, Math.min(meta.width - width, Math.round(x - width / 2))),
      top: Math.max(0, Math.min(meta.height - height, Math.round(y - height / 2))), width, height }).resize(240, 190).png().toBuffer();
    const left = index % 3 * 240, top = Math.floor(index / 3) * 214;
    const direction = row.id === `swing.${hero}` ? "east" : row.id.split(".").at(-1);
    const labels = { east: "Вправо: новый эталон", west: "Влево: 1 × горизонтально", north: "Вверх: 1 × вертикально", south: "Вниз: 2 × вертикально" };
    const title = reference ? labels[direction] ?? direction : direction === "east" ? "east (reference)" : direction;
    const label = Buffer.from(`<svg width="240" height="24"><rect width="240" height="24" fill="#171717"/><text x="8" y="17" fill="white" font-family="Arial" font-size="13">${title}</text></svg>`);
    tiles.push({ input: label, left, top }, { input, left, top: top + 24 });
  }
  await sharp({ create: { width: 720, height: 642, channels: 4, background: "#171717" } }).composite(tiles).png()
    .toFile(path.join(output, reference ? `${viewport}-${hero}.png` : `${viewport}.png`));
}
console.log("Saved eight directions plus miss on the actual Board, desktop and phone.");
