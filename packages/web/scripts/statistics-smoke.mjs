import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

// HTTP fixtures exercise the complete routed UI without touching a database.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.STATISTICS_TEST_WEB_PORT ?? 5196);
const baseUrl = `http://127.0.0.1:${port}`;
const apiUrl = "http://127.0.0.1:3196";
const output = path.join(root, "packages/web/test-results/statistics");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((candidate) => candidate && fs.existsSync(candidate));
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
    stdio: "ignore",
    env: { ...process.env, VITE_API_URL: apiUrl, VITE_WS_URL: "ws://127.0.0.1:3196/ws" },
  },
);

const owner = {
  id: "owner",
  username: "Owner",
  displayName: "The wandering tactician",
  avatarUrl: null,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  email: "owner@example.test",
  preferredLanguage: "en",
  preferredTheme: "dark",
};
const profiles = {
  Veteran: { ...owner, id: "veteran", username: "Veteran", displayName: "The wandering tactician" },
  NewPlayer: { ...owner, id: "new", username: "NewPlayer", displayName: "A new beginning" },
  SmallSample: { ...owner, id: "small", username: "SmallSample", displayName: "First battles" },
  Partial: {
    ...owner,
    id: "partial",
    username: "Partial",
    displayName: "A history still being written",
  },
  Dominant: { ...owner, id: "dominant", username: "Dominant", displayName: "Classic strategist" },
  LongPlayerName_123456789012345678: {
    ...owner,
    id: "long",
    username: "LongPlayerName_123456789012345678",
    displayName: "An exceptionally long display name for responsive profile testing",
  },
};
function summary(gamesPlayed, wins, losses, draws = 0) {
  return {
    gamesPlayed,
    wins,
    losses,
    draws,
    winRate: gamesPlayed ? wins / gamesPlayed : 0,
    averageDurationMs: gamesPlayed ? 1112000 : null,
    durationSampleSize: gamesPlayed,
    averageTurns: gamesPlayed ? 24 : null,
    turnCountSampleSize: gamesPlayed,
  };
}
function statistics(id) {
  const small = id === "small",
    empty = id === "new";
  const overall = {
    ...summary(
      empty ? 0 : small ? 3 : 64,
      empty ? 0 : small ? 2 : 40,
      empty ? 0 : small ? 1 : 23,
      empty || small ? 0 : 1,
    ),
    currentStreak: { type: empty ? null : "WIN", count: empty ? 0 : small ? 1 : 4 },
    longestWinStreak: empty ? 0 : small ? 1 : 9,
    longestLossStreak: empty ? 0 : small ? 1 : 3,
  };
  const byGameMode = empty
    ? []
    : small
      ? [{ ...summary(3, 2, 1), gameMode: "classic" }]
      : [
          { ...summary(34, 23, 11), gameMode: "classic" },
          { ...summary(29, 17, 12), gameMode: "standard" },
          { ...summary(1, 0, 0, 1), gameMode: "draft" },
        ];
  if (id === "partial") {
    overall.averageDurationMs = null;
    overall.durationSampleSize = 0;
    overall.turnCountSampleSize = 12;
    for (const mode of byGameMode) {
      mode.averageDurationMs = null;
      mode.durationSampleSize = 0;
      mode.turnCountSampleSize = mode.gameMode === "standard" ? 12 : 0;
      mode.averageTurns = mode.turnCountSampleSize ? 24 : null;
    }
  }
  if (id === "dominant")
    byGameMode.splice(0, byGameMode.length, { ...summary(64, 40, 23, 1), gameMode: "classic" });
  return { userId: id, overall, byGameMode };
}
const recent = ["WIN", "LOSS", "WIN", "WIN", "DRAW", "LOSS", "WIN", "WIN", "WIN", "WIN"].map(
  (result, index) => ({
    id: `recent-${index}`,
    status: "FINISHED",
    gameMode: result === "DRAW" ? "draft" : index % 3 === 0 ? "standard" : "classic",
    createdAt: `2026-09-${String(index + 10).padStart(2, "0")}T10:00:00Z`,
    startedAt: null,
    finishedAt: `2026-09-${String(index + 10).padStart(2, "0")}T10:18:32Z`,
    durationMs: 1112000,
    finishReason: "allEnemyUnitsDefeated",
    finalRevision: 42,
    turnCount: 24,
    seat: "P1",
    result,
    opponent: {
      userId: "opponent",
      seat: "P2",
      username: "Opponent",
      avatarUrl: null,
      displayName:
        index === 4 ? "An unusually long historical opponent display name" : "Historical opponent",
    },
  }),
);
let signedIn = false;
let statsFailure = false;
let recentFailure = false;
const requests = [];
let browser, page;
const errors = [];
async function noOverflow() {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
}
async function screenshot(name) {
  await noOverflow();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
try {
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error("Vite exited before startup");
    try {
      if ((await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true;
        break;
      }
    } catch {
      /* service startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert(ready, "Vite startup timed out");
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
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
    const fail = (code, status = 503) => send({ error: { code, message: code } }, status);
    if (url.pathname === "/api/capabilities")
      return send({ testRooms: { enabled: false, requiresToken: false } });
    if (url.pathname === "/api/auth/refresh")
      return signedIn
        ? send({ accessToken: "fixture-only", accessTokenExpiresIn: 900 })
        : fail("UNAUTHORIZED", 401);
    if (url.pathname === "/api/auth/me") return send({ user: owner });
    if (url.pathname === "/api/profile") {
      if (route.request().method() === "PATCH")
        Object.assign(owner, route.request().postDataJSON());
      return send({ profile: owner });
    }
    const stats = url.pathname.match(/^\/api\/users\/([^/]+)\/statistics$/);
    if (stats) return statsFailure ? fail("SERVER_ERROR") : send(statistics(stats[1]));
    const history = url.pathname.match(/^\/api\/users\/([^/]+)\/matches$/);
    if (history) {
      if (recentFailure) return fail("SERVER_ERROR");
      const id = history[1];
      const items =
        id === "new"
          ? []
          : id === "small"
            ? recent
                .slice(0, 3)
                .map((item) => ({ ...item, gameMode: "classic" }))
                .reverse()
            : [...recent]
                .map((item) => (id === "dominant" ? { ...item, gameMode: "classic" } : item))
                .reverse();
      const limit = Number(url.searchParams.get("limit"));
      const total = statistics(id).overall.gamesPlayed;
      return send({
        items,
        pagination: {
          page: 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
    const user = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (user) {
      const profile = profiles[decodeURIComponent(user[1])];
      return profile ? send({ profile }) : fail("USER_NOT_FOUND", 404);
    }
    const detail = url.pathname.match(/^\/api\/matches\/(recent-\d+)$/);
    if (detail) {
      const match = recent.find((item) => item.id === detail[1]);
      return send({
        ...match,
        winner: null,
        loser: null,
        participants: [
          {
            userId: "veteran",
            seat: "P1",
            username: "Veteran",
            displayName: "The wandering tactician",
            avatarUrl: null,
            outcome: match.result,
          },
          {
            ...match.opponent,
            outcome: match.result === "WIN" ? "LOSS" : match.result === "LOSS" ? "WIN" : "DRAW",
          },
        ],
      });
    }
    if (/\/replay$/.test(url.pathname)) return fail("MATCH_NOT_REPLAYABLE", 409);
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  });
  const statisticsSection = page.getByTestId("player-statistics");
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await statisticsSection
    .getByRole("img", { name: "Recent sample win rate", exact: false })
    .waitFor();
  assert.equal(
    await statisticsSection
      .getByRole("link", { name: "View all matches", exact: true })
      .getAttribute("href"),
    "/users/Veteran/matches",
  );
  assert.equal(await statisticsSection.locator(".stats-results a").count(), 10);
  assert(
    await page
      .locator(".profile-identity")
      .getByRole("heading", { name: "The wandering tactician", exact: true })
      .isVisible(),
  );
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await screenshot(`established-dark-${viewport.width}`);
  }
  // Open the built-in text alternative on touch and inspect the result navigation.
  await statisticsSection.locator("summary").click();
  await statisticsSection.getByText("Match 10 · sample win rate 70%", { exact: true }).waitFor();
  await screenshot("recent-details-mobile");
  const firstResult = statisticsSection.locator(".stats-results a").first();
  assert.equal(await firstResult.getAttribute("href"), "/matches/recent-0");
  await firstResult.click();
  await page.getByTestId("match-details-page").waitFor();
  await page.goBack();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await statisticsSection.getByRole("link", { name: "View all matches", exact: true }).click();
  await page.getByTestId("match-history-page").waitFor();
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("FATE_LANGUAGE", "uk");
  });
  await page.reload();
  await statisticsSection.getByRole("heading", { name: "Режими гри", exact: true }).waitFor();
  await screenshot("established-light-uk-mobile");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await statisticsSection
      .locator(".stats-overview")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  for (const [name, filename] of [
    ["NewPlayer", "zero"],
    ["SmallSample", "small-sample"],
    ["Partial", "partial-coverage"],
    ["Dominant", "dominant-mode"],
    ["LongPlayerName_123456789012345678", "long-identity"],
  ]) {
    await page.goto(`${baseUrl}/users/${name}`);
    await statisticsSection
      .getByText(
        name === "NewPlayer" ? "No match data yet" : name === "SmallSample" ? "66.7%" : "62.5%",
        { exact: true },
      )
      .first()
      .waitFor();
    await screenshot(`${filename}-mobile`);
    if (name === "NewPlayer") {
      assert.equal(await statisticsSection.getByRole("link").count(), 0);
      assert.equal(await statisticsSection.getByRole("img").count(), 0);
    }
  }
  statsFailure = true;
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection
    .getByRole("heading", { name: "Statistics unavailable", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByTestId("public-profile-page")
      .getByRole("heading", { name: "The wandering tactician", exact: true })
      .count(),
    1,
  );
  await screenshot("statistics-error-mobile");
  statsFailure = false;
  await statisticsSection.getByRole("button", { name: "Try again", exact: true }).click();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  recentFailure = true;
  await page.reload();
  await statisticsSection
    .getByText("Unable to load recent performance. Your career statistics are still available.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await statisticsSection.getByText("62.5%", { exact: true }).count(), 1);
  recentFailure = false;
  await statisticsSection.getByRole("button", { name: "Try again", exact: true }).click();
  await statisticsSection
    .getByRole("img", { name: "Recent sample win rate", exact: false })
    .waitFor();
  signedIn = true;
  await page.goto(`${baseUrl}/profile`);
  await page
    .getByTestId("profile-page")
    .getByRole("button", { name: "Edit profile", exact: true })
    .waitFor();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  assert.equal(
    await statisticsSection
      .getByRole("link", { name: "View all matches", exact: true })
      .getAttribute("href"),
    "/matches",
  );
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Updated tactician");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("heading", { name: "Updated tactician", exact: true }).waitFor();
  const previousRequests = requests.filter(
    (value) => value === "/api/users/owner/statistics",
  ).length;
  await page
    .getByTestId("profile-page")
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  assert(
    requests.filter((value) => value === "/api/users/owner/statistics").length > previousRequests,
  );
  await screenshot("own-profile-mobile");
  await page.getByTestId("open-navigation").click();
  await page.getByTestId("mobile-sidebar").waitFor();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  assert(
    requests
      .filter((value) => /\/users\/.+\/matches\?/.test(value))
      .every(
        (value) =>
          new URL(value, apiUrl).searchParams.get("limit") === "10" ||
          new URL(value, apiUrl).searchParams.get("limit") === "20",
      ),
  );
  assert(!requests.some((value) => /snapshots|actions|replay\/state/.test(value)));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(
      {
        viewports: [1920, 1366, 768, 390],
        states: ["established", "zero", "small", "partial", "dominant", "long", "errors", "own"],
        locales: ["en", "uk"],
        themes: ["dark", "light"],
        errors,
        requests,
      },
      null,
      2,
    ),
  );
  console.log(
    "statistics browser smoke passed: public/own profiles, 4 viewports, dark/light, en/uk, empty/partial/error states, retry, match links, editing, refresh, mobile navigation and reduced motion",
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  vite.kill();
}
