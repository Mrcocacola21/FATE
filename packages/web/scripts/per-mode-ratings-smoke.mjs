import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const api = "http://127.0.0.1:3120",
  web = "http://127.0.0.1:5202";
const output = path.join(root, "packages/web/test-results/per-mode-ratings");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
assert(executablePath);
const children = [],
  errors = [],
  queueModes = [];
let browser,
  peer,
  page,
  step = "startup";
function start(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      child.output = ((child.output || "") + chunk).slice(-3000);
    });
}
async function ready(url) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const failed = children.find((child) => child.exitCode !== null);
    if (failed) throw new Error(failed.output);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Server startup timed out");
}
async function capture(page, name) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Overflow ${name}`,
  );
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
function peerRequest(body, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      peer.off("message", receive);
      reject(new Error(`Missing ${type}`));
    }, 10000);
    function receive(data) {
      const message = JSON.parse(data.toString());
      if (message.type === type) {
        clearTimeout(timer);
        peer.off("message", receive);
        resolve(message);
      }
    }
    peer.on("message", receive);
    peer.send(JSON.stringify(body));
  });
}
try {
  start(
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/web/scripts/per-mode-server.ts"],
    root,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: "3120",
      ENABLE_TEST_ROOMS: "false",
      WEB_ORIGIN: web,
    },
  );
  await ready(api + "/health");
  const credentials = await (await fetch(api + "/fixture/credentials")).json();
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5202",
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: api, VITE_WS_URL: "ws://127.0.0.1:3120/ws" },
  );
  await ready(web);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  // Only auth is stubbed. Competitive/statistics/lobby reads use PostgreSQL.
  await context.route(api + "/api/auth/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/refresh")
      ? { accessToken: credentials.first, accessTokenExpiresIn: 900 }
      : { user: credentials.profile };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await context.route(api + "/api/profile", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ profile: credentials.profile }),
    }),
  );
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/matchmaking/queue"))
      queueModes.push(request.postDataJSON().gameMode);
  });
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
  const samples = [
    ["Standard", "standard", 1800, "BLACK_MOON"],
    ["Draft", "draft", 900, "HALF"],
    ["Classic", "classic", 2010, "DESTINY"],
  ];
  step = "Play modes and real queue ratings";
  await page.goto(web);
  await page.getByTestId("competitive-rating").waitFor();
  for (const [label, mode, rating, tier] of samples) {
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.getByTestId("competitive-rating").innerText(), String(rating));
    assert.equal(await page.getByTestId("rank-emblem").getAttribute("data-rank"), tier);
    await capture(page, `play-${mode}`);
    await page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
    await page.getByText("Searching for opponent", { exact: true }).waitFor();
    const queue = await (
      await fetch(api + "/api/matchmaking/queue", {
        headers: { Authorization: `Bearer ${credentials.first}` },
      })
    ).json();
    assert.equal(queue.gameMode, mode);
    assert.equal(queue.rating, rating);
    assert.equal(queueModes.at(-1), mode);
    await page.getByRole("button", { name: "Cancel search", exact: true }).click();
    await page.getByRole("button", { name: "Find Rated Match", exact: true }).waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await capture(page, "play-draft-mobile");
  await page.setViewportSize({ width: 1366, height: 768 });
  step = "three real leaderboards and URL reload";
  await page.goto(web + "/leaderboard");
  for (const [label, mode] of samples) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (mode === "draft") await page.getByRole("tab", { name: "Provisional", exact: true }).click();
    else await page.getByRole("tab", { name: "Ranked", exact: true }).click();
    await page
      .locator(`.leaderboard-desktop a[href="/users/${credentials.profile.username}"]`)
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("gameMode"), mode);
    await capture(page, `leaderboard-${mode}`);
  }
  await page.reload();
  await page
    .locator(`.leaderboard-desktop a[href="/users/${credentials.profile.username}"]`)
    .waitFor();
  assert.equal(new URL(page.url()).searchParams.get("gameMode"), "classic");
  step = "own and public profile modes";
  for (const profilePath of ["/profile", `/users/${credentials.profile.username}`]) {
    await page.goto(web + profilePath);
    const rank = page.getByTestId("profile-rank");
    await rank.getByTestId("rank-emblem").waitFor();
    for (const [label, mode, rating, tier] of samples) {
      await rank.getByRole("button", { name: label, exact: true }).click();
      assert.equal(await rank.getByTestId("rank-emblem").getAttribute("data-rank"), tier);
      assert((await rank.innerText()).includes(String(rating)));
      await capture(page, `${profilePath === "/profile" ? "own" : "public"}-profile-${mode}`);
    }
  }
  step = "Rated Draft manual lobby uses Draft gap";
  await fetch(api + "/fixture/draft-ratings", { method: "POST" });
  await page.goto(web + "/lobby");
  await page.getByTestId("create-room").click();
  await page.getByLabel("Lobby name (optional)", { exact: true }).fill("Independent Draft");
  await page.locator("#create-game-mode").selectOption("draft");
  await page.getByRole("radio", { name: "Rated", exact: true }).check();
  await page.getByTestId("submit-room").click();
  await page.getByRole("button", { name: "Ready up", exact: true }).waitFor();
  assert(roomId);
  peer = new WebSocket("ws://127.0.0.1:3120/ws");
  await new Promise((resolve) => peer.once("open", resolve));
  await peerRequest(
    { type: "joinRoom", mode: "join", roomId, role: "P2", accessToken: credentials.second },
    "roomState",
  );
  await peerRequest({ type: "setReady", ready: true }, "roomState");
  await page.getByRole("button", { name: "Ready up", exact: true }).click();
  const compatibility = page.getByTestId("rated-compatibility");
  await compatibility.getByText("Eligible for Rated play", { exact: true }).waitFor();
  const gapText = await compatibility.innerText();
  assert(gapText.includes("50 / 400"));
  await page.getByText("Current rating: 1450", { exact: true }).waitFor();
  await page.getByText("Current rating: 1500", { exact: true }).waitFor();
  assert(await page.getByRole("button", { name: "Start draft", exact: true }).isEnabled());
  await capture(page, "manual-rated-draft");
  await page.getByRole("button", { name: "Start draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Start draft", exact: true })
    .waitFor({ state: "detached" });
  step = "Draft completion preserves Standard and Classic";
  const completion = await (await fetch(api + "/fixture/finish-draft", { method: "POST" })).json();
  for (const mode of ["standard", "classic"])
    assert.deepEqual(
      completion.before.find((row) => row.gameMode === mode),
      completion.after.find((row) => row.gameMode === mode),
    );
  const draftBefore = completion.before.find((row) => row.gameMode === "draft"),
    draftAfter = completion.after.find((row) => row.gameMode === "draft");
  assert(draftAfter.rating > draftBefore.rating);
  assert.equal(draftAfter.ratedGames, draftBefore.ratedGames + 1);
  await page.goto(web + "/profile");
  const rank = page.getByTestId("profile-rank");
  await rank.getByTestId("rank-emblem").waitFor();
  await rank.getByRole("button", { name: "Draft", exact: true }).click();
  assert((await rank.innerText()).includes(String(Math.floor(draftAfter.rating))));
  await capture(page, "profile-draft-after-result");
  assert.deepEqual(errors, []);
  console.log(
    "Browser + real local PostgreSQL passed: all Play modes/medals, exact queue mode/rating, mobile layout, three URL leaderboards, own/public profiles, Draft lobby gap and result isolation. Screenshots:",
    output,
  );
} catch (error) {
  console.error("Failed at", step, errors);
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
    console.error(await page.locator("body").innerText());
  }
  throw error;
} finally {
  peer?.terminate();
  await browser?.close();
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
}
