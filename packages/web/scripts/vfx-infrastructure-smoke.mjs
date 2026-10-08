import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(webRoot, "test-results", "vfx-infrastructure");
const url = process.env.VFX_PREVIEW_URL ?? "http://127.0.0.1:5186";
const server = process.env.VFX_PREVIEW_URL
  ? null
  : spawn(
      process.execPath,
      [
        path.resolve(webRoot, "../../node_modules/vite/bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "5186",
        "--strictPort",
      ],
      { cwd: webRoot, windowsHide: true, stdio: "ignore" },
    );
let browser;
const observations = [];
try {
  await mkdir(output, { recursive: true });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting Vite. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "preview server started");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : { channel: "msedge" }),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/vfx-preview`);
  const { beamThicknessCells } = await page.evaluate(async () => {
    const { vfxRegistry } = await import("/src/features/vfx/vfxRegistry.ts");
    return vfxRegistry.gasterBeam;
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const replay = async (elapsed = 500) => {
    await page.getByRole("button", { name: "Play / Replay", exact: true }).click();
    await page.locator("[data-vfx-cue]").waitFor();
    await page.locator("[data-vfx-cue]").evaluateAll(async (elements, elapsed) => {
      await Promise.all(
        elements
          .flatMap((el) => Array.from(el.children))
          .map(async (el) => {
            const background = getComputedStyle(el).backgroundImage;
            if (!background.startsWith("url(")) return;
            const img = new Image();
            img.src = background.slice(5, -2);
            await img.decode();
          }),
      );
      for (const el of elements)
        for (const animation of el.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = elapsed;
        }
    }, elapsed);
  };
  const geometry = () =>
    page.locator("[data-vfx-cue]").evaluate((el) => {
      const style = getComputedStyle(el),
        root = el.closest(".vfx-board-root");
      const cell = document.querySelector(".board-cell");
      const rootRect = root.getBoundingClientRect(),
        cellRect = cell.getBoundingClientRect();
      return {
        width: el.offsetWidth,
        height: el.offsetHeight,
        left: parseFloat(style.left),
        top: parseFloat(style.top),
        cellSize: cell.offsetWidth,
        gridAligned:
          Math.abs(rootRect.left - cellRect.left) < 0.5 &&
          Math.abs(rootRect.top - cellRect.top) < 0.5,
        transform: style.transform,
        id: el.dataset.vfxCue,
        start: el.dataset.vfxStart,
        clip: getComputedStyle(root).overflow,
        pointer: getComputedStyle(root).pointerEvents,
        children: Array.from(el.children).map((child) => ({
          frames: child.dataset.vfxFrames,
          position: getComputedStyle(child).backgroundPositionX,
          z: getComputedStyle(child).zIndex,
          animation: getComputedStyle(child).animationName,
          delay: getComputedStyle(child).animationDelay,
        })),
      };
    });
  for (const id of ["doraImpact", "carpetImpact", "forestEruption"]) {
    await page.getByLabel("Runtime effect").selectOption(id);
    const size = id === "carpetImpact" ? 5 : 3;
    for (const orientation of ["P1", "P2"]) {
      await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
      for (const anchor of ["center", "left", "right", "top", "bottom", "corner"]) {
        await page.getByLabel("Anchor", { exact: true }).selectOption(anchor);
        await replay();
        const result = await geometry();
        assert.equal(result.width, size * result.cellSize);
        assert.equal(result.height, size * result.cellSize);
        assert.equal(result.clip, "hidden");
        assert.equal(result.gridAligned, true);
        assert.equal(result.pointer, "none");
        assert.equal(result.children.length, 2);
        assert.deepEqual(
          result.children.map((child) => child.z),
          ["0", "1"],
        );
        assert.equal(result.children[0].position, result.children[1].position);
        assert.equal(result.children[0].delay, result.children[1].delay);
        observations.push({ id, orientation, anchor, ...result });
        if (["center", "left", "corner"].includes(anchor))
          await page.screenshot({ path: path.join(output, `${id}-${orientation}-${anchor}.png`) });
      }
    }
  }
  await page.getByLabel("Runtime effect").selectOption("doraImpact");
  await page.getByLabel("Orientation", { exact: true }).selectOption("P1");
  await page.getByLabel("Anchor", { exact: true }).selectOption("center");
  for (const composition of ["primary", "accent", "composite"]) {
    await page.getByLabel("Composition", { exact: true }).selectOption(composition);
    await replay();
    const result = await geometry();
    assert.equal(result.children.length, composition === "composite" ? 2 : 1);
    await page.screenshot({ path: path.join(output, `dora-${composition}.png`) });
  }
  const positions = await page.locator("[data-vfx-cue]").evaluate((el) => {
    const children = Array.from(el.children),
      frames = Number(children[0].dataset.vfxFrames);
    return Array.from({ length: frames }, (_, index) =>
      children.map((child) => {
        const animation = child.getAnimations()[0];
        animation.currentTime =
          (Number(animation.effect.getTiming().duration) * (index + 0.25)) / (frames - 1);
        return parseFloat(getComputedStyle(child).backgroundPositionX);
      }),
    );
  });
  positions.forEach((pair, frame) =>
    pair.forEach((value) => assert.ok(Math.abs(value - (frame * 100) / 27) < 0.0001)),
  );
  const beforeReplay = await geometry();
  await replay();
  const afterReplay = await geometry();
  assert.notEqual(beforeReplay.id, afterReplay.id);
  const resized = await geometry();
  await page.getByLabel("Board width", { exact: true }).fill("460");
  // ResizeObserver uses real layout; wait for its geometry update.
  await page.waitForFunction(
    (previous) => document.querySelector(".board-cell").offsetWidth !== previous,
    resized.cellSize,
  );
  const afterResize = await geometry();
  assert.equal(afterResize.id, resized.id);
  assert.equal(afterResize.start, resized.start);
  assert.equal(afterResize.width, afterResize.cellSize * 3);
  await page.getByLabel("Board width", { exact: true }).fill("680");
  await page.waitForFunction(
    (previous) => document.querySelector(".board-cell").offsetWidth !== previous,
    afterResize.cellSize,
  );
  await page.getByLabel("Runtime effect").selectOption("gasterBeam");
  for (const orientation of ["P1", "P2"]) {
    await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
    for (const ray of ["horizontal", "vertical", "diagonal", "board-edge", "target"]) {
      await page.getByLabel("Ray direction", { exact: true }).selectOption(ray);
      await replay();
      const result = await geometry();
      assert.equal(result.height, Math.round(result.cellSize * beamThicknessCells));
      observations.push({ id: "gasterBeam", orientation, ray, ...result });
      await page.screenshot({ path: path.join(output, `beam-${orientation}-${ray}.png`) });
    }
  }
  for (const id of [
    "combatHit",
    "combatMiss",
    "unitDeath",
    "statusSmall",
    "bunkerStatus",
    "vladGaze",
    "fireball",
  ]) {
    await page.getByLabel("Runtime effect").selectOption(id);
    await replay();
    await page.screenshot({ path: path.join(output, `${id}.png`) });
  }
  const projectileSources = [];
  await page.getByLabel("Runtime effect").selectOption("fireball");
  for (const orientation of ["P1", "P2"]) {
    await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
    await replay(300);
    const source = await page.locator(".vfx-projectile-axis").evaluate((el) => ({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      rotation: el.style.transform,
      travel: el.firstChild.style.getPropertyValue("--vfx-travel"),
    }));
    projectileSources.push(source);
    observations.push({ id: "fireball", orientation, ...source });
    await page.screenshot({ path: path.join(output, `fireball-${orientation}.png`) });
  }
  assert.notEqual(projectileSources[0].left, projectileSources[1].left);
  assert.notEqual(projectileSources[0].rotation, projectileSources[1].rotation);
  assert.equal(projectileSources[0].travel, projectileSources[1].travel);
  await page.getByLabel("Reduced motion", { exact: true }).check();
  for (const id of ["doraImpact", "carpetImpact", "forestEruption"]) {
    await page.getByLabel("Runtime effect").selectOption(id);
    await replay();
    const reduced = await geometry();
    assert.ok(reduced.children.every((child) => child.animation === "none"));
    assert.equal(reduced.width, (id === "carpetImpact" ? 5 : 3) * reduced.cellSize);
    await page.screenshot({ path: path.join(output, `${id}-reduced-motion.png`) });
  }
  // Click through an active impact, exercising the real board input handler.
  const point = await page.locator('[data-highlight="attack"]').boundingBox();
  await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
  assert.match(await page.locator("[data-vfx-pointer-check]").textContent(), /4,4/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Reduced motion", { exact: true }).uncheck();
  await replay();
  assert.ok((await geometry()).children.every((child) => child.animation === "none"));
  await page.clock.runFor(1700);
  assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "observations.json"),
    JSON.stringify({ positions, observations, errors }, null, 2),
  );
  console.log(
    `VFX browser checks passed: 36 area cases, 10 rays, all core artwork, composition, frames, resize, input, reduced motion, cleanup. Screenshots: ${output}`,
  );
} finally {
  await browser?.close();
  server?.kill();
}
