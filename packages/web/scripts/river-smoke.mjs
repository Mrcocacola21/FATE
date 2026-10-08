import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

// Production Board/ReactionChoicePanel, fed real recipient-projected rules results.
// This is an automated browser smoke, not a live WebSocket/two-account match.
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results/river/browser");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
assert(executablePath, "Local Chromium browser required");
await mkdir(output, { recursive: true });
const modulePath = (p) => JSON.stringify(path.join(root, p).replaceAll("\\", "/"));
await writeFile(
  path.join(output, "fixtures.ts"),
  `
import { writeFileSync } from "node:fs";
import { setupRiverPersonState,setUnit,toBattleState,initKnowledgeForOwners,makeRngSequence } from ${modulePath("packages/rules/src/tests/helpers/testUtils.ts")};
import { applyAction,makePlayerView,projectEventsForRecipient } from ${modulePath("packages/rules/src/index.ts")};
const data={};
for(const name of ["boat","boat-stake","boat-landing-death","boat-hidden","tralala","tralala-death","tralala-stake"]){
 const f=setupRiverPersonState(), drag=name.startsWith("tralala");let state=f.state;
 const target=Object.values(state.units).find(u=>u.owner===(drag?"P2":"P1")&&u.class==="assassin");
 const allies=["berserker","spearman","knight"].map(cls=>Object.values(state.units).find(u=>u.owner==="P1"&&u.class===cls));
 for(const u of Object.values(state.units))state=setUnit(state,u.id,{position:null});
 state=setUnit(state,f.river.id,{position:{col:0,row:0},charges:{...f.river.charges,riverTraLaLa:4}});
 state=setUnit(state,target.id,{position:{col:1,row:0},hp:name.includes("death")?1:20,isStealthed:name==="boat-hidden",stealthTurnsLeft:name==="boat-hidden"?3:0});
 if(drag)allies.forEach((u,i)=>state=setUnit(state,u.id,{position:{col:1,row:i+2}}));
 state=initKnowledgeForOwners(toBattleState(state,"P1",f.river.id));
 if(name.includes("stake")||name.includes("landing")||name.includes("hidden"))state={...state,stakeMarkers:[{id:"hidden",owner:"P2",position:name.includes("stake")?{col:0,row:2}:{col:1,row:5},createdAt:1,isRevealed:false}]};
 const wrap=(result,revision)=>Object.fromEntries(["P1","P2"].map(player=>[player,{view:makePlayerView(result.state,player),batch:revision?{streamId:"river-smoke",revision,events:projectEventsForRecipient(result.state,result.events,player).map((e,i)=>({...e,eventId:name+":"+revision+":"+i}))}:null}]));
 const baseline=wrap({state,events:[]},0),steps=[],commands=[];
 function run(action,dice=[]){const result=applyAction(state,action,makeRngSequence(dice));state=result.state;steps.push(wrap(result,steps.length+1));commands.push(action);return result;}
 function choice(value,dice=[]){const p=state.pendingRoll;return run({type:"resolvePendingRoll",player:p.player,pendingRollId:p.id,choice:value},dice);}
 run({type:"useAbility",unitId:f.river.id,abilityId:drag?"riverTraLaLa":"riverBoat"});
 choice({type:"hassanTrueEnemyTarget",targetId:target.id});
 choice({type:"forestMoveDestination",position:{col:0,row:5}});
 choice({type:"forestMoveDestination",position:{col:1,row:5}});
 let reaction=0;
 for(let i=0;state.pendingRoll;i++){
  if(i>30)throw Error("Unresolved River fixture");const p=state.pendingRoll;
  if(p.kind==="reactionChoice")choice({type:"resolveReactionChoice",choice:reaction++===1?"pass":"attack"});
  else if(p.kind==="reactionDropChoice")choice({type:"reactionDropDestination",position:p.context.options[0]});
  else if(p.kind==="riverBoatDropDestination")choice({type:"forestMoveDestination",position:p.context.options[0]});
  else choice(undefined,p.kind.endsWith("_attackerRoll")?[0.99,0.99]:[0.01,0.2]);
 }
 data[name]={baseline,steps,commands,riverId:f.river.id,targetId:target.id};
}
writeFileSync(${JSON.stringify(path.join(output, "fixtures.json"))},JSON.stringify(data));
`,
);
const fixtures = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/tsx/dist/cli.mjs"),
    "--tsconfig",
    path.join(root, "tsconfig.tests.json"),
    path.join(output, "fixtures.ts"),
  ],
  { cwd: root, windowsHide: true, encoding: "utf8" },
);
assert.equal(fixtures.status, 0, fixtures.stderr);
await writeFile(
  path.join(output, "index.html"),
  '<div id="root"></div><script type="module" src="./harness.tsx"></script>',
);
await writeFile(
  path.join(output, "harness.tsx"),
  `
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import {Board} from "/src/components/Board.tsx";
import {ReactionChoicePanel} from "/src/game/gameshell-content/components/ReactionChoicePanel.tsx";
import {sfxPlayer} from "/src/features/sfx/sfxPlayer.ts";
import {preloadRiverSounds,preloadCoreSounds} from "/src/features/sfx/audioPreload.ts";
import data from "./fixtures.json";import "/src/styles.css";
window.riverAudio=[];window.riverVfx=[];
const original=sfxPlayer.play.bind(sfxPlayer);sfxPlayer.play=cue=>{const played=original(cue);window.riverAudio.push({key:cue.key,played});return played;};
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(!(n instanceof Element))continue;for(const el of [...(n.matches("[data-vfx-effect]")?[n]:[]),...n.querySelectorAll("[data-vfx-effect]")])window.riverVfx.push({effect:el.dataset.vfxEffect,board:el.closest("[data-board]")?.dataset.board});}}).observe(document.getElementById("root"),{subtree:true,childList:true});
function App(){const [name,setName]=useState("boat"),[index,setIndex]=useState(-1),[frame,setFrame]=useState(data.boat.baseline),[session,setSession]=useState("initial");
 const reset=name=>{setName(name);setIndex(-1);setFrame(data[name].baseline);setSession("reset"+Date.now());window.riverAudio=[];window.riverVfx=[];};
 const advance=()=>{const i=index+1;setIndex(i);setFrame(data[name].steps[i]);};
 const reconnect=()=>{setSession("reconnect"+Date.now());setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:null}])));window.riverAudio=[];window.riverVfx=[];};
 return <><button onClick={async()=>{await sfxPlayer.ensureAudioReady();await Promise.all([preloadRiverSounds(),preloadCoreSounds("gameplay")]);document.body.dataset.audio="ready";}}>Enable audio</button>
 {Object.keys(data).map(n=><button key={n} onClick={()=>reset(n)}>{n} baseline</button>)}<button onClick={advance} disabled={index>=data[name].steps.length-1}>Next authoritative command</button>
 <button onClick={reconnect}>Reconnect baseline</button><button onClick={()=>setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:v.batch?{...v.batch}:null}])))}>Duplicate delivery</button>
 <div style={{display:"flex",gap:12}}>{["P1","P2"].map(player=>{const {view,batch}=frame[player],p=view.pendingRoll;return <section key={player} data-board={player} style={{width:540}}>
 <div data-testid="pending-kind">{p?.kind??view.pendingDecision?.opponentStatus?.message??"idle"}</div>
 {p?.kind==="reactionChoice"?<ReactionChoicePanel context={p.context} units={view.rosterUnits} onResolve={c=>{if(c.choice!==data[name].commands[index+1].choice.choice)throw Error("Unexpected smoke choice");advance();}}/>:null}
 <Board view={view} playerId={player} selectedUnitId={data[name].riverId} highlightedCells={{}} visualEffectsEnabled eventBatch={batch} effectSessionKey={session} onSelectUnit={()=>{}} onCellClick={()=>{}}/>
 </section>;})}</div></>;}
createRoot(document.getElementById("root")).render(<App/>);
`,
);
const url = "http://127.0.0.1:5192";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5192",
    "--strictPort",
  ],
  { cwd: webRoot, windowsHide: true, stdio: "ignore" },
);
let browser, page;
const observations = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* local startup */
    }
    assert(i < 100, "Vite startup timeout");
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 1250, height: 850 } });
  await page.addInitScript(() => localStorage.setItem("FATE_LANGUAGE", "en"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/test-results/river/browser/index.html`);
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.audio === "ready");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const read = () => page.evaluate(() => ({ audio: window.riverAudio, vfx: window.riverVfx }));
  for (const name of [
    "boat",
    "boat-stake",
    "boat-landing-death",
    "boat-hidden",
    "tralala",
    "tralala-death",
    "tralala-stake",
  ]) {
    console.log(`Checking ${name}`);
    await page.getByRole("button", { name: `${name} baseline`, exact: true }).click();
    await page.clock.runFor(32);
    const next = page.getByRole("button", { name: "Next authoritative command", exact: true });
    for (let i = 0; i < 3; i++) {
      await next.click();
      await page.clock.runFor(150);
    }
    assert.equal((await read()).audio.length, 0, `${name}: setup is silent`);
    assert.equal((await read()).vfx.length, 0);
    await next.click();
    await page.clock.runFor(64);
    await page
      .locator(
        `[data-board="P1"] [data-vfx-effect="${name.startsWith("tralala") ? "tralala" : "boatPickup"}"]`,
      )
      .first()
      .waitFor({ state: "attached" });
    await page.clock.runFor(360);
    if (name === "boat-stake") {
      assert.equal(
        await page.locator('[data-board="P1"] [data-transport-passenger-id]').count(),
        1,
      );
      await page.screenshot({ path: path.join(output, `${name}-travelling.png`), fullPage: true });
    }
    await page.clock.runFor(4500);
    if (name === "boat-stake" || name.startsWith("tralala")) {
      assert.equal(
        await page.locator('[data-board="P1"] [data-transport-passenger-id]').count(),
        1,
        `${name}: attached at reached pause`,
      );
    }
    const before = await read();
    await page.getByRole("button", { name: "Duplicate delivery", exact: true }).click();
    await page.clock.runFor(200);
    assert.deepEqual(await read(), before);
    if (name === "boat-stake") {
      assert(!before.vfx.some((v) => v.effect === "boatDrop"));
      await page.getByRole("button", { name: "Reconnect baseline", exact: true }).click();
      await page.clock.runFor(100);
      assert.equal((await read()).audio.length, 0);
      assert.match(
        await page.locator('[data-board="P1"] [data-testid="pending-kind"]').innerText(),
        /riverBoatDropDestination/,
      );
    }
    let reactionIndex = 0;
    while (await next.isEnabled()) {
      const panel = page.locator('[data-board="P1"] [data-testid="reaction-choice-panel"]');
      if (await panel.count()) {
        // Fixtures use Attack / Pass / Attack. The safe UI offers separate choices.
        await panel
          .getByRole("button", { name: reactionIndex++ === 1 ? "Pass" : "Attack", exact: true })
          .click();
      } else await next.click();
      await page.clock.runFor(5000);
    }
    const seen = await read();
    for (const player of ["P1", "P2"]) {
      const vfx = seen.vfx.filter((v) => v.board === player);
      assert.equal(
        vfx.filter((v) => v.effect === "boatPickup").length,
        name.startsWith("boat") &&
          !(name === "boat-hidden" && player === "P2") &&
          name !== "boat-stake"
          ? 1
          : 0,
        `${name} ${player}: ${JSON.stringify(seen)}`,
      );
      if (name === "tralala-death")
        assert.equal(vfx.filter((v) => v.effect === "boatDrop").length, 0);
    }
    if (name === "boat-hidden")
      assert(!seen.vfx.some((v) => v.board === "P2" && v.effect === "boatPickup"));
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    observations.push(
      `${name}: silent selection, confirmed steps, P1/P2, pause/choice or landing/death, duplicate silence`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "observations.json"), JSON.stringify(observations, null, 2));
  console.log(observations.join("\n"));
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
