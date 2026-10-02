import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "../../../scripts/testDatabase.cjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");
const databaseUrl = configureTestDatabase();
const serverPort = Number(process.env.AUTH_TEST_SERVER_PORT ?? 3103);
const webPort = Number(process.env.AUTH_TEST_WEB_PORT ?? 5175);
const baseUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${serverPort}`;
const output = path.join(webRoot, "test-results", "auth");
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((value) => value && fs.existsSync(value));
if (!executablePath)
  throw new Error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser.");

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
    if (child.exitCode !== null) throw new Error("Test service exited before becoming ready.");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Test service startup timeout.");
}
const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const suffix = randomUUID().slice(0, 8);
const email = `browser-${suffix}@example.test`;
let username = `Browser_${suffix}`;
const password = randomBytes(16).toString("hex");
async function openNavigation(page) {
  const trigger = page.getByTestId("open-navigation");
  if ((await trigger.isVisible()) && !(await page.getByTestId("mobile-sidebar").isVisible()))
    await trigger.click();
}
async function signOut(page) {
  await openNavigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
}
let browser;
let page;
let step = "startup";
let gameplayRoomId;
try {
  await database.$connect();
  const server = start(
    [
      path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
      path.join(repoRoot, "packages/server/src/index.ts"),
    ],
    repoRoot,
    {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      PORT: String(serverPort),
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      WEB_ORIGIN: baseUrl,
      JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
      JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
      JWT_ACCESS_TTL_SECONDS: "2",
      JWT_REFRESH_TTL_SECONDS: "3600",
      AUTH_COOKIE_SAME_SITE: "lax",
    },
  );
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
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
    locale: "en-US",
  });
  page = await context.newPage();
  let refreshes = 0;
  page.on("request", (request) => {
    if (request.url() === `${apiUrl}/api/auth/refresh`) refreshes++;
  });

  step = "protected redirect";
  await page.goto(`${baseUrl}/account`);
  await page.waitForURL(/\/login\?returnTo=%2Fprofile/);
  await page.getByLabel("Email", { exact: true }).waitFor();
  assert.equal(refreshes, 1, "StrictMode must not duplicate bootstrap refresh");

  step = "registration";
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL(`${baseUrl}/profile`);
  await page.getByTestId("profile-page").waitFor();
  assert.equal(await page.getByText(email, { exact: true }).count(), 1);
  const initialCookie = (await context.cookies(apiUrl + "/api/auth")).find(
    (cookie) => cookie.name === "fate_refresh",
  );
  assert(initialCookie?.httpOnly);
  assert.equal(initialCookie.path, "/api/auth");
  assert.equal(await page.evaluate(() => document.cookie.includes("fate_refresh")), false);
  assert((await database.authSession.count({ where: { user: { email }, revokedAt: null } })) === 1);
  console.log("browser auth: registration, safe internal return and HttpOnly cookie passed");

  step = "reload restoration";
  await page.reload();
  await page.getByTestId("profile-page").waitFor();
  assert.equal(new URL(page.url()).pathname, "/profile");
  const rotatedCookie = (await context.cookies(apiUrl + "/api/auth")).find(
    (cookie) => cookie.name === "fate_refresh",
  );
  assert.notEqual(rotatedCookie?.value, initialCookie.value);
  assert.equal(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value),
      ),
    ),
    false,
  );
  await page.screenshot({ path: path.join(output, "account-desktop.png") });
  console.log("browser auth: F5, /me, protected direct URL and memory-only credentials passed");

  step = "profile editing and persistence";
  const oldUsername = username;
  username = `Updated_${suffix}`;
  const displayName = `Profile ${suffix}`;
  const avatarUrl = "https://avatars.example.test/profile.png";
  await context.route(avatarUrl, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5YkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  assert.equal(await page.getByLabel("Username", { exact: true }).inputValue(), oldUsername);
  await page.getByLabel("Display name", { exact: true }).fill("Unsaved name");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByText("Unsaved name", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Display name", { exact: true }).fill(displayName);
  await page.getByLabel("Avatar URL", { exact: true }).fill(avatarUrl);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Profile updated.", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="profile-page"] img')?.naturalWidth > 0,
  );
  await page.reload();
  await page
    .getByTestId("profile-page")
    .getByRole("heading", { name: displayName, exact: true })
    .waitFor();
  assert.equal(
    await page.getByTestId("profile-page").getByText(`@${username}`, { exact: true }).count(),
    1,
  );
  const persistedProfile = await database.profile.findUniqueOrThrow({ where: { username } });
  assert.equal(persistedProfile.displayName, displayName);
  assert.equal(persistedProfile.avatarUrl, avatarUrl);
  await page.screenshot({ path: path.join(output, "profile-desktop.png") });

  step = "profile validation and avatar fallback";
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Avatar URL", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Enter a valid HTTP or HTTPS avatar URL.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const brokenAvatar = "https://avatars.example.test/missing.png";
  await context.route(brokenAvatar, (route) => route.fulfill({ status: 404, body: "" }));
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Avatar URL", { exact: true }).fill(brokenAvatar);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Profile updated.", { exact: true }).waitFor();
  await page.getByTestId("profile-page").locator('span[role="img"]').waitFor();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Avatar URL", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Profile updated.", { exact: true }).waitFor();
  assert.equal((await database.profile.findUniqueOrThrow({ where: { username } })).avatarUrl, null);

  step = "persistent preferences";
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.locator("form").getByLabel("Language", { exact: true }).selectOption("uk");
  await page.locator("form").getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Профіль оновлено.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    true,
  );
  await page.reload();
  await page.getByRole("button", { name: "Редагувати профіль", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), "uk");
  assert.equal(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    true,
  );
  await page.getByTestId("sidebar-settings").filter({ visible: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).waitFor();
  await page.getByRole("button", { name: "Switch to Light mode", exact: true }).click();
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await page.keyboard.press("Escape");
  const savedPreferences = await database.profile.findUniqueOrThrow({ where: { username } });
  assert.equal(savedPreferences.preferredLanguage, "en");
  assert.equal(savedPreferences.preferredTheme, "light");

  step = "public profile direct navigation and privacy";
  const publicContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
  });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`${baseUrl}/users/${username}`);
  const publicSection = publicPage.getByTestId("public-profile-page");
  await publicSection.getByRole("heading", { name: displayName, exact: true }).waitFor();
  assert.equal(
    (await publicContext.cookies()).some((cookie) => cookie.name === "fate_refresh"),
    false,
  );
  const publicText = await publicSection.textContent();
  assert.equal(publicText.includes(email), false);
  assert.equal(publicText.includes("Theme"), false);
  assert.equal(publicText.includes("Language"), false);
  assert.equal(
    await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await publicPage.reload();
  await publicSection.getByRole("heading", { name: displayName, exact: true }).waitFor();
  await publicPage.screenshot({ path: path.join(output, "public-profile-mobile.png") });
  await publicPage.goto(`${baseUrl}/users/${oldUsername}`);
  await publicPage.getByText("User not found.", { exact: true }).waitFor();
  await publicContext.close();
  console.log(
    "browser profiles: editing/cancel, username URLs, avatar safety/fallback/clear, F5, preferences and public privacy passed",
  );

  step = "cross-tab expired access recovery";
  const second = await context.newPage();
  await second.goto(`${baseUrl}/profile`);
  await second.getByTestId("profile-page").waitFor();
  assert.equal(await page.evaluate(() => Boolean(navigator.locks)), true);
  // Wait only for the deliberately short fixture access JWT lifetime.
  await new Promise((resolve) => setTimeout(resolve, 2200));
  await Promise.all([
    page.getByRole("button", { name: "Refresh", exact: true }).click(),
    second.getByRole("button", { name: "Refresh", exact: true }).click(),
  ]);
  await Promise.all([
    page.getByRole("button", { name: "Refresh", exact: true }).waitFor({ state: "visible" }),
    second.getByRole("button", { name: "Refresh", exact: true }).waitFor({ state: "visible" }),
  ]);
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.equal(await second.getByRole("alert").count(), 0);
  assert.equal(
    await database.authSession.count({ where: { user: { email }, revokedAt: null } }),
    1,
  );
  await second.close();
  console.log("browser auth: expired access retry and cross-tab rotation serialization passed");

  step = "logout and reload";
  const logoutResponse = page.waitForResponse(
    (response) => response.url() === `${apiUrl}/api/auth/logout` && response.status() === 204,
  );
  await signOut(page);
  await logoutResponse;
  await page.waitForURL(/\/login\?returnTo=/);
  await page.reload();
  await page.getByLabel("Email", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/login");
  assert.equal(
    (await context.cookies(apiUrl + "/api/auth")).some(
      (cookie) => cookie.name === "fate_refresh" && cookie.value,
    ),
    false,
  );
  assert.equal(
    await database.authSession.count({ where: { user: { email }, revokedAt: null } }),
    0,
  );
  console.log("browser auth: logout, cookie clearing and logged-out reload passed");

  step = "login";
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`${baseUrl}/profile`);
  await page.getByTestId("profile-page").waitFor();
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await page.getByTestId("sidebar-account").getByText(displayName, { exact: true }).waitFor();
  console.log("browser auth: real login and minimal lobby account control passed");

  step = "mobile and localization";
  await page.goto(`${baseUrl}/profile`);
  await page.getByTestId("profile-page").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.screenshot({ path: path.join(output, "account-mobile.png") });
  const response = page.waitForResponse(
    (value) => value.url() === `${apiUrl}/api/auth/logout` && value.status() === 204,
  );
  await signOut(page);
  await response;
  await page.getByLabel("Email", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "login-mobile.png") });
  await page.evaluate(() => localStorage.setItem("FATE_LANGUAGE", "uk"));
  await page.reload();
  await page.getByLabel("Електронна пошта", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "login-uk-mobile.png") });
  console.log("browser auth: responsive account/forms and Ukrainian localization passed");

  step = "authenticated gameplay regression";
  let socketCount = 0;
  let socketClosures = 0;
  page.on("websocket", (socket) => {
    socketCount++;
    socket.on("close", () => {
      socketClosures++;
    });
  });
  await page.evaluate(() => localStorage.setItem("FATE_LANGUAGE", "en"));
  await page.goto(baseUrl);
  await page.getByTestId("create-room").click();
  await page.getByTestId("submit-room").click();
  await page.waitForURL(/\/login\?returnTo=/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(baseUrl + "/");
  await page.getByTestId("create-room").click();
  await page.getByTestId("submit-room").click();
  await page.waitForFunction(() => Boolean(localStorage.getItem("fate.room-session.v1")));
  // Inspect the established game connection independently of account state.
  const gameSession = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fate.room-session.v1")),
  );
  assert(gameSession.roomId);
  gameplayRoomId = gameSession.roomId;
  assert.equal(gameSession.role, "P1");
  console.log("browser auth: guest player login redirect and authenticated P1 join passed");

  step = "auth independence from the current game connection";
  const gameSocketCount = socketCount;
  const gameSocketClosures = socketClosures;
  // Exercise an SPA route transition while retaining the established game runtime.
  await page.evaluate(() => {
    history.pushState({}, "", "/profile");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByTestId("profile-page").waitFor();
  await signOut(page);
  await page.waitForURL(/\/login\?returnTo=/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("profile-page").waitFor();
  const finalLogout = page.waitForResponse(
    (value) => value.url() === `${apiUrl}/api/auth/logout` && value.status() === 204,
  );
  await signOut(page);
  await finalLogout;
  await page.getByRole("link", { name: "Back to Rooms", exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("fate.room-session.v1"))),
    gameSession,
  );
  assert.equal(socketCount, gameSocketCount);
  assert.equal(socketClosures, gameSocketClosures);
  await page.screenshot({ path: path.join(output, "public-game-mobile.png") });
  console.log(
    "browser auth: login/logout preserve the room, P1, resume data and active WebSocket passed",
  );
  console.log("Authentication and profiles browser smoke passed");
} catch (error) {
  console.error(`Authentication browser smoke failed during: ${step}`);
  console.error(`Failure type: ${error instanceof Error ? error.name : "unknown"}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => undefined);
    console.error(`Current route: ${new URL(page.url()).pathname}`);
    console.error(`Visible alerts: ${await page.getByRole("alert").allTextContents()}`);
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (gameplayRoomId) await database.match.deleteMany({ where: { roomId: gameplayRoomId } });
  await database.user.deleteMany({ where: { email } });
  await database.$disconnect();
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else child.kill();
  }
}
