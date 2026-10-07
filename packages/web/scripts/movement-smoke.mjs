// DB-free browser verification of the real Board and shared presentation consumers.
import assert from "node:assert/strict";
import { mkdir, writeFile, existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results", "movement");
const url = "http://127.0.0.1:5187";
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((file) => file && existsSync(file));
assert.ok(executablePath, "Local Chromium browser required");
await promisify(mkdir)(output, { recursive: true });
await promisify(writeFile)(
  path.join(output, "index.html"),
  '<div id="root"></div><script type="module" src="./harness.tsx"></script>',
);
await promisify(writeFile)(
  path.join(output, "harness.tsx"),
  `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "/src/components/Board.tsx";
import { createVfxPreviewView } from "/src/features/vfx/vfxPreviewScenarios.ts";
import "/src/styles.css";
const A = { col: 1, row: 1 }, B = { col: 5, row: 4 };
const base = createVfxPreviewView();
const mover = { ...base.units["preview-searcher"], id: "mover", position: A, hp: 5 };
function App() {
  const [state, setState] = useState({ view: { ...base, units: { mover } }, events: [], key: "baseline", revision: 0 });
  const reset = () => setState({ view: { ...base, units: { mover } }, events: [], key: "reset-" + Date.now(), revision: 0 });
  const play = (kind) => {
    const events = [];
    let position = B, hp = 5;
    if (kind === "placement") {
      position = A;
      events.push({ type: "stakesPlaced", owner: "P1", positions: [B], hiddenFromOpponent: true });
      events.push({ type: "snarePlaced", owner: "P1", sourceUnitId: "mover", cell: { col: 8, row: 0 } });
    } else {
      events.push(kind === "forced" ? { type: "intimidateResolved", attackerId: "mover", from: A, to: B, provenance: { kind: "forced", cause: "intimidatingStare" } }
        : { type: "unitMoved", unitId: "mover", from: A, to: B, provenance: { kind: kind === "teleport" ? "teleport" : kind === "rider" ? "rider" : "normal" } });
      if (kind === "stake") { hp = 4; events.push({ type: "stakeTriggered", unitId: "mover", markerPos: B, stopped: true, damage: 1 }); }
      if (kind === "snare") events.push({ type: "snareTriggered", unitId: "mover", cell: B, immobilized: true });
    }
    setState(previous => ({ ...previous, revision: previous.revision + 1, events: events.map((event, i) => ({ ...event, eventId: kind + ":" + previous.revision + ":" + i })),
      view: { ...base, units: { mover: { ...mover, position, hp, immobilizedUntilOwnTurnStart: kind === "snare" || undefined } } } }));
  };
  return <><div>{["normal", "teleport", "forced", "rider", "stake", "snare", "placement"].map(kind => <button key={kind} onClick={() => play(kind)}>{kind}</button>)}<button onClick={reset}>reset</button></div>
    <div style={{display:"flex"}}>{["P1", "P2"].map(playerId => <div key={playerId} data-board={playerId} style={{width:560,height:580}}>
    <Board view={state.view} playerId={playerId} selectedUnitId={null} highlightedCells={{}} visualEffectsEnabled effectSessionKey={state.key}
      eventBatch={state.revision ? { streamId: "smoke", revision: state.revision, events: state.events.filter(event => playerId === "P1" || !["stakesPlaced", "snarePlaced"].includes(event.type)) } : null}
      onSelectUnit={() => {}} onCellClick={() => { document.body.dataset.clicked = "yes"; }} />
    </div>)}</div></>;
}
createRoot(document.getElementById("root")).render(<App />);
`,
);
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5187",
    "--strictPort",
  ],
  { cwd: webRoot, windowsHide: true, stdio: "ignore" },
);
let browser, page;
const observations = [];
try {
  const deadline = Date.now() + 20000;
  while (true) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Vite starting */
    }
    assert.ok(Date.now() < deadline, "Vite started");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.addInitScript(() => localStorage.setItem("FATE_LANGUAGE", "en"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url + "/test-results/movement/index.html");
  await page.locator('[data-board="P1"] [data-unit-id="mover"]').waitFor();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const token = (player) =>
    page.locator('[data-board="' + player + '"] [data-unit-id="mover"] .board-unit-content');
  // Playwright's virtual clock drives RAF/timers. CSS animations retain their
  // native clock, so freeze them at the same shared timestamp for inspection.
  const syncSprites = () =>
    page.locator("[data-vfx-cue]").evaluateAll((elements) => {
      for (const el of elements)
        for (const animation of el.getAnimations({ subtree: true })) {
          const delay = getComputedStyle(animation.effect.target).animationDelay.split(",")[0];
          const delayMs = parseFloat(delay) * (delay.endsWith("ms") ? 1 : 1000);
          animation.pause();
          animation.currentTime = Math.max(0, Date.now() - Number(el.dataset.vfxStart) + delayMs);
        }
    });
  const play = async (kind) => {
    await page.getByRole("button", { name: "reset", exact: true }).click();
    await page.clock.runFor(32);
    for (const player of ["P1", "P2"])
      await page
        .locator('[data-board="' + player + '"] button[aria-label^="Cell B1"] .unit-token')
        .waitFor();
    const starts = await Promise.all([token("P1").boundingBox(), token("P2").boundingBox()]);
    await page.getByRole("button", { name: kind, exact: true }).click();
    if (kind === "placement")
      await page.locator('[data-board="P1"] [data-vfx-cue]').first().waitFor({ state: "attached" });
    else
      await page.locator('[data-board="P1"] [data-movement-mode]').waitFor({ state: "attached" });
    await page.clock.runFor(16);
    return starts;
  };
  for (const kind of ["normal", "rider", "forced"]) {
    const starts = await play(kind);
    await page.clock.runFor(64);
    const middles = await Promise.all([token("P1").boundingBox(), token("P2").boundingBox()]);
    assert.ok(
      middles[0].x > starts[0].x && middles[0].y < starts[0].y,
      kind + " P1 movement " + JSON.stringify({ starts, middles }),
    );
    assert.ok(middles[1].x < starts[1].x && middles[1].y > starts[1].y, kind + " P2 movement");
    if (kind === "forced") assert.equal(await page.locator(".board-effect-trail-push").count(), 6);
    await page.clock.runFor(200);
    observations.push(kind + " token interpolation and P1/P2 direction");
  }
  const starts = await play("teleport");
  await page.clock.runFor(40);
  const departure = await token("P1").boundingBox();
  assert.equal(departure.x, starts[0].x);
  assert.equal(await page.locator(".board-effect-trail").count(), 0);
  await page.clock.runFor(100);
  const arrival = await token("P1").boundingBox();
  assert.ok(arrival.x > departure.x);
  assert.ok(Number(await token("P1").evaluate((el) => getComputedStyle(el).opacity)) < 1);
  observations.push("teleport departure/fade/arrival without intermediate trail");
  await play("stake");
  await page.clock.runFor(64);
  await syncSprites();
  const stake = page.locator('[data-board="P1"] [data-vfx-effect="stakeTrigger"]');
  assert.equal(Number(await stake.evaluate((el) => getComputedStyle(el).opacity)), 0);
  await page.clock.runFor(128);
  await syncSprites();
  assert.ok(Number(await stake.evaluate((el) => getComputedStyle(el).opacity)) > 0);
  assert.equal(await page.locator('[data-board="P1"] .board-effect-text-damage').count(), 1);
  await page.screenshot({ path: path.join(output, "stake-arrival.png"), fullPage: true });
  observations.push("stake activates after token arrival with one damage text");
  await play("snare");
  await page.clock.runFor(64);
  assert.equal(await page.locator('[data-board="P1"] .snared-overlay').count(), 0);
  await page.clock.runFor(128);
  assert.equal(await page.locator('[data-board="P1"] [data-vfx-effect="snareTrigger"]').count(), 1);
  assert.ok((await page.locator('[data-board="P1"] [aria-label="Wrapped in snares"]').count()) > 0);
  observations.push("snare impact and wrapped indicator begin after arrival");
  await play("placement");
  assert.equal(await page.locator('[data-board="P1"] [data-vfx-cue]').count(), 2);
  assert.equal(await page.locator('[data-board="P2"] [data-vfx-cue]').count(), 0);
  await page.clock.runFor(120);
  await syncSprites();
  await page.screenshot({ path: path.join(output, "owner-placement.png"), fullPage: true });
  observations.push("owner placement sprites, no opponent placement sprites");
  await page.getByRole("button", { name: "reset", exact: true }).click();
  await page.clock.runFor(32);
  await page.locator("[data-vfx-cue]").first().waitFor({ state: "detached" });
  await page.locator("[data-movement-mode]").first().waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
  assert.equal(await page.locator("[data-movement-mode]").count(), 0);
  await page.locator('[data-board="P1"] button[aria-label^="Cell A0"]').click();
  assert.equal(await page.locator("body").getAttribute("data-clicked"), "yes");
  assert.deepEqual(errors, []);
  observations.push(
    "session reset clears movement/VFX; board pointer input remains usable; no page errors",
  );
  const report = {
    observations,
    manualTwoPlayerGame: false,
    source: "projected event fixture using production Board",
  };
  await promisify(writeFile)(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page) {
    console.log(
      await page.locator('[data-unit-id="mover"]').evaluateAll((elements) =>
        elements.map((el) => ({
          label: el.getAttribute("aria-label"),
          token: el.querySelector(".unit-token")?.outerHTML.slice(0, 250),
        })),
      ),
    );
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  }
  throw error;
} finally {
  await browser?.close();
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else server.kill("SIGTERM");
}
