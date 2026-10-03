import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../../scripts/testDatabase.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const databaseUrl = configureTestDatabase();
const apiPort = Number(process.env.MATCHMAKING_TEST_SERVER_PORT ?? 3188);
const webPort = Number(process.env.MATCHMAKING_TEST_WEB_PORT ?? 5188);
const apiUrl = `http://127.0.0.1:${apiPort}`,
  webUrl = `http://127.0.0.1:${webPort}`;
const output = path.join(root, "packages/web/test-results/matchmaking");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
if (!executablePath) throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const children = [],
  users = [],
  roomIds = [],
  errors = [];
let browser;
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
async function until(check, description) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${description}`);
}
async function state(page) {
  return page.evaluate(async () => {
    const game = (await import("/src/store.ts")).useGameStore.getState();
    const queue = (await import("/src/matchmaking/store.ts")).queue.state.getState();
    return {
      queue: queue.status,
      joined: game.joined,
      roomId: game.roomId,
      seat: game.seat,
      hasSnapshot: game.hasSnapshot,
      matchType: game.roomMeta?.matchType,
      isHost: game.isHost,
      modeLocked: game.roomMeta?.gameModeLocked,
      error: queue.error,
      joinError: game.joinError,
    };
  });
}
try {
  start([path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/server/src/index.ts"], root, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    PORT: String(apiPort),
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    WEB_ORIGIN: webUrl,
    JWT_ACCESS_SECRET: "phase18-browser-access-01234567890123456789",
    JWT_REFRESH_SECRET: "phase18-browser-refresh-01234567890123456789",
    ENABLE_TEST_ROOMS: "true",
  });
  start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    { VITE_API_URL: apiUrl, VITE_WS_URL: `ws://127.0.0.1:${apiPort}/ws` },
  );
  await until(async () => {
    try {
      return (await fetch(`${apiUrl}/health`)).ok && (await fetch(webUrl)).ok;
    } catch {
      return false;
    }
  }, "local servers ready");
  browser = await chromium.launch({ executablePath, headless: true });
  const makeUser = async (name) => {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "reduce",
    });
    context.setDefaultTimeout(60000);
    await context.addInitScript(() => localStorage.setItem("FATE_LANGUAGE", "en"));
    const username = `mm_${name}_${randomUUID().slice(0, 8)}`;
    const response = await context.request.post(`${apiUrl}/api/auth/register`, {
      headers: { origin: webUrl },
      data: { email: `${username}@example.test`, username, password: "Test-password-123!" },
    });
    assert.equal(response.status(), 201);
    const account = await response.json();
    users.push(account.user.id);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Find Rated Match", exact: true }).waitFor();
    return { page, context, account };
  };
  const a = await makeUser("alice");
  await a.page.getByLabel("Game mode", { exact: true }).selectOption("classic");
  await a.page.screenshot({ path: path.join(output, "idle-1366.png"), fullPage: false });
  await a.page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await a.page.getByText("Searching for opponent", { exact: true }).waitFor();
  const original = (await state(a.page)).queue;
  assert.equal(original.rating, 1500);
  assert.equal(original.gameMode, "classic");
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await a.page.setViewportSize(viewport);
    assert(await a.page.getByRole("button", { name: "Cancel search", exact: true }).isVisible());
    assert(
      await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      "queue horizontal overflow",
    );
    await a.page.screenshot({
      path: path.join(output, `searching-${viewport.width}.png`),
      fullPage: false,
    });
  }
  await a.page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await a.page.getByText("Searching for opponent", { exact: true }).waitFor();
  assert.equal((await state(a.page)).queue.joinedAt, original.joinedAt);
  const tab2 = await a.context.newPage();
  tab2.on("pageerror", (error) => errors.push(error.message));
  await tab2.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await tab2.getByText("Searching for opponent", { exact: true }).waitFor();
  assert.equal((await state(tab2)).queue.joinedAt, original.joinedAt);
  await tab2.close(); // Delivery to multiple connections is independently tested by the real WS suite.
  const b = await makeUser("bob");
  await b.page.getByLabel("Game mode", { exact: true }).selectOption("classic");
  await b.page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await until(
    async () =>
      (await state(a.page)).joined &&
      (await state(a.page)).hasSnapshot &&
      (await state(b.page)).joined &&
      (await state(b.page)).hasSnapshot,
    "both clients enter matched room",
  );
  const first = await state(a.page),
    second = await state(b.page);
  assert.equal(first.roomId, second.roomId);
  assert.notEqual(first.seat, second.seat);
  assert.equal(first.matchType, "RATED");
  assert.equal(second.matchType, "RATED");
  assert.equal(first.isHost, first.seat === "P1");
  assert.equal(second.isHost, second.seat === "P1");
  for (const player of [a, b]) {
    assert.equal((await state(player.page)).modeLocked, true);
    const controls = player.page.locator("button.mode-card");
    assert((await controls.count()) > 0);
    assert(await controls.evaluateAll((buttons) => buttons.every((button) => button.disabled)));
  }
  roomIds.push(first.roomId);
  const match = await db.match.findUniqueOrThrow({
    where: { roomId: first.roomId },
    include: { participants: true },
  });
  assert.equal(match.isRated, true);
  assert.equal(match.participants.length, 2);
  assert.equal(
    await db.match.count({
      where: { participants: { some: { userId: { in: [a.account.user.id, b.account.user.id] } } } },
    }),
    1,
  );
  await a.page.screenshot({ path: path.join(output, "match-found-mobile.png"), fullPage: false });
  await b.page.screenshot({ path: path.join(output, "match-found-desktop.png"), fullPage: false });
  // A third persistent account can spectate, but cannot acquire either reservation.
  const c = await makeUser("charlie");
  await c.page.evaluate(
    async ({ roomId, seat }) =>
      (await import("/src/store.ts")).useGameStore
        .getState()
        .joinRoom({ mode: "join", roomId, role: seat }),
    { roomId: first.roomId, seat: first.seat },
  );
  await until(
    async () => (await state(c.page)).joinError?.includes("reserved"),
    "reserved seat stays protected",
  );
  assert.equal((await state(c.page)).joined, false);
  await c.page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await c.page.getByRole("button", { name: "Cancel search", exact: true }).waitFor();
  await c.page.getByRole("button", { name: "Cancel search", exact: true }).click();
  await c.page.getByRole("button", { name: "Find Rated Match", exact: true }).waitFor();
  await c.page.getByRole("button", { name: "Find Rated Match", exact: true }).click();
  await c.page.getByRole("button", { name: "Cancel search", exact: true }).waitFor();
  await c.page.evaluate(async () =>
    (await import("/src/auth/authStore.ts")).authStore.getState().logout(),
  );
  const status = await c.context.request.get(`${apiUrl}/api/matchmaking/queue`, {
    headers: { authorization: `Bearer ${c.account.accessToken}` },
  });
  assert.equal((await status.json()).status, "NOT_QUEUED");
  assert.deepEqual(errors, []);
  console.log(
    "Matchmaking browser: real PostgreSQL/auth/WS, queue refresh, same-account tabs, automatic shared room/opposite seats, Rated visibility, third-user protection, Cancel/logout, reduced motion and 1920/1366/768/390 screenshots passed",
  );
} catch (error) {
  console.error("Matchmaking browser page errors:", errors);
  let failurePage = 0;
  for (const context of browser?.contexts() ?? []) {
    for (const page of context.pages()) {
      await page.screenshot({ path: path.join(output, `failure-${++failurePage}.png`), timeout: 10000 })
        .catch(() => undefined);
    }
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
  await db.match.deleteMany({
    where: {
      OR: [
        { roomId: { in: roomIds } },
        { participants: { some: { userId: { in: users } } } },
      ],
    },
  });
  await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
