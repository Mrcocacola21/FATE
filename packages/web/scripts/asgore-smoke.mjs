import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";

// Production Board/ability buttons with recipient-projected, rules-generated
// manual-decision fixtures. No account, database, server or gameplay RNG changes.
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const root = path.resolve(webRoot, "../..");
const output = path.join(webRoot, "test-results/asgore/browser");
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
import { setupAsgoreState, setUnit, toBattleState, initKnowledgeForOwners, makeRngSequence } from ${modulePath("packages/rules/src/tests/helpers/testUtils.ts")};
import { applyAction, makePlayerView, projectEventsForRecipient, getAbilityChargeCost, getAbilitySpec } from ${modulePath("packages/rules/src/index.ts")};
const wrap = (result, revision) => Object.fromEntries(["P1","P2"].map(player => [player, {
  view: makePlayerView(result.state, player), batch: {streamId:"asgore-smoke",revision,
  events:projectEventsForRecipient(result.state,result.events,player).map((e,i)=>({...e,eventId:"E"+revision+":"+i}))}}]));
const data={};
for(const [name,id,hit] of [["hit","asgoreFireball",true],["miss","asgoreFireball",false],["parade","asgoreFireParade",true]]){
 const f=setupAsgoreState(), enemy=Object.values(f.state.units).find(u=>u.owner==="P2"&&u.class==="knight");
 const cost=getAbilityChargeCost(getAbilitySpec(id));
 let state=setUnit(f.state,f.asgore.id,{position:{col:1,row:2},charges:{...f.asgore.charges,[id]:cost-1}});
 state=setUnit(state,enemy.id,{position:{col:1,row:id==="asgoreFireParade"?4:6},hp:8});
 state=initKnowledgeForOwners(toBattleState(state,"P1",f.asgore.id));
 const below=wrap({state,events:[]},0);
 state=setUnit(state,f.asgore.id,{charges:{...state.units[f.asgore.id].charges,[id]:cost}});
 const baseline=wrap({state,events:[]},0),steps=[];
 let result=applyAction(state,{type:"useAbility",unitId:f.asgore.id,abilityId:id,payload:{targetId:enemy.id}},makeRngSequence([]));
 steps.push(wrap(result,1));
 for(let i=0;result.state.pendingRoll;i++){
  if(i>20)throw Error("unresolved fixture");const p=result.state.pendingRoll;
  const attacker=p.kind.endsWith("_attackerRoll");
  result=applyAction(result.state,{type:"resolvePendingRoll",player:p.player,pendingRollId:p.id},makeRngSequence(attacker?(hit?[0.8,0.5]:[0.1,0.2]):(hit?[0.01,0.2]:[0.8,0.5])));
  steps.push(wrap(result,steps.length+1));
 }
 data[name]={below,baseline,steps,sourceId:f.asgore.id,abilityId:id};
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
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {Board} from "/src/components/Board.tsx";
import {BattleAbilityActions} from "/src/game/components/RightPanel/sections/BattleAbilityActions.tsx";
import {buildActionPreview} from "/src/game/targeting/buildActionPreview.ts";
import {sfxPlayer} from "/src/features/sfx/sfxPlayer.ts";
import {preloadAsgoreSounds,preloadCoreSounds} from "/src/features/sfx/audioPreload.ts";
import data from "./fixtures.json";
import "/src/styles.css";
window.asgoreAudio=[];window.asgoreVfx=[];
const original=sfxPlayer.play.bind(sfxPlayer);
sfxPlayer.play=cue=>{const played=original(cue);window.asgoreAudio.push({key:cue.key,played});return played;};
new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes){if(!(n instanceof Element))continue;
 const nodes=[...(n.matches("[data-vfx-effect]")?[n]:[]),...n.querySelectorAll("[data-vfx-effect]")];
 for(const el of nodes)window.asgoreVfx.push({effect:el.dataset.vfxEffect,board:el.closest("[data-board]")?.dataset.board});
}}).observe(document.getElementById("root"),{subtree:true,childList:true});
function App(){
 const [scenario,setScenario]=useState("hit"),[frame,setFrame]=useState(data.hit.below),[index,setIndex]=useState(-1),[session,setSession]=useState("initial"),[mode,setMode]=useState(null);
 const reset=name=>{setScenario(name);setFrame(data[name].below);setIndex(-1);setMode(null);setSession("reset"+Date.now());window.asgoreAudio=[];window.asgoreVfx=[];};
 const advance=()=>{const i=index+1;setIndex(i);setFrame(data[scenario].steps[i]);};
 const reconnect=()=>{setSession("reconnect"+Date.now());setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:null}])));window.asgoreAudio=[];window.asgoreVfx=[];};
 return <><div><button onClick={async()=>{await sfxPlayer.ensureAudioReady();await Promise.all([preloadAsgoreSounds(),preloadCoreSounds("gameplay")]);document.body.dataset.audio="ready";}}>Enable audio</button>
 {Object.keys(data).map(name=><button key={name} onClick={()=>reset(name)}>{name} baseline</button>)}
 <button onClick={()=>setFrame(data[scenario].baseline)}>Exact required charges</button>
 <button onClick={advance}>Resolve next manual decision</button><button onClick={reconnect}>Reconnect baseline</button>
 <button onClick={()=>setFrame(old=>Object.fromEntries(Object.entries(old).map(([p,v])=>[p,{...v,batch:v.batch?{...v.batch}:null}])))}>Duplicate delivery</button>
 <button onClick={()=>setMode("asgoreFireParade")}>Select another ability</button>
 <button onClick={()=>sfxPlayer.setMuted(true)}>Mute</button><button onClick={()=>sfxPlayer.setVolume(0)}>Zero volume</button></div>
 <div style={{display:"flex",gap:12}}>{["P1","P2"].map(player=>{const view=frame[player].view,unit=view.units[data[scenario].sourceId];return <section key={player} data-board={player} style={{width:540}}>
 <Board view={view} playerId={player} selectedUnitId={unit.id} highlightedCells={{}} boardPreview={buildActionPreview({gameView:view,viewerPlayerId:player,sourceUnitId:unit.id,actionMode:mode})}
 visualEffectsEnabled eventBatch={frame[player].batch} effectSessionKey={session} onSelectUnit={()=>{}} onCellClick={()=>{}}/>
 {player==="P1"?<BattleAbilityActions view={view} actionableAbilities={view.abilitiesByUnitId[unit.id].filter(a=>a.id===data[scenario].abilityId)} selectedUnit={unit} canAct={true}
 economy={unit.turn} actionMode={mode} targetingActive={false} onUseAbility={advance} onUseLokiLaughtOption={()=>{}} onToggleMode={setMode} onModePreview={()=>{}} onHoverAbility={()=>{}}/>:null}
 </section>;})}</div></>;
}
createRoot(document.getElementById("root")).render(<App/>);
`,
);
const url = "http://127.0.0.1:5191";
const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5191",
    "--strictPort",
  ],
  { cwd: webRoot, windowsHide: true, stdio: "ignore" },
);
let browser;
const observations = [];
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* local startup */
    }
    assert(i < 50, "Vite startup timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1250, height: 820 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/test-results/asgore/browser/index.html`);
  await page.getByRole("button", { name: "Enable audio", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.audio === "ready");
  const read = () => page.evaluate(() => ({ vfx: window.asgoreVfx, audio: window.asgoreAudio }));
  for (const scenario of ["hit", "miss", "parade"]) {
    await page.getByRole("button", { name: `${scenario} baseline`, exact: true }).click();
    const id = scenario === "parade" ? "asgoreFireParade" : "asgoreFireball";
    const button = page.locator(`[data-ability-action-id="${id}"]`);
    assert(await button.isDisabled(), `${scenario}: below cost must disable`);
    await page.getByRole("button", { name: "Exact required charges", exact: true }).click();
    assert(await button.isEnabled(), `${scenario}: exact cost must enable`);
    await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
    await page.waitForTimeout(220);
    assert((await read()).audio.some((s) => s.key.endsWith(`${id}.cast`) && s.played));
    assert(
      !(await read()).vfx.some((s) => s.effect === "fireballImpact" || s.effect === "fireParade"),
    );
    await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
    await page.waitForTimeout(750);
    await page.getByRole("button", { name: "Select another ability", exact: true }).click();
    assert(
      !(await read()).vfx.some((s) => s.effect === "fireballImpact" || s.effect === "fireParade"),
    );
    await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(output, `${scenario}-travel.png`), fullPage: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, `${scenario}-outcome.png`), fullPage: true });
    await page.waitForTimeout(1100);
    const seen = await read();
    for (const player of ["P1", "P2"]) {
      const effects = seen.vfx.filter((s) => s.board === player);
      assert.equal(
        effects.filter((s) => s.effect === (scenario === "parade" ? "fireParade" : "fireball"))
          .length,
        1,
      );
      assert.equal(
        effects.filter((s) => s.effect === "fireballImpact").length,
        scenario === "hit" ? 1 : 0,
      );
    }
    if (scenario === "miss") {
      assert(!seen.audio.some((s) => s.key.endsWith("asgoreFireball.impact")));
      assert(!seen.vfx.some((s) => s.effect === "combatHit"));
    }
    await page.getByRole("button", { name: "Duplicate delivery", exact: true }).click();
    await page.waitForTimeout(200);
    assert.deepEqual(await read(), seen);
    await page.screenshot({ path: path.join(output, `${scenario}.png`), fullPage: true });
    observations.push(
      `${scenario}: below/exact cost, committed cast, manual rolls, no predicted impact, changed selection, P1/P2 outcome, duplicate silence`,
    );
  }
  await page.getByRole("button", { name: "hit baseline", exact: true }).click();
  await page.getByRole("button", { name: "Exact required charges", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
    await page.waitForTimeout(750);
  }
  await page.getByRole("button", { name: "Reconnect baseline", exact: true }).click();
  await page.waitForTimeout(200);
  assert.deepEqual((await read()).audio, []);
  await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
  await page.waitForTimeout(2000);
  assert.equal((await read()).vfx.filter((s) => s.effect === "fireballImpact").length, 2);
  assert(!(await read()).vfx.some((s) => s.effect === "fireballCast"));
  observations.push(
    "defender-pending reconnect: silent baseline, restored correlation, one outcome per board, no old cast",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "miss baseline", exact: true }).click();
  await page.getByRole("button", { name: "Exact required charges", exact: true }).click();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Resolve next manual decision", exact: true }).click();
    await page.waitForTimeout(650);
  }
  await page.waitForTimeout(1200);
  assert(!(await read()).audio.some((s) => s.played));
  assert(!(await read()).vfx.some((s) => s.effect === "fireballImpact"));
  observations.push("reduced-motion miss retains safe branch; mute prevents playback");
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(output, "observations.json"),
    JSON.stringify({ observations, errors }, null, 2),
  );
  console.log(observations.join("\n"));
} finally {
  await browser?.close();
  if (server.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else server.kill("SIGTERM");
  }
}
