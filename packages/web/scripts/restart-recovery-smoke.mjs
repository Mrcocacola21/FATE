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
const apiPort = Number(process.env.RECOVERY_TEST_SERVER_PORT ?? 3193);
const webPort = Number(process.env.RECOVERY_TEST_WEB_PORT ?? 5193);
const apiUrl = `http://127.0.0.1:${apiPort}`, webUrl = `http://127.0.0.1:${webPort}`;
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/chromium"].find(p => p && fs.existsSync(p));
if (!executablePath) throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const output = path.join(root, "packages/web/test-results/restart-recovery");
fs.mkdirSync(output, { recursive: true });
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const children = [], users = [], rooms = [], errors = [];
const frames = [];
let browser;
const pages = [];
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: "ignore" });
  children.push(child);
  return child;
}
async function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGKILL");
  await exited;
}
const backend = () => start([path.join(root, "packages/server/dist/index.js")], root, {
  NODE_ENV: "test", LOG_LEVEL: "silent", PORT: String(apiPort),
  DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, WEB_ORIGIN: webUrl,
  JWT_ACCESS_SECRET: "restart-browser-access-01234567890123456789",
  JWT_REFRESH_SECRET: "restart-browser-refresh-01234567890123456789",
});
async function until(check, description) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const result = await check(); if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}
const healthy = async () => {
  try { return (await fetch(`${apiUrl}/ready`)).ok && (await fetch(webUrl)).ok; } catch { return false; }
};
async function state(page) {
  return page.evaluate(async () => {
    const game = (await import("/src/store.ts")).useGameStore.getState();
    return { joined: game.joined, roomId: game.roomId, seat: game.seat, role: game.role,
      revision: game.roomMeta?.revision, view: game.roomState, pending: game.roomMeta?.pendingRoll,
      hasSnapshot: game.hasSnapshot, joinError: game.joinError };
  });
}
try {
  let server = backend();
  start([path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    path.join(root, "packages/web"), { VITE_API_URL: apiUrl, VITE_WS_URL: `ws://127.0.0.1:${apiPort}/ws` });
  await until(healthy, "local services ready");
  browser = await chromium.launch({ executablePath, headless: true });
  for (const seat of ["P1", "P2"]) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("FATE_LANGUAGE", "en"));
    const username = `restart_${seat}_${randomUUID().slice(0, 8)}`;
    const response = await context.request.post(`${apiUrl}/api/auth/register`, { headers: { origin: webUrl },
      data: { email: `${username}@example.test`, username, password: "Restart-test-password-123!" } });
    assert.equal(response.status(), 201); users.push((await response.json()).user.id);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => {
      socket.on("framesent", ({ payload }) => { try { frames.push({ seat, direction: "sent", type: JSON.parse(payload).type }); } catch {} });
      socket.on("framereceived", ({ payload }) => { try { const msg = JSON.parse(payload); frames.push({ seat, direction: "received", type: msg.type, code: msg.code }); } catch {} });
    });
    await page.goto(webUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Find Rated Match", exact: true }).waitFor();
    pages.push(page);
  }
  const [p1, p2] = pages;
  await p1.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().joinRoom({ mode: "create", role: "P1", gameMode: "classic" }));
  const roomId = await until(async () => { const s = await state(p1); return s.joined && s.roomId; }, "create persistent match");
  rooms.push(roomId);
  await p2.evaluate(async roomId => (await import("/src/store.ts")).useGameStore.getState().joinRoom({ mode: "join", role: "P2", roomId }), roomId);
  await until(async () => (await state(p2)).joined, "P2 joins");
  for (const page of pages) await page.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().setReady(true));
  await until(() => p1.evaluate(async () => { const g = (await import("/src/store.ts")).useGameStore.getState(); return g.roomMeta.ready.P1 && g.roomMeta.ready.P2; }), "both players ready");
  await p1.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().startGame());
  await until(async () => !!(await state(p1)).pending, "pending initiative");
  const match = await db.match.findUniqueOrThrow({ where: { roomId } });
  const before = await Promise.all(pages.map(state));
  const revision = before[0].revision;
  await until(async () => (await db.matchAction.count({ where: { matchId: match.id } })) === revision, "journal durable");
  await p1.screenshot({ path: path.join(output, "before-crash.png"), fullPage: true });
  // Kill the actual child process: no shutdown drain and no client refresh/manual room creation.
  await kill(server);
  await until(async () => !(await state(p1)).joined, "client detects hard process crash");
  server = backend(); await until(healthy, "fresh process recovery ready");
  for (const [index, page] of pages.entries()) await until(async () => {
    const s = await state(page); return s.joined && s.hasSnapshot && s.seat === (index ? "P2" : "P1") && s.revision === revision;
  }, "automatic authenticated seat reclaim");
  const after = await Promise.all(pages.map(state));
  for (const [index, restored] of after.entries()) {
    assert.equal(restored.roomId, roomId); assert.deepEqual(restored.view, before[index].view);
    assert.deepEqual(restored.pending, before[index].pending);
  }
  assert.equal((await db.match.findUniqueOrThrow({ where: { roomId } })).id, match.id);
  const acting = after[0].pending.player === "P1" ? p1 : p2;
  await acting.evaluate(async id => (await import("/src/store.ts")).useGameStore.getState().resolvePendingRoll(id), after[0].pending.id);
  await until(async () => (await state(p1)).revision === revision + 1, "next action continues at N+1");
  await until(async () => (await db.matchAction.count({ where: { matchId: match.id, revision: revision + 1 } })) === 1, "one durable next action");
  await p1.screenshot({ path: path.join(output, "restored-and-continued.png"), fullPage: true });
  // A second crash with deliberately corrupt durable data yields a localized terminal notice.
  await kill(server);
  await until(async () => !(await state(p1)).joined, "second disconnect");
  await db.matchAction.update({ where: { matchId_revision: { matchId: match.id, revision: 1 } }, data: { actionPayload: {} } });
  server = backend(); await until(healthy, "corrupt match isolated at startup");
  await p1.getByRole("alert").filter({ hasText: "This match was interrupted by a server restart and cannot be resumed." }).waitFor();
  assert.equal((await state(p1)).joinError, "MATCH_INTERRUPTED");
  assert.equal((await db.match.findUniqueOrThrow({ where: { id: match.id } })).status, "CANCELLED");
  await p1.screenshot({ path: path.join(output, "interrupted-notice.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Real browser hard-crash recovery: automatic P1/P2 reclaim, exact pending state, N+1, second-crash interruption UX passed");
} catch (error) {
  console.error("Restart failure", error.message);
  console.error("Browser restart diagnostics", await Promise.allSettled(pages.map(async page => {
    const s = await state(page);
    return { joined: s.joined, revision: s.revision, seat: s.seat, joinError: s.joinError,
      connection: await page.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().connectionStatus) };
  })));
  console.error("Durable lifecycle", await db.match.findMany({ where: { roomId: { in: rooms } }, select: { status: true, finishReason: true } }));
  console.error("Recent transport message types", frames.slice(-35));
  throw error;
} finally {
  await browser?.close();
  for (const child of children) await kill(child);
  await db.match.deleteMany({ where: { roomId: { in: rooms } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
