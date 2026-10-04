import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import fixtures from "../src/admin/fixtures.ts";
const { fixtureUser, fixtureMatch, fixtureSummary, fixtureAction } = fixtures;
const { fixtureAudit } = fixtures;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = 5199,
  baseUrl = `http://127.0.0.1:${port}`,
  apiUrl = "http://127.0.0.1:3199";
const output = path.join(root, "packages/web/test-results/admin");
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
    env: { ...process.env, VITE_API_URL: apiUrl, VITE_WS_URL: "ws://127.0.0.1:3199/ws" },
  },
);
let viteOutput = "",
  browser,
  role = "ADMIN",
  mode = "normal",
  policyError = "",
  summaryForbidden = false,
  user = structuredClone(fixtureUser);
const requests = [],
  errors = [];
for (const stream of [vite.stdout, vite.stderr])
  stream.on("data", (chunk) => {
    viteOutput = (viteOutput + chunk).slice(-4000);
  });
const authUser = () => ({
  id: "33333333-3333-4333-8333-333333333333",
  role,
  email: "staff@example.test",
  username: "staff",
  displayName: "Staff",
  avatarUrl: null,
  createdAt: fixtureUser.createdAt,
});
const pageResult = (items, query, total = 41) => ({
  items,
  pagination: {
    page: Number(query.get("page") ?? 1),
    limit: Number(query.get("limit") ?? 20),
    total,
    totalPages: Math.ceil(total / Number(query.get("limit") ?? 20)),
  },
});
try {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited: ${viteOutput}`);
    try {
      if ((await fetch(baseUrl)).ok) break;
    } catch {
      /* wait for startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    timezoneId: "Europe/Kyiv",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("FATE_LANGUAGE", "en");
  });
  await page.route(`${apiUrl}/**`, async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname,
      q = url.searchParams;
    requests.push({
      path: p,
      query: Object.fromEntries(q),
      method: route.request().method(),
      body: route.request().postData(),
    });
    const send = (data, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (route.request().method() === "OPTIONS") return send({});
    if (p === "/api/capabilities")
      return send({ testRooms: { enabled: false, requiresToken: false } });
    if (p === "/api/auth/refresh")
      return send({ accessToken: "local-fixture-token", accessTokenExpiresIn: 3600 });
    if (p === "/api/auth/me") return send({ user: authUser() });
    if (p === "/api/profile/me")
      return send({
        profile: {
          ...authUser(),
          updatedAt: fixtureUser.updatedAt,
          bio: null,
          avatarUrl: null,
          theme: "dark",
        },
      });
    if (p === "/api/matchmaking/status") return send({ status: "idle" });
    if (p.startsWith("/api/admin/")) {
      if (role === "USER" || (summaryForbidden && p.endsWith("/summary")))
        return send({ error: { code: "FORBIDDEN" } }, 403);
      if (mode === "error") return send({ error: { code: "DATABASE_UNAVAILABLE" } }, 503);
      if (p === "/api/admin/summary") return send(fixtureSummary);
      if (p === "/api/admin/audit") {
        if (role !== "ADMIN") return send({ error: { code: "FORBIDDEN" } }, 403);
        const items =
          mode === "empty"
            ? []
            : fixtureAudit.filter(
                (event) => !q.get("eventType") || event.eventType === q.get("eventType"),
              );
        return send(pageResult(items, q, items.length));
      }
      if (p === "/api/admin/users")
        return send(
          pageResult(
            mode === "empty"
              ? []
              : [
                  user,
                  {
                    ...fixtureUser,
                    id: "44444444-4444-4444-8444-444444444444",
                    displayName: "Polina",
                    username: "polina",
                    role: "MODERATOR",
                  },
                ],
            q,
            mode === "empty" ? 0 : 41,
          ),
        );
      if (p === `/api/admin/users/${fixtureUser.id}`) return send({ user });
      if (p.endsWith("/block") || p.endsWith("/unblock") || p.endsWith("/role")) {
        if (policyError)
          return send(
            { error: { code: policyError } },
            policyError === "LAST_ADMIN_PROTECTED" ? 409 : 403,
          );
        if (p.endsWith("/block"))
          user = {
            ...user,
            blocked: true,
            blockedAt: fixtureUser.updatedAt,
            blockedReason: route.request().postDataJSON().reason,
          };
        if (p.endsWith("/unblock"))
          user = { ...user, blocked: false, blockedAt: null, blockedReason: null };
        if (p.endsWith("/role")) user = { ...user, role: route.request().postDataJSON().role };
        return send({ user });
      }
      if (p === "/api/admin/matches")
        return send(
          pageResult(mode === "empty" ? [] : [fixtureMatch], q, mode === "empty" ? 0 : 41),
        );
      if (p.endsWith("/actions"))
        return send(
          pageResult(
            mode === "empty"
              ? []
              : [
                  fixtureAction,
                  {
                    ...fixtureAction,
                    revision: 38,
                    actionType: "attack",
                    actorUserId: null,
                    actorSeat: "P2",
                    actionPayload: {
                      type: "attack",
                      nested: { password: "DO_NOT_RENDER", html: "<img onerror=alert(1)>" },
                    },
                  },
                ],
            q,
            80,
          ),
        );
      if (p === `/api/admin/matches/${fixtureMatch.matchId}`) return send({ match: fixtureMatch });
    }
    return send({ error: { code: "NOT_FOUND" } }, 404);
  });
  const visit = async (route, text) => {
    await page.goto(`${baseUrl}${route}`);
    await page.getByText(text, { exact: true }).first().waitFor();
  };
  const capture = async (name) => {
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `Horizontal overflow: ${name}`,
    );
    await page.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  };
  role = "USER";
  await visit("/admin", "Access denied");
  assert.equal(await page.locator('a[href="/admin"]').count(), 0);
  assert.equal(requests.filter((r) => r.path.startsWith("/api/admin")).length, 0);
  role = "MODERATOR";
  await visit("/admin/audit", "Access denied");
  assert.equal(await page.locator('a[href="/admin/audit"]').count(), 0);
  assert.equal(requests.filter((r) => r.path === "/api/admin/audit").length, 0);
  await visit("/admin", "System overview");
  await page.getByText("1,248", { exact: true }).waitFor();
  assert.equal(await page.locator('a[href="/admin"]').count(), 2);
  await visit(`/admin/users/${fixtureUser.id}`, "Ratings by mode");
  assert.equal(await page.getByRole("button", { name: "Change role", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Block user", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  role = "ADMIN";
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await visit("/admin/audit", "Restart recovery unavailable");
    await capture(`audit-${viewport.width}`);
    await page.getByRole("button", { name: "Details", exact: true }).nth(2).click();
    await page.getByText("Previous role", { exact: true }).waitFor();
    await capture(`audit-role-details-${viewport.width}`);
    await page.getByRole("button", { name: "Details", exact: true }).nth(3).focus();
    await page.keyboard.press("Enter");
    await page.getByText("ACTION_LOG_GAP", { exact: true }).waitFor();
    await capture(`audit-match-details-${viewport.width}`);
    assert.equal(await page.getByRole("button", { name: /Delete|Edit|Clear/ }).count(), 0);
    await page.getByLabel("Event", { exact: true }).selectOption("USER_BLOCKED");
    await page.waitForURL(/eventType=USER_BLOCKED/);
    await page.waitForFunction(
      () => document.querySelectorAll(".admin-audit-table tbody tr").length === 1,
    );
    assert.equal(
      await page
        .locator(".admin-audit-table")
        .getByText("Match interrupted", { exact: true })
        .count(),
      0,
    );
    await visit("/admin", "System overview");
    await page.getByText("1,248", { exact: true }).waitFor();
    await capture(`overview-${viewport.width}`);
    await visit("/admin/users", "Max");
    await capture(`users-${viewport.width}`);
    await visit(`/admin/users/${fixtureUser.id}`, "Ratings by mode");
    await capture(`user-${viewport.width}`);
    assert.equal(await page.locator('[data-testid="rank-emblem"]').count(), 3);
    await page.getByRole("button", { name: "Block user", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await capture(`block-dialog-${viewport.width}`);
    // Tab and Shift+Tab remain within the existing shared dialog focus trap.
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(() =>
          document.querySelector('[role="dialog"]').contains(document.activeElement),
        ),
      );
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "Block user", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Change role", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await capture(`role-dialog-${viewport.width}`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await visit("/admin/matches", "Night Games");
    await capture(`matches-${viewport.width}`);
    await visit(`/admin/matches/${fixtureMatch.matchId}`, "Action history");
    await page.getByLabel("Action details for revision 37", { exact: true }).waitFor();
    await capture(`match-${viewport.width}`);
    await page.getByLabel("Action details for revision 37", { exact: true }).click();
    await page.getByLabel("Action details for revision 38", { exact: true }).click();
    await capture(`actions-${viewport.width}`);
    assert.equal(await page.locator(".admin-payload img").count(), 0);
    assert(
      !(await page
        .locator(".admin-page")
        .innerText()
        .then((text) => text.includes("DO_NOT_RENDER"))),
    );
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await visit(`/admin/users/${fixtureUser.id}`, "Ratings by mode");
  await page.getByRole("button", { name: "Block user", exact: true }).click();
  await page.getByLabel("Block reason (optional)").fill("Repeated harassment");
  await page.getByRole("dialog").getByRole("button", { name: "Block user", exact: true }).click();
  await page.getByText("Account blocked.", { exact: true }).waitFor();
  assert.equal(user.blockedReason, "Repeated harassment");
  await page.getByRole("button", { name: "Unblock user", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Unblock user", exact: true }).click();
  await page.getByText("Account unblocked.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await page.getByLabel("New role").selectOption("MODERATOR");
  await page.getByRole("dialog").getByRole("button", { name: "Change role", exact: true }).click();
  await page.getByText("Role updated.", { exact: true }).waitFor();
  policyError = "LAST_ADMIN_PROTECTED";
  await page.getByRole("button", { name: "Change role", exact: true }).click();
  await page.getByLabel("New role").selectOption("USER");
  await page.getByRole("dialog").getByRole("button", { name: "Change role", exact: true }).click();
  await page.getByText("The last active administrator cannot be demoted.").waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  policyError = "";
  await visit("/admin/users?page=2&role=USER&status=blocked&search=max", "Max");
  await page.reload();
  await page.getByText("Max", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Status", { exact: true }).inputValue(), "BLOCKED");
  assert(
    requests.some(
      (r) =>
        r.path === "/api/admin/users" &&
        r.query.page === "2" &&
        r.query.status === "BLOCKED" &&
        r.query.search === "max",
    ),
  );
  await page.getByLabel("Role", { exact: true }).selectOption("ADMIN");
  await page.waitForURL(
    (url) => !url.searchParams.has("page") && url.searchParams.get("role") === "ADMIN",
  );
  await page.getByLabel("Search users", { exact: true }).fill("polina");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/users") && response.url().includes("search=polina"),
    ),
    page.getByRole("button", { name: "Search", exact: true }).click(),
  ]);
  await page.waitForURL(/search=polina/);
  await visit(
    `/admin/matches?participant=${fixtureUser.id}&gameMode=classic&matchType=RATED&status=FINISHED`,
    "Night Games",
  );
  await page.getByLabel("Status", { exact: true }).selectOption("WAITING");
  await page.waitForURL(/status=WAITING/);
  assert(
    requests.some(
      (r) =>
        r.path === "/api/admin/matches" &&
        r.query.participantUserId === fixtureUser.id &&
        r.query.gameMode === "classic" &&
        r.query.matchType === "RATED",
    ),
  );
  await page.getByLabel("Created from", { exact: true }).fill("2026-10-03");
  await page.getByLabel("Created through", { exact: true }).fill("2026-10-02");
  const requestsBeforeInvalid = requests.filter((r) => r.path === "/api/admin/matches").length;
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Created through", { exact: true })
      .evaluate((el) => el.validity.customError),
    true,
  );
  assert.equal(
    requests.filter((r) => r.path === "/api/admin/matches").length,
    requestsBeforeInvalid,
  );
  await page.getByLabel("Created through", { exact: true }).fill("2026-10-04");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("createdTo") === "2026-10-04T23:59:59.999Z");
  await visit(`/admin/matches/${fixtureMatch.matchId}`, "Action history");
  await page.getByRole("button", { name: "Copy Match ID", exact: true }).click();
  await page.getByText("Copied", { exact: true }).first().waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fixtureMatch.matchId);
  mode = "empty";
  await visit("/admin/users", "No users match these filters.");
  await capture("users-empty");
  mode = "error";
  await visit("/admin/matches", "The administration service is unavailable. Try again shortly.");
  await capture("matches-error");
  mode = "normal";
  await visit("/admin", "System overview");
  await page.getByText("1,248", { exact: true }).waitFor();
  role = "USER";
  summaryForbidden = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText("Access denied", { exact: true }).waitFor();
  assert.equal(await page.locator(".admin-stat").count(), 0);
  await capture("access-lost");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      viewports: [1920, 1366, 768, 390],
      screenshots: fs.readdirSync(output).filter((f) => f.endsWith(".png")).length,
      requests: requests.length,
      consoleErrors: errors,
      output,
    }),
  );
} finally {
  await browser?.close();
  vite.kill();
}
