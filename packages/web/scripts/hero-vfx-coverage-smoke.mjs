import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const web = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
const vite = path.resolve(web, "../../node_modules/vite/bin/vite.js");
const productionOutput = "test-results/vfx-coverage/preview-dist";
// The ordinary production bundle keeps its existing preview guard disabled.
// Build a separate local production-mode artifact with the existing test-room
// switch, so visual QA does not change or expose the normal production output.
if (production) {
  const built = spawnSync(process.execPath, [vite, "build", "--outDir", productionOutput], {
    cwd: web, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, VITE_ENABLE_TEST_ROOM: "true",
      VITE_API_URL: "http://127.0.0.1:3196", VITE_WS_URL: "ws://127.0.0.1:3196"},
  });
  assert.equal(built.status, 0, built.stderr);
}
const output = path.join(
  web,
  `test-results/vfx-coverage/${production ? "browser-production" : "browser"}`,
);
const coverage = JSON.parse(
  readFileSync(path.join(web, "src/assets/heroVfxCoverage.json"), "utf8"),
);
const keys = [...new Set(coverage.filter((row) => row.key).map((row) => row.key))];
const url = "http://127.0.0.1:5197";
mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    vite,
    ...(production ? ["preview", "--outDir", productionOutput] : []),
    "--host",
    "127.0.0.1",
    "--port",
    "5197",
    "--strictPort",
  ],
  { cwd: web, windowsHide: true, stdio: "ignore" },
);
let browser;
const observations = [],
  errors = [];
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Starting Vite. */
    }
    assert(attempt < 150, "Vite preview unavailable");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => p && existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://127.0.0.1:3196/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }),
    }),
  );
  await page.goto(`${url}/vfx-preview`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByLabel("Runtime effect").waitFor({ timeout: 60000 });
  // Paused JS clock prevents a short strip expiring during inspection. CSS
  // animations are stepped separately so both layers are measured at one frame.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const step = async (elapsed = 250) => {
    await page.locator("[data-vfx-cue]").evaluateAll(async (elements, elapsed) => {
      for (const el of elements) {
        await Promise.all(
          Array.from(el.children).map(async (child) => {
            const style = getComputedStyle(child),
              image = new Image();
            image.src =
              child instanceof HTMLImageElement ? child.src : style.backgroundImage.slice(5, -2);
            if (image.src) await image.decode();
          }),
        );
        for (const animation of el.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = elapsed;
        }
      }
    }, elapsed);
  };
  const replay = async (elapsed = 250) => {
    await page.getByRole("button", { name: "Play / Replay", exact: true }).click();
    await page.locator("[data-vfx-cue]").first().waitFor();
    await step(elapsed);
  };
  const inspect = () =>
    page
      .locator("[data-vfx-cue]")
      .first()
      .evaluate((el) => ({
        effect: el.dataset.vfxEffect,
        clock: el.dataset.vfxStart,
        width: el.offsetWidth,
        height: el.offsetHeight,
        pointer: getComputedStyle(el.closest(".vfx-board-root")).pointerEvents,
        clip: getComputedStyle(el.closest(".vfx-board-root")).overflow,
        layer: el.dataset.vfxLayer,
        children: Array.from(el.children).map((child) => ({
          frames: Number(child.dataset.vfxFrames ?? 1),
          position: getComputedStyle(child).backgroundPositionX,
          delay: getComputedStyle(child).animationDelay,
          duration: getComputedStyle(child).animationDuration,
          animation: getComputedStyle(child).animationName,
          z: getComputedStyle(child).zIndex,
        })),
      }));
  for (const orientation of ["P1", "P2"]) {
    await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
    for (const key of keys) {
      await page.getByLabel("Runtime effect").selectOption(key);
      await replay();
      const sample = await inspect(),
        paired = coverage.filter((row) => row.key === key).length === 2;
      assert.equal(sample.effect, key);
      assert.equal(sample.pointer, "none");
      assert.equal(sample.clip, "hidden");
      assert.equal(sample.children.length, paired ? 2 : 1, key);
      if (paired) {
        assert.equal(sample.children[0].position, sample.children[1].position, key);
        assert.equal(sample.children[0].delay, sample.children[1].delay, key);
        assert.equal(sample.children[0].duration, sample.children[1].duration, key);
        assert.deepEqual(
          sample.children.map((child) => child.z),
          ["0", "1"],
        );
      }
      observations.push({ orientation, key, ...sample });
    }
  }
  // Exercise representative first/middle/last frames and clipping of actual
  // two-layer artwork at the corner in both orientations.
  await page.getByLabel("Runtime effect").selectOption("artemidaCrescent");
  for (const orientation of ["P1", "P2"]) {
    await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
    await page.getByLabel("Anchor", { exact: true }).selectOption("corner");
    for (const elapsed of [0, 600, 1200]) {
      await replay(elapsed);
      const sample = await inspect();
      assert.equal(sample.children[0].position, sample.children[1].position);
      observations.push({ orientation, elapsed, ...sample });
    }
    await replay(600);
    await page
      .locator("[data-vfx-preview-board]")
      .screenshot({ path: path.join(output, `crescent-${orientation}-corner.png`) });
  }
  for (const scenario of [
    "artemidaCrescent",
    "elCidKolada",
    "lucheRay",
    "mettatonLaser",
    "genghisCharge",
    "bunkerEntry",
    "bunkerExit",
    "kanekiCentipede",
    "friskFriendship",
    "friskOnePath",
    "lokiSpin",
  ]) {
    await page.locator(`[data-vfx-preview-trigger="coverage-${scenario}"]`).click();
    assert(await page.locator(`[data-vfx-effect="${scenario}"]`).count(), scenario);
    await step(250);
    await page
      .locator("[data-vfx-preview-board]")
      .screenshot({ path: path.join(output, `${scenario}-confirmed.png`) });
  }
  await page.locator('[data-vfx-preview-trigger="coverage-gaster"]').click();
  for (const key of ["gasterCannon", "gasterCharge", "gasterBeam"])
    assert.equal(await page.locator(`[data-vfx-effect="${key}"]`).count(), 1);
  await step(300);
  await page
    .locator("[data-vfx-preview-board]")
    .screenshot({ path: path.join(output, "gaster-charge.png") });
  await step(700);
  await page
    .locator("[data-vfx-preview-board]")
    .screenshot({ path: path.join(output, "gaster-sequence.png") });
  await page.getByLabel("Persistent status snapshot").selectOption("statuses");
  for (const recipient of ["P1", "P2", "spectator"]) {
    await page.getByLabel("Recipient", { exact: true }).selectOption(recipient);
    const markers = await page.locator("[data-stake-state]").count();
    assert.equal(markers, recipient === "P1" ? 2 : 1);
    assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
  }
  await page
    .locator("[data-vfx-preview-board]")
    .screenshot({ path: path.join(output, "persistent-spectator.png") });
  await page.getByLabel("Persistent status snapshot").selectOption("off");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Reduced motion", { exact: true }).check();
  await page.getByLabel("Runtime effect").selectOption("mettatonLaser");
  await page.getByLabel("Anchor", { exact: true }).selectOption("center");
  await replay();
  const reduced = await inspect();
  assert(reduced.children.every((child) => child.animation === "none"));
  await page
    .locator("[data-vfx-preview-board]")
    .screenshot({ path: path.join(output, "phone-P2-reduced-laser.png") });
  observations.push({ phone: true, reduced: true, ...reduced });
  assert.deepEqual(errors, []);
  writeFileSync(
    path.join(output, "observations.json"),
    JSON.stringify({ keys: keys.length, observations, errors }, null, 2),
  );
  console.log(
    `Hero VFX ${production ? "production" : "development"} browser coverage passed: ${keys.length} definitions in P1/P2, composite frames, confirmed scenarios, private markers, phone and reduced motion.`,
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
