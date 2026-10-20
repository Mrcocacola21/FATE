import assert from "node:assert/strict";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";
const web = fileURLToPath(new URL("../", import.meta.url)), root = path.resolve(web, "../..");
const output = path.join(web, process.argv.includes("--lunge") ? "test-results/melee-lunge-recording" : "test-results/target-cut-recording"), frames = path.join(output, "frames");
mkdirSync(frames, { recursive: true });
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5196", "--strictPort"],
  { cwd: web, windowsHide: true, stdio: "ignore" });
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch("http://127.0.0.1:5196")).ok) break; } catch { /* starting */ }
    assert(i < 150); await new Promise(resolve => setTimeout(resolve, 100));
  }
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].find(p => p && existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  await page.goto("http://127.0.0.1:5196/test-results/vfx-expansion-game/index.html"); await page.getByLabel("Fixture").waitFor();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByLabel("Fixture").selectOption("swing.guts"); await page.clock.runFor(40); await page.evaluate(() => window.warmPortraits());
  await page.getByRole("button", { name: "Play", exact: true }).click(); await page.clock.runFor(16);
  const cue = page.locator('[data-vfx-effect="expansion.guts.attack_swing"]');
  const start = await cue.evaluate(el => Number(el.dataset.vfxStart));
  await cue.locator(".vfx-sprite").evaluateAll(els => Promise.all(els.map(async el => {
    const img = new Image(); img.src = getComputedStyle(el).backgroundImage.slice(5, -2); await img.decode();
  })));
  await page.clock.fastForward(Math.max(0, start - 150 - await page.evaluate(() => Date.now())));
  const fixture = JSON.parse(readFileSync(path.join(web, "test-results/vfx-expansion-game/fixtures.json"), "utf8"))["swing.guts"];
  const targetId = fixture.recipients.P1.events.find(event => event.type === "attackResolved").defenderId;
  const bounds = await page.locator(`[data-unit-id="${targetId}"]`).boundingBox();
  assert(bounds, targetId);
  const clip = { x: Math.round(bounds.x + bounds.width / 2 - 195), y: Math.round(bounds.y + bounds.height / 2 - 100), width: 320, height: 200 };
  for (let i = 0; i < 72; i++) {
    await page.clock.runFor(Math.max(0, Math.round(start - 150 + i * 1000 / 60 - await page.evaluate(() => Date.now()))));
    await page.locator("[data-vfx-cue]").evaluateAll(els => {
      for (const el of els) {
        for (const animation of el.getAnimations({ subtree: true })) {
          animation.pause(); animation.currentTime = Date.now() - Number(el.dataset.vfxStart) + (parseFloat(el.style.getPropertyValue("--vfx-delay")) || 0);
        }
        for (const art of el.querySelectorAll(".vfx-artwork")) art.style.willChange = "auto";
      }
    });
    await page.screenshot({ clip, path: path.join(frames, `frame-${String(i).padStart(3, "0")}.png`) });
  }
  const encode = (file, filter) => {
    const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "60", "-i", path.join(frames, "frame-%03d.png"),
      "-vf", filter, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(output, file)], { windowsHide: true, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  encode("slash-normal.mp4", "scale=960:600:flags=lanczos");
  encode("slash-slow-x4.mp4", "setpts=4*PTS,scale=960:600:flags=lanczos");
  writeFileSync(path.join(output, "recording.json"), JSON.stringify({ fixture: "swing.guts", renderer: "Actual Board + rules-produced recipient projection",
    timing: "Deterministic shared playback clock stepped at 60fps; sprite and clip animations seeked to that same time", frames: 72, fps: 60,
    normal: "slash-normal.mp4", slow: "slash-slow-x4.mp4", tokenLunge: process.argv.includes("--lunge"), manualNetworkMatch: false }, null, 2));
  console.log("Saved actual Board target slash: normal + x4 slow motion.");
} finally {
  await browser?.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else server.kill("SIGTERM");
}
