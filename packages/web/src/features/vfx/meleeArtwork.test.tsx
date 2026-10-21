import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView } from "rules";
import { expansionAssets } from "./expansionCatalog.generated";
import { MELEE_ARTWORK_ORIENTATIONS, meleeArtworkOrientation } from "./meleeArtwork";
import { VfxLayer } from "./VfxLayer";

test("real melee PNG alpha geometry normalizes to the bottom-left/top-right diagonal", async () => {
  const strips = Object.entries(expansionAssets).filter(([, art]) => art.geometry === "swing");
  assert.equal(strips.length, 27);
  assert.deepEqual(Object.keys(MELEE_ARTWORK_ORIENTATIONS).sort(), strips.map(([id]) => id).sort());
  for (const [id, art] of strips) {
    const orientation = meleeArtworkOrientation(id)!;
    const { data, info } = await sharp(fileURLToPath(art.asset))
      .extract({ left: 6 * art.frameWidth, top: 0, width: art.frameWidth, height: art.frameHeight })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let weight = 0, x = 0, y = 0, xx = 0, yy = 0, xy = 0;
    for (let j = 0; j < data.length; j += info.channels) {
      const w = data[j + 3] / 255, px = j / info.channels % info.width, py = Math.floor(j / info.channels / info.width);
      weight += w; x += px * w; y += py * w; xx += px * px * w; yy += py * py * w; xy += px * py * w;
    }
    assert(weight > 100, `${id}: sample must contain actual artwork`);
    const cx = x / weight, cy = y / weight;
    const authored = Math.atan2(2 * (xy / weight - cx * cy), xx / weight - cx * cx - yy / weight + cy * cy) * 90 / Math.PI;
    const normalized = ((authored + orientation.rotationDeg + 135) % 180 + 180) % 180 - 90;
    assert(Math.abs(normalized) < 16, `${id}: actual alpha axis must follow the reference diagonal (error ${normalized.toFixed(2)}deg)`);
  }
});

test("renderer normalizes each artwork before applying direction and matches its reveal corner", () => {
  const view = { units: {} } as unknown as PlayerView;
  for (const id of ["expansion.guts.attack_swing", "expansion.genghisKhan.attack_swing", "expansion.kaladin.attack_swing", "expansion.frisk.attack_swing"] as const) {
    const orientation = meleeArtworkOrientation(id)!;
    const now = Date.now();
    const html = renderToStaticMarkup(<VfxLayer view={view} effects={[{ id: "confirmed-cut", effectId: id,
      placement: "cell", anchorMode: "event", sourceCell: { col: 4, row: 4 }, targetCell: { col: 5, row: 4 },
      strikeContactMs: 420, startedAt: now, expiresAt: now + 640 }]}
      boardSize={9} cellSize={64} isFlipped={false} reducedMotion={false} />);
    assert.match(html, new RegExp(`data-vfx-melee-rotation="${orientation.rotationDeg}"`));
    assert.match(html, new RegExp(`data-vfx-melee-reveal="${orientation.revealFrom}"`));
    assert(html.includes(`transform:rotate(${orientation.rotationDeg}deg);transform-origin:50% 50%`));
    assert(html.includes(orientation.revealFrom === "topRight" ? "--melee-start-clip:polygon(100% 0" : "--melee-start-clip:polygon(0 100%"));
    assert.equal((html.match(/data-vfx-cue=/g) ?? []).length, 1);
  }
  assert.equal(meleeArtworkOrientation("expansion.guts.attack_swing")!.rotationDeg, 180);
  assert.equal(meleeArtworkOrientation("expansion.genghisKhan.attack_swing")!.rotationDeg, 0,
    "fixing Guts must preserve Genghis Khan's accepted reference");
});
