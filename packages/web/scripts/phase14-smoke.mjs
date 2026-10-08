import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

// Automated browser smoke with synthetic authorized state and semantic events.
// Audio scheduling is instrumented; this is not an audible two-account match.
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results/phase14/browser");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find((candidate) => candidate && existsSync(candidate));
assert(executablePath, "Local Chromium browser required");
await mkdir(output, { recursive: true });
const generated = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/tsx/dist/cli.mjs"),
    path.join(webRoot, "scripts/phase14-fixtures.ts"),
    path.join(output, "fixtures.json"),
  ],
  { cwd: root, windowsHide: true, encoding: "utf8" },
);
assert.equal(generated.status, 0, generated.stderr);
await writeFile(
  path.join(output, "index.html"),
  '<div id="root"></div><script type="module" src="./harness.tsx"></script>',
);
await writeFile(
  path.join(output, "harness.tsx"),
  `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {Board} from "/src/components/Board.tsx";
import data from "./fixtures.json";
import {sfxPlayer} from "/src/features/sfx/sfxPlayer.ts";import "/src/styles.css";
window.phase14Audio=[];sfxPlayer.play=cue=>{window.phase14Audio.push(cue.key);return true;};
sfxPlayer.isMuted=()=>false;sfxPlayer.getVolume=()=>1;
function App(){const [state,setState]=useState("baseline"),[role,setRole]=useState("P1"),
[batch,setBatch]=useState(null),[session,setSession]=useState(1),[revision,setRevision]=useState(100),[clicks,setClicks]=useState(0),[renderVersion,setRenderVersion]=useState(0);
const view=data[state][role];
const live=(next,event)=>{setState(next);setRevision(revision+1);
setBatch({streamId:"preview",revision:revision+1,view:data[next][role],events:[{...event,eventId:"preview:"+(revision+1)}]});};
return <main><div>
<button onClick={()=>{setState("baseline");setBatch(null);setSession(session+1);window.phase14Audio=[];}}>Hydrate</button>
<button onClick={()=>{setBatch(null);setSession(session+1);window.phase14Audio=[];}}>Reconnect</button>
<button onClick={()=>setRenderVersion(renderVersion+1)}>Rerender</button>
<button onClick={()=>setBatch(batch?{...batch}:null)}>Duplicate</button>
<button onClick={()=>live("baseline",{type:"bunkerEntered",unitId:"status-kaiser",roll:6})}>Entry</button>
<button onClick={()=>live("noBunker",{type:"bunkerExited",unitId:"status-kaiser",reason:"timerExpired"})}>Exit</button>
<button onClick={()=>{setState("noBunker");setBatch(null);}}>Silent exit</button>
<button onClick={()=>live("tick",{type:"sansLastAttackTick",targetId:"status-cursed",targetCell:view.units["status-cursed"].position,damage:1,hpAfter:4})}>Tick</button>
<button onClick={()=>{setState("noCurse");setBatch(null);}}>Remove curse</button>
<button onClick={()=>live("moved",{type:"unitMoved",unitId:"status-cursed",from:{col:4,row:4},to:{col:5,row:4},provenance:{kind:"normal"}})}>Move</button>
<button onClick={()=>{setState("preDeath");setBatch(null);}}>Pre-death</button>
<button onClick={()=>live("dead",{type:"unitDied",unitId:"status-cursed",killerId:null,deathCell:view.units["status-cursed"].position})}>Final death</button>
<button onClick={()=>{setState("bone");setBatch(null);}}>Bone Field</button>
<button onClick={()=>{setState("storm");setBatch(null);}}>Storm</button>
<button onClick={()=>{setState("baseline");setBatch(null);}}>Clear field</button>
<select aria-label="Recipient" value={role} onChange={e=>{setRole(e.target.value);setSession(session+1);setBatch(null);window.phase14Audio=[];}}>
<option>P1</option><option>P2</option><option value="spectator">Spectator</option></select>
<output data-clicks>{clicks}</output></div>
<div data-board style={{width:"min(640px,100vw)",height:"min(640px,100vw)"}}>
<Board view={view} playerId={role==="spectator"?null:role} selectedUnitId="status-cursed" highlightedCells={{"4,4":"move"}}
visualEffectsEnabled eventBatch={batch} effectSessionKey={"session:"+session} showCoordinates={false}
allowUnitSelection={false} onSelectUnit={()=>{}} onCellClick={()=>setClicks(clicks+1)}/></div></main>;}
createRoot(document.getElementById("root")).render(<App/>);
`,
);
const url = "http://127.0.0.1:5194";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5194",
    "--strictPort",
  ],
  { cwd: webRoot, windowsHide: true, stdio: "ignore" },
);
let browser, page;
const errors = [];
const observations = [];
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* startup */
    }
    assert(attempt < 100, "Vite did not start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
  await page.goto(`${url}/test-results/phase14/browser/index.html`);
  const status = (kind) => page.locator(`[data-unit-status="${kind}"]`);
  const anchor = (id) => page.locator(`[data-status-unit="${id}"]`);
  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  const count = async (locator, expected) => {
    await locator.first().waitFor({ state: expected ? "visible" : "detached" });
    assert.equal(await locator.count(), expected);
  };
  const audio = () => page.evaluate(() => window.phase14Audio);
  await count(status("bunker"), 1);
  await count(status("curse"), 1);
  await count(status("movementDisabled"), 1);
  await count(status("immobilized"), 1);
  assert.deepEqual(await audio(), []);
  assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
  await page.evaluate(() => {
    window.statusNode = document.querySelector('[data-status-id="status-kaiser:bunker"]');
  });
  await click("Rerender");
  await click("Reconnect");
  assert.equal(
    await page.evaluate(
      () => window.statusNode === document.querySelector('[data-status-id="status-kaiser:bunker"]'),
    ),
    true,
  );
  assert.deepEqual(await audio(), []);
  await click("Silent exit");
  await count(status("bunker"), 0);
  await click("Entry");
  await count(status("bunker"), 1);
  await page.waitForFunction(() => window.phase14Audio.some((key) => key.endsWith("bunker.enter")));
  await click("Duplicate");
  await click("Rerender");
  assert.equal((await audio()).filter((key) => key.endsWith("bunker.enter")).length, 1);
  await click("Exit");
  await count(status("bunker"), 0);
  await page.waitForFunction(() => window.phase14Audio.some((key) => key.endsWith("bunker.exit")));
  assert.equal((await audio()).filter((key) => key.endsWith("bunker.exit")).length, 1);
  await click("Reconnect");
  await click("Tick");
  await page.waitForFunction(() =>
    window.phase14Audio.some((key) => key.endsWith("sansLastAttack.tick")),
  );
  assert.equal((await audio()).filter((key) => key.endsWith("sansLastAttack.tick")).length, 1);
  assert.equal((await audio()).filter((key) => key.endsWith("sansLastAttack.apply")).length, 0);
  await click("Remove curse");
  await count(status("curse"), 0);
  await click("Hydrate");
  await click("Move");
  await page.waitForFunction(() =>
    document.querySelector('[data-unit-id="status-cursed"] [data-movement-mode="normal"]'),
  );
  const movementSamples = await page.evaluate(async () => {
    const samples = [];
    for (let frame = 0; frame < 5; frame++) {
      await new Promise(requestAnimationFrame);
      const token = document
        .querySelector('[data-unit-id="status-cursed"] .unit-token')
        .getBoundingClientRect();
      const aura = document
        .querySelector('[data-status-unit="status-cursed"]')
        .getBoundingClientRect();
      samples.push({
        x: aura.left,
        distance: Math.abs(token.left + token.width / 2 - aura.left - aura.width / 2),
      });
    }
    return samples;
  });
  assert(
    movementSamples.every((sample) => sample.distance < 1),
    "Persistent aura must follow the moving token",
  );
  await page.waitForFunction(() => {
    const token = document.querySelector('[data-unit-id="status-cursed"] .unit-token');
    const aura = document.querySelector('[data-status-unit="status-cursed"]');
    return (
      token &&
      aura &&
      Math.abs(
        token.getBoundingClientRect().left +
          token.getBoundingClientRect().width / 2 -
          (aura.getBoundingClientRect().left + aura.getBoundingClientRect().width / 2),
      ) < 1
    );
  });
  assert.equal((await audio()).filter((key) => key.endsWith("sansLastAttack.apply")).length, 0);
  await click("Hydrate");
  await click("Pre-death");
  await count(anchor("status-cursed"), 1);
  await click("Final death");
  await count(anchor("status-cursed"), 0);
  await click("Hydrate");
  await click("Bone Field");
  await count(page.locator('[data-board-field="sans_bone_field"]'), 1);
  await click("Storm");
  await count(page.locator('[data-board-field="lechy_storm"]'), 1);
  await click("Clear field");
  await count(page.locator("[data-board-field]"), 0);
  assert.deepEqual(await audio(), []);
  for (const recipient of ["P1", "P2", "spectator"]) {
    await page.getByLabel("Recipient").selectOption(recipient);
    await count(status("stealth"), recipient === "P1" ? 1 : 0);
    await count(status("mark"), recipient === "P1" ? 1 : 0);
    assert.equal(
      await page.locator('[data-board-marker="vlad_stake_hidden"]').count(),
      recipient === "P1" ? 1 : 0,
    );
    assert.equal(
      await page.locator('[data-board-marker="jack_snare_hidden"]').count(),
      recipient === "P1" ? 1 : 0,
    );
    assert.equal(await page.locator('[data-board-marker="vlad_stake"]').count(), 1);
    assert.deepEqual(await audio(), []);
    await page.screenshot({ path: path.join(output, `${recipient}.png`), fullPage: true });
    observations.push({ recipient, privacy: true, silent: true });
  }
  await page.getByLabel("Recipient").selectOption("P1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 700 });
  await count(status("curse"), 1);
  await count(status("movementDisabled"), 1);
  await count(status("immobilized"), 1);
  assert.equal(
    await status("curse").evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(112, 26, 117)",
  );
  assert.equal(
    await page
      .locator(".persistent-status-art")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).animationName === "none"),
      ),
    true,
  );
  await page.locator('[data-unit-id="status-cursed"]').click();
  assert.equal(await page.locator("[data-clicks]").textContent(), "1");
  await page.screenshot({ path: path.join(output, "mobile-reduced.png"), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "results.json"),
    JSON.stringify(
      {
        observations,
        dedupe: true,
        lifetime: true,
        movement: true,
        death: true,
        reducedMotion: true,
        input: true,
        audioScheduling: true,
        audibleAudio: false,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Phase 14 browser smoke passed: silent snapshots, same-session cues, dedupe, privacy, lifetime, movement, death, mobile, reduced motion and click-through.",
  );
} catch (error) {
  console.error("Browser errors:", errors);
  await writeFile(path.join(output, "errors.json"), JSON.stringify(errors));
  await page?.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
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
