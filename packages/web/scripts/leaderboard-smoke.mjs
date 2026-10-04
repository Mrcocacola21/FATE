import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import rankTiers from "../../server/src/rating/rankTiers.ts";
const { getRatingTier, getRankMetadata } = rankTiers;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.LEADERBOARD_TEST_WEB_PORT ?? 5197);
const baseUrl = `http://127.0.0.1:${port}`,
  apiUrl = "http://127.0.0.1:3197";
const output = path.join(root, "packages/web/test-results/leaderboard");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
if (!executablePath) throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const vite = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: path.join(root, "packages/web"),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, VITE_API_URL: apiUrl, VITE_WS_URL: "ws://127.0.0.1:3197/ws" },
  },
);
const requests = [],
  errors = [];
let viteOutput = "";
for (const stream of [vite.stdout, vite.stderr])
  stream.on("data", (chunk) => {
    viteOutput = (viteOutput + chunk).slice(-4000);
  });
let mode = "normal",
  delay = 0,
  browser;
let page;
function player(index, provisional = false) {
  const long = index === 1;
  const games = provisional ? (index % 4) + 1 : 70 - index;
  const wins = Math.floor(games * 0.6),
    losses = games - wins;
  return {
    ratingRank: provisional ? null : index + 1,
    user: {
      id: `player-${index}`,
      username: long
        ? "LongPlayerName_12345678901234567890123456789012345678"
        : `Tactician${index + 1}`,
      displayName: long
        ? "An exceptionally long display name for responsive standings testing"
        : ["The Black Swordsman", "Tactician", "Midland Strategist"][index % 3],
      avatarUrl: index === 2 ? "javascript:bad" : null,
    },
    rating: 1824.371 - index * 12,
    rankTier: getRatingTier(1824.371 - index * 12),
    ratingDeviation: provisional ? 280 : 54 + index,
    ratedGames: games,
    wins,
    losses,
    draws: 0,
    winRate: wins / games,
    lastActivity: "2026-10-03T08:00:00Z",
    performanceAvailable: true,
    status: provisional ? "PROVISIONAL" : "QUALIFIED",
    gamesUntilQualified: provisional ? 5 - games : 0,
  };
}
async function noOverflow(page) {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "horizontal overflow",
  );
  assert(
    await page.evaluate(() =>
      [...document.querySelectorAll(".leaderboard-panel")].every(
        (el) => el.scrollWidth <= el.clientWidth + 1,
      ),
    ),
    "panel overflow",
  );
}
async function capture(page, name) {
  await noOverflow(page);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: path.join(output, `${name}-viewport.png`),
    animations: "disabled",
  });
}
try {
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error("Vite exited before startup");
    try {
      if ((await fetch(baseUrl, { signal: AbortSignal.timeout(5000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(ready, `Vite startup timed out: ${viteOutput}`);
  browser = await chromium.launch({ executablePath, headless: true, timeout: 120000 });
  page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    timezoneId: "Europe/Kyiv",
  });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("theme")) localStorage.setItem("theme", "dark");
    if (!localStorage.getItem("FATE_LANGUAGE")) localStorage.setItem("FATE_LANGUAGE", "en");
  });
  await page.route(`${apiUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const send = (data, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/api/capabilities")
      return send({ testRooms: { enabled: false, requiresToken: false } });
    if (url.pathname === "/api/auth/refresh") return send({ error: { code: "UNAUTHORIZED" } }, 401);
    if (url.pathname === "/api/leaderboard") {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (mode === "error") return send({ error: { code: "DATABASE_UNAVAILABLE" } }, 503);
      const query = url.searchParams,
        provisional = query.get("status") === "provisional";
      const pageNumber = Number(query.get("page") ?? 1),
        limit = Number(query.get("limit") ?? 20);
      const total = mode === "empty" ? 0 : mode === "large" ? 200000 : provisional ? 4 : 41;
      const items = Array.from(
        { length: Math.min(limit, Math.max(0, total - (pageNumber - 1) * limit)) },
        (_, i) => player((pageNumber - 1) * limit + i, provisional),
      );
      return send({
        items,
        pagination: { page: pageNumber, limit, total, totalPages: Math.ceil(total / limit) },
        qualification: { minRatedGames: 5 },
      });
    }
    if (/^\/api\/users\/[^/]+$/.test(url.pathname))
      return send({
        profile: {
          ...player(0).user,
          username: url.pathname.split("/").at(-1),
          createdAt: "2026-10-03T08:00:00Z",
        },
      });
    if (url.pathname.endsWith("/statistics"))
      return send({ error: { code: "DATABASE_UNAVAILABLE" } }, 503);
    if (url.pathname === "/api/competitive/config") return send({ minRatedGames: 5 });
    if (url.pathname.endsWith("/ratings"))
      return send({
        ratings: Object.fromEntries(
          ["standard", "draft", "classic"].map((gameMode) => [
            gameMode,
            {
              rating: player(0).rating,
              ratingDeviation: 74,
              ratedGames: 10,
              ...getRankMetadata(player(0).rating),
            },
          ]),
        ),
      });
    if (url.pathname.endsWith("/rating"))
      return send({
        rating: player(0).rating,
        ratingDeviation: 74,
        ratedGames: 10,
        ...getRankMetadata(player(0).rating),
      });
    if (url.pathname.endsWith("/matches"))
      return send({ items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    return send({ error: { code: "NOT_FOUND" } }, 404);
  });
  await page.goto(`${baseUrl}/leaderboard`, { waitUntil: "commit" });
  await page
    .getByText("Players enter the ranked leaderboard after 5 rated matches.")
    .waitFor({ timeout: 180000 });
  assert.equal(
    await page.getByRole("tab", { name: "Ranked", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page
      .locator('[data-testid="desktop-sidebar"] a[aria-current="page"]')
      .getAttribute("href"),
    "/leaderboard",
  );
  assert.equal(await page.locator('.leaderboard-table tbody tr[data-top="true"]').count(), 3);
  await capture(page, "ranked-1920");
  await page.setViewportSize({ width: 1366, height: 768 });
  await capture(page, "ranked-1366");
  await page.getByRole("tab", { name: "Provisional", exact: true }).click();
  await page.getByText("4 games until ranked", { exact: true }).first().waitFor();
  assert.equal(await page.locator(".leaderboard-table .leaderboard-rank").count(), 0);
  await capture(page, "provisional-1366");
  await page.getByRole("tab", { name: "Ranked", exact: true }).click();
  await page.getByLabel("Sort by", { exact: true }).selectOption("winRate");
  await page.waitForURL(/sort=winRate/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForURL(/page=2/);
  await page
    .locator(".leaderboard-table tbody tr .leaderboard-rank")
    .first()
    .filter({ hasText: "#21" })
    .waitFor({ timeout: 180000 });
  assert(requests.some((q) => q.includes("page=2") && q.includes("sort=winRate")));
  await page.goBack();
  await page.waitForURL(/page=1/);
  await page.getByRole("button", { name: "Sort ascending", exact: true }).click();
  await page.waitForURL(/order=asc/);
  await page.reload();
  await page.getByText("Players enter the ranked leaderboard after 5 rated matches.").waitFor();
  assert.match(page.url(), /sort=winRate.*order=asc/);
  await page.locator(".leaderboard-player:visible").first().click();
  await page.waitForURL(/\/users\/Tactician1/);
  assert.equal(await page.locator('[data-testid="app-shell"]').count(), 1);
  await page.goto(`${baseUrl}/leaderboard`);
  await page.getByText("Players enter the ranked leaderboard after 5 rated matches.").waitFor();
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture(page, "ranked-tablet");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "ranked-mobile");
  await page.getByRole("tab", { name: "Provisional", exact: true }).click();
  await page.getByText("4 games until ranked", { exact: true }).last().waitFor();
  await capture(page, "provisional-mobile");
  // Keyboard switching uses a roving focus tab list.
  await page.getByRole("tab", { name: "Provisional", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("tab", { name: "Ranked", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Ranked", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  mode = "empty";
  await page.reload();
  await page.getByText("No ranked players yet", { exact: true }).waitFor();
  await capture(page, "empty-ranked-mobile");
  await page.getByRole("tab", { name: "Provisional", exact: true }).click();
  await page.getByText("No provisional rated players yet", { exact: true }).waitFor();
  await capture(page, "empty-provisional-mobile");
  mode = "error";
  await page.reload();
  await page.getByText("Unable to load leaderboard", { exact: true }).waitFor();
  await capture(page, "error-mobile");
  mode = "normal";
  delay = 1500;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator('[aria-busy="true"]').waitFor();
  await capture(page, "loading-mobile");
  await page.getByText("4 games until ranked", { exact: true }).last().waitFor();
  delay = 0;
  mode = "large";
  await page.goto(`${baseUrl}/leaderboard`);
  await page.getByText("Page 1 of 10000", { exact: true }).waitFor();
  await capture(page, "large-page-count-mobile");
  assert.equal(
    await page.getByRole("navigation", { name: "Leaderboard pages" }).getByRole("button").count(),
    2,
  );
  mode = "normal";
  await page.goto(`${baseUrl}/leaderboard?status=whatever&sort=hacker&page=banana`);
  await page.waitForURL(/status=qualified/);
  await noOverflow(page);
  await page.evaluate(() => localStorage.setItem("FATE_LANGUAGE", "uk"));
  await page.reload();
  await page.getByRole("heading", { name: "Таблиця лідерів", exact: true }).waitFor();
  await page
    .getByText("Гравці потрапляють до основної таблиці після 5 рейтингових матчів.")
    .waitFor();
  await capture(page, "ranked-uk-mobile");
  assert.deepEqual(errors, []);
  console.log(
    "Leaderboard browser smoke passed: 1920x1080, 1366x768, 768x1024, 390x844; tabs/keyboard, sort/direction, URL/refresh/back, pagination/ranks, profile/AppShell, long names, RD, both empty states, loading/error/retry, large page counts, Ukrainian and no overflow/page errors.",
  );
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error(JSON.stringify({ errors, requests: requests.slice(-10), viteOutput }));
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  vite.kill();
}
