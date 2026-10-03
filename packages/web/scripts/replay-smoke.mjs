import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../../scripts/testDatabase.cjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const databaseUrl = configureTestDatabase();
const apiUrl = "http://127.0.0.1:3112",
  baseUrl = "http://127.0.0.1:5192";
const output = path.join(webRoot, "test-results/replay");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((v) => v && fs.existsSync(v));
if (!executablePath)
  throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");
const { createReplayFixture } = await import(
  pathToFileURL(path.join(repoRoot, "packages/server/dist/tests/replayTestSupport.js"))
);
const fixture = createReplayFixture("classic", true);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const children = [],
  users = [],
  matches = [];
let browser, page;
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: "ignore",
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Test service exited during startup.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Test service startup timeout.");
}
try {
  const server = start([path.join(repoRoot, "packages/server/dist/index.js")], repoRoot, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    PORT: "3112",
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    WEB_ORIGIN: baseUrl,
    JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
    JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
    JWT_ACCESS_TTL_SECONDS: "900",
    JWT_REFRESH_TTL_SECONDS: "3600",
    AUTH_COOKIE_SAME_SITE: "lax",
  });
  const vite = start(
    [
      path.join(repoRoot, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5192",
      "--strictPort",
    ],
    webRoot,
    { VITE_API_URL: apiUrl, VITE_WS_URL: "ws://127.0.0.1:3112/ws", VITE_PORT: "5192" },
  );
  await Promise.all([ready(`${apiUrl}/health`, server), ready(baseUrl, vite)]);
  const suffix = randomUUID().slice(0, 8),
    password = randomBytes(16).toString("hex");
  const email = `replay-${suffix}@example.test`,
    username = `Replay_${suffix}`;
  const registered = await fetch(`${apiUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, username, password }),
  });
  assert.equal(registered.status, 201);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  users.push(user.id);
  const id = fixture.match.id;
  matches.push(id);
  await db.match.create({
    data: {
      ...fixture.match,
      participants: {
        create: [
          { seat: "P1", userId: user.id, displayNameSnapshot: "Historical Alice", outcome: "WIN" },
          { seat: "P2", userId: null, displayNameSnapshot: "Historical Bob", outcome: "LOSS" },
        ],
      },
    },
  });
  await db.matchAction.createMany({ data: fixture.actions });
  await db.matchSnapshot.createMany({
    data: [20, 40, 60, fixture.match.finalRevision].map((n) => fixture.history.get(n)),
  });
  const persisted = async () => ({
    match: await db.match.findUniqueOrThrow({ where: { id }, include: { participants: true } }),
    actions: await db.matchAction.count({ where: { matchId: id } }),
    snapshots: await db.matchSnapshot.count({ where: { matchId: id } }),
  });
  const before = await persisted();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const failures = [],
    stateRequests = [],
    writes = [],
    sockets = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("websocket", (socket) => {
    // Vite's development HMR socket is unrelated to gameplay.
    if (new URL(socket.url()).pathname === "/ws") sockets.push(socket.url());
  });
  page.on("request", (request) => {
    if (request.url().includes(`/api/matches/${id}/replay/state`))
      stateRequests.push(request.url());
    if (request.url().includes(`/api/matches/${id}`) && request.method() !== "GET")
      writes.push(request.url());
  });
  // A stale resume token must not trigger any socket or reconnect on direct replay entry.
  await context.addInitScript(() => {
    localStorage.setItem(
      "fate.room-session.v1",
      JSON.stringify({
        roomId: "stale-test-room",
        role: "P1",
        seat: "P1",
        resumeToken: "deliberately-stale-test-token",
      }),
    );
    window.__replayRoomSessionAccesses = 0;
    for (const method of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (key === "fate.room-session.v1") window.__replayRoomSessionAccesses++;
        return original.call(this, key, ...args);
      };
    }
  });
  await page.goto(`${baseUrl}/matches/${id}/replay`);
  await page.waitForURL(/\/login\?returnTo=/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const visible = page.getByTestId("replay-visible-revision");
  const at = async (revision) => {
    await page.waitForFunction(
      ({ revision, final }) =>
        document.querySelector('[data-testid="replay-visible-revision"]')?.textContent ===
        `Revision ${revision} / ${final}`,
      { revision, final: fixture.match.finalRevision },
    );
  };
  await at(0);
  assert(
    stateRequests.length <= 2,
    "StrictMode may cancel the first request, but never mass-prefetches",
  );
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await at(1);
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  await at(2);
  await page.getByRole("button", { name: "Previous action", exact: true }).click();
  await at(1);
  await page.getByRole("button", { name: "Go to beginning", exact: true }).click();
  await at(0);
  await page.getByRole("button", { name: "Go to end", exact: true }).click();
  await at(fixture.match.finalRevision);
  await page.getByLabel("Revision", { exact: true }).fill("55");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await at(55);
  assert(new URL(page.url()).searchParams.get("revision") === "55");
  await page.reload();
  await at(55);
  assert.equal(await page.locator(".replay-board button:not(:disabled)").count(), 0);
  await page.locator(".replay-board button[data-unit-id]").first().dispatchEvent("click");
  assert.deepEqual(sockets, []);
  assert.deepEqual(writes, []);
  assert.equal(await page.evaluate(() => window.__replayRoomSessionAccesses), 0);
  // Keyboard is scoped away from controls; body focus enables timeline shortcuts.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("ArrowRight");
  await at(56);
  await page.keyboard.press("ArrowLeft");
  await at(55);
  await page.getByRole("link", { name: "Back to match details", exact: true }).click();
  await page.getByRole("link", { name: "Watch Replay", exact: true }).click();
  await at(0);
  await page.getByLabel("Revision", { exact: true }).fill("55");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await at(55);
  const viewports = [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ];
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.getByTestId("replay-page").waitFor();
    // Wait for Board's existing 150 ms fit transition before asserting/capturing.
    await page.waitForFunction(() => {
      const frame = document.querySelector(".replay-board"),
        board = frame?.querySelector(".board-object");
      return (
        frame &&
        board &&
        board.getBoundingClientRect().height + 12 <= frame.clientHeight &&
        board.getBoundingClientRect().width + 12 <= frame.clientWidth
      );
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `Page overflows at ${width}`);
    await page.screenshot({
      path: path.join(output, `replay-${width}x${height}.png`),
      fullPage: true,
    });
  }
  assert.equal(await visible.innerText(), `Revision 55 / ${fixture.match.finalRevision}`);
  assert.deepEqual(await persisted(), before);
  assert.deepEqual(failures, []);
  assert.deepEqual(sockets, []);
  assert.deepEqual(writes, []);
  const roomSessionAccesses = await page.evaluate(() => window.__replayRoomSessionAccesses);
  assert.equal(roomSessionAccesses, 0);
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(
      {
        finalRevision: fixture.match.finalRevision,
        stateRequests: stateRequests.length,
        sockets: sockets.length,
        gameplayWrites: writes.length,
        roomSessionAccesses,
        viewports,
      },
      null,
      2,
    ),
  );
  console.log(
    `Replay browser smoke passed: auth, details link, manual/keyboard navigation, URL refresh, disabled board, ${stateRequests.length} on-demand state requests, no sockets/writes/token access, four viewports`,
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  await db.match.deleteMany({ where: { id: { in: matches } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
