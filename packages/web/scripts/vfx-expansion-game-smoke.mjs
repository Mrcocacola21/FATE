import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
const web = fileURLToPath(new URL("../", import.meta.url)), root = path.resolve(web, "../..");
const output = path.join(web, "test-results/vfx-expansion-game");
mkdirSync(output, { recursive: true });
const generated = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.join(root, "tsconfig.tests.json"), path.join(web, "scripts/vfx-expansion-fixtures.ts"), path.join(output, "fixtures.json")],
  { cwd: root, windowsHide: true, encoding: "utf8" });
assert.equal(generated.status, 0, generated.stderr);
const fixtures = JSON.parse(readFileSync(path.join(output, "fixtures.json"), "utf8"));
writeFileSync(path.join(output, "index.html"), '<div id="root"></div><script type="module" src="./harness.tsx"></script>');
writeFileSync(path.join(output, "harness.tsx"), `
import React,{useState} from "react";import{createRoot}from"react-dom/client";
import{Board}from"/src/components/Board.tsx";import{usePresentationPreload,rosterPortraitUrls}from"/src/game/effects/presentationPreload.ts";
import{imagePreloader}from"/src/features/vfx/imagePreload.ts";import{assetLoadQueue}from"/src/assets/assetLoadQueue.ts";
import{sfxPlayer}from"/src/features/sfx/sfxPlayer.ts";import data from"./fixtures.json";import"/src/styles.css";
sfxPlayer.play=()=>true;window.expansionDiagnostics=()=>({image:imagePreloader.diagnostics,queue:assetLoadQueue.diagnostics});
function App(){const[id,setId]=useState(Object.keys(data)[0]),[role,setRole]=useState("P1"),[live,setLive]=useState(false),[snapshot,setSnapshot]=useState(false),[session,setSession]=useState(1),[selected,setSelected]=useState(null),[duplicate,setDuplicate]=useState(0);
const frame=data[id].recipients[role],view=live||snapshot?frame.after:frame.before;usePresentationPreload(view,true);
window.warmPortraits=()=>Promise.all(rosterPortraitUrls(view).map(src=>imagePreloader.load(src,"smoke portrait","high")));
window.runtimeHarnessState={id,role,live,session};
const reset=()=>{setLive(false);setSnapshot(false);setSession(x=>x+1);setSelected(null);};
return <main><label>Fixture<select aria-label="Fixture" value={id} onChange={e=>{setId(e.target.value);reset();}}>{Object.keys(data).map(key=><option key={key}>{key}</option>)}</select></label>
<label>Recipient<select aria-label="Recipient" value={role} onChange={e=>{setRole(e.target.value);reset();}}>{["P1","P2","spectator"].map(key=><option key={key}>{key}</option>)}</select></label>
<button onClick={()=>setSnapshot(true)}>Snapshot</button><button onClick={()=>{window.runtimeMovementStartedAt=Date.now();setLive(true);}}>Play</button><button onClick={()=>setDuplicate(x=>x+1)}>Duplicate</button><button onClick={reset}>Reconnect</button><button onClick={()=>setSelected(null)}>Deselect</button>
<div data-runtime-board style={{width:"min(680px,100%)"}}><Board view={view} playerId={role==="spectator"?null:role} selectedUnitId={selected} highlightedCells={{}} visualEffectsEnabled effectSessionKey={String(session)}
 eventBatch={live?{streamId:"runtime",revision:session,events:frame.events,view}:null} onSelectUnit={setSelected} onCellClick={()=>{}} /></div><span data-duplicate={duplicate}/></main>;}
createRoot(document.getElementById("root")).render(<App/>);
`);
const url = "http://127.0.0.1:5198";
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5198", "--strictPort"], { cwd: web, windowsHide: true, stdio: "ignore" });
let browser;
const observations = [], errors = [];
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Vite starting */ }
    assert(attempt < 150); await new Promise(resolve => setTimeout(resolve, 100));
  }
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium"].find(p => p && existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  let portraitReleased = false;
  const portraitWaiters = [];
  if (process.argv.includes("--cold-portrait")) await page.route("**/assets/tokens/genghisKhan.webp*", async route => {
    if (!portraitReleased) await new Promise(resolve => { portraitWaiters.push(resolve); });
    await route.continue();
  });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${url}/test-results/vfx-expansion-game/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByLabel("Fixture").waitFor({ timeout: 60000 });
  if (process.argv.includes("--dark")) await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  // CSS animations do not share Playwright's fake JS clock. Capture their actual
  // midpoint including authored delay, after the real playback clock reaches it.
  const stepCss = () => page.locator("[data-vfx-cue]").evaluateAll(elements => {
    for (const el of elements) for (const animation of [...el.getAnimations({ subtree: true }),
      ...(el.closest(".unit-deployment-composition")?.getAnimations({ subtree: true }) ?? [])]) {
      animation.pause();
      const elapsed = Date.now() - Number(el.dataset.vfxStart);
      const delay = parseFloat(el.style.getPropertyValue("--vfx-delay")) || 0;
      animation.currentTime = elapsed < 0 ? 0 : delay + elapsed;
    }
    // Chromium may keep a stale promoted texture when a delayed strip is
    // paused/seeked headlessly. Drop this performance hint for the capture;
    // geometry, frame, opacity and animation time remain unchanged.
    for (const el of elements) for (const art of el.querySelectorAll(".vfx-artwork")) art.style.willChange = "auto";
  });
  for (const viewport of process.argv.includes("--phone-only") ? ["phone-reduced"] : process.argv.includes("--desktop-only") ? ["desktop"] : process.argv.includes("--phone-motion") ? ["desktop", "phone", "phone-reduced"] : ["desktop", "phone-reduced"]) {
    await page.setViewportSize(viewport === "desktop" ? { width: 1024, height: 1000 } : { width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: viewport === "phone-reduced" ? "reduce" : "no-preference" });
    for (const recipient of process.argv.includes("--owner-only") ? ["P1"] : ["P1", "P2", "spectator"]) {
      console.log(`Runtime Board: ${viewport}/${recipient}`);
      await page.getByLabel("Recipient").selectOption(recipient);
      for (const [id, fixture] of Object.entries(fixtures)) {
        if (process.argv.includes("--long-only") && !id.startsWith("longmove.")) continue;
        if (process.argv.includes("--swings-only") && !id.startsWith("swing.") && !((process.argv.includes("--facing-only") || process.argv.includes("--normalization-only")) && id.startsWith("direction."))) continue;
        if (process.argv.includes("--facing-only") && !id.startsWith("direction.") && !["swing.guts", "swing.guts.north", "swing.guts.southwest", "swing.guts.miss", "swing.genghisKhan"].includes(id)) continue;
        if (process.argv.includes("--projectiles-only") && !id.startsWith("projectile.")) continue;
        if (process.argv.includes("--outcomes-only") && !id.startsWith("outcome.")) continue;
        if (process.argv.includes("--signatures-only") && !id.startsWith("signature.")) continue;
        if (process.argv.includes("--projectile-contrast") && !/^projectile\.(guts\.gutsArbalet|asgore\.)/.test(id)) continue;
        if (process.argv.includes("--melee-timeline") && !["swing.guts", "swing.guts.north", "swing.guts.southwest", "swing.guts.miss", "swing.guts.berserk", "swing.undyne", "swing.chikatilo", "swing.genghisKhan", "swing.luche"].includes(id)) continue;
        if (process.argv.includes("--signals-only") && !id.startsWith("expansion.")) continue;
        if (process.argv.includes("--deploy-only") && !id.startsWith("deploy.")) continue;
        if (process.argv.includes("--genghis-only") && id !== "deploy.genghisKhan" && !(process.argv.includes("--aura-live") && id === "move.genghisKhan")) continue;
        if (process.argv.includes("--kaiser-only") && !id.includes(".grand-kaiser")) continue;
        if (process.argv.includes("--review-samples") && !id.startsWith("expansion.") && id !== "move.zoro") continue;
        if (process.argv.includes("--staging-only") && !id.startsWith("move.") && !id.startsWith("deploy.")) continue;
        if (process.argv.includes("--commander-only") && !/\.(jebe|hassan|donKihote|elCidCompeador|genghisKhan|vladTepes)(\.|$)/.test(id)) continue;
        await page.getByLabel("Fixture").selectOption(id); await page.getByRole("button", { name: "Reconnect", exact: true }).click();
        await page.clock.runFor(40);
        if (!process.argv.includes("--cold-portrait")) await page.evaluate(() => window.warmPortraits());
        await page.locator("[data-vfx-cue]").first().waitFor({ state: "detached" });
        assert.equal(await page.locator("[data-vfx-cue]").count(), 0, `${id}: hydration is silent`);
        assert.equal(await page.locator("[data-unit-deployment]").count(), 0, `${id}: snapshot does not materialize a token`);
        let selectionRect = null;
        if (recipient === "P1" && fixture.selectable !== false && !process.argv.includes("--long-only") &&
          (!(process.argv.includes("--projectiles-only") || process.argv.includes("--outcomes-only")) || fixture.recipients.P1.before.units[fixture.sourceId]?.heroId)) {
          await page.locator(`[data-unit-id="${fixture.sourceId}"]`).click(); await page.clock.runFor(16);
          await page.locator("[data-selection-vfx]").waitFor({ state: "attached" });
          assert.equal(await page.locator("[data-selection-vfx]").count(), 1, `${id}: local Board selection`);
          const selection = await page.locator("[data-selection-vfx]").evaluate(el => ({
            width: el.getBoundingClientRect().width, artWidth: el.querySelector("img").getBoundingClientRect().width,
            objectFit: getComputedStyle(el.querySelector("img")).objectFit, clip: getComputedStyle(el).overflow,
          }));
          assert(selection.artWidth >= selection.width, `${id}: visible ring uses enlarged canvas`);
          assert.equal(selection.objectFit, "fill"); assert.equal(selection.clip, "hidden");
          if (process.argv.includes("--selection-capture") && viewport === "desktop") {
            await page.locator("[data-selection-vfx] img").evaluate(img => img.decode());
            selectionRect = await page.locator("[data-selection-vfx]").boundingBox();
            await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `selection-${id}.png`) });
          }
          await page.getByRole("button", { name: "Deselect", exact: true }).click();
          await page.locator("[data-selection-vfx]").waitFor({ state: "detached" });
          assert.equal(await page.locator("[data-selection-vfx]").count(), 0);
        }
        if (process.argv.includes("--snapshot-first")) {
          await page.getByRole("button", { name: "Snapshot", exact: true }).click(); await page.clock.runFor(48);
          assert.equal(await page.locator("[data-vfx-cue], [data-unit-deployment]").count(), 0, `${id}: ahead snapshot is silent`);
          if (id.startsWith("deploy.")) assert.equal(await page.locator(`[data-unit-id="${fixture.sourceId}"]`).count(), 0,
            `${id}: deployment waits for confirmation instead of painting an aura alone`);
        }
        const startRect = process.argv.includes("--long-only") ? await page.locator(`[data-unit-id="${fixture.sourceId}"] .board-unit-content`).boundingBox() : null;
        const movementCellSize = process.argv.includes("--long-only") ? (await page.locator(`[data-unit-id="${fixture.sourceId}"]`).boundingBox()).width : null;
        await page.getByRole("button", { name: "Play", exact: true }).click(); await page.clock.runFor(16);
        const expected = (fixture.recipients[recipient].expected ?? fixture.expected).filter(key => !(viewport === "phone-reduced" && fixture.hiddenInReduced.includes(key)));
        if (process.argv.includes("--long-only")) {
          const event = fixture.recipients[recipient].events.find(event => event.type === "unitMoved");
          assert(event, `${id}: actual rules movement must be projected`);
          const distance = Math.max(Math.abs(event.to.col - event.from.col), Math.abs(event.to.row - event.from.row));
          const duration = viewport === "phone-reduced" ? 50 : Math.min(720, distance * 160);
          const startedAt = await page.evaluate(() => window.runtimeMovementStartedAt);
          const common = fixture.expected.length === 0;
          const token = page.locator(`[data-unit-id="${fixture.sourceId}"] .board-unit-content`);
          if (!common) {
            const trail = page.locator(`[data-vfx-effect="${fixture.expected[0]}"]`);
            if (viewport !== "phone-reduced") {
              assert.equal(await trail.count(), 1);
              assert.equal(await trail.getAttribute("data-vfx-travel-duration"), String(duration));
              assert.equal(await trail.evaluate(el => parseFloat(el.style.getPropertyValue("--vfx-duration"))), duration + 240);
              await trail.locator(".vfx-sprite").evaluateAll(elements => Promise.all(elements.map(async el => {
                const src = getComputedStyle(el).backgroundImage.slice(5, -2);
                const image = new Image(); image.src = src; await image.decode();
                if (!image.naturalWidth) throw new Error("Movement artwork must decode");
              })));
            } else assert.equal(await trail.count(), 0, "reduced motion suppresses traveling strips");
          }
          const samples = [];
          let fixedDeposits;
          for (const fraction of [.25, .5, .75]) {
            const now = await page.evaluate(() => Date.now());
            await page.clock.runFor(Math.max(0, Math.round(startedAt + duration * fraction - now)));
            await stepCss();
            const elapsed = await page.evaluate(() => Date.now()) - startedAt;
            await page.locator(".board-effect-trail, .board-effect-trail-dot").evaluateAll((elements, elapsed) => {
              for (const el of elements) for (const animation of el.getAnimations()) {
                animation.pause(); animation.currentTime = elapsed + (parseFloat(el.style.getPropertyValue("--effect-delay")) || 0);
              }
            }, elapsed);
            const unitRect = await token.boundingBox();
            let wakeDeposits;
            const sign = recipient === "P2" ? -1 : 1;
            const travel = (event.to.col - event.from.col) * movementCellSize * sign;
            const tolerance = Math.abs(travel) * 17 / duration + 1;
            assert(Math.abs(unitRect.x - startRect.x - travel * fraction) <= tolerance,
              `${id}/${recipient}/${viewport}: token must still be traveling at ${fraction} (${JSON.stringify({unitRect,startRect,travel,duration})})`);
            if (viewport !== "phone-reduced") {
              const trail = page.locator(common ? ".board-effect-trail" : `[data-vfx-effect="${fixture.expected[0]}"]`);
              assert.equal(await trail.count(), 1, "one continuous wake for the confirmed route");
              assert(await trail.evaluate(el => Number(getComputedStyle(el).opacity) > .1), `${id}: wake visible at ${fraction}`);
              if (common) {
                const paint = await trail.evaluate(el => ({ color: getComputedStyle(el).backgroundColor,
                  width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
                assert(!["transparent", "rgba(0, 0, 0, 0)"].includes(paint.color), `${id}: common trail needs actual painted pixels, not transparent CSS`);
                assert(paint.width > 1 && paint.height > 1);
              }
              if (!common) {
                assert.equal(await page.locator(".board-effect-trail").count(), 0, "no duplicate generic trail");
                const deposits = await trail.locator("[data-vfx-wake-sample]").evaluateAll(elements => elements.map(el => ({
                  index: Number(el.dataset.vfxWakeSample), emission: Number(el.dataset.vfxEmission),
                  opacity: Number(getComputedStyle(el).opacity), x: el.getBoundingClientRect().x,
                  y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width,
                })));
                assert(deposits.length >= 3 && deposits.length <= 32, "bounded deposits share one queued route");
                const board = await page.locator("[data-runtime-board]").boundingBox();
                const positions = deposits.map(({ index, x, y }) => ({ index, x: x - board.x, y: y - board.y }));
                if (fixedDeposits) assert.deepEqual(positions, fixedDeposits, "deposits stay on the board while the token moves away");
                fixedDeposits = positions;
                const active = deposits.filter(sample => sample.opacity > .02);
                assert(active.length >= 1, "passed positions leave a visible wake");
                for (const sample of deposits) {
                  if (sample.emission >= elapsed || elapsed - sample.emission >= 240)
                    assert(sample.opacity < .001, "future and expired deposits stay transparent");
                }
                for (const sample of active) {
                  assert(sample.emission < elapsed, "no paint ahead of the moving token");
                  const center = sample.x + sample.width / 2;
                  const tokenCenter = unitRect.x + unitRect.width / 2;
                  assert((center - tokenCenter) * sign < movementCellSize * .2,
                    "wake remains behind the token in both board orientations");
                }
                wakeDeposits = deposits;
              }
              if (recipient === "P1" && id.endsWith(".long")) await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `${viewport === "desktop" ? "" : `${viewport}-`}${id}-${fraction}.png`) });
            }
            // Element screenshots may scroll the page; record coordinates after
            // capture so contact sheets use the same viewport as the pixels.
            samples.push({ fraction, unitRect: await token.boundingBox(),
              boardRect: await page.locator("[data-runtime-board]").boundingBox(),
              ...(wakeDeposits ? { deposits: wakeDeposits } : {}) });
            if (fraction === .25) {
              const cueIds = await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => el.dataset.vfxCue));
              const commonCount = await page.locator(".board-effect-trail").count();
              await page.getByRole("button", { name: "Duplicate", exact: true }).click();
              assert.deepEqual(await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => el.dataset.vfxCue)), cueIds);
              assert.equal(await page.locator(".board-effect-trail").count(), commonCount);
            }
          }
          const now = await page.evaluate(() => Date.now());
          await page.clock.runFor(Math.max(0, startedAt + duration + 16 - now)); await stepCss();
          const reached = await token.boundingBox();
          assert(Math.abs(reached.x - startRect.x - (event.to.col - event.from.col) * movementCellSize * (recipient === "P2" ? -1 : 1)) < 1);
          if (!common) assert.equal(await page.locator(`[data-vfx-effect="${fixture.expected[1]}"]`).count(), 1, "one arrival at reached endpoint");
          if (!common && viewport !== "phone-reduced") {
            assert.equal(await page.locator(`[data-vfx-effect="${fixture.expected[0]}"]`).count(), 1,
              "deposited residue finishes fading after arrival, without holding the token");
          }
          for (let n = 0; n < 15; n++) { await page.clock.runFor(100); await page.evaluate(() => undefined); }
          assert.equal(await page.locator("[data-vfx-cue], .board-effect-trail").count(), 0, "expired movement cleans up");
          await page.getByRole("button", { name: "Reconnect", exact: true }).click(); await page.clock.runFor(32);
          await page.getByRole("button", { name: "Snapshot", exact: true }).click(); await page.clock.runFor(1600);
          assert.equal(await page.locator("[data-vfx-cue], .board-effect-trail").count(), 0, "snapshot/reconnect never replays movement");
          observations.push({ viewport, recipient, id, distance, duration, samples, boardRect: await page.locator("[data-runtime-board]").boundingBox() });
          continue;
        }
        if (process.argv.includes("--cold-portrait")) {
          const token = page.locator(`[data-unit-id="${fixture.sourceId}"] .unit-deployment-token img`);
          assert.equal(await token.evaluate(img => img.complete && img.naturalWidth > 0), false);
          assert.equal(await page.locator("[data-unit-deployment], [data-commander-radius]").count(), 0, "unloaded portrait cannot leave a circle or aura playing alone");
          await page.locator(`[data-unit-id="${fixture.sourceId}"]`).click();
          assert.equal(await page.locator("[data-selection-vfx]").count(), 0, "cold selected portrait cannot leave its selection ring playing alone");
          assert(portraitWaiters.length > 0, "cold token request must actually be intercepted");
          if (process.argv.includes("--expired-portrait")) {
            for (let n = 0; n < 18; n++) { await page.clock.runFor(50); await page.evaluate(() => undefined); }
          }
          portraitReleased = true; for (const release of portraitWaiters) release();
          await token.evaluate(img => img.decode()); await page.evaluate(() => window.warmPortraits());
          await page.clock.runFor(16);
          if (process.argv.includes("--expired-portrait")) {
            assert.equal(await page.locator("[data-unit-deployment], [data-vfx-cue]").count(), 0, "late decode cannot replay an expired entrance");
            assert.equal(await page.locator("[data-commander-radius]").count(), 1, "persistent aura hydrates once its portrait is visible");
            observations.push({ viewport, recipient, id, lateDecodeSilent: true });
            continue;
          }
        }
        // No polling or extra frames: the first paint of a confirmed placement
        // must contain the token and its single attached deploy composition.
        if (id.startsWith("deploy.") && expected.length) {
          if (id === "deploy.genghisKhan") {
            assert.equal(await page.locator('[data-unit-status="commanderAura"]').count(), 2,
              "both adjacent allied tokens receive the flag badge; commander itself does not");
            assert.equal(await page.locator('[data-unit-status="commanderAura"] svg').count(), 2);
          }
          const firstFrame = await page.locator(`[data-unit-id="${fixture.sourceId}"]`).evaluate(el => {
            const composition = el.querySelector("[data-unit-deployment]");
            const token = el.querySelector(".unit-deployment-token");
            const portrait = token?.querySelector("img");
            window.runtimePortrait = portrait;
            const art = composition?.querySelector("[data-vfx-cue]");
            return { attached: Boolean(token && art && composition.contains(token)),
              decoded: Boolean(portrait?.complete && portrait.naturalWidth > 0),
              opacity: composition ? Number(getComputedStyle(composition).opacity) : 0,
              duration: composition?.style.animationDuration, artDuration: art?.style.getPropertyValue("--vfx-duration") };
          });
          assert(firstFrame.attached, `${id}: token and deploy share their first paint`);
          assert(firstFrame.decoded, `${id}: portrait pixels must be decoded, not just an empty img element`);
          assert(firstFrame.opacity >= 0.4, `${id}: token and light enter visibly in one composition`);
          assert.equal(firstFrame.duration, firstFrame.artDuration, `${id}: token and art share one duration`);
          assert.equal(await page.locator("[data-unit-deployment]").count(), 1);
          const reveal = await page.locator("[data-unit-deployment]").evaluate(el => {
            const token = el.querySelector(".unit-deployment-token");
            const duration = parseFloat(getComputedStyle(token).animationDuration) * 1000;
            const baseDelay = parseFloat(el.style.getPropertyValue("--vfx-delay")) || 0;
            const animations = el.getAnimations({ subtree: true });
            const sample = ms => {
              for (const animation of animations) { animation.pause(); animation.currentTime = baseDelay + ms; }
              return Number(getComputedStyle(token).opacity);
            };
            const result = { duration, start: sample(0), half: sample(duration / 2),
              lightHalf: Number(getComputedStyle(el.querySelector(".unit-deployment-light")).opacity), peak: sample(duration),
              lightPeak: Number(getComputedStyle(el.querySelector(".unit-deployment-light")).opacity), after: sample(duration + 30) };
            const elapsed = Date.now() - Number(el.querySelector("[data-vfx-start]").dataset.vfxStart);
            sample(elapsed);
            return result;
          });
          assert.equal(reveal.start, 0, `${id}: portrait starts transparent`);
          assert(reveal.half > .35 && reveal.half < .65, `${id}: smooth halfway reveal (${reveal.half})`);
          assert.equal(reveal.peak, 1, `${id}: portrait reaches full opacity with flash peak`);
          assert.equal(reveal.after, 1, `${id}: portrait stays fully visible after peak`);
          if (viewport !== "phone-reduced") assert(reveal.lightPeak > reveal.lightHalf, `${id}: light and portrait reach their peak together`);
          if (recipient === "P1") {
            await page.locator(`[data-unit-id="${fixture.sourceId}"]`).click();
            await page.locator("[data-selection-vfx]").waitFor({ state: "attached" });
            const selectedReveal = await page.locator("[data-selection-vfx]").evaluate(el => {
              const ring = el.firstElementChild;
              const token = document.querySelector("[data-unit-deployment] .unit-deployment-token");
              const duration = parseFloat(getComputedStyle(token).animationDuration) * 1000;
              const sample = ms => [token, ring].map(node => {
                for (const animation of node.getAnimations()) {
                  animation.pause(); animation.currentTime = Number(animation.effect.getTiming().delay) + ms;
                }
                return Number(getComputedStyle(node).opacity);
              });
              const result = { start: sample(0), half: sample(duration / 2), peak: sample(duration),
                pointerEvents: getComputedStyle(el).pointerEvents, mask: getComputedStyle(el).maskImage };
              const start = Number(document.querySelector("[data-unit-deployment] [data-vfx-start]").dataset.vfxStart);
              sample(Date.now() - start);
              return result;
            });
            assert.deepEqual(selectedReveal.start, [0, 0], `${id}: selection cannot precede the fading token`);
            assert(Math.abs(selectedReveal.half[0] - selectedReveal.half[1]) < .01);
            assert.deepEqual(selectedReveal.peak, [1, 1], `${id}: selection and token reveal together`);
            assert.equal(selectedReveal.pointerEvents, "none");
            assert(selectedReveal.mask.includes("radial-gradient"), `${id}: ring leaves portrait center clear`);
            await page.getByRole("button", { name: "Deselect", exact: true }).click();
          }
          if (process.argv.includes("--timeline") && recipient === "P1" && viewport === "desktop") {
            const cue = page.locator(`[data-unit-deployment] [data-vfx-cue]`);
            const start = await cue.evaluate(el => Number(el.dataset.vfxStart));
            for (const atMs of [16, 80, 180, 360, 560]) {
              const now = await page.evaluate(() => Date.now());
              await page.clock.runFor(Math.max(0, start + atMs - now)); await stepCss();
              assert.equal(await page.locator(`[data-unit-id="${fixture.sourceId}"] [data-unit-deployment]`).count(), 1);
              await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `timeline-${id}-${atMs}.png`) });
            }
          }
        }
        for (const key of expected) {
          try { await page.locator(`[data-vfx-effect="${key}"]`).first().waitFor({ state: "attached", timeout: 3000 }); }
          catch (error) {
            await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
            console.log(JSON.stringify({ viewport, recipient, id, errors, state: await page.evaluate(() => window.runtimeHarnessState), effects: await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => ({ effect: el.dataset.vfxEffect, start: el.dataset.vfxStart, now: Date.now() }))) }));
            throw error;
          }
        }
        const effects = await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => el.dataset.vfxEffect));
        for (const key of expected) {
          if (!effects.includes(key)) {
            await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
            console.log(JSON.stringify({ errors, state: await page.evaluate(() => window.runtimeHarnessState), effects, expected }));
          }
          assert(effects.includes(key), `${viewport}/${recipient}/${id}: ${key} missing (${effects})`);
        }
        const ids = await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => el.dataset.vfxCue));
        await page.getByRole("button", { name: "Duplicate", exact: true }).click(); await page.clock.runFor(1);
        assert.deepEqual(await page.locator("[data-vfx-cue]").evaluateAll(elements => elements.map(el => el.dataset.vfxCue)), ids);
        if (!expected.length) {
          assert(!effects.some(key => fixture.expected.includes(key)), `${id}: private placement must not leak art`);
          if (id === "outcome.rider.riverPerson") assert.equal(await page.locator("[data-vfx-contact], [data-vfx-effect=missShield]").count(), 0, "River movement cannot invent path strikes");
          observations.push({ viewport, recipient, id, effects, activeArt: null });
          continue;
        }
        const sample = page.locator(`[data-vfx-effect="${expected[0]}"]`).first();
        const phase = await sample.evaluate(el => ({ start: Number(el.dataset.vfxStart),
          duration: el.dataset.vfxContact ? Number(el.dataset.vfxContact) - Number(el.dataset.vfxStart)
            : Number(el.dataset.vfxTravelDuration) || parseFloat(el.style.getPropertyValue("--vfx-duration")), now: Date.now() }));
        await sample.locator(".vfx-sprite").evaluateAll(elements => Promise.all(elements.map(async el => {
          const src = el instanceof HTMLImageElement ? el.src : getComputedStyle(el).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
          if (!src) return;
          const image = new Image(); image.src = src; await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Undecoded live art ${src}`);
        })));
        const untilSample = Math.max(0, phase.start + phase.duration * (process.argv.includes("--projectiles-only") ? .25 : process.argv.includes("--melee-timeline") ? .6 : process.argv.includes("--swings-only") ? .85 : .5) - phase.now);
        if (process.argv.includes("--swings-only") || process.argv.includes("--projectiles-only") || process.argv.includes("--outcomes-only")) await page.clock.fastForward(untilSample);
        else await page.clock.runFor(untilSample);
        await stepCss();
        assert(await sample.evaluate(el => parseFloat(getComputedStyle(el).opacity) > 0), `${id}: active phase must be visible`);
        const activeArt = await sample.evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(),
          opacity: getComputedStyle(el).opacity, children: [...el.querySelectorAll(".vfx-artwork")].map(child => ({
            rect: child.getBoundingClientRect().toJSON(), opacity: getComputedStyle(child).opacity,
            image: getComputedStyle(child).backgroundImage, position: getComputedStyle(child).backgroundPositionX,
          })) }));
        assert(activeArt.children.length > 0, `${id}: active cue must contain decoded artwork`);
        if (process.argv.includes("--signatures-only")) {
          assert.equal(await page.locator('[data-vfx-effect="zoroSantoryu"]').count(), 1, "Zoro retains one native release on either result");
          assert.equal(await page.locator('[data-vfx-effect="basicSlash"]').count(), 0, "no generic slash over native Santoryu");
          assert.equal(await page.locator('[data-vfx-effect="expansion.zoro.attack_impact"]').count(), id.endsWith(".hit") ? 1 : 0);
          assert.equal(await page.locator('[data-vfx-effect="missShield"]').count(), id.endsWith(".miss") ? 1 : 0);
          await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `signature-${viewport}-${recipient}-${id}.png`) });
        }
        if (process.argv.includes("--swings-only")) assert(activeArt.children.some(art => Number(art.opacity) > .1), `${id}: artwork itself must be visible`);
        let slashFrames, projectileFrames;
        if (process.argv.includes("--outcomes-only")) {
          const attacks = fixture.recipients[recipient].events.filter(event => event.type === "attackResolved");
          const releases = await page.locator("[data-vfx-contact]").evaluateAll(elements => elements.map(el => ({
            id: el.dataset.vfxCue, contact: Number(el.dataset.vfxContact), start: Number(el.dataset.vfxStart), effect: el.dataset.vfxEffect,
          })).sort((a, b) => a.contact - b.contact));
          assert.equal(releases.length, attacks.length, `${id}: one slash per accepted attack`);
          assert.equal(new Set(releases.map(release => release.id)).size, attacks.length);
          for (let n = 0; n < releases.length; n++) {
            const release = releases[n];
            const stroke = page.locator(`[data-vfx-cue="${release.id}"] .vfx-melee-stroke`);
            await page.clock.fastForward(Math.max(0, release.contact - 1 - await page.evaluate(() => Date.now()))); await stepCss();
            assert(await stroke.evaluate(el => Number(getComputedStyle(el).opacity) > .01), `${id}: the gesture is visible even on miss/protection`);
            await page.clock.fastForward(Math.max(0, release.contact + 150 - await page.evaluate(() => Date.now()))); await stepCss();
            const outcomes = await page.locator("[data-vfx-cue]:not([data-vfx-contact])").evaluateAll((elements, contact) => elements
              .filter(el => Number(el.dataset.vfxStart) === contact && Number(getComputedStyle(el).opacity) > .01)
              .map(el => ({ effect: el.dataset.vfxEffect, tint: el.dataset.vfxTint, filter: getComputedStyle(el.querySelector(".vfx-artwork")).filter })), release.contact);
            assert(outcomes.length > 0, `${id}: the confirmed contact result paints`);
            assert(!outcomes.some(outcome => outcome.effect === "combatMiss"));
            if (!attacks[n].hit) assert(!outcomes.some(outcome => outcome.effect === "combatHit" || outcome.effect.endsWith(".attack_impact")), `${id}: miss cannot paint damage`);
            if (id.startsWith("outcome.miss.")) {
              assert.equal(outcomes.length, 1); assert.equal(outcomes[0].effect, "missShield");
              assert(outcomes[0].filter.includes("hue-rotate"), `${id}: hero tint reaches the painted shield`);
            } else if (!id.includes(".rider.")) assert(!outcomes.some(outcome => outcome.effect === "missShield"), `${id}: special defense replaces the generic guard`);
            await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `outcome-${viewport}-${recipient}-${id}-${n}.png`) });
          }
        }
        if (process.argv.includes("--projectiles-only")) {
          const event = fixture.recipients[recipient].events.find(event => event.type === "attackResolved");
          const source = await page.locator(`[data-unit-id="${fixture.sourceId}"]`).boundingBox();
          const target = await page.locator(`[data-unit-id="${event.defenderId}"]`).boundingBox();
          assert(await sample.evaluate(el => el.classList.contains("vfx-geometry-projectile")), `${id}: release is a projectile`);
          assert.equal(await sample.getAttribute("data-vfx-layer"), "projectile", `${id}: projectile paints above tokens`);
          assert.equal(await page.locator("[data-melee-lunge]").count(), 0, `${id}: ranged release never lunges like melee`);
          const poses = [];
          for (const fraction of [.25, .5, .8]) {
            await page.clock.fastForward(Math.max(0, Math.round(phase.start + phase.duration * fraction - await page.evaluate(() => Date.now()))));
            await stepCss();
            const pose = await sample.evaluate(el => {
              const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, opacity: Number(css.opacity) };
            });
            const progress = viewport === "phone-reduced" ? 0 : fraction;
            const currentSource = await page.locator(`[data-unit-id="${fixture.sourceId}"]`).boundingBox();
            const currentTarget = await page.locator(`[data-unit-id="${event.defenderId}"]`).boundingBox();
            const expectedX = currentSource.x + currentSource.width / 2 + (currentTarget.x - currentSource.x) * progress;
            const expectedY = currentSource.y + currentSource.height / 2 + (currentTarget.y - currentSource.y) * progress;
            assert(Math.hypot(pose.x - expectedX, pose.y - expectedY) < source.width * .04, `${id}: actual flight follows source-to-target geometry at ${fraction}: ${JSON.stringify({pose, expectedX, expectedY, duration: phase.duration, now: await page.evaluate(() => Date.now()), start: phase.start})}`);
            assert(pose.opacity > .01, `${id}: projectile is visible during flight`);
            poses.push({ fraction, ...pose });
            if ((recipient === "P1" || recipient === "P2" && fraction === .5) && viewport !== "phone-reduced") await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `projectile-${viewport}-${recipient === "P1" ? "" : `${recipient}-`}${id}-${fraction}.png`) });
          }
          projectileFrames = poses;
          const impact = page.locator(`[data-vfx-effect="expansion.${id.split(".")[1]}.attack_impact"]`);
          if (!event.hit) assert.equal(await impact.count(), 0, `${id}: miss still flies but has no damage impact`);
          if (await impact.count()) {
            assert.equal(await impact.evaluate(el => Number(el.dataset.vfxStart)), phase.start + phase.duration, `${id}: impact follows flight`);
            assert(await impact.evaluate(el => Number(getComputedStyle(el).opacity) === 0), `${id}: no early hit flash`);
          }
        }
        if (process.argv.includes("--swings-only")) {
          assert.equal(await page.locator(`[data-vfx-effect="${expected[0]}"]`).count(), 1, `${id}: one weapon release`);
          assert.equal(phase.duration, viewport === "phone-reduced" ? 70 : 420, `${id}: release shares the combat window`);
          const pose = await sample.evaluate(el => {
            const css = getComputedStyle(el), matrix = new DOMMatrixReadOnly(css.transform);
            const root = el.closest(".vfx-board-root").getBoundingClientRect();
            const [ox, oy] = css.transformOrigin.split(" ").map(parseFloat);
            return { x: root.x + parseFloat(el.style.left) + ox, y: root.y + parseFloat(el.style.top) + oy,
              width: parseFloat(el.style.width), height: parseFloat(el.style.height),
              matrix: [matrix.a, matrix.b, matrix.c, matrix.d], angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI, origin: [ox, oy], pointer: css.pointerEvents,
              layer: el.dataset.vfxLayer };
          });
          const sourceRect = await page.locator(`[data-unit-id="${fixture.sourceId}"]`).boundingBox();
          const attack = fixture.recipients[recipient].events.find(event => event.type === "attackResolved");
          const targetRect = await page.locator(`[data-unit-id="${attack.defenderId}"]`).boundingBox();
          assert(Math.abs(pose.x - targetRect.x - targetRect.width / 2) < 1 &&
            Math.abs(pose.y - targetRect.y - targetRect.height / 2) < 1, `${id}: slash crosses the confirmed defender portrait`);
          const blade = await sample.locator(".vfx-melee-art").evaluate(el => ({ size: parseFloat(el.style.width), left: parseFloat(el.style.left) }));
          assert(Math.abs(blade.size / sourceRect.width - 1.3) < .01, `${id}: slash fits the target cell`);
          const lunge = page.locator(`[data-unit-id="${fixture.sourceId}"] .unit-melee-content`);
          if (viewport === "phone-reduced") assert.equal(await lunge.getAttribute("data-melee-lunge"), null, `${id}: reduced motion has no token thrust`);
          else {
            assert.equal(await lunge.getAttribute("data-melee-lunge"), "true", `${id}: adjacent melee release leans toward defender`);
            const matrix = await lunge.evaluate(el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: m.e, y: m.f }; });
            const dx = targetRect.x + targetRect.width / 2 - sourceRect.x - sourceRect.width / 2;
            const dy = targetRect.y + targetRect.height / 2 - sourceRect.y - sourceRect.height / 2;
            assert(matrix.x * dx + matrix.y * dy > 0, `${id}: lunge faces the opponent in both orientations`);
            assert(Math.hypot(matrix.x, matrix.y) < sourceRect.width * .25, `${id}: restrained thrust stays below quarter cell`);
          }
          const flip = recipient === "P2" ? -1 : 1;
          const expectedAngle = Math.atan2(-(attack.targetCell.row - attack.sourceCell.row) * flip,
            (attack.targetCell.col - attack.sourceCell.col) * flip) * 180 / Math.PI;
          const octant = ((Math.round(expectedAngle / 45) % 8) + 8) % 8, q = Math.SQRT1_2;
          const expectedMatrices = [[1, 0, 0, 1], [q, q, -q, q], [1, 0, 0, 1], [-q, q, q, q],
            [-1, 0, 0, 1], [-q, -q, -q, q], [1, 0, 0, -1], [q, -q, q, q]];
          pose.matrix.forEach((value, axis) => assert(Math.abs(value - expectedMatrices[octant][axis]) < .001,
            `${id}: screen direction ${octant} uses the requested mirrored sweep, including opponent board rotation`));
          assert.equal(pose.pointer, "none"); assert.equal(pose.layer, "impact");
          const impact = page.locator(`[data-vfx-effect="expansion.${id.split(".")[1]}.attack_impact"]`);
          assert.equal(await sample.getAttribute("data-vfx-hit"), String(attack.hit));
          if (!attack.hit) {
            assert.equal(await impact.count(), 0, `${id}: missed slash cannot create a damage impact`);
            assert(await sample.locator(".vfx-target-cut-miss").count(), `${id}: missed stroke still reaches the guard`);
          }
          if (await impact.count()) {
            assert.equal(await impact.evaluate(el => Number(el.dataset.vfxStart)), phase.start + phase.duration,
              `${id}: impact occurs at the confirmed result`);
            assert(await impact.evaluate(el => Number(getComputedStyle(el).opacity) === 0), `${id}: no early damage flash`);
          }
          const stroke = sample.locator(".vfx-melee-stroke");
          const authored = fixture.meleeArtwork[expected[0]];
          assert(authored, `${id}: actual hero strip has a reviewed authored orientation`);
          assert.equal(await stroke.getAttribute("data-vfx-melee-reveal"), authored.revealFrom);
          const artworkPose = await sample.locator(".vfx-melee-art").evaluate(el => {
            const css = getComputedStyle(el), matrix = new DOMMatrixReadOnly(css.transform);
            return { matrix: [matrix.a, matrix.b, matrix.c, matrix.d], origin: css.transformOrigin };
          });
          const radians = authored.rotationDeg * Math.PI / 180;
          [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians)].forEach((value, axis) =>
            assert(Math.abs(value - artworkPose.matrix[axis]) < .001, `${id}: per-asset correction reaches the painted artwork`));
          const reflection = await stroke.evaluate(el => {
            const css = getComputedStyle(el), matrix = new DOMMatrixReadOnly(css.transform);
            return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, origin: css.transformOrigin };
          });
          assert.deepEqual([reflection.a, reflection.b, reflection.c, reflection.d], [1, 0, 0, 1],
            `${id}: canonical reveal stays independent of artwork normalization and directional pose`);
          assert(reflection.origin.split(" ").every(value => Math.abs(parseFloat(value) - blade.size / 2) < .02),
            `${id}: reflection stays centered on defender`);
          assert(await stroke.evaluate(el => Number(getComputedStyle(el).opacity) > .01), `${id}: moving weapon must actually paint during windup`);
          assert.equal(await page.locator("[data-unit-melee]").count(), 0, `${id}: slash is not held as a weapon by the attacker`);
          if (process.argv.includes("--melee-timeline") && viewport !== "phone-reduced") {
            const poses = [];
            for (const fraction of [.6, .8, 1, 1 + 40 / phase.duration]) {
              await page.clock.fastForward(Math.max(0, Math.round(phase.start + phase.duration * fraction - await page.evaluate(() => Date.now()))));
              await stepCss();
              poses.push({ fraction, stroke: await stroke.evaluate(el => ({ clip: getComputedStyle(el).clipPath,
                opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })) });
              if (recipient === "P1") await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `cut-${viewport}-${id}-${fraction.toFixed(2)}.png`) });
              const captureBoard = await page.locator("[data-runtime-board]").boundingBox();
              const captureTarget = await page.locator(`[data-unit-id="${attack.defenderId}"]`).boundingBox();
              poses[poses.length - 1].target = { x: captureTarget.x - captureBoard.x + captureTarget.width / 2,
                y: captureTarget.y - captureBoard.y + captureTarget.height / 2 };
            }
            assert(new Set(poses.map(pose => JSON.stringify(pose.stroke))).size === 4, `${id}: slash draws across the defender and dissipates`);
            assert(poses.every(pose => pose.stroke.transform === "matrix(1, 0, 0, 1, 0, 0)"), `${id}: reflection stays fixed while the cut is drawn`);
            slashFrames = poses;
          }
        }
        if (await sample.locator(".vfx-wake-fragment").count()) assert(await sample.locator(".vfx-wake-fragment")
          .evaluateAll(elements => elements.some(el => Number(getComputedStyle(el).opacity) > .02)),
          `${id}: wake actually paints a passed position at movement midpoint`);
        if (await page.locator('[data-commander-radius]').count() || process.argv.includes("--commander-only")) {
          const auras = await page.locator('[data-commander-radius]').evaluateAll(fields => fields.map(el => ({
            width: el.getBoundingClientRect().width, expected: parseFloat(el.style.width),
            cells: el.querySelectorAll("[data-aura-cell]").length,
            animation: getComputedStyle(el.querySelector(".commander-aura-orbit")).animationName,
            artOpacity: Number(getComputedStyle(el.querySelector(".commander-aura-artwork")).opacity),
            cellOpacity: Number(el.querySelector("[data-aura-cell]").getAttribute("fill-opacity")),
          })));
          assert(auras.length > 0, `${id}: current commander state renders its aura`);
          for (const aura of auras) {
            assert(Math.abs(aura.width - aura.expected) < 1); assert(aura.cells >= 3 && aura.cells <= 8);
            assert.equal(aura.animation, viewport === "phone-reduced" ? "none" : "commander-aura-orbit");
            assert(aura.artOpacity > 0 && aura.artOpacity <= .4); assert(aura.cellOpacity <= .006);
          }
        }
        if (process.argv.includes("--review-samples") || (recipient === "P1" && (viewport === "desktop" || id.startsWith("expansion.") || process.argv.includes("--swings-only"))))
          await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `${viewport}-${recipient === "P1" ? "" : `${recipient}-`}${id}.png`) });
        const boardRect = await page.locator("[data-runtime-board]").boundingBox();
        const sourceContent = page.locator(`[data-unit-id="${fixture.sourceId}"] .board-unit-content`);
        assert.equal(await sourceContent.count(), 1, `${id}: source content remains mounted after flight`);
        const unitRect = await sourceContent.boundingBox();
        if (process.argv.includes("--aura-live")) {
          for (let n = 0; n < 20; n++) { await page.clock.runFor(50); await page.evaluate(() => undefined); }
          const field = page.locator("[data-commander-radius]").first();
          let previousOffset;
          for (const atMs of [0, 1400, 2800]) {
            const offset = await field.evaluate((el, atMs) => {
              for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = atMs; }
              const orbit = el.querySelector(".commander-aura-orbit");
              const center = new DOMPoint(150, 150).matrixTransform(orbit.getScreenCTM());
              const svg = el.querySelector("svg").getBoundingClientRect();
              if (Math.abs(center.x - (svg.x + svg.width / 2)) > 1 || Math.abs(center.y - (svg.y + svg.height / 2)) > 1)
                throw new Error("Original aura artwork must rotate around the source cell center");
              return getComputedStyle(orbit).transform;
            }, atMs);
            if (previousOffset !== undefined) {
              if (viewport === "phone-reduced") assert.equal(offset, previousOffset);
              else assert.notEqual(offset, previousOffset, "original aura artwork must move continuously around its fixed center");
            }
            previousOffset = offset;
            await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `aura-live-${id}-${atMs}.png`) });
          }
        }
        let arrivalArt = null;
        if (process.argv.includes("--staging-only") && id.startsWith("move.") && expected.some(key => key.endsWith("move_arrive"))) {
          assert.equal(await page.locator(".board-effect-trail").count(), 0, `${id}: thematic wake replaces the generic line`);
          const landing = page.locator('[data-vfx-effect$=".move_arrive"]').last();
          const arrival = await landing.evaluate(el => ({ start: Number(el.dataset.vfxStart),
            duration: parseFloat(el.style.getPropertyValue("--vfx-duration")), now: Date.now() }));
          await page.clock.runFor(Math.max(0, arrival.start + arrival.duration / 2 - arrival.now));
          await landing.locator(".vfx-sprite").evaluateAll(elements => Promise.all(elements.map(async el => {
            const image = new Image(); image.src = getComputedStyle(el).backgroundImage.slice(5, -2); await image.decode();
          })));
          await stepCss();
          assert(await landing.evaluate(el => parseFloat(getComputedStyle(el).opacity) > 0));
          arrivalArt = { rect: await landing.boundingBox(), unitRect: await page.locator(`[data-unit-id="${fixture.sourceId}"] .board-unit-content`).boundingBox() };
          if (recipient === "P1" && viewport === "desktop") await page.locator("[data-runtime-board]").screenshot({ path: path.join(output, `${viewport}-${id}.arrival.png`) });
        }
        if (recipient === "spectator" || process.argv.includes("--swings-only") || process.argv.includes("--projectiles-only") || process.argv.includes("--outcomes-only") || process.argv.includes("--signatures-only")) {
          const remaining = await page.locator("[data-vfx-cue]").evaluateAll(elements => Math.max(0, ...elements.map(el =>
            Number(el.dataset.vfxStart) + parseFloat(el.style.getPropertyValue("--vfx-duration")) - Date.now())));
          // React effects must commit between timeout ticks. One large fake
          // clock jump batches updates unlike a running browser event loop.
          if (process.argv.includes("--swings-only") || process.argv.includes("--projectiles-only") || process.argv.includes("--outcomes-only") || process.argv.includes("--signatures-only")) {
            await page.clock.fastForward(remaining + 250); await page.evaluate(() => undefined);
          } else for (let left = remaining + 250; left > 0; left -= 50) {
            await page.clock.runFor(Math.min(50, left));
            await page.evaluate(() => undefined);
          }
          await page.locator("[data-vfx-cue]").first().waitFor({ state: "detached" });
          assert.equal(await page.locator("[data-vfx-cue]").count(), 0, `${id}: expires without reconnect`);
          if (process.argv.includes("--swings-only")) assert.equal(await page.locator("[data-melee-lunge]").count(), 0, `${id}: token returns without a lingering pose`);
          if (id.startsWith("deploy.")) assert(await page.locator(`[data-unit-id="${fixture.sourceId}"] .unit-deployment-token img`)
            .evaluate(img => img === window.runtimePortrait), `${id}: cleanup preserves the exact portrait element`);
        }
        await page.getByRole("button", { name: "Reconnect", exact: true }).click(); await page.clock.runFor(32);
        await page.locator("[data-vfx-cue]").first().waitFor({ state: "detached" });
        assert.equal(await page.locator("[data-vfx-cue]").count(), 0);
        if (process.argv.includes("--swings-only")) assert.equal(await page.locator("[data-melee-lunge]").count(), 0, `${id}: reconnect cancels token pose`);
        observations.push({ viewport, recipient, id, effects, activeArt, arrivalArt, boardRect, unitRect, selectionRect, slashFrames, projectileFrames });
      }
    }
  }
  const diagnostics = await page.evaluate(() => window.expansionDiagnostics());
  assert(diagnostics.image.estimatedPixelBytes <= diagnostics.image.budgetBytes);
  assert.deepEqual(errors, []);
  const reportName = process.argv.includes("--normalization-only") && process.argv.includes("--melee-timeline") ? "normalized-timeline-report.json" : process.argv.includes("--normalization-only") ? "melee-normalization-report.json" : process.argv.includes("--reference-facing") ? "direction-reference-report.json" : process.argv.includes("--facing-only") ? "direction-report.json" : process.argv.includes("--signatures-only") ? "signature-report.json" : process.argv.includes("--outcome-projectiles") ? "outcome-projectiles-report.json" : process.argv.includes("--outcomes-only") ? "outcomes-report.json" : process.argv.includes("--projectile-contrast") ? "projectiles-contrast-report.json" : process.argv.includes("--projectiles-only") ? "projectiles-report.json" : process.argv.includes("--melee-timeline") ? "melee-timeline-report.json" : process.argv.includes("--swings-only") ? "swings-report.json" : process.argv.includes("--long-only") ? "long-movement-report.json" : process.argv.includes("--cold-portrait") ? process.argv.includes("--expired-portrait") ? "expired-portrait-report.json" : "cold-portrait-report.json" : process.argv.includes("--snapshot-first") ? "snapshot-first-report.json" : process.argv.includes("--commander-only") ? "commander-report.json" : process.argv.includes("--deploy-only") ? "deploy-report.json" : process.argv.includes("--staging-only") ? "staging-report.json" : process.argv.includes("--review-samples") ? "review-samples-report.json" : process.argv.includes("--signals-only") ? "signals-report.json" : "report.json";
  writeFileSync(path.join(output, reportName), JSON.stringify({ observations, diagnostics, errors, manualTwoPlayerGame: false,
    source: "Rules-produced recipient projections through the actual Board, shared playback and VFX hooks" }, null, 2));
  console.log(`Expansion runtime Board smoke passed: ${observations.length} scenarios; selection, duplicate, reconnect, P1/P2/spectator, desktop/phone reduced motion.`);
} finally {
  await browser?.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else server.kill("SIGTERM");
}
