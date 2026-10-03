import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const api = "http://127.0.0.1:3118",
  web = "http://127.0.0.1:5198";
const output = path.join(root, "packages/web/test-results/match-types");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
assert(executablePath);
const children = [],
  sockets = [],
  errors = [];
let browser;
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
    child.startupOutput = ((child.startupOutput ?? "") + chunk.toString()).slice(-4000);
  });
  return child;
}
async function ready(url) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const failed = children.find((child) => child.exitCode !== null);
    if (failed) throw new Error(`Fixture exited: ${failed.startupOutput}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Startup timeout: ${url}`);
}
try {
  start(
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/web/scripts/app-shell-server.ts"],
    root,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "3118",
      ENABLE_TEST_ROOMS: "false",
      WEB_ORIGIN: web,
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
  );
  const webBuild = start(
    [path.join(root, "node_modules/vite/bin/vite.js"), "build"],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3118/ws" },
  );
  await new Promise((resolve, reject) => webBuild.once("exit", (code) => code === 0 ? resolve() : reject(new Error(webBuild.startupOutput))));
  children.splice(children.indexOf(webBuild), 1);
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "5198",
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3118/ws" },
  );
  await Promise.all([ready(`${api}/health`), ready(web)]);
  const credentials = await (await fetch(`${api}/shell-test/credentials`)).json();
  const createRoom = async (matchType) =>
    (
      await (
        await fetch(`${api}/rooms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${credentials.accessToken}`,
          },
          body: JSON.stringify({ matchType }),
        })
      ).json()
    ).roomId;
  const casualId = await createRoom("CASUAL"),
    ratedId = await createRoom("RATED");
  const profile = {
    id: credentials.userId,
    username: "Commander",
    displayName: "Tactician",
    avatarUrl: null,
    email: "phase17@example.test",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    preferredLanguage: "en",
    preferredTheme: "dark",
  };
  const match = (matchType) => ({
    id: matchType.toLowerCase(),
    matchType,
    status: "FINISHED",
    gameMode: "classic",
    createdAt: profile.createdAt,
    startedAt: profile.createdAt,
    finishedAt: "2026-01-01T00:03:00Z",
    durationMs: 180000,
    finalRevision: null,
    turnCount: 12,
    finishReason: "allEnemyUnitsDefeated",
    result: "WIN",
    seat: "P1",
    opponent: {
      userId: null,
      seat: "P2",
      displayName: "Opponent",
      username: null,
      avatarUrl: null,
    },
    winner: { userId: profile.id, seat: "P1", displayName: "Tactician" },
    loser: null,
    participants: [
      {
        userId: profile.id,
        seat: "P1",
        displayName: "Tactician",
        username: "Commander",
        avatarUrl: null,
        outcome: "WIN",
      },
      {
        userId: null,
        seat: "P2",
        displayName: "Opponent",
        username: null,
        avatarUrl: null,
        outcome: "LOSS",
      },
    ],
  });
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  await context.route(`${api}/api/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (data) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (pathname === "/api/auth/refresh")
      return json({ accessToken: credentials.accessToken, accessTokenExpiresIn: 900 });
    if (pathname === "/api/auth/me") return json({ user: profile });
    if (pathname.endsWith("/matches") && pathname.includes("/users/"))
      return json({
        items: [match("CASUAL"), match("RATED")],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      });
    if (pathname === "/api/matches/casual") return json(match("CASUAL"));
    if (pathname === "/api/matches/rated") return json(match("RATED"));
    return route.continue();
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  let roomFromAck;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === "joinAck") roomFromAck = message.roomId;
      } catch {
        /* HMR */
      }
    }),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  const capture = async (name, target = page) => {
    assert(
      await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "horizontal overflow",
    );
    await target.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  };
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    console.log(`Checking viewport ${width}x${height}`);
    await page.setViewportSize({ width, height });
    await page.goto(web + "/lobby", { waitUntil: "domcontentloaded" });
    await page.getByTestId("room-browser").waitFor();
    const browserPanel = page.getByTestId("room-browser");
    await browserPanel.locator("article").getByText("Casual", { exact: true }).waitFor();
    await browserPanel.locator("article").getByText("Rated", { exact: true }).waitFor();
    assert.equal(await page.getByText("Heartbreak", { exact: true }).count(), 0);
    await capture(`rooms-${width}`);
    await page.getByTestId("create-room").click();
    const casual = page.getByRole("radio", { name: "Casual", exact: true }),
      rated = page.getByRole("radio", { name: "Rated", exact: true });
    assert(await casual.isChecked());
    await capture(`create-casual-${width}`);
    await rated.check();
    assert(await rated.isChecked());
    await capture(`create-rated-${width}`);
    await page.keyboard.press("Escape");
    await page.getByTestId("join-by-id").click();
    await page.getByLabel("Join Code", { exact: true }).fill(ratedId);
    await page.getByRole("dialog").getByText("Rated", { exact: true }).waitFor();
    await capture(`join-rated-${width}`);
    await page.keyboard.press("Escape");
    await page.goto(`${web}/matches`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("match-history-page").waitFor();
    await page.getByText("Casual", { exact: true }).waitFor();
    await page.getByText("Rated", { exact: true }).waitFor();
    await capture(`history-${width}`);
    await page.goto(`${web}/matches/rated`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("match-details-page").waitFor();
    await page.getByText("Rated", { exact: true }).first().waitFor();
    await capture(`details-rated-${width}`);
  }
  // Real WebSocket creation, joining, start and reconnect, using the fixture server.
  for (const type of ["CASUAL", "RATED"]) {
    console.log(`Checking ${type} create/start/reconnect`);
    // The earlier active game retains its competitors. Use another pair for
    // this independent scenario, preserving the active-match protection.
    if (type === "RATED") {
      credentials.accessToken = credentials.extraAccessToken;
      credentials.p2AccessToken = credentials.extraP2AccessToken;
      profile.id = credentials.extraUserId;
    }
    await page.goto(web + "/lobby", { waitUntil: "domcontentloaded" });
    await page.getByTestId("create-room").click();
    await page.getByLabel("Lobby name (optional)", { exact: true }).fill(type === "CASUAL" ? "Evening Casual" : "Evening Rated");
    if (type === "RATED") await page.getByRole("radio", { name: "Rated", exact: true }).check();
    await page.getByTestId("submit-room").click();
    await page.getByRole("button", { name: "Ready up", exact: true }).waitFor();
    const roomId = roomFromAck;
    assert(roomId);
    await page.setViewportSize({ width: 1366, height: 768 });
    await capture(`prematch-${type.toLowerCase()}-1366`);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(`prematch-${type.toLowerCase()}-390`);
    const peer = new WebSocket("ws://127.0.0.1:3118/ws");
    sockets.push(peer);
    await new Promise((resolve) => peer.once("open", resolve));
    const joined = new Promise((resolve) =>
      peer.on("message", (data) => {
        if (JSON.parse(data.toString()).type === "joinAck") resolve();
      }),
    );
    peer.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId,
        role: "P2",
        accessToken: credentials.p2AccessToken,
      }),
    );
    await joined;
    peer.send(JSON.stringify({ type: "setReady", ready: true }));
    await page.getByRole("button", { name: "Ready up", exact: true }).click();
    const startButton = page.getByRole("button", { name: "Start game", exact: true });
    await startButton.waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Start game" && !b.disabled,
      ),
    );
    await startButton.click();
    await page.getByRole("button", { name: "Ready up", exact: true }).waitFor({ state: "detached" });
    // Resolve normal initiative/rule setup through the fixture's debug REST
    // transport, using the same authoritative lifecycle as the real socket.
    for (let i = 0; i < 10; i++) {
      const views = await Promise.all(["P1", "P2"].map(async (player) =>
        (await fetch(`${api}/api/games/${roomId}?playerId=${player}`)).json()));
      const pending = views.map(({ view }) => view.pendingRoll).find(Boolean);
      if (!pending) break;
      const result = await fetch(`${api}/api/games/${roomId}/actions?playerId=${pending.player}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id,
          ...(pending.kind === "ruleDeclarationChoice" ? { choice: { type: "chooseRuleDeclaration", ruleId: "normal_rule" } } : {}) }),
      });
      assert.equal(result.status, 200, await result.text());
    }
    const current = await (await fetch(`${api}/api/games/${roomId}?playerId=P1`)).json();
    assert.notEqual(current.view.phase, "lobby", "normal setup enters active gameplay");
    await page
      .getByRole("button", { name: "Ready up", exact: true })
      .waitFor({ state: "detached" });
    await page.locator(".panel-hud").getByText(type === "RATED" ? "Rated" : "Casual", { exact: true }).waitFor();
    await capture(`active-${type.toLowerCase()}-390`);
    await page.setViewportSize({ width: 1366, height: 768 });
    await capture(`active-${type.toLowerCase()}-1366`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator(".panel-hud").getByText(type === "RATED" ? "Rated" : "Casual", { exact: true }).waitFor();
    await capture(`reconnect-${type.toLowerCase()}-390`);
    await page.getByRole("button", { name: "Leave match", exact: true }).click();
    await page.getByTestId("create-room").waitFor();
    peer.close();
  }
  // Browse and spectate an active Casual game in an independent guest context.
  const observerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await observerContext.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  await observerContext.route(`${api}/api/auth/refresh`, route => route.fulfill({
    status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }),
  }));
  const observer = await observerContext.newPage();
  observer.on("pageerror", e => errors.push(e.message));
  await observer.goto(web + "/lobby");
  const activeCasual = observer.locator("article").filter({ hasText: "Evening Casual" });
  await activeCasual.getByText("In Progress", { exact: true }).waitFor();
  await capture("browser-active-casual-1366", observer);
  await observer.setViewportSize({ width: 390, height: 844 });
  await capture("browser-active-casual-390", observer);
  await activeCasual.getByRole("button", { name: "Spectate", exact: true }).click();
  assert.equal(await observer.getByLabel("Role", { exact: true }).inputValue(), "spectator");
  await observer.getByTestId("submit-room").click();
  await observer.getByRole("button", { name: "Leave match", exact: true }).waitFor();
  await capture("spectator-casual-390", observer);
  await observerContext.close();
  // A room not present in the last list is resolved through the new lookup API.
  await context.route(`${api}/rooms`, (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" }),
  );
  await page.goto(web + "/lobby", { waitUntil: "domcontentloaded" });
  await page.getByTestId("join-by-id").click();
  await page.getByLabel("Join Code", { exact: true }).fill(casualId);
  await page.getByRole("dialog").getByText("Casual", { exact: true }).waitFor();
  await capture("lookup-casual-390");
  assert.deepEqual(errors, []);
  console.log(
    "match types browser: 4 viewports, selectable creation, mixed rooms, lookup, history/details, actual WS create/start/reconnect for both types; no horizontal overflow or page errors",
  );
} finally {
  for (const socket of sockets) socket.close();
  await browser?.close();
  for (const child of children) child.kill();
}
