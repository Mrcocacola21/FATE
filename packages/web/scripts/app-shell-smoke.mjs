import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const webPort = Number(process.env.SHELL_TEST_WEB_PORT ?? 5187);
const apiPort = Number(process.env.SHELL_TEST_SERVER_PORT ?? 3117);
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const output = path.join(root, "packages/web/test-results/app-shell");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const children = [];
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
    if (child.exitCode !== null) throw new Error("Fixture exited before startup");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Fixture startup timed out");
}
let browser;
let page;
let step = "startup";
const errors = [];
try {
  const server = start(
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "packages/web/scripts/app-shell-server.ts"],
    root,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: String(apiPort),
      ENABLE_TEST_ROOMS: "true",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      DIRECT_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      WEB_ORIGIN: webUrl,
      AUTH_TRUSTED_ORIGINS: webUrl,
      JWT_ACCESS_SECRET: "shell-test-access-01234567890123456789",
      JWT_REFRESH_SECRET: "shell-test-refresh-01234567890123456789",
    },
  );
  await ready(`${apiUrl}/health`, server);
  const credentials = await (await fetch(`${apiUrl}/shell-test/credentials`)).json();
  const vite = start(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
      "--strictPort",
    ],
    path.join(root, "packages/web"),
    {
      VITE_API_URL: apiUrl,
      VITE_WS_URL: apiUrl.replace("http:", "ws:") + "/ws",
    },
  );
  await ready(webUrl, vite);
  browser = await chromium.launch({ executablePath, headless: true });
  async function contextFor({
    authenticated = true,
    testRooms = false,
    capabilityFailure = false,
  } = {}) {
    let signedIn = authenticated;
    let capabilityRequests = 0;
    const profile = {
      id: credentials.userId,
      username: "Commander",
      displayName: "Tactician",
      avatarUrl: null,
      email: "shell@example.test",
      createdAt: "2026-10-03T00:00:00Z",
      updatedAt: "2026-10-03T00:00:00Z",
      preferredLanguage: "en",
      preferredTheme: "dark",
    };
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addInitScript(() => {
      localStorage.setItem("theme", "dark");
      localStorage.setItem("FATE_LANGUAGE", "en");
    });
    await context.route(`${apiUrl}/api/**`, async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const json = (value, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
      if (pathname === "/api/capabilities") {
        capabilityRequests++;
        return capabilityFailure
          ? route.fulfill({ status: 503, body: "" })
          : json({ testRooms: { enabled: testRooms, requiresToken: false } });
      }
      if (pathname === "/api/auth/refresh")
        return signedIn
          ? json({ accessToken: credentials.accessToken, accessTokenExpiresIn: 900 })
          : json({ error: { code: "UNAUTHORIZED" } }, 401);
      if (pathname === "/api/auth/me") return json({ user: profile });
      if (pathname === "/api/auth/logout") {
        signedIn = false;
        return route.fulfill({ status: 204 });
      }
      if (pathname === "/api/profile") {
        if (request.method() === "PATCH") Object.assign(profile, request.postDataJSON());
        return json({ profile });
      }
      if (/^\/api\/users\/[^/]+\/matches$/.test(pathname))
        return json({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      if (pathname === "/api/users/Commander") return json({ profile });
      if (pathname === "/api/matches/example")
        return json({
          id: "example",
          status: "FINISHED",
          gameMode: "standard",
          createdAt: profile.createdAt,
          startedAt: profile.createdAt,
          finishedAt: "2026-10-03T00:05:00Z",
          durationMs: 300000,
          finishReason: "elimination",
          finalRevision: 12,
          turnCount: 4,
          winner: { userId: profile.id, seat: "P1", displayName: "Tactician" },
          loser: null,
          participants: [
            {
              userId: profile.id,
              seat: "P1",
              displayName: "Tactician",
              username: "Commander",
              avatarUrl: null,
              outcome: "WIN",
            },
          ],
        });
      return route.continue();
    });
    return { context, getCapabilityRequests: () => capabilityRequests };
  }
  async function screenshot(name) {
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  async function noOverflow() {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  const fixture = await contextFor();
  page = await fixture.context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(webUrl);
  await page.getByTestId("sidebar-account").waitFor();
  step = "desktop navigation, disabled capabilities and dialogs";
  assert.equal(await page.getByText("Heartbreak", { exact: true }).count(), 0);
  assert.equal(await page.getByTestId("developer-navigation").count(), 0);
  assert.equal(await page.locator("#room-id").count(), 0);
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await noOverflow();
    await screenshot(`play-${width}`);
  }
  await page.getByTestId("create-room").click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator("#player-name").count(), 0);
  await screenshot("create-match");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert(
    await page.getByTestId("create-room").evaluate((element) => element === document.activeElement),
  );
  await page.getByTestId("join-by-id").click();
  await page.getByLabel("Role", { exact: true }).selectOption("spectator");
  assert.equal(await page.locator("#player-name").count(), 1);
  await screenshot("join-by-id");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Match history", exact: true }).click();
  await page.getByTestId("match-history-page").waitFor();
  assert.equal(await page.locator('a[href="/matches"][aria-current="page"]').count(), 1);
  await screenshot("history-desktop");
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).waitFor();
  await screenshot("profile-desktop");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Switch to Light mode", exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await screenshot("settings-light");
  await page.getByRole("button", { name: "Switch to Dark mode", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: "Українська", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "uk");
  await screenshot("settings-uk");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await screenshot("rules");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Figure Set", exact: true }).click();
  await page.getByLabel("Search heroes", { exact: true }).waitFor();
  await screenshot("figures-desktop");
  await page.getByRole("link", { name: "Play", exact: true }).click();
  assert.equal(fixture.getCapabilityRequests(), 1);
  step = "tablet/mobile navigation and focus trap";
  for (const [width, height] of [
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await noOverflow();
    await screenshot(`play-${width}`);
    await page.getByTestId("open-navigation").click();
    await page.getByTestId("mobile-sidebar").waitFor();
    await noOverflow();
    await screenshot(`drawer-${width}`);
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press("Tab");
      assert(
        await page
          .getByRole("dialog")
          .evaluate((element) => element.contains(document.activeElement)),
      );
    }
    await page.keyboard.press("Escape");
    assert(
      await page
        .getByTestId("open-navigation")
        .evaluate((element) => element === document.activeElement),
    );
  }
  await page.getByTestId("open-navigation").click();
  await page
    .getByTestId("mobile-sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert(
    await page.getByRole("dialog").evaluate((element) => element.contains(document.activeElement)),
  );
  await screenshot("settings-mobile");
  await page.keyboard.press("Escape");
  assert(
    await page
      .getByTestId("open-navigation")
      .evaluate((element) => element === document.activeElement),
  );
  await page.getByTestId("open-navigation").click();
  await page
    .getByTestId("mobile-sidebar")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await page.getByTestId("profile-page").waitFor();
  assert.equal(await page.getByTestId("mobile-sidebar").count(), 0);
  await page.getByTestId("open-navigation").click();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).waitFor();
  assert.equal(await page.locator("aside").count(), 0);
  await fixture.context.close();
  step = "public routes and unavailable/disabled capabilities";
  const guest = await contextFor({ authenticated: false });
  page = await guest.context.newPage();
  await page.goto(webUrl + "/users/Commander");
  await page.getByTestId("public-profile-page").waitFor();
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  await screenshot("public-profile");
  await page.goto(webUrl + "/users/Commander/matches");
  await page.getByTestId("match-history-page").waitFor();
  await page.goto(webUrl + "/matches/example");
  await page.getByTestId("match-details-page").waitFor();
  await screenshot("details-public");
  await page.goto(webUrl + "/heartbreak");
  await page.waitForURL(webUrl + "/");
  assert.equal(await page.getByText("Heartbreak", { exact: true }).count(), 0);
  // Guest spectating remains public; a normal player seat still redirects to login.
  await page.getByTestId("join-by-id").click();
  assert.equal(await page.getByLabel("Role", { exact: true }).inputValue(), "spectator");
  await page.keyboard.press("Escape");
  await page.getByTestId("create-room").click();
  await page.getByTestId("submit-room").click();
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Back to Rooms", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await guest.context.close();
  const failed = await contextFor({ authenticated: false, capabilityFailure: true });
  page = await failed.context.newPage();
  await page.goto(webUrl);
  await page.getByTestId("play-page").waitFor();
  assert.equal(await page.getByText("Heartbreak", { exact: true }).count(), 0);
  await failed.context.close();
  step = "enabled capabilities and actual game connection";
  const dev = await contextFor({ testRooms: true });
  page = await dev.context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  let sockets = 0,
    closedSockets = 0;
  page.on("websocket", (socket) => {
    sockets++;
    socket.on("close", () => {
      closedSockets++;
    });
  });
  await page.goto(webUrl);
  await page.getByTestId("developer-navigation").waitFor();
  await screenshot("play-test-enabled");
  await page.getByRole("link", { name: "Heartbreak", exact: true }).click();
  await screenshot("heartbreak");
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await page.getByTestId("create-room").click();
  await page.getByTestId("submit-room").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="app-shell"]')?.getAttribute("data-immersive") ===
      "true",
  );
  await page.getByRole("button", { name: "Leave match", exact: true }).waitFor();
  await screenshot("normal-room");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave match", exact: true }).click();
  await page.getByTestId("create-room").waitFor();
  await page.getByRole("button", { name: "Create Test Room", exact: true }).click();
  await page.getByTestId("submit-room").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="app-shell"]')?.getAttribute("data-immersive") ===
      "true",
  );
  assert.equal(await page.getByTestId("desktop-sidebar").count(), 0);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="desktop-match-layout"]') ||
      document.querySelector("canvas") ||
      document.querySelector('[data-testid="board-stage"]'),
  );
  await screenshot("game-desktop");
  const gameConnection = sockets,
    gameClosures = closedSockets;
  // SPA navigation through the existing router: verify the real connection survives.
  await page.evaluate(() => {
    history.pushState({}, "", "/profile");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByTestId("profile-page").waitFor();
  await page.getByRole("link", { name: "Play", exact: true }).click();
  assert.equal(sockets, gameConnection);
  assert.equal(closedSockets, gameClosures);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await screenshot("game-mobile");
  assert.equal(dev.getCapabilityRequests(), 1);
  const observer = await contextFor({ authenticated: false, testRooms: true });
  page = await observer.context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(webUrl);
  await page.getByRole("button", { name: "Spectate", exact: true }).waitFor();
  await screenshot("room-browser-populated");
  await page.getByRole("button", { name: "Spectate", exact: true }).click();
  assert.equal(await page.getByLabel("Role", { exact: true }).inputValue(), "spectator");
  await page.getByTestId("submit-room").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="app-shell"]')?.getAttribute("data-immersive") ===
      "true",
  );
  await screenshot("spectator-game");
  await observer.context.close();
  await dev.context.close();
  assert.deepEqual(errors, []);
  console.log(
    "App shell browser smoke passed: navigation, profile/history/public routes, rules/settings, dialogs, DOM capability gates, 1920/1366/768/390 layouts, focus restoration/trapping, real test room and preserved WebSocket.",
  );
  console.log(`Screenshots: ${output}`);
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => undefined);
  throw new Error(`App shell smoke failed at ${step}`, { cause: error });
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
