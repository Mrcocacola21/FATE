import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results/phase15");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
assert(executablePath, "Local Chromium required");
const children = [];
const errors = [];
let browser;
let page;
function start(args) {
  const child = spawn(process.execPath, args, { cwd: webRoot, windowsHide: true, stdio: "ignore" });
  children.push(child);
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server unavailable: ${url}`);
}
try {
  start([
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5195",
    "--strictPort",
  ]);
  await ready("http://127.0.0.1:5195");
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5195");
  assert.equal(
    await page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .filter((e) => /\.(wav|mp3|mpeg)(\?|$)/.test(e.name)).length,
    ),
    0,
    "Landing fetches no audio",
  );
  await page.evaluate(async () => {
    const { sfxPlayer } = await import("/src/features/sfx/sfxPlayer.ts");
    const { prepareAudioFromGesture } = await import("/src/features/sfx/uiSfx.ts");
    window.qaAudio = sfxPlayer;
    document.addEventListener("click", prepareAudioFromGesture, { once: true });
  });
  await page.locator("main").click({ position: { x: 8, y: 8 } });
  await page.waitForFunction(() => window.qaAudio.diagnostics.decodedBuffers === 2);
  const metrics = await page.evaluate(async () => {
    const { sfxPlayer } = await import("/src/features/sfx/sfxPlayer.ts");
    const { preloadCoreSounds } = await import("/src/features/sfx/audioPreload.ts");
    const { preloadPresentation } = await import("/src/game/effects/presentationPreload.ts");
    const { resolveSound } = await import("/src/assets/sfx/resolver.ts");
    const { imagePreloader, preloadVfx } = await import("/src/features/vfx/imagePreload.ts");
    const { assetLoadQueue } = await import("/src/assets/assetLoadQueue.ts");
    const result = { ui: sfxPlayer.diagnostics };
    let peakJobs = 0,
      peakPending = 0;
    const monitor = setInterval(() => {
      peakJobs = Math.max(peakJobs, assetLoadQueue.diagnostics.active);
      peakPending = Math.max(peakPending, assetLoadQueue.diagnostics.pending);
    }, 1);
    let t = performance.now();
    await preloadCoreSounds("gameplay");
    result.corePreloadMs = performance.now() - t;
    result.coreAudio = sfxPlayer.diagnostics;
    const starts = [];
    const nativeStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      starts.push(performance.now());
      return nativeStart.apply(this, args);
    };
    const cue = { ...resolveSound("common.combat.hit", "qa-first"), id: "qa-first" };
    t = performance.now();
    result.firstReadyPlay = sfxPlayer.play(cue);
    result.firstReadyDispatchMs = starts[0] - t;
    AudioBufferSourceNode.prototype.start = nativeStart;
    sfxPlayer.stopGameplay();
    t = performance.now();
    await preloadVfx(
      ["combatHit", "combatMiss", "unitDeath", "statusSmall", "hiddenReveal"],
      "high",
    );
    result.coreImageDecodeMs = performance.now() - t;
    result.coreImages = imagePreloader.diagnostics;
    t = performance.now();
    await preloadPresentation(["grand-kaiser", "sans", "jackRipper"]);
    result.rosterPreloadMs = performance.now() - t;
    result.rosterAudio = sfxPlayer.diagnostics;
    result.rosterImages = imagePreloader.diagnostics;
    const signatureStarts = [];
    AudioBufferSourceNode.prototype.start = function (...args) {
      signatureStarts.push(args);
      return nativeStart.apply(this, args);
    };
    result.boundedDoraPlay = sfxPlayer.play({ ...resolveSound("hero.grand-kaiser.abilities.kaiserDora", "qa-dora"), id: "qa-dora" });
    AudioBufferSourceNode.prototype.start = nativeStart;
    result.signatureStartArgs = signatureStarts;
    sfxPlayer.stopGameplay();
    t = performance.now();
    await preloadPresentation(["grand-kaiser", "sans", "jackRipper"]);
    result.warmRosterPreloadMs = performance.now() - t;
    await preloadPresentation([]);
    result.afterRosterRelease = {
      audio: sfxPlayer.diagnostics,
      images: imagePreloader.diagnostics,
    };
    for (let i = 0; i < 10; i++) {
      await preloadPresentation(["asgore", "riverPerson"]);
      await preloadPresentation([]);
    }
    result.afterTenMatchChanges = {
      audio: sfxPlayer.diagnostics,
      images: imagePreloader.diagnostics,
    };
    clearInterval(monitor);
    result.peakJobs = peakJobs;
    result.peakPending = peakPending;
    return result;
  });
  assert(metrics.firstReadyPlay);
  assert(metrics.boundedDoraPlay);
  assert.deepEqual(metrics.signatureStartArgs, [[0, 0, 1.5]]);
  assert(metrics.peakJobs <= 4);
  assert.equal(
    metrics.afterTenMatchChanges.audio.decodedBuffers,
    metrics.afterRosterRelease.audio.decodedBuffers,
  );
  assert.equal(metrics.afterTenMatchChanges.images.ready, metrics.afterRosterRelease.images.ready);
  fs.writeFileSync(path.join(output, "runtime-metrics.json"), JSON.stringify(metrics, null, 2));

  // Real Board consumer with recipient-safe synthetic deliveries, isolated from live store/server.
  fs.writeFileSync(
    path.join(output, "index.html"),
    '<div id="root"></div><script type="module" src="./harness.tsx"></script>',
  );
  fs.writeFileSync(
    path.join(output, "harness.tsx"),
    `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {Board} from "/src/components/Board.tsx";import {createVfxPreviewView} from "/src/features/vfx/vfxPreviewScenarios.ts";
import {PresentationSession} from "/src/game/effects/presentationSession.ts";
import {sfxPlayer} from "/src/features/sfx/sfxPlayer.ts";import "/src/styles.css";
const ingress=new PresentationSession(),binding={roomId:"qa",recipient:"P1"};ingress.begin(binding);ingress.snapshot({...binding,streamId:"qa",revision:1000});
window.qaPlayed=[];sfxPlayer.play=cue=>{window.qaPlayed.push(cue.id);return true;};
function App(){const [view,setView]=useState(createVfxPreviewView),[batches,setBatches]=useState([]);
window.qaDeliver=(count=1)=>{const accepted=[];for(let i=0;i<count;i++){const revision=ingress.highestReceivedRevision+1;
const live={streamId:"qa",revision,events:[{type:"rollResolved",eventId:"qa:"+revision,rollId:"roll:"+revision,rollKind:"attack_attackerRoll",rollerPlayerId:"P1",dice:[5],total:5,sides:6,rollIndex:0}]};
ingress.snapshot({...binding,streamId:"qa",revision});accepted.push(...ingress.receive(live,binding,view));ingress.receive(live,binding,view);}
setBatches(current=>[...current,...accepted]);};
window.qaStateOnly=()=>setView(current=>({...current,units:{...current.units,"preview-asgore":{...current.units["preview-asgore"],hp:2}},pendingDecision:null}));
return <div style={{width:"min(680px,100vw)",aspectRatio:"1/1"}}><Board view={view} playerId="P1" highlightedCells={{}} eventBatches={batches}
onEventBatchesConsumed={used=>setBatches(current=>current.filter(batch=>!used.includes(batch)))} effectSessionKey={ingress.key}
visualEffectsEnabled onSelectUnit={()=>{}} onCellClick={()=>{}} /></div>;}
createRoot(document.getElementById("root")).render(<App/>);`,
  );
  await page.goto("http://127.0.0.1:5195/test-results/phase15/index.html");
  await page.locator(".board-cell").first().waitFor();
  await page.evaluate(() => {
    window.qaHidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.qaHidden });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.qaDeliver(120);
    window.qaStateOnly();
  });
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => window.qaPlayed), []);
  assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
  await page.evaluate(() => {
    window.qaHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  assert.deepEqual(
    await page.evaluate(() => window.qaPlayed),
    [],
    "Visibility resume has no historical replay",
  );
  await page.evaluate(() => window.qaDeliver());
  await page.waitForFunction(() => window.qaPlayed.length === 1);
  fs.writeFileSync(
    path.join(output, "background-observations.json"),
    JSON.stringify(
      {
        syntheticVisibilityChange: true,
        hiddenDeliveries: 120,
        duplicateDeliveries: 120,
        hiddenOneShots: 0,
        resumedHistoricalOneShots: 0,
        freshOneShots: 1,
        actualOSBackgroundSuspension: false,
      },
      null,
      2,
    ),
  );

  await page.goto("http://127.0.0.1:5195/vfx-preview");
  const visual = [];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1440, 1050],
  ]) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      for (const orientation of ["P1", "P2"]) {
        await page.getByLabel("Orientation", { exact: true }).selectOption(orientation);
        await page.getByLabel("Persistent status snapshot").selectOption("statuses");
        await page.waitForTimeout(80);
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          cells: document.querySelectorAll(".board-cell").length,
          cellWidth: document.querySelector(".board-cell").getBoundingClientRect().width,
          boardRight: document.querySelector(".board-cell:last-child").getBoundingClientRect()
            .right,
          allCellsInViewport: [...document.querySelectorAll(".board-cell")].every((cell) => {
            const box = cell.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth;
          }),
          statusCount: document.querySelectorAll("[data-unit-status]").length,
        }));
        assert(layout.overflow <= 1, `Overflow at ${width}/${theme}/${orientation}`);
        assert.equal(layout.cells, 81);
        assert(layout.allCellsInViewport, `Board clipped at ${width}/${theme}/${orientation}`);
        assert(layout.statusCount > 0);
        visual.push({ width, height, theme, orientation, ...layout });
        await page.screenshot({
          path: path.join(output, `statuses-${width}-${height}-${theme}-${orientation}.png`),
          fullPage: true,
        });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel("Persistent status snapshot").selectOption("off");
  for (const id of [
    "doraImpact",
    "carpetImpact",
    "forestEruption",
    "gasterBeam",
    "fireball",
    "boat",
    "tralala",
    "sansField",
    "lechyStorm",
  ]) {
    await page.getByLabel("Runtime effect").selectOption(id);
    await page.getByLabel("Anchor", { exact: true }).selectOption("corner");
    await page.getByLabel("Reduced motion", { exact: true }).check();
    await page.getByRole("button", { name: "Play / Replay", exact: true }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(output, `reduced-${id}.png`), fullPage: true });
  }
  fs.writeFileSync(
    path.join(output, "visual-observations.json"),
    JSON.stringify({ visual, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Phase 15 smoke passed: real Web Audio/image timings, bounded jobs, ten cache cycles, hidden 120-event burst, fresh resume, 20 theme/orientation/viewport layouts.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  await page?.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  for (const child of children) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
}
