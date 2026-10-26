import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import rankTiers from "../../server/src/rating/rankTiers.ts";
const { getRankMetadata } = rankTiers;

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
  // Hero stats only cover matches with a recorded squad: Veteran has 12 of 64, NewPlayer none.
  const hero = (heroId, gamesPlayed, wins, losses) => ({
    heroId,
    gamesPlayed,
    wins,
    losses,
    draws: 0,
    winRate: wins / gamesPlayed,
  });
  const byHero = empty
    ? []
    : small
      ? [hero("guts", 3, 2, 1)]
      : [
          hero("guts", 9, 6, 3),
          hero("loki", 7, 4, 3),
          hero("grand-kaiser", 6, 5, 1),
          hero("sans", 5, 2, 3),
          hero("vladTepes", 4, 2, 2),
          hero("jebe", 2, 1, 1),
        ];
  return { userId: id, overall, byGameMode, byHero, heroSampleSize: empty ? 0 : small ? 3 : 12 };
}
const recent = ["WIN", "LOSS", "WIN", "WIN", "DRAW", "LOSS", "WIN", "WIN", "WIN", "WIN"].map(
  (result, index) => ({
    id: `recent-${index}`,
    status: "FINISHED",
    matchType: "CASUAL",
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
    // The oldest two predate squad recording.
    squad:
      index < 2
        ? null
        : [
            { class: "rider", heroId: index % 2 ? "guts" : "jebe" },
            { class: "spearman", heroId: null },
            { class: "trickster", heroId: "loki" },
            { class: "assassin", heroId: null },
            { class: "berserker", heroId: index % 3 ? "grand-kaiser" : null },
            { class: "archer", heroId: null },
            { class: "knight", heroId: "vladTepes" },
          ],
  }),
);
/** Deterministic rated games per player and mode, newest first like the API. The newest
 * entries carry the ids of the recent fixture matches of that mode, so rows show a delta. */
const ratedGameCounts = {
  veteran: { standard: 29, classic: 34, draft: 1 },
  small: { standard: 0, classic: 3, draft: 0 },
  partial: { standard: 12, classic: 8, draft: 0 },
  dominant: { standard: 0, classic: 40, draft: 0 },
  long: { standard: 6, classic: 3, draft: 2 },
};
function ratingHistory(id, gameMode) {
  const count = ratedGameCounts[id]?.[gameMode] ?? 0;
  const recentOfMode = [...recent]
    .reverse()
    .filter((item) => (id === "dominant" ? true : item.gameMode === gameMode))
    .slice(0, count);
  let seed = [...`${id}:${gameMode}`].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7);
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const results = Array.from(
    { length: count },
    (_, index) => recentOfMode[count - 1 - index]?.result ?? (random() < 0.62 ? "WIN" : "LOSS"),
  );
  let rating = 1500;
  const chronological = results.map((result, index) => {
    const delta =
      result === "WIN"
        ? 8 + random() * 10
        : result === "LOSS"
          ? -(7 + random() * 9)
          : random() * 4 - 2;
    const entry = {
      id: `${id}-${gameMode}-${index}`,
      gameMode,
      matchId: recentOfMode[count - 1 - index]?.id ?? `${id}-${gameMode}-match-${index}`,
      opponentUserId: "opponent",
      result,
      ratedGameNumber: index + 1,
      ratingBefore: rating,
      ratingAfter: rating + delta,
      ratingDelta: delta,
      ratingDeviationBefore: 80,
      ratingDeviationAfter: 78,
      volatilityBefore: 0.06,
      volatilityAfter: 0.06,
      createdAt: `2026-08-${String(1 + (index % 28)).padStart(2, "0")}T10:00:00Z`,
    };
    rating += delta;
    return entry;
  });
  return chronological.reverse();
}
function competitiveRating(id, gameMode) {
  const history = ratingHistory(id, gameMode);
  const rating = history[0]?.ratingAfter ?? 1500;
  return { rating, ratingDeviation: 74, ratedGames: history.length, ...getRankMetadata(rating) };
}
let signedIn = false;
let statsFailure = false;
let recentFailure = false;
let historyFailure = false;
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
    if (url.pathname === "/api/auth/me") return send({ user: { ...owner, role: "USER" } });
    if (url.pathname === "/api/profile") {
      if (route.request().method() === "PATCH")
        Object.assign(owner, route.request().postDataJSON());
      return send({ profile: owner });
    }
    if (url.pathname === "/api/competitive/config") return send({ minRatedGames: 5 });
    const ratings = url.pathname.match(/^\/api\/users\/([^/]+)\/ratings$/);
    if (ratings)
      return send({
        ratings: Object.fromEntries(
          ["standard", "draft", "classic"].map((gameMode) => [
            gameMode,
            competitiveRating(ratings[1], gameMode),
          ]),
        ),
      });
    const ratingHistoryMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/rating\/history$/);
    if (ratingHistoryMatch) {
      if (historyFailure) return fail("SERVER_ERROR");
      const gameMode = url.searchParams.get("gameMode");
      const items = ratingHistory(ratingHistoryMatch[1], gameMode);
      const limit = Number(url.searchParams.get("limit"));
      return send({
        items: items.slice(0, limit),
        pagination: {
          page: 1,
          limit,
          total: items.length,
          totalPages: Math.ceil(items.length / limit),
        },
      });
    }
    if (url.pathname.endsWith("/rating"))
      return send({ rating: 1500, ratingDeviation: 74, ratedGames: 2, ...getRankMetadata(1500) });
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
        items: items.slice(0, limit),
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
  const chart = page.getByTestId("profile-rating-chart");
  const recentSection = page.getByTestId("profile-recent-matches");
  const hero = page.getByTestId("profile-hero");
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await hero.getByText("The wandering tactician", { exact: true }).waitFor();
  // Classic has the most rated games, so the chart and the gold card open on it.
  await chart.getByRole("img", { name: /last 34 rated games/ }).waitFor();
  assert.equal(
    await page.getByTestId("profile-rank-classic").getAttribute("data-selected"),
    "true",
  );
  assert.equal(
    await recentSection
      .getByRole("link", { name: "View all matches", exact: true })
      .getAttribute("href"),
    "/users/Veteran/matches",
  );
  assert.equal(await recentSection.locator(".profile-match").count(), 5);
  assert(
    (await recentSection.locator(".profile-match__delta").allTextContents()).every((value) =>
      /^[+−]\d+$|^0$/.test(value),
    ),
  );
  assert.equal(await page.getByTestId("profile-private").count(), 0);
  const heroesSection = page.getByTestId("profile-heroes");
  assert.equal(await heroesSection.locator(".profile-hero-row").count(), 5);
  await heroesSection.getByText("Matches with a recorded squad: 12", { exact: true }).waitFor();
  assert.equal(await recentSection.locator(".profile-squad").count(), 5);
  // Hover and keyboard both reveal the point readout.
  const plot = chart.locator("svg");
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await chart.locator(".profile-chart__tooltip").waitFor();
  await screenshot("chart-hover-1920");
  await page.mouse.move(0, 0);
  await plot.focus();
  await page.keyboard.press("Home");
  await chart.locator(".profile-chart__tooltip").getByText("Start", { exact: true }).waitFor();
  await chart.getByRole("button", { name: "Standard", exact: true }).click();
  await chart.getByRole("img", { name: /last 29 rated games/ }).waitFor();
  assert.equal(
    await page.getByTestId("profile-rank-standard").getAttribute("data-selected"),
    "true",
  );
  await chart.getByRole("button", { name: "Classic", exact: true }).click();
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await screenshot(`established-dark-${viewport.width}`);
  }
  // Phones: one rank card at a time, switched by the tabs above it; the chart follows.
  const rankTabs = page.locator(".profile-mode-tabs--ranks");
  await rankTabs.getByRole("button", { name: "Draft", exact: true }).click();
  assert(await page.getByTestId("profile-rank-draft").isVisible());
  assert(!(await page.getByTestId("profile-rank-classic").isVisible()));
  await chart.getByRole("img", { name: /last 1 rated games/ }).waitFor();
  assert.equal(await recentSection.locator(".profile-match:visible").count(), 3);
  await screenshot("draft-mobile");
  await rankTabs.getByRole("button", { name: "Classic", exact: true }).click();
  const firstResult = recentSection.locator(".profile-match__main").first();
  assert.equal(await firstResult.getAttribute("href"), "/matches/recent-9");
  await firstResult.click();
  await page.getByTestId("match-details-page").waitFor();
  await page.goBack();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await recentSection.getByRole("link", { name: "View all matches", exact: true }).click();
  await page.getByTestId("match-history-page").waitFor();
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("FATE_LANGUAGE", "uk");
  });
  await page.reload();
  await chart.getByRole("heading", { name: "Історія рейтингу", exact: true }).waitFor();
  await screenshot("established-light-uk-mobile");
  await page.setViewportSize({ width: 1366, height: 768 });
  await screenshot("established-light-uk-1366");
  await page.setViewportSize({ width: 390, height: 844 });
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
      await chart.getByText("No rated games in this format yet.", { exact: true }).waitFor();
    }
  }
  statsFailure = true;
  await page.goto(`${baseUrl}/users/Veteran`);
  await statisticsSection
    .getByRole("heading", { name: "Statistics unavailable", exact: true })
    .waitFor();
  await hero.getByText("The wandering tactician", { exact: true }).waitFor();
  await chart.getByRole("img").waitFor();
  await screenshot("statistics-error-mobile");
  statsFailure = false;
  await statisticsSection.getByRole("button", { name: "Try again", exact: true }).click();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  recentFailure = true;
  historyFailure = true;
  await page.reload();
  await recentSection
    .getByText("Unable to load recent performance. Your career statistics are still available.", {
      exact: true,
    })
    .waitFor();
  await chart.getByText("Unable to load the rating history.", { exact: true }).waitFor();
  assert.equal(await statisticsSection.getByText("62.5%", { exact: true }).count(), 1);
  recentFailure = false;
  historyFailure = false;
  await recentSection.getByRole("button", { name: "Try again", exact: true }).click();
  await recentSection.locator(".profile-match").first().waitFor();
  await chart.getByRole("button", { name: "Try again", exact: true }).click();
  await chart.getByRole("img").waitFor();
  signedIn = true;
  await page.goto(`${baseUrl}/profile`);
  await page
    .getByTestId("profile-page")
    .getByRole("button", { name: "Edit profile", exact: true })
    .waitFor();
  await statisticsSection.getByText("62.5%", { exact: true }).waitFor();
  assert.equal(
    await recentSection
      .getByRole("link", { name: "View all matches", exact: true })
      .getAttribute("href"),
    "/matches",
  );
  await page.getByTestId("profile-private").getByText("owner@example.test").waitFor();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Updated tactician");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await hero.getByText("Updated tactician", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Change avatar", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await screenshot("own-profile-1366");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("own-profile-mobile");
  await page.getByTestId("open-navigation").click();
  await page.getByTestId("mobile-sidebar").waitFor();
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  assert(
    requests
      .filter((value) => /\/users\/.+\/matches\?/.test(value))
      .every(
        (value) =>
          new URL(value, apiUrl).searchParams.get("limit") === "5" ||
          new URL(value, apiUrl).searchParams.get("limit") === "20",
      ),
  );
  assert(
    requests
      .filter((value) => /\/rating\/history\?/.test(value))
      .every((value) => new URL(value, apiUrl).searchParams.get("limit") === "100"),
  );
  assert(!requests.some((value) => /snapshots|actions|replay\/state/.test(value)));
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(
      {
        viewports: [1920, 1366, 768, 390],
        states: [
          "established",
          "chart-hover",
          "mobile-rank-tabs",
          "zero",
          "small",
          "partial",
          "dominant",
          "long",
          "errors",
          "own",
        ],
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
    "profile browser smoke passed: public/own profiles, rating chart hover and keyboard, format tabs, 4 viewports, dark/light, en/uk, empty/partial/error states, retry, match links, private block, editing and mobile navigation",
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  vite.kill();
}
