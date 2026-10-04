import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const web = "http://127.0.0.1:5199",
  api = "http://127.0.0.1:3119";
const output = path.join(root, "packages/web/test-results/play-lobby");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
assert(executablePath, "A local Chromium browser is required");
const children = [],
  sockets = [],
  errors = [];
let browser,
  page,
  step = "startup";
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
  return child;
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
  throw new Error("Fixture startup timed out");
}
async function capture(name, target = page) {
  assert(
    await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Overflow: ${name}`,
  );
  await target.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
    animations: "disabled",
  });
}
try {
  start(
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/web/scripts/play-lobby-server.ts"],
    root,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "3119",
      ENABLE_TEST_ROOMS: "false",
      WEB_ORIGIN: web,
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    },
  );
  await ready(api + "/health");
  const credentials = await (await fetch(api + "/fixture/credentials")).json();
  const updateRatings = (value) =>
    fetch(api + "/fixture/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5199",
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3119/ws" },
  );
  await ready(web);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  const profile = {
    id: credentials.userId,
    username: "Max",
    displayName: "Max",
    avatarUrl: null,
    email: "fixture@example.test",
    createdAt: "2026-10-03T00:00:00Z",
    updatedAt: "2026-10-03T00:00:00Z",
    preferredLanguage: "en",
    preferredTheme: "dark",
  };
  await context.route(api + "/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (value) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
    if (pathname === "/api/auth/refresh")
      return json({ accessToken: credentials.first, accessTokenExpiresIn: 900 });
    if (pathname === "/api/auth/me") return json({ user: profile });
    if (pathname === "/api/profile") return json({ profile });
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => errors.push(error.message));
  let roomId;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === "joinAck") roomId = message.roomId;
      } catch {
        /* HMR */
      }
    }),
  );
  const viewports = [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ];
  step = "provisional and empty browser";
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(web);
    await page.getByTestId("competitive-rating").waitFor();
    assert.equal(await page.locator('.rank-emblem[data-rank="BLACK_MOON"] img').count(), 1);
    assert(
      await page
        .getByRole("button", { name: "Find Rated Match", exact: true })
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
    );
    assert.equal(await page.getByTestId("room-browser").count(), 0);
    await capture(`play-provisional-${width}`);
    await page.goto(web + "/lobby");
    await page.getByTestId("room-browser").waitFor();
    assert.equal(await page.getByTestId("matchmaking-panel").count(), 0);
    await capture(`lobby-empty-${width}`);
  }
  await updateRatings({ ratedGames: 27 });
  await page.goto(web);
  await page.getByText("Qualified for the ranked leaderboard", { exact: true }).waitFor();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await capture(`play-qualified-${width}`);
  }
  step = "real queue and cancel";
  await page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await page.getByText("Searching for opponent", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("rank-emblem").count(), 0);
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await capture(`play-queued-${width}`);
  }
  await page.getByRole("button", { name: "Cancel search", exact: true }).click();
  await page.getByRole("button", { name: "Find Rated Match", exact: true }).waitFor();

  async function peerRequest(socket, body, type) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off("message", receive);
        reject(new Error(`Missing ${type}`));
      }, 10000);
      function receive(data) {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timer);
          socket.off("message", receive);
          resolve(message);
        }
      }
      socket.on("message", receive);
      socket.send(JSON.stringify(body));
    });
  }
  const peer = new WebSocket("ws://127.0.0.1:3119/ws");
  sockets.push(peer);
  await new Promise((resolve) => peer.once("open", resolve));
  const observerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await observerContext.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  await observerContext.route(api + "/api/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAUTHORIZED" } }),
    }),
  );
  const observer = await observerContext.newPage();
  observer.on("pageerror", (error) => errors.push(error.message));
  step = "named Rated lobby and invalid gap";
  await updateRatings({ first: 1800, second: 1350 });
  await page.goto(web + "/lobby");
  await page.getByTestId("create-room").click();
  await page.getByLabel("Lobby name (optional)", { exact: true }).fill("Нічні ігри · Night Games");
  await page.getByRole("radio", { name: "Rated", exact: true }).check();
  await page.getByTestId("submit-room").click();
  await page.getByRole("button", { name: "Ready up", exact: true }).waitFor();
  assert(roomId);
  await peerRequest(
    peer,
    { type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: credentials.second },
    "roomState",
  );
  await peerRequest(peer, { type: "setReady", ready: true }, "roomState");
  await page.getByRole("button", { name: "Ready up", exact: true }).click();
  await page
    .getByTestId("rated-compatibility")
    .getByText("Rating difference is too large for a Rated match.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Start game", exact: true }).isEnabled(),
    false,
  );
  const bypass = await fetch(`${api}/api/games/${roomId}/actions?playerId=P1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "startGame" }),
  });
  assert(!bypass.ok);
  assert.equal((await bypass.json()).code, "RATED_RATING_DIFFERENCE_TOO_LARGE");
  await observer.goto(web + "/lobby");
  await observer.getByText("Rating gap too large", { exact: true }).waitFor();
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await capture(`lobby-invalid-rated-${width}`);
    await observer.setViewportSize({ width, height });
    await capture(`browser-waiting-rated-${width}`, observer);
  }
  assert(
    !(await page
      .locator(".panel-hud")
      .innerText()
      .then((text) => text.includes(roomId))),
  );
  // Reconnect preserves server names and display identities.
  await page.reload();
  await page.getByRole("button", { name: "Start game", exact: true }).waitFor();
  await page.getByText("Нічні ігри · Night Games", { exact: true }).first().waitFor();
  await updateRatings({ second: 1400 });
  // Ready status broadcasts freshly resolved server compatibility.
  await peerRequest(peer, { type: "setReady", ready: false }, "roomState");
  await peerRequest(peer, { type: "setReady", ready: true }, "roomState");
  // Rejoin refreshes rated metadata; authoritative start is independently tested.
  await page.reload();
  await page.getByText("Eligible for Rated play", { exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Ready up", exact: true }).count())
    await page.getByRole("button", { name: "Ready up", exact: true }).click();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Ready up", exact: true }).waitFor({ state: "detached" });
  // Resolve only the normal initiative/rule setup using the existing test-gated REST transport.
  for (let attempt = 0; attempt < 10; attempt++) {
    const states = await Promise.all(
      ["P1", "P2"].map(async (player) =>
        (await fetch(`${api}/api/games/${roomId}?playerId=${player}`)).json(),
      ),
    );
    const pending = states.map((state) => state.view.pendingRoll).find(Boolean);
    if (!pending) break;
    const body = {
      type: "resolvePendingRoll",
      player: pending.player,
      pendingRollId: pending.id,
      ...(pending.kind === "ruleDeclarationChoice"
        ? { choice: { type: "chooseRuleDeclaration", ruleId: "normal_rule" } }
        : {}),
    };
    assert(
      (
        await fetch(`${api}/api/games/${roomId}/actions?playerId=${pending.player}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).ok,
    );
  }
  step = "active Rated browser and spectator";
  await observer.reload();
  await observer.locator("article").getByText("In Progress", { exact: true }).waitFor();
  for (const [width, height] of viewports) {
    await observer.setViewportSize({ width, height });
    await capture(`browser-active-rated-${width}`, observer);
  }
  await observer.getByRole("button", { name: "Spectate", exact: true }).click();
  assert.equal(await observer.getByLabel("Role", { exact: true }).inputValue(), "spectator");
  await observer.getByTestId("submit-room").click();
  await observer.getByRole("button", { name: "Leave match", exact: true }).waitFor();
  await capture("spectator-rated-mobile", observer);

  step = "Match Found and reserved matchmaking browser";
  const queuedContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await queuedContext.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  const queuedProfile = {
    ...profile,
    id: credentials.queuedFirstId,
    username: "Aster",
    displayName: "Aster",
  };
  await queuedContext.route(api + "/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (value) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
    if (pathname === "/api/auth/refresh")
      return json({ accessToken: credentials.queuedFirst, accessTokenExpiresIn: 900 });
    if (pathname === "/api/auth/me") return json({ user: queuedProfile });
    if (pathname === "/api/profile") return json({ profile: queuedProfile });
    return route.continue();
  });
  const queuedPage = await queuedContext.newPage();
  queuedPage.on("pageerror", (error) => errors.push(error.message));
  const queuedPeer = new WebSocket("ws://127.0.0.1:3119/ws");
  sockets.push(queuedPeer);
  await new Promise((resolve) => queuedPeer.once("open", resolve));
  await peerRequest(
    queuedPeer,
    {
      type: "matchmakingSubscribe",
      accessToken: credentials.queuedSecond,
      requestId: "browser-queue",
    },
    "matchmakingSubscribed",
  );
  assert(
    (
      await fetch(api + "/api/matchmaking/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credentials.queuedSecond}`,
        },
        body: JSON.stringify({ gameMode: "classic" }),
      })
    ).ok,
  );
  await queuedPage.goto(web);
  await queuedPage
    .getByRole("combobox", { name: "Game mode", exact: true })
    .selectOption("classic");
  await queuedPage.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await queuedPage.getByText("Match found", { exact: true }).first().waitFor();
  await capture("play-match-found-1366", queuedPage);
  await queuedPage.getByRole("button", { name: "Ready up", exact: true }).waitFor();
  const found = await (
    await fetch(api + "/api/matchmaking/queue", {
      headers: { Authorization: `Bearer ${credentials.queuedFirst}` },
    })
  ).json();
  assert.equal(found.status, "MATCH_FOUND");
  // The first match's spectator leaves through the public UI to browse again.
  observer.on("dialog", (dialog) => dialog.accept());
  await observer.getByRole("button", { name: "Leave match", exact: true }).click();
  await observer.getByTestId("room-browser").waitFor();
  await observer.getByRole("button", { name: "Refresh", exact: true }).click();
  const reservedCard = observer.locator("article").filter({ hasText: "Rated Match" });
  await reservedCard.getByText("Starting · Reserved", { exact: true }).waitFor();
  assert.equal(
    await reservedCard.getByRole("button", { name: "Join Lobby", exact: true }).count(),
    0,
  );
  for (const [width, height] of viewports) {
    await observer.setViewportSize({ width, height });
    await capture(`browser-matchmade-starting-${width}`, observer);
  }
  await peerRequest(
    queuedPeer,
    {
      type: "joinRoom",
      mode: "join",
      roomId: found.roomId,
      role: found.seat === "P1" ? "P2" : "P1",
      accessToken: credentials.queuedSecond,
    },
    "roomState",
  );
  await peerRequest(queuedPeer, { type: "setReady", ready: true }, "roomState");
  await queuedPage.getByRole("button", { name: "Ready up", exact: true }).click();
  if (found.seat === "P1")
    await queuedPage.getByRole("button", { name: "Start game", exact: true }).click();
  else await peerRequest(queuedPeer, { type: "startGame" }, "roomState");
  await queuedPage
    .getByRole("button", { name: "Ready up", exact: true })
    .waitFor({ state: "detached" });
  for (let attempt = 0; attempt < 10; attempt++) {
    const states = await Promise.all(
      ["P1", "P2"].map(async (player) =>
        (await fetch(`${api}/api/games/${found.roomId}?playerId=${player}`)).json(),
      ),
    );
    const pending = states.map((state) => state.view.pendingRoll).find(Boolean);
    if (!pending) break;
    const body = {
      type: "resolvePendingRoll",
      player: pending.player,
      pendingRollId: pending.id,
      ...(pending.kind === "ruleDeclarationChoice"
        ? { choice: { type: "chooseRuleDeclaration", ruleId: "normal_rule" } }
        : {}),
    };
    assert(
      (
        await fetch(`${api}/api/games/${found.roomId}/actions?playerId=${pending.player}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).ok,
    );
  }
  await observer.getByRole("button", { name: "Refresh", exact: true }).click();
  await reservedCard.getByText("In Progress", { exact: true }).waitFor();
  for (const [width, height] of viewports) {
    await observer.setViewportSize({ width, height });
    await capture(`browser-matchmade-active-${width}`, observer);
  }
  await reservedCard.getByRole("button", { name: "Spectate", exact: true }).click();
  await observer.getByTestId("submit-room").click();
  await observer.getByRole("button", { name: "Leave match", exact: true }).waitFor();
  await capture("spectator-matchmade-390", observer);
  await observer.getByRole("button", { name: "Leave match", exact: true }).click();
  await observer.getByTestId("room-browser").waitFor();
  assert(
    (
      await fetch(api + "/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyName: "Night Games · ".repeat(4) }),
      })
    ).ok,
  );
  await observer.getByRole("button", { name: "Refresh", exact: true }).click();
  await observer
    .getByRole("heading", { name: "Night Games · ".repeat(4).trim(), exact: true })
    .waitFor();
  await capture("browser-long-name-390", observer);
  assert.deepEqual(errors, []);
  console.log(
    "Play/Lobby browser: 1920/1366/768/390, provisional/qualified, real queue/cancel/Match Found, named Rated/reconnect, invalid gap/disabled Start/direct bypass, exact-boundary start, active/spectator, reserved/active matchmade games, long name; no overflow/page errors",
  );
} catch (error) {
  console.error(`Browser step: ${step}`);
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  sockets.forEach((socket) => socket.close());
  await browser?.close();
  children.forEach((child) => child.kill());
}
