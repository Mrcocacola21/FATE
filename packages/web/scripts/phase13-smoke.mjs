import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

// Automated local Board smoke with real rules and recipient-projected frames.
// This is not a manually played two-account/WebSocket match.
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results/phase13/browser");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
assert(executablePath, "Local Chromium browser required");
await mkdir(output, { recursive: true });
const json = path.join(output, "fixtures.json");
const generated = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/tsx/dist/cli.mjs"),
    path.join(webRoot, "scripts/phase13-fixtures.ts"),
    json,
  ],
  { cwd: root, windowsHide: true, encoding: "utf8" },
);
assert.equal(generated.status, 0, generated.stderr);
const data = JSON.parse(await readFile(json, "utf8"));
await writeFile(
  path.join(output, "index.html"),
  '<div id="root"></div><script type="module" src="./harness.tsx"></script>',
);
await writeFile(
  path.join(output, "harness.tsx"),
  `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {Board} from "/src/components/Board.tsx";
import {ReactionChoicePanel} from "/src/game/gameshell-content/components/ReactionChoicePanel.tsx";
import {sfxPlayer} from "/src/features/sfx/sfxPlayer.ts";
import {preloadRosterSounds,preloadCoreSounds} from "/src/features/sfx/audioPreload.ts";
import data from "./fixtures.json";import "/src/styles.css";
window.phase13Audio=[];window.phase13Vfx=[];
const original=sfxPlayer.play.bind(sfxPlayer);sfxPlayer.play=cue=>{const played=original(cue);window.phase13Audio.push({key:cue.key,id:cue.id,played});return played;};
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(!(n instanceof Element))continue;for(const el of [...(n.matches("[data-vfx-effect]")?[n]:[]),...n.querySelectorAll("[data-vfx-effect]")])window.phase13Vfx.push({effect:el.dataset.vfxEffect,board:el.closest("[data-board]")?.dataset.board});}}).observe(document.getElementById("root"),{subtree:true,childList:true});
function App(){const [name,setName]=useState("jack-snare"),[index,setIndex]=useState(-1),[frame,setFrame]=useState(data["jack-snare"].baseline),[session,setSession]=useState("initial"),[reduced,setReduced]=useState(false);
const reset=name=>{setName(name);setIndex(-1);setFrame(data[name].baseline);setSession("reset"+Date.now());window.phase13Audio=[];window.phase13Vfx=[];};
const advance=()=>{const i=index+1;flushSync(()=>{setIndex(i);setFrame(data[name].frames[i]);});};
return <><button onClick={async()=>{await sfxPlayer.ensureAudioReady();await Promise.all([preloadRosterSounds(["jackRipper","hassan","chikatilo","genghisKhan","lechy"]),preloadCoreSounds("gameplay")]);document.body.dataset.audio="ready";}}>Enable audio</button>
{Object.keys(data).map(n=><button key={n} onClick={()=>reset(n)}>{n} baseline</button>)}
<button onClick={advance} disabled={index>=data[name].frames.length-1}>Next authoritative command</button>
<button onClick={()=>setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:v.batch?{...v.batch}:null}])))}>Duplicate delivery</button>
<button onClick={()=>{setSession("reconnect"+Date.now());setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:null}])));window.phase13Audio=[];window.phase13Vfx=[];}}>Reconnect baseline</button>
<button onClick={()=>sfxPlayer.setMuted(true)}>Mute</button><button onClick={()=>sfxPlayer.setMuted(false)}>Unmute</button>
<button onClick={()=>sfxPlayer.setVolume(0)}>Volume zero</button><button onClick={()=>sfxPlayer.setVolume(1)}>Volume full</button>
<label>Reduced motion<input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/></label>
<div style={{display:"flex",gap:10}}>{["P1","P2","spectator"].map(player=>{const {view,batch}=frame[player],p=view.pendingRoll;
return <section key={player} data-board={player} style={{width:400}}><h2>{player}</h2><div data-testid="pending-kind">{p?.kind??view.pendingDecision?.opponentStatus?.message??"idle"}</div>
{p?.kind==="reactionChoice"?<ReactionChoicePanel context={p.context} units={view.rosterUnits} onResolve={c=>{const expected=data[name].commands[index+1].choice;if(c.choice!==expected.choice||(c.choice==="attack"&&c.targetId!==expected.targetId))throw Error("Wrong reaction choice/target");advance();}}/>:null}
<Board view={view} playerId={player==="spectator"?"P1":player} selectedUnitId={data[name].selectedUnitId} highlightedCells={{}} visualEffectsEnabled eventBatch={batch} effectSessionKey={session} previewReducedMotion={reduced} onSelectUnit={()=>{}} onCellClick={()=>{}}/>
</section>;})}</div></>;}
createRoot(document.getElementById("root")).render(<App/>);
`,
);
const url = "http://127.0.0.1:5193";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5193",
    "--strictPort",
  ],
  { cwd: webRoot, windowsHide: true, stdio: "ignore" },
);
let browser, page;
const observations = [];
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* local startup */
    }
    assert(attempt < 100, "Vite startup timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("FATE_LANGUAGE", "en"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/test-results/phase13/browser/index.html`);
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.audio === "ready");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const read = () => page.evaluate(() => ({ audio: window.phase13Audio, vfx: window.phase13Vfx }));
  // React's MessageChannel work runs on real time; advancing the browser's
  // virtual timer alone can outrun passive effects and sample an empty batch.
  const settle = async () => {
    for (let pass = 0; pass < 2; pass++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await page.clock.runFor(6500);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
  const next = page.getByRole("button", { name: "Next authoritative command", exact: true });
  for (const name of Object.keys(data)) {
    console.log(`Checking ${name}`);
    await page.getByRole("button", { name: `${name} baseline`, exact: true }).click();
    await settle();
    assert.deepEqual(await read(), { audio: [], vfx: [] }, `${name}: silent hydration`);
    if (name === "hassan-order") {
      assert.equal(
        await page.locator('[data-board="P1"] [data-testid="pending-kind"]').textContent(),
        "hassanAssassinOrderSelection",
      );
      assert.notEqual(
        await page.locator('[data-board="P2"] [data-testid="pending-kind"]').textContent(),
        "hassanAssassinOrderSelection",
      );
    }
    let actor = 0;
    while (await next.isEnabled()) {
      const panel = page.locator('[data-board="P1"] [data-testid="reaction-choice-panel"]');
      if (await panel.count()) {
        const pass = actor++ === 1;
        const control = panel.getByRole("button", { name: pass ? "Pass" : "Attack", exact: true });
        const count = await control.count();
        assert.ok(count >= 1);
        // Each legal target has an Attack control, in the authoritative target
        // order. Fixtures choose the first target and verify its exact ID above.
        if (pass) {
          assert.equal(count, 1);
          await control.click();
        } else await control.first().click();
      } else await next.click();
      await page.clock.runFor(160);
      if (name === "jack-cover" && !(await next.isEnabled()))
        await page.screenshot({
          path: path.join(output, "jack-cover-before-final-death.png"),
          fullPage: true,
        });
      await settle();
      const prior = await read();
      await page.getByRole("button", { name: "Duplicate delivery", exact: true }).click();
      await settle();
      assert.deepEqual(await read(), prior, `${name}: duplicate stays silent`);
    }
    const seen = await read(),
      effects = (player) => seen.vfx.filter((v) => v.board === player).map((v) => v.effect);
    if (name === "jack-snare") {
      assert.equal(effects("P1").filter((e) => e === "snarePlace").length, 1);
      for (const player of ["P2", "spectator"]) assert.ok(!effects(player).includes("snarePlace"));
      for (const player of ["P1", "P2", "spectator"])
        assert.equal(effects(player).filter((e) => e === "snareTrigger").length, 1);
    }
    if (name === "jack-cover")
      for (const player of ["P1", "P2", "spectator"]) {
        assert.equal(effects(player).filter((e) => e === "jackCoverTracks").length, 1);
        assert.equal(effects(player).filter((e) => e === "unitDeath").length, 1);
      }
    if (name === "hassan-order" || name === "chikatilo-mark") {
      const id = name === "hassan-order" ? "hassanOrder" : "chikatiloMark";
      assert.equal(effects("P1").filter((e) => e === id).length, 1);
      for (const player of ["P2", "spectator"]) assert.ok(!effects(player).includes(id));
      assert.equal(seen.audio.length, 1, `${name}: one private owner sound`);
    }
    if (name === "genghis") {
      assert.equal(actor, 3, "Three independently rendered reaction panels");
      assert.equal(
        seen.audio.filter((a) => a.key === "common.combat.diceRoll").length,
        12,
        "Two manual attacks, two rolls, three recipient Boards",
      );
    }
    if (name === "lechy-storm") assert.ok(effects("P1").includes("lechyStorm"));
    assert.ok(
      seen.audio.some((a) => a.played),
      `${name}: decoded audio actually played`,
    );
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    observations.push({
      name,
      audioRequests: seen.audio.length,
      vfx: seen.vfx.length,
      duplicateSilent: true,
    });
    await page.getByRole("button", { name: "Reconnect baseline", exact: true }).click();
    await settle();
    assert.deepEqual(await read(), { audio: [], vfx: [] });
  }
  for (const button of ["Mute", "Volume zero"]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByRole("button", { name: "chikatilo-mark baseline", exact: true }).click();
    await settle();
    await next.click();
    await settle();
    assert.deepEqual((await read()).audio, []);
    await page
      .getByRole("button", { name: button === "Mute" ? "Unmute" : "Volume full", exact: true })
      .click();
  }
  await page.getByLabel("Reduced motion", { exact: true }).check();
  await page.getByRole("button", { name: "hassan-order baseline", exact: true }).click();
  await settle();
  await next.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await page.clock.runFor(16);
  await page.waitForSelector('[data-board="P1"] [data-vfx-effect="hassanOrder"]');
  await page.screenshot({ path: path.join(output, "hassan-reduced-motion.png"), fullPage: true });
  assert.ok((await read()).vfx.some((v) => v.effect === "hassanOrder"));
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "observations.json"),
    JSON.stringify({ observations, muteAndVolume: true, reducedMotion: true, errors }, null, 2),
  );
  console.log(
    "Phase 13 Board smoke passed: recipient privacy, actual audio, reached snare, direct death, three manual reactors, dedupe, hydration, mute/volume, reduced motion.",
  );
} catch (error) {
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
