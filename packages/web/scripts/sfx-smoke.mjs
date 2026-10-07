// DB-free browser smoke: real Web Audio and authoritative test-room transport.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const web = "http://127.0.0.1:5205",
  api = "http://127.0.0.1:3125";
const output = path.join(root, "packages/web/test-results/sfx");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
assert(executablePath, "A local Chromium browser is required");
const children = [];
let browser, page;
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      child.output = ((child.output ?? "") + chunk.toString()).slice(-2000);
    });
}
async function wait(check, description) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const failed = children.find((child) => child.exitCode !== null);
    if (failed) throw new Error(failed.output);
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${description}`);
}
async function ready(url) {
  await wait(async () => {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  }, url);
}
try {
  start(
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/web/scripts/play-lobby-server.ts"],
    root,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "3125",
      ENABLE_TEST_ROOMS: "true",
      WEB_ORIGIN: web,
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
  );
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5205",
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3125/ws" },
  );
  await Promise.all([ready(api + "/health"), ready(web)]);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    ignoreDefaultArgs: ["--mute-audio"],
    args: ["--autoplay-policy=user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("FATE_LANGUAGE", "en");
    localStorage.setItem("theme", "dark");
    const observations = (window.__audio = {
      contexts: [],
      gains: [],
      sources: [],
      decodes: 0,
      fetches: [],
      currentCue: null,
      connections: new WeakMap(),
    });
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        observations.contexts.push(this);
      }
    };
    const decode = NativeContext.prototype.decodeAudioData;
    NativeContext.prototype.decodeAudioData = function (...args) {
      observations.decodes++;
      return decode.apply(this, args);
    };
    const createGain = NativeContext.prototype.createGain;
    NativeContext.prototype.createGain = function (...args) {
      const gain = createGain.apply(this, args);
      observations.gains.push(gain);
      return gain;
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (node, ...args) {
      observations.connections.set(this, node);
      return connect.call(this, node, ...args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      let node = this;
      const route = [];
      while (node && route.length < 6) {
        route.push(node.constructor.name);
        node = observations.connections.get(node);
      }
      observations.sources.push({
        key: observations.currentCue,
        state: this.context.state,
        frames: this.buffer?.length,
        route,
        at: performance.now(),
      });
      return start.apply(this, args);
    };
    const fetchAsset = window.fetch;
    window.fetch = function (url, ...args) {
      if (String(url).includes(".wav")) observations.fetches.push(String(url));
      return fetchAsset.call(this, url, ...args);
    };
  });
  await context.route(api + "/api/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }),
    }),
  );
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(web);
  await page.getByTestId("app-shell").waitFor();
  assert.equal(
    await page.evaluate(() => window.__audio.contexts.length),
    0,
    "landing does not instantiate/preload audio",
  );
  await page.evaluate(async () => {
    const { sfxPlayer } = await import("/src/features/sfx/sfxPlayer.ts");
    const play = sfxPlayer.play.bind(sfxPlayer);
    sfxPlayer.play = (cue, options) => {
      window.__audio.currentCue = typeof cue === "object" ? cue?.key : cue;
      try {
        return play(cue, options);
      } finally {
        window.__audio.currentCue = null;
      }
    };
  });
  // Trusted pointer interaction goes through the actual shell gesture handler.
  await page.locator("main").click({ position: { x: 10, y: 10 } });
  await page.waitForFunction(
    () => window.__audio.contexts[0]?.state === "running" && window.__audio.decodes === 4,
  );
  assert.equal(
    await page.evaluate(() => window.__audio.sources.length),
    0,
    "unlock never plays a fake source",
  );
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/store.ts");
    window.__store = useGameStore;
    await useGameStore.getState().joinRoom({ mode: "create", role: "P1", roomMode: "test" });
  });
  await page.getByTestId("sound-controls").waitFor();
  await page.waitForFunction(() => window.__audio.decodes === 17);
  async function command(command) {
    const revision = await page.evaluate(() => window.__store.getState().roomMeta.revision);
    await page.evaluate(
      (command) => window.__store.getState().sendTestRoomCommand(command),
      command,
    );
    await page.waitForFunction(
      (revision) => window.__store.getState().roomMeta.revision > revision,
      revision,
    );
  }
  await command({
    type: "debugSpawnUnit",
    heroId: "frisk",
    owner: "P1",
    coord: { col: 4, row: 3 },
  });
  await command({
    type: "debugSpawnUnit",
    heroId: "frisk",
    owner: "P2",
    coord: { col: 4, row: 4 },
  });
  const ids = await page.evaluate(() => {
    const units = Object.values(window.__store.getState().roomState.units);
    return {
      attacker: units.find((unit) => unit.owner === "P1").id,
      target: units.find((unit) => unit.owner === "P2").id,
    };
  });
  // Observe the real board rather than invoking the presentation mappers.
  await page.evaluate(() => {
    const combat = (window.__combat = { rolls: [], sprites: [], hp: [], states: [] });
    const seenRolls = new Set(), seenSprites = new Set();
    let previousHp, previousState;
    const observe = () => {
      const roll = document.querySelector("[data-combat-cue]");
      if (roll && !seenRolls.has(roll.dataset.combatCue)) {
        seenRolls.add(roll.dataset.combatCue);
        combat.rolls.push({ id: roll.dataset.combatCue,
          dice: [...roll.querySelectorAll("[data-combat-die]")].map(die => Number(die.dataset.combatDie)), at: performance.now() });
      }
      for (const sprite of document.querySelectorAll("[data-vfx-cue]")) {
        if (seenSprites.has(sprite.dataset.vfxCue)) continue;
        const kind = ["combatHit", "combatMiss", "unitDeath"].find(kind => sprite.querySelector(`.vfx-${kind}`));
        if (!kind) continue;
        seenSprites.add(sprite.dataset.vfxCue);
        combat.sprites.push({ id: sprite.dataset.vfxCue, kind, startsAt: Number(sprite.dataset.vfxStart),
          rect: { left: sprite.style.left, top: sprite.style.top } });
      }
      const target = document.querySelector('[data-unit-visual-state][data-owner="P2"]');
      const hp = target?.closest("button")?.querySelector(".board-outcome .h-full")?.style.width;
      if (hp && hp !== previousHp) {
        combat.hp.push({ width: hp, at: performance.now() });
        previousHp = hp;
      }
      const state = target?.dataset.unitVisualState;
      if (state && state !== previousState) {
        combat.states.push({ state, at: performance.now() });
        previousState = state;
      }
    };
    new MutationObserver(observe).observe(document.body, { childList: true, subtree: true, attributes: true });
    observe();
  });
  async function count(key) {
    return page.evaluate(
      (key) => window.__audio.sources.filter((source) => source.key === key).length,
      key,
    );
  }
  async function attack(values) {
    await command({ type: "debugSetDiceQueue", values });
    await page.evaluate(
      ({ attacker, target }) =>
        window.__store
          .getState()
          .sendAction({ type: "attack", attackerId: attacker, defenderId: target }),
      ids,
    );
    await page.waitForFunction(
      () => window.__store.getState().roomState.pendingRoll?.kind === "attack_attackerRoll",
    );
    const before = await count("common.combat.diceRoll");
    const rollsBefore = await page.evaluate(() => window.__combat.rolls.length);
    // Actual Roll button produces only UI click; server result then produces dice.
    await page.getByTestId("pending-roll-overlay").getByRole("heading", { name: "Attack Roll", exact: true }).waitFor();
    const rollButton = page.getByRole("button", { name: "Roll 2d6", exact: true });
    await rollButton.waitFor();
    assert.equal(await rollButton.count(), 1);
    await rollButton.click();
    await page.waitForFunction(
      () => window.__store.getState().roomState.pendingRoll?.kind === "attack_defenderRoll",
    );
    await wait(
      async () => (await count("common.combat.diceRoll")) > before,
      "authoritative attacker dice audio",
    );
    await wait(async () => (await page.evaluate(() => window.__combat.rolls.length)) > rollsBefore,
      "actual attacker dice display");
    assert.deepEqual(await page.evaluate(() => window.__combat.rolls.at(-1).dice), values.slice(0, 2));
    await page.screenshot({ path: path.join(output, `combat-attacker-${rollsBefore}.png`) });
    await page.getByTestId("pending-roll-overlay").getByRole("heading", { name: "Defense Roll", exact: true }).waitFor();
    await page.getByRole("button", { name: "Roll 2d6", exact: true }).click();
    await page.waitForFunction(() => !window.__store.getState().roomState.pendingRoll);
    await wait(
      async () => (await count("common.combat.diceRoll")) >= before + 2,
      "authoritative defender dice audio",
    );
    await wait(async () => (await page.evaluate(() => window.__combat.rolls.length)) === rollsBefore + 2,
      "ordered defender dice display");
    assert.deepEqual(await page.evaluate(() => window.__combat.rolls.at(-1).dice), values.slice(2, 4));
    await page.screenshot({ path: path.join(output, `combat-defender-${rollsBefore}.png`) });
  }
  await attack([5, 4, 1, 1]);
  await wait(async () => (await count("common.combat.hit")) === 1, "hit audio");
  await wait(async () => (await page.evaluate(() => window.__combat.hp.length)) > 1, "staged HP decrease");
  const firstImpact = await page.evaluate(() => ({
    sound: window.__audio.sources.find(source => source.key === "common.combat.hit"),
    sprite: window.__combat.sprites.find(sprite => sprite.kind === "combatHit"),
    hp: window.__combat.hp,
    states: window.__combat.states,
    epoch: performance.timeOrigin,
  }));
  assert(firstImpact.sprite, "one registered generic hit sprite");
  assert(Math.abs(firstImpact.sound.at + firstImpact.epoch - firstImpact.sprite.startsAt) < 100,
    "real audio source and sprite share the impact timestamp");
  assert(firstImpact.hp[1].at > firstImpact.sound.at, "HP fill changes after impact");
  assert(firstImpact.states.some(item => item.state === "takingDamage"));
  assert.equal(await count("common.combat.miss"), 0);
  assert((await count("common.ui.buttonClick")) >= 1);
  // Re-delivering the exact confirmed batch cannot play again.
  const beforeDuplicate = await page.evaluate(() => window.__audio.sources.length);
  await page.evaluate(() => {
    const state = window.__store.getState();
    state.applyActionResult(state.events, state.lastEventRevision, state.eventStreamId);
  });
  assert.equal(await page.evaluate(() => window.__audio.sources.length), beforeDuplicate);
  await command({ type: "debugResetActions", unitId: ids.attacker });
  await wait(async () => await page.locator('[data-unit-visual-state="idle"][data-owner="P2"]').count() === 1,
    "first HP playback completes");
  const hpBeforeMiss = await page.evaluate(() => window.__combat.hp.length);
  await attack([1, 2, 5, 6]);
  await wait(async () => (await count("common.combat.miss")) === 1, "miss audio");
  assert.equal(await page.evaluate(() => window.__combat.hp.length), hpBeforeMiss, "miss does not change HP fill");
  assert.equal(await page.evaluate(() => window.__combat.sprites.filter(sprite => sprite.kind === "combatMiss").length), 1);
  await command({ type: "debugResetActions", unitId: ids.attacker });
  await command({ type: "debugSetHp", unitId: ids.target, hp: 1 });
  assert.equal(await count("common.combat.death"), 0, "state changes do not invent death cues");
  await attack([5, 4, 1, 1]);
  await wait(async () => (await count("common.combat.death")) === 1, "final death audio");
  assert.equal(await page.evaluate(() => window.__combat.sprites.filter(sprite => sprite.kind === "unitDeath").length), 1);
  await page.getByTestId("battle-end-view-board").click();
  const volume = page.getByRole("slider", { name: "Master volume", exact: true });
  await volume.press("Home");
  for (let i = 0; i < 10; i++) await volume.press("ArrowRight");
  assert.equal(await page.evaluate(() => window.__audio.gains[0].gain.value), 0.5);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__audio.gains[0].gain.value), 0);
  const mutedCount = await page.evaluate(() => window.__audio.sources.length);
  await page.evaluate(async () => {
    const { playUiSfx } = await import("/src/features/sfx/uiSfx.ts");
    playUiSfx();
  });
  assert.equal(await page.evaluate(() => window.__audio.sources.length), mutedCount);
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__audio.gains[0].gain.value), 0.5);
  assert.equal(
    await page.evaluate(() => window.__audio.sources.length),
    mutedCount,
    "unmute never replays a skipped cue",
  );
  const native = await page.evaluate(() => ({
    decodes: window.__audio.decodes,
    fetches: window.__audio.fetches.length,
    uniqueUrls: new Set(window.__audio.fetches).size,
    sources: window.__audio.sources,
  }));
  assert.equal(native.decodes, 17);
  assert.equal(native.fetches, 17);
  assert.equal(native.uniqueUrls, 17);
  for (const source of native.sources) {
    assert.equal(source.state, "running");
    assert(source.frames > 0);
    assert.deepEqual(source.route, [
      "AudioBufferSourceNode",
      "GainNode",
      "GainNode",
      "GainNode",
      "AudioDestinationNode",
    ]);
  }
  // Reload/reconnect snapshot is silent, but settings persist and core cache loads once per app.
  await page.reload();
  await page.getByTestId("sound-controls").waitFor();
  await page.waitForFunction(() => window.__store === undefined && window.__audio.decodes === 13);
  assert.equal(await page.evaluate(() => window.__audio.sources.length), 0);
  assert.equal(await volume.inputValue(), "0.5");
  await page.getByTestId("battle-end-view-board").click();
  await page.screenshot({ path: path.join(output, "game-sound-controls.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile sound controls must not overflow");
  await page.getByTestId("sound-controls").waitFor();
  await page.screenshot({ path: path.join(output, "game-sound-controls-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  const report = {
    verified: [
      "gesture unlock without dummy source",
      "17 native WAV decodes",
      "UI Roll click",
      "confirmed dice",
      "hit",
      "miss",
      "final death",
      "duplicate silence",
      "master mute/volume",
      "persisted settings",
      "silent reconnect",
      "actual attacker/defender dice UI order",
      "registered generic hit/miss/death sprites",
      "shared impact timestamp in real Web Audio and CSS sprite playback",
      "HP fill decreases after impact; miss leaves it unchanged",
    ],
    native,
    manualListening: false,
  };
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page) {
    fs.writeFileSync(
      path.join(output, "failure-dom.txt"),
      await page.locator("body").ariaSnapshot(),
    );
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  }
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
