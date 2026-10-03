import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../../scripts/testDatabase.cjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const databaseUrl = configureTestDatabase();
const serverPort = Number(process.env.HISTORY_TEST_SERVER_PORT ?? 3109);
const webPort = Number(process.env.HISTORY_TEST_WEB_PORT ?? 5189);
const apiUrl = `http://127.0.0.1:${serverPort}`;
const baseUrl = `http://127.0.0.1:${webPort}`;
const output = path.join(webRoot, "test-results", "match-history");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((value) => value && fs.existsSync(value));
if (!executablePath)
  throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");
const children = [],
  users = [],
  matches = [],
  registeredEmails = [];
const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
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
    PORT: String(serverPort),
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
      String(webPort),
      "--strictPort",
    ],
    webRoot,
    {
      VITE_API_URL: apiUrl,
      VITE_WS_URL: `ws://127.0.0.1:${serverPort}/ws`,
      VITE_PORT: String(webPort),
    },
  );
  await Promise.all([ready(`${apiUrl}/health`, server), ready(baseUrl, vite)]);
  const suffix = randomUUID().slice(0, 8),
    password = randomBytes(16).toString("hex");
  const accounts = [];
  for (const name of ["Alice", "Bob"]) {
    const email = `history-${name.toLowerCase()}-${suffix}@example.test`,
      username = `${name}_${suffix}`;
    const registered = await fetch(`${apiUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ email, username, password }),
    });
    assert.equal(registered.status, 201);
    registeredEmails.push(email);
    const user = await database.user.findUniqueOrThrow({ where: { email } });
    users.push(user.id);
    accounts.push({ id: user.id, email, username });
  }
  const [alice, bob] = accounts;
  for (let i = 0; i < 24; i++) {
    const result = i % 2 === 0 ? "WIN" : "LOSS";
    matches.push(
      (
        await database.match.create({
          data: {
            status: "FINISHED",
          matchType: "CASUAL",
            gameMode: ["standard", "classic", "draft"][i % 3],
            seed: 5,
            createdAt: new Date("2026-01-01T12:00:00Z"),
            startedAt: new Date("2026-01-01T12:00:00Z"),
            finishedAt: new Date(Date.UTC(2026, 0, i + 1, 12, 3)),
            durationMs: 180000,
            finalRevision: 42,
            turnCount: 18,
            finishReason: "allEnemyUnitsDefeated",
            winnerSeat: result === "WIN" ? "P1" : "P2",
            loserSeat: result === "WIN" ? "P2" : "P1",
            winnerUserId: result === "WIN" ? alice.id : bob.id,
            loserUserId: result === "WIN" ? bob.id : alice.id,
            participants: {
              create: [
                {
                  userId: alice.id,
                  seat: "P1",
                  displayNameSnapshot: "Historical Alice",
                  outcome: result,
                },
                {
                  userId: bob.id,
                  seat: "P2",
                  displayNameSnapshot: "Historical Bob",
                  outcome: result === "WIN" ? "LOSS" : "WIN",
                },
              ],
            },
          },
        })
      ).id,
    );
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
    locale: "en-US",
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const historyBody = page.getByTestId("match-history-page");
  async function expectRows(count) {
    await page.waitForFunction((expected) => {
      const view = document.querySelector('[data-testid="match-history-page"]');
      return (
        view?.querySelector('[aria-busy="false"]') &&
        view.querySelectorAll("li").length === expected
      );
    }, count);
    assert.equal(await historyBody.locator("li").count(), count);
  }
  await page.goto(`${baseUrl}/matches`);
  await page.waitForURL(/\/login\?returnTo=%2Fmatches/);
  await page.getByLabel("Email", { exact: true }).fill(alice.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${baseUrl}/matches`);
  await historyBody
    .getByRole("link", { name: /vs Historical Bob/ })
    .first()
    .waitFor();
  await expectRows(20);
  await page.screenshot({ path: path.join(output, "history-desktop.png") });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL(/page=2/);
  await historyBody
    .getByRole("link", { name: /vs Historical Bob/ })
    .first()
    .waitFor();
  await expectRows(4);
  assert.equal(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.waitForURL(/page=1/);
  await page.getByLabel("Result", { exact: true }).selectOption("WIN");
  await page.waitForURL(/result=WIN/);
  await historyBody
    .getByRole("link", { name: /Win · vs Historical Bob/ })
    .first()
    .waitFor();
  await expectRows(12);
  await page.getByLabel("Result", { exact: true }).selectOption("LOSS");
  await page.waitForURL(/result=LOSS/);
  await historyBody
    .getByRole("link", { name: /Loss · vs Historical Bob/ })
    .first()
    .waitFor();
  await expectRows(12);
  await page.getByLabel("Result", { exact: true }).selectOption("WIN");
  await page.waitForURL(/result=WIN/);
  await historyBody
    .getByRole("link", { name: /Win · vs Historical Bob/ })
    .first()
    .waitFor();
  await page.getByLabel("Game mode", { exact: true }).selectOption("classic");
  await page.waitForURL(/gameMode=classic/);
  await historyBody
    .getByRole("link", { name: /Win · vs Historical Bob/ })
    .first()
    .waitFor();
  await expectRows(4);
  await page.reload();
  await historyBody
    .getByRole("link", { name: /Win · vs Historical Bob/ })
    .first()
    .waitFor();
  assert.equal(await page.getByLabel("Result", { exact: true }).inputValue(), "WIN");
  assert.equal(await page.getByLabel("Game mode", { exact: true }).inputValue(), "classic");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, "history-mobile.png") });
  const link = historyBody.getByRole("link", { name: /Win · vs Historical Bob/ }).first();
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(`${baseUrl}${href}`);
  const details = page.getByTestId("match-details-page");
  await details.getByText("Historical Bob", { exact: true }).waitFor();
  const content = await details.innerText();
  assert.match(content, /P1 · Win/);
  assert.match(content, /P2 · Loss/);
  assert.match(content, /3m 00s/);
  assert.match(content, /Final revision[\s\S]*42/);
  assert.doesNotMatch(content, /actionPayload|rngState|rating/i);
  assert.equal(await details.getByRole("link", { name: "Watch Replay", exact: true }).count(), 0);
  await page.screenshot({ path: path.join(output, "details-mobile.png") });
  const renamed = `Renamed_${suffix}`;
  await database.profile.update({
    where: { userId: bob.id },
    data: { username: renamed, displayName: "New Bob" },
  });
  await page.reload();
  await details.getByRole("link", { name: `@${renamed}`, exact: true }).waitFor();
  assert.equal(await details.getByText("Historical Bob", { exact: true }).count(), 1);
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.screenshot({ path: path.join(output, "details-desktop.png") });
  await details.getByRole("link", { name: `@${renamed}`, exact: true }).click();
  await page.getByTestId("public-profile-page").getByText("New Bob", { exact: true }).waitFor();
  await page
    .getByTestId("public-profile-page")
    .getByRole("link", { name: "Match history", exact: true })
    .click();
  await historyBody
    .getByRole("link", { name: /vs Historical Alice/ })
    .first()
    .waitFor();
  assert.equal(new URL(page.url()).pathname, `/users/${renamed}/matches`);
  await page.goto(`${baseUrl}/profile`);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page.goto(`${baseUrl}/users/${renamed}/matches`);
  await historyBody
    .getByRole("link", { name: /vs Historical Alice/ })
    .first()
    .waitFor();
  await page.reload();
  await historyBody
    .getByRole("link", { name: /vs Historical Alice/ })
    .first()
    .waitFor();
  await page.getByLabel("Result", { exact: true }).selectOption("DRAW");
  await historyBody.getByText("No matches match these filters.", { exact: true }).waitFor();
  const publicResponse = await fetch(`${apiUrl}/api/users/${alice.id}/matches`);
  assert.equal(publicResponse.status, 200);
  assert.doesNotMatch(
    await publicResponse.text(),
    /email|passwordHash|AuthSession|token|resumeToken|connId|GameState|resultData/,
  );
  assert.deepEqual(failures, []);
  console.log(
    "browser match history: login, 24 persisted results, win/mode filters, pagination, F5, details, profile rename, public logout flow and desktop/mobile screenshots passed",
  );
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, "failure.png") });
  throw error;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  await database.match.deleteMany({ where: { id: { in: matches } } });
  await database.user.deleteMany({
    where: { OR: [{ id: { in: users } }, { email: { in: registeredEmails } }] },
  });
  await database.$disconnect();
}
