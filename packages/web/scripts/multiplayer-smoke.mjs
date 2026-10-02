import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../../scripts/testDatabase.cjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const databaseUrl = configureTestDatabase();
const browserPath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((candidate) => candidate && fs.existsSync(candidate));
if (!browserPath) throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const serverPort = Number(process.env.MULTIPLAYER_TEST_SERVER_PORT ?? 3106);
const webPort = Number(process.env.MULTIPLAYER_TEST_WEB_PORT ?? 5176);
const apiUrl = `http://127.0.0.1:${serverPort}`,
  webUrl = `http://127.0.0.1:${webPort}`;
const children = [],
  users = [],
  rooms = [];
const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
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
async function waitFor(check, description) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}
let browser;
try {
  await database.$connect();
  start(
    [path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"), "packages/server/src/index.ts"],
    repoRoot,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: String(serverPort),
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      WEB_ORIGIN: webUrl,
      AUTH_TRUSTED_ORIGINS: webUrl,
      JWT_ACCESS_SECRET: "phase6-browser-access-01234567890123456789",
      JWT_REFRESH_SECRET: "phase6-browser-refresh-01234567890123456789",
    },
  );
  start(
    [
      path.join(repoRoot, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    path.join(repoRoot, "packages/web"),
    { VITE_API_URL: apiUrl, VITE_WS_URL: apiUrl.replace("http:", "ws:") + "/ws" },
  );
  await Promise.all(
    [apiUrl + "/health", webUrl].map((target) =>
      waitFor(async () => {
        try {
          return (await fetch(target)).ok;
        } catch {
          return false;
        }
      }, "service startup"),
    ),
  );
  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const contextA = await browser.newContext({ locale: "en-US" }),
    contextB = await browser.newContext({ locale: "en-US" });
  const pageA = await contextA.newPage(),
    pageB = await contextB.newPage();
  const errors = [];
  for (const page of [pageA, pageB]) page.on("pageerror", (error) => errors.push(error.message));
  await Promise.all([pageA.goto(webUrl), pageB.goto(webUrl)]);
  const suffix = randomUUID().slice(0, 8);
  async function register(page, seat) {
    const id = await page.evaluate(
      async ({ suffix, seat }) => {
        const { authStore } = await import("/src/auth/authStore.ts");
        await authStore.getState().initializeSession();
        await authStore
          .getState()
          .register({
            email: `phase6-${seat}-${suffix}@example.test`,
            username: `Phase6_${seat}_${suffix}`,
            password: "Browser-test-password-123!",
          });
        return authStore.getState().user.id;
      },
      { suffix, seat },
    );
    users.push(id);
    return id;
  }
  const userA = await register(pageA, "A"),
    userB = await register(pageB, "B");
  await pageA.evaluate(async () => {
    const { useGameStore } = await import("/src/store.ts");
    await useGameStore.getState().joinRoom({ mode: "create", role: "P1" });
  });
  const roomId = await waitFor(
    () =>
      pageA.evaluate(async () => {
        const { useGameStore } = await import("/src/store.ts");
        return useGameStore.getState().joined && useGameStore.getState().roomId;
      }),
    "P1 join",
  );
  rooms.push(roomId);
  const guestContext = await browser.newContext({ locale: "en-US" });
  const guest = await guestContext.newPage();
  await guest.goto(webUrl);
  await guest.evaluate(async () => {
    const { useGameStore } = await import("/src/store.ts");
    await useGameStore.getState().joinRoom({ mode: "create", role: "P1" });
  });
  await guest.waitForURL(webUrl + "/login?returnTo=%2F");
  await guest.getByLabel("Email", { exact: true }).waitFor();
  await guest.goto(webUrl);
  await guest.evaluate(async (roomId) => {
    await (await import("/src/store.ts")).useGameStore
      .getState()
      .joinRoom({ mode: "join", roomId, role: "spectator" });
  }, roomId);
  await guest.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.joined && state.role === "spectator";
  });
  await pageB.evaluate(async (roomId) => {
    const { useGameStore } = await import("/src/store.ts");
    await useGameStore.getState().joinRoom({ mode: "join", roomId, role: "P2" });
  }, roomId);
  await waitFor(
    () =>
      pageB.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().joined),
    "P2 join",
  );
  const match = await database.match.findUniqueOrThrow({
    where: { roomId },
    include: { participants: true },
  });
  assert.equal(match.createdById, userA);
  assert.deepEqual(match.participants.map((p) => p.userId).sort(), [userA, userB].sort());
  for (const page of [pageA, pageB])
    await page.evaluate(async () =>
      (await import("/src/store.ts")).useGameStore.getState().setReady(true),
    );
  await pageA.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.roomMeta?.ready.P1 && state.roomMeta.ready.P2;
  });
  await pageA.evaluate(async () =>
    (await import("/src/store.ts")).useGameStore.getState().startGame(),
  );
  await waitFor(
    async () => (await database.match.findUnique({ where: { roomId } }))?.status === "IN_PROGRESS",
    "match start",
  );
  const before = await pageA.evaluate(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return { token: state.resumeToken, revision: state.roomMeta.revision };
  });
  let refreshes = 0;
  pageA.on("request", (request) => {
    if (request.url() === apiUrl + "/api/auth/refresh") refreshes++;
  });
  await pageA.reload();
  await pageA.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.joined && state.hasSnapshot && state.seat === "P1";
  });
  const after = await waitFor(
    () =>
      pageA.evaluate(async () => {
        const state = (await import("/src/store.ts")).useGameStore.getState();
        return state.joined && state.hasSnapshot && state.roomMeta.pendingRoll
          ? { token: state.resumeToken, revision: state.roomMeta.revision }
          : null;
      }),
    "active authoritative snapshot after reload",
  );
  assert.deepEqual(after, before);
  assert.equal(refreshes, 1);
  await pageA.evaluate(async () => {
    const { authStore } = await import("/src/auth/authStore.ts");
    authStore.setState({ accessTokenExpiresAt: Date.now() - 1 });
    await (await import("/src/store.ts")).useGameStore.getState().resumeRoom({ force: true });
  });
  await pageA.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.joined && state.hasSnapshot && state.roomMeta.pendingRoll;
  });
  assert.equal(refreshes, 2, "expired token reconnect uses existing HTTP refresh once");
  assert.equal(await database.matchParticipant.count({ where: { matchId: match.id } }), 2);
  assert.equal(
    await pageA.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value),
      ),
    ),
    false,
  );
  await pageB.evaluate(
    async ({ roomId, resumeToken }) => {
      const { authStore } = await import("/src/auth/authStore.ts");
      const socket = new WebSocket((await import("/src/api/config.ts")).WS_BASE);
      window.phase6Mismatch = new Promise((resolve) => {
        socket.onopen = () =>
          socket.send(
            JSON.stringify({
              type: "joinRoom",
              mode: "join",
              roomId,
              role: "P1",
              resumeToken,
              accessToken: authStore.getState().accessToken,
            }),
          );
        socket.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === "error") {
            socket.close();
            resolve(msg.code);
          }
        };
      });
    },
    { roomId, resumeToken: before.token },
  );
  assert.equal(await pageB.evaluate(() => window.phase6Mismatch), "RESUME_IDENTITY_MISMATCH");
  await pageA.evaluate(async () =>
    (await import("/src/auth/authStore.ts")).authStore.getState().logout(),
  );
  assert.equal(
    await pageA.evaluate(
      async () => (await import("/src/store.ts")).useGameStore.getState().joined,
    ),
    true,
  );
  const matchesBeforeSandbox = await database.match.count();
  await guest.evaluate(async () => {
    await (await import("/src/store.ts")).useGameStore.getState().joinRoom({
      mode: "create", role: "P1", roomMode: "test",
    });
  });
  await guest.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.joined && state.hasSnapshot && state.roomMeta.roomMode === "test";
  });
  await guest.reload();
  await guest.waitForFunction(async () => {
    const state = (await import("/src/store.ts")).useGameStore.getState();
    return state.joined && state.hasSnapshot && state.roomMeta.roomMode === "test" && state.seat === "P1";
  });
  assert.equal(await database.match.count(), matchesBeforeSandbox);
  assert.deepEqual(errors, []);
  console.log(
    "browser multiplayer: guest login redirect, anonymous spectator, two accounts, participants, start, F5, expired-token refresh, resume mismatch, memory-only tokens, logout and anonymous sandbox F5 passed",
  );
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
  await database.match.deleteMany({ where: { roomId: { in: rooms } } });
  await database.user.deleteMany({ where: { id: { in: users } } });
  await database.$disconnect();
}
