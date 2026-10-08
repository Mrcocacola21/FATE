import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { SOUND_REGISTRY } from "../src/assets/sfx/registry";
import { vfxRegistry, validateVfxRegistry } from "../src/features/vfx/vfxRegistry";
import { vfxAssets } from "../src/features/vfx/imagePreload";
import { CORE_VFX, rosterVfx } from "../src/game/effects/presentationPreload";
import { rosterSoundKeys } from "../src/features/sfx/audioPreload";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
}
function exactFile(url: string): Buffer {
  const file = fileURLToPath(url);
  const relative = path.relative(path.join(web, "src/assets"), file);
  let directory = path.join(web, "src/assets");
  for (const segment of relative.split(path.sep)) {
    assert(readdirSync(directory).includes(segment), `Case-sensitive path mismatch: ${relative}`);
    directory = path.join(directory, segment);
  }
  return readFileSync(file);
}
const sounds = Object.entries(SOUND_REGISTRY);
const soundUrls = [...new Set(sounds.flatMap(([, sound]) => [...sound.sources]))];
const arts = Object.entries(vfxRegistry).flatMap(([id, definition]) =>
  vfxAssets(definition).map((art) => ({ id, art })),
);
assert.deepEqual(validateVfxRegistry(), []);
for (const { id, art } of arts) {
  const buffer = exactFile(art.asset!);
  if (art.assetType === "spriteStrip") {
    assert.equal(buffer.readUInt32BE(16), art.frameWidth! * art.frames!, `${id}: full strip width`);
    assert.equal(buffer.readUInt32BE(20), art.frameHeight, `${id}: strip height`);
  }
}
soundUrls.forEach(exactFile);
const inventory: Record<string, { count: number; bytes: number; estimatedPixelBytes: number }> = {};
for (const file of [
  ...files(path.join(web, "src/assets/sfx")),
  ...files(path.join(web, "src/assets/vfx")),
]) {
  const ext = path.extname(file);
  if (![".wav", ".mp3", ".mpeg", ".png"].includes(ext)) continue;
  const buffer = readFileSync(file);
  const group = (inventory[ext] ??= { count: 0, bytes: 0, estimatedPixelBytes: 0 });
  group.count++;
  group.bytes += buffer.length;
  if (ext === ".png")
    group.estimatedPixelBytes += buffer.readUInt32BE(16) * buffer.readUInt32BE(20) * 4;
}
const core = sounds.filter(([, sound]) => sound.preload === "core");
const sampleRoster = ["grand-kaiser", "sans", "jackRipper"];
const roster = rosterSoundKeys(sampleRoster);
const summarizeUrls = (urls: string[]) => ({
  uniqueFiles: new Set(urls).size,
  transferBytes: [...new Set(urls)].reduce((sum, url) => sum + exactFile(url).length, 0),
});
const soundStats = soundUrls.map((url) => {
  const b = exactFile(url);
  let byteRate = 0,
    pcmBytes = 0;
  if (url.endsWith(".wav")) {
    for (let offset = 12; offset + 8 <= b.length; ) {
      const tag = b.toString("ascii", offset, offset + 4),
        length = b.readUInt32LE(offset + 4);
      if (tag === "fmt ") byteRate = b.readUInt32LE(offset + 16);
      if (tag === "data") pcmBytes = length;
      offset += 8 + length + (length % 2);
    }
  }
  return {
    file: path.relative(web, fileURLToPath(url)).replaceAll("\\", "/"),
    bytes: b.length,
    wavDurationSeconds: byteRate ? pcmBytes / byteRate : undefined,
  };
});
const dist: Record<string, { count: number; bytes: number; gzipBytes: number }> = {};
const hashes = new Map<string, string[]>();
if (existsSync(path.join(web, "dist")))
  for (const file of files(path.join(web, "dist"))) {
    const b = readFileSync(file),
      ext = path.extname(file);
    const group = (dist[ext] ??= { count: 0, bytes: 0, gzipBytes: 0 });
    group.count++;
    group.bytes += statSync(file).size;
    if ([".js", ".css"].includes(ext)) group.gzipBytes += gzipSync(b).length;
    const hash = createHash("sha256").update(b).digest("hex");
    hashes.set(hash, [...(hashes.get(hash) ?? []), path.relative(web, file)]);
  }
const report = {
  inventory,
  registeredSfx: sounds.length,
  registeredAudio: summarizeUrls(soundUrls),
  registeredVfx: Object.keys(vfxRegistry).length,
  imageFiles: [...new Set(arts.map(({ art }) => fileURLToPath(art.asset!)))].map((file) =>
    path.relative(web, file).replaceAll("\\", "/"),
  ),
  soundDefinitions: sounds.map(([key, sound]) => ({
    key,
    gain: sound.gain,
    maxVoices: sound.maxVoices,
    maxDurationMs: "maxDurationMs" in sound ? sound.maxDurationMs : undefined,
    files: sound.sources.map((url) => path.relative(web, fileURLToPath(url)).replaceAll("\\", "/")),
  })),
  registeredImages: summarizeUrls(arts.map(({ art }) => art.asset!)),
  core: {
    ui: core.filter(([, s]) => s.category === "ui").length,
    gameplay: core.filter(([, s]) => s.category === "gameplay").length,
    before: summarizeUrls(core.flatMap(([, s]) => [...s.sources])),
    after: summarizeUrls(core.map(([, s]) => s.sources[0])),
    vfx: CORE_VFX.length,
  },
  sampleRoster: {
    heroes: sampleRoster,
    soundKeys: roster.length,
    before: summarizeUrls(sounds.filter(([key]) => sampleRoster.includes(key.split(".")[1])).flatMap(([, sound]) => [...sound.sources])),
    after: summarizeUrls(roster.map((key) => SOUND_REGISTRY[key].sources[0])),
    vfx: rosterVfx(sampleRoster),
  },
  longestRegisteredWavs: soundStats
    .filter((s) => s.wavDurationSeconds)
    .sort((a, b) => b.wavDurationSeconds! - a.wavDurationSeconds!)
    .slice(0, 12),
  soundStats,
  dist,
  duplicateEmittedFiles: [...hashes.values()].filter((group) => group.length > 1),
  caseSensitiveReferences: "PASS",
  spriteDimensions: "PASS",
};
const out = path.join(web, "test-results/phase15");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "asset-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, soundStats: undefined }, null, 2));
