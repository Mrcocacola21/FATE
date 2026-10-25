import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

// Real sandbox transport and UI, with in-memory test persistence and no database.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "packages/web/test-results/test-room");
const battleUi = process.env.FATE_BATTLE_UI === "classic" ? "classic" : "minimal";
const web = "http://127.0.0.1:5207",
  api = "http://127.0.0.1:3127";
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
assert(executablePath, "A local Chromium browser is required");
const fixture = path.join(output, "server.ts");
const viteConfig = path.join(output, "vite.config.mjs");
const entry = path.join(output, "harness.html");
fs.writeFileSync(
  entry,
  '<div id="root"></div><script>history.replaceState(null,"","/play")</script><script type="module" src="./entry.ts"></script>',
);
fs.writeFileSync(
  path.join(output, "entry.ts"),
  'import "/src/main.tsx"; import {useGameStore} from "/src/store.ts"; window.sandboxStore=useGameStore;',
);
fs.writeFileSync(
  viteConfig,
  `
import base from ${JSON.stringify(path.join(root, "packages/web/vite.config.ts").replaceAll("\\", "/"))};
export default { ...base, build: { outDir: ${JSON.stringify(path.join(output, "build").replaceAll("\\", "/"))}, emptyOutDir: true,
  rollupOptions: { input: ${JSON.stringify(entry.replaceAll("\\", "/"))} } } };
`,
);
fs.writeFileSync(
  fixture,
  `
import { buildTestServer } from ${JSON.stringify(path.join(root, "packages/server/src/tests/matchTestSupport.ts").replaceAll("\\", "/"))};
async function main() {
  const server = await buildTestServer();
  await server.listen({port:3127,host:"127.0.0.1"});
}
void main();
`,
);
const children = [],
  errors = [],
  observations = [];
let browser, page;
function start(args, cwd, extra) {
  const env = { ...process.env, ...extra };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  delete env.TEST_DATABASE_URL;
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      child.output = ((child.output ?? "") + chunk.toString()).slice(-4000);
    });
}
async function ready(url) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const failed = children.find((child) => child.exitCode !== null);
    if (failed) throw new Error(failed.output);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Sandbox startup timed out");
}
try {
  const build = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", viteConfig],
    {
      cwd: path.join(root, "packages/web"),
      windowsHide: true,
      encoding: "utf8",
      env: { ...process.env, VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3127/ws" },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  assert.equal(build.status, 0, (build.stderr + build.stdout).slice(-4000));
  console.log("sandbox smoke: production fixture built");
  start(
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      path.join(root, "tsconfig.tests.json"),
      fixture,
    ],
    root,
    { NODE_ENV: "test", LOG_LEVEL: "silent", WEB_ORIGIN: web, ENABLE_TEST_ROOMS: "true" },
  );
  await ready(api + "/health");
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "preview",
      "--config",
      viteConfig,
      "--host",
      "127.0.0.1",
      "--port",
      "5207",
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3127/ws" },
  );
  await ready(web + "/test-results/test-room/harness.html");
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-proxy-server", "--disable-gpu"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // The minimal battle layout is the default; FATE_BATTLE_UI=classic runs the same scenario
  // against the classic layout, which players can still switch back to.
  await context.addInitScript((battleUi) => {
    localStorage.setItem("FATE_LANGUAGE", "en");
    localStorage.setItem("theme", "dark");
    localStorage.setItem("fate.battleUi", battleUi);
    window.sandboxEffects = [];
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const nodes = [
            ...(node.matches("[data-vfx-effect]") ? [node] : []),
            ...node.querySelectorAll("[data-vfx-effect]"),
          ];
          for (const effect of nodes)
            window.sandboxEffects.push(effect.getAttribute("data-vfx-effect"));
        }
    }).observe(document, { childList: true, subtree: true });
  }, battleUi);
  page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(web + "/test-results/test-room/harness.html", { waitUntil: "domcontentloaded" });
  console.log("sandbox smoke: loading the application");
  await page.getByRole("button", { name: "Create Test Room", exact: true }).click();
  await page.getByTestId("submit-room").click();
  await page.getByRole("tab", { name: "Presets", exact: true }).waitFor();
  console.log("sandbox smoke: test room opened");
  const store = (callback) =>
    page.evaluate((callbackSource) => {
      return new Function("store", `return (${callbackSource})(store)`)(window.sandboxStore);
    }, callback.toString());
  const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
  const button = (name) => page.getByRole("button", { name, exact: true });
  // Destructive sandbox commands ask in an in-app dialog; an empty board loads presets directly.
  const acceptConfirm = async () => {
    const dialog = page.getByRole("dialog", { name: "Confirm" });
    if (
      await dialog.waitFor({ timeout: 1000 }).then(
        () => true,
        () => false,
      )
    )
      await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  };
  const state = () =>
    store((s) => ({
      view: s.getState().roomState,
      revision: s.getState().roomMeta.revision,
      replay: s.getState().lastEffectReplay?.events.map((event) => event.type),
      selected: s.getState().selectedUnitId,
    }));
  const send = async (command) => {
    const revision = (await state()).revision;
    await page.evaluate((command) => {
      window.sandboxStore.getState().sendTestRoomCommand(command);
    }, command);
    await page.waitForFunction(
      (revision) => window.sandboxStore.getState().roomMeta.revision > revision,
      revision,
    );
  };
  // Every preset through the public UI, including timeline invalidation.
  for (const name of [
    "Basic attack duel",
    "AoE cluster",
    "Line attack",
    "Rider path",
    "Stake trigger",
    "Stealth / reveal",
    "Transformations",
    "Impulse start turn",
    "Healing / statuses",
    "Empty board",
  ]) {
    const revision = (await state()).revision;
    await button(name).click();
    await acceptConfirm();
    await page.waitForFunction(
      (revision) => window.sandboxStore.getState().roomMeta.revision > revision,
      revision,
    );
    assert.equal((await state()).view.phase, "battle");
    assert.equal((await state()).view.gameOver, null);
    observations.push({ preset: name, units: Object.keys((await state()).view.units).length });
  }
  console.log("sandbox smoke: all presets passed");
  // Spawn both players, edit HP and resolve a fatal attack via the normal pipeline.
  await send({ type: "debugSpawnUnit", heroId: "frisk", owner: "P1", coord: { col: 4, row: 3 } });
  await send({ type: "debugSpawnUnit", heroId: "frisk", owner: "P2", coord: { col: 4, row: 4 } });
  const units = Object.values((await state()).view.units);
  const attacker = units.find((unit) => unit.owner === "P1"),
    target = units.find((unit) => unit.owner === "P2");
  await store((s) =>
    s
      .getState()
      .setSelectedUnit(
        Object.values(s.getState().roomState.units).find((unit) => unit.owner === "P2").id,
      ),
  );
  await tab("Selected unit editor");
  const editor = page.locator("div.panel-card-muted").filter({ has: button("Set HP") });
  await editor.locator('input[type="number"]').first().fill("1");
  await button("Set HP").click();
  await page.waitForFunction(
    (id) => window.sandboxStore.getState().roomState.units[id].hp === 1,
    target.id,
  );
  await store((s) =>
    s
      .getState()
      .setSelectedUnit(
        Object.values(s.getState().roomState.units).find((unit) => unit.owner === "P1").id,
      ),
  );
  await tab("Combat and dice");
  await page.getByPlaceholder("6,6,1,1").fill("6,5,1,2");
  await button("Queue").click();
  await button("Resolve normal attack").click();
  for (let decision = 0; decision < 2; decision++) {
    await page.waitForFunction(() => Boolean(window.sandboxStore.getState().roomState.pendingRoll));
    if (battleUi === "minimal" && decision === 0) {
      const overlay = page.getByTestId("pending-roll-overlay");
      if (
        await overlay.waitFor({ timeout: 5000 }).then(
          () => true,
          () => false,
        )
      ) {
        await page.waitForTimeout(400);
        await page.screenshot({
          path: path.join(output, `desktop-${battleUi}-roll.png`),
        });
      }
    }
    const pendingId = await store((s) => s.getState().roomState.pendingRoll.id);
    await store((s) => {
      const pending = s.getState().roomState.pendingRoll;
      s.getState().sendAction({
        type: "resolvePendingRoll",
        pendingRollId: pending.id,
        player: pending.player,
      });
    });
    await page.waitForFunction(
      (id) => window.sandboxStore.getState().roomState.pendingRoll?.id !== id,
      pendingId,
    );
  }
  await page.waitForFunction(() =>
    Boolean(
      window.sandboxStore
        .getState()
        .lastEffectReplay?.events.some((event) => event.type === "attackResolved"),
    ),
  );
  assert.equal((await state()).view.phase, "battle");
  assert.equal((await state()).view.units[target.id].isAlive, false);
  await page.waitForFunction((id) => !document.querySelector(`[data-unit-id="${id}"]`), target.id);
  await page.waitForFunction(
    () => document.querySelectorAll("[data-vfx-effect]").length === 0,
    null,
    { timeout: 30000 },
  );
  const effectCount = () => page.evaluate(() => window.sandboxEffects.length);
  for (let repeat = 0; repeat < 3; repeat++) {
    const before = await effectCount();
    await button("Replay last visible effects").click();
    await page.waitForFunction((before) => window.sandboxEffects.length > before, before);
    await page.waitForFunction(
      () => document.querySelectorAll("[data-vfx-effect]").length === 0,
      null,
      { timeout: 30000 },
    );
    assert.equal((await state()).view.units[target.id].hp, 0);
    assert.equal((await state()).view.phase, "battle");
    observations.push({ repeat, addedEffects: (await effectCount()) - before });
  }
  await page.screenshot({
    path: path.join(output, `desktop-${battleUi}.png`),
    fullPage: true,
  });
  if (battleUi === "minimal") {
    // Capture each side tab of the minimal layout, then return to the sandbox controls.
    for (const name of ["Unit", "Actions", "Log"]) {
      await tab(name);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(output, `desktop-${battleUi}-${name.toLowerCase()}.png`),
      });
    }
    await tab("TEST / SANDBOX");
  }
  await tab("Snapshot and reproduction");
  await button("Export authoritative snapshot").click();
  await page.waitForFunction(() => Boolean(window.sandboxStore.getState().testRoomSnapshot));
  const snapshot = await store((s) => s.getState().testRoomSnapshot);
  const downloadReady = page.waitForEvent("download");
  await button("Download JSON").click();
  await (await downloadReady).saveAs(path.join(output, "snapshot.json"));
  await page.getByPlaceholder("Paste exported snapshot JSON").fill(snapshot);
  const beforeImport = (await state()).revision;
  await button("Import snapshot").click();
  await acceptConfirm();
  await page.waitForFunction(
    (revision) => window.sandboxStore.getState().roomMeta.revision > revision,
    beforeImport,
  );
  assert.equal((await state()).view.phase, "battle");
  assert(
    await button("Replay last visible effects").isDisabled(),
    "snapshot import must discard the old replay",
  );
  observations.push({ snapshotRoundTrip: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("mobile-match-layout").waitFor();
  await button("TEST").click();
  await page.getByRole("tab", { name: "Presets", exact: true }).waitFor();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    "mobile horizontal overflow",
  );
  await page.screenshot({
    path: path.join(output, `mobile-${battleUi}.png`),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ observations, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, observations }, null, 2));
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error((await page.locator("body").innerText()).slice(-9000));
  }
  throw error;
} finally {
  await browser?.close();
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  }
}
