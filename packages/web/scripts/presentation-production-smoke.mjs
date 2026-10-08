import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "../..");
const output = path.join(web, "test-results/phase15");
const audit = JSON.parse(fs.readFileSync(path.join(output, "asset-audit.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const emitted = new Map(
  fs
    .readdirSync(path.join(web, "dist/assets"))
    .map((name) => [hash(fs.readFileSync(path.join(web, "dist/assets", name))), name]),
);
const js = fs
  .readdirSync(path.join(web, "dist/assets"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(web, "dist/assets", name), "utf8"))
  .join("\n");
const assets = [
  ...audit.soundStats.map((sound) => ({ file: sound.file, kind: "audio" })),
  ...audit.imageFiles.map((file) => ({ file, kind: "image" })),
].map((asset) => {
  const bytes = fs.readFileSync(path.join(web, asset.file));
  const name = emitted.get(hash(bytes));
  const url = name ? `/assets/${name}` : `data:image/png;base64,${bytes.toString("base64")}`;
  assert(name || js.includes(url), `Asset absent from emitted bundle: ${asset.file}`);
  return { ...asset, url, bytes: bytes.length };
});
const url = "http://127.0.0.1:5196";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5196",
    "--strictPort",
  ],
  { cwd: web, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Starting. */
    }
    assert(attempt < 100, "Production preview unavailable");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
  ].find((p) => p && fs.existsSync(p));
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://127.0.0.1:3196/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }),
    }),
  );
  await page.goto(url);
  await page.getByTestId("app-shell").waitFor();
  const results = await page.evaluate(async (assets) => {
    const context = new AudioContext();
    const results = [];
    let next = 0;
    const worker = async () => {
      while (next < assets.length) {
        const asset = assets[next++],
          started = performance.now();
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(`${asset.file}: ${response.status}`);
        const bytes = await response.arrayBuffer();
        const result = {
          file: asset.file,
          url: asset.url,
          transferBytes: bytes.byteLength,
          mime: response.headers.get("content-type"),
          cacheControl: response.headers.get("cache-control"),
        };
        if (asset.kind === "audio") {
          const buffer = await context.decodeAudioData(bytes);
          let sum = 0,
            peak = 0,
            samples = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const pcm = buffer.getChannelData(channel);
            for (const value of pcm) {
              sum += value * value;
              peak = Math.max(peak, Math.abs(value));
            }
            samples += pcm.length;
          }
          Object.assign(result, {
            durationSeconds: buffer.duration,
            decodedBytes: buffer.length * buffer.numberOfChannels * 4,
            rmsDb: 20 * Math.log10(Math.sqrt(sum / samples)),
            peakDb: 20 * Math.log10(peak),
          });
        } else {
          const image = new Image();
          image.src = asset.url;
          await image.decode();
          Object.assign(result, {
            width: image.naturalWidth,
            height: image.naturalHeight,
            estimatedPixelBytes: image.naturalWidth * image.naturalHeight * 4,
          });
        }
        result.fetchDecodeMs = performance.now() - started;
        results.push(result);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    await context.close();
    return results;
  }, assets);
  const audio = results.filter((r) => r.decodedBytes);
  const definitions = audit.soundDefinitions.map((definition) => ({
    ...definition,
    variants: definition.files.map((file) => {
      const sample = audio.find((r) => r.file === file);
      return {
        file,
        durationSeconds: sample.durationSeconds,
        rmsAfterGainDb: sample.rmsDb + 20 * Math.log10(definition.gain),
        peakAfterGainDb: sample.peakDb + 20 * Math.log10(definition.gain),
      };
    }),
  }));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, "production-preview.png"), fullPage: true });
  const report = {
    basePath: "/",
    cachePolicy: "Vite preview is a local server; deployed CDN cache policy is not measured",
    checkedAudio: audio.length,
    checkedImages: results.length - audio.length,
    errors,
    results,
    definitions,
    totalRegisteredDecodedAudioBytes: audio.reduce((sum, r) => sum + r.decodedBytes, 0),
  };
  fs.writeFileSync(path.join(output, "production-assets.json"), JSON.stringify(report, null, 2));
  console.log(
    `Production preview passed: ${audio.length} audio files and ${results.length - audio.length} images loaded/decoded through emitted URLs, including .mp3.mpeg; no page errors.`,
  );
} finally {
  await browser?.close();
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill("SIGTERM");
}
