import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const { HERO_REGISTRY_LIST } = createRequire(import.meta.url)("rules");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const output = path.join(root, "packages/web/test-results/figure-set");
fs.mkdirSync(output, { recursive: true });
const webPort = Number(process.env.FIGURES_TEST_WEB_PORT ?? 5193);
const webUrl = `http://127.0.0.1:${webPort}`;
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((candidate) => candidate && fs.existsSync(candidate));
assert(executablePath, "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const defaults = Object.fromEntries(
  ["assassin", "archer", "berserker", "rider", "spearman", "trickster", "knight"].map((slot) => [
    slot,
    `base-${slot}`,
  ]),
);
const roster = {
  assassin: "jackRipper",
  archer: "grand-kaiser",
  berserker: "undyne",
  rider: "riverPerson",
  spearman: "papyrus",
  trickster: "lechy",
  knight: "asgore",
};
const key = "FATE_FIGURE_SET_SELECTION_V1";
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(webPort),
    "--strictPort",
  ],
  {
    cwd: path.join(root, "packages/web"),
    env: { ...process.env, VITE_API_URL: webUrl },
    windowsHide: true,
    stdio: "ignore",
  },
);
let browser;
let context;
let page;
let step = "startup";
const errors = [];
const checks = [];
let metadataMode = "normal";
try {
  const deadline = Date.now() + 30000;
  while (true) {
    assert.equal(child.exitCode, null, "Vite exited before startup");
    try {
      if ((await fetch(webUrl)).ok) break;
    } catch {
      /* startup */
    }
    assert(Date.now() < deadline, "Vite startup timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(
    ({ key, roster }) => {
      localStorage.setItem("theme", "dark");
      if (!localStorage.getItem("FATE_LANGUAGE")) localStorage.setItem("FATE_LANGUAGE", "en");
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, updatedAt: "2026-10-03T00:00:00Z", selection: roster }),
        );
    },
    { key, roster },
  );
  await context.route(`${webUrl}/api/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (pathname === "/api/heroes")
      return metadataMode === "error" ? json({}, 503) : json(HERO_REGISTRY_LIST);
    if (pathname === "/api/capabilities")
      return json({ testRooms: { enabled: false, requiresToken: false } });
    if (pathname === "/api/auth/refresh") return json({ error: { code: "UNAUTHORIZED" } }, 401);
    return json([]);
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const inspected = () => page.getByTestId("hero-details").getAttribute("data-hero-id");
  const selection = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)).selection, key);
  const capture = async (name) => {
    if (name.startsWith("details-")) {
      await page.locator(".modal-card").evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      const opacity = await page.locator(".modal-card").evaluate((element) => getComputedStyle(element).opacity);
      assert.equal(opacity, "1", "Dialog entrance animation has finished");
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => img.getBoundingClientRect().top < innerHeight)
          .map((img) => img.decode().catch(() => {})),
      );
    });
    await page.screenshot({
      path: path.join(output, `${name}.png`),
      fullPage: !name.startsWith("details-"),
      animations: "disabled",
    });
  };
  step = "initial load";
  await page.goto(`${webUrl}/figures`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("hero-details").waitFor();
  await page.getByText("Loading heroes...").waitFor({ state: "hidden" });
  assert.equal(await inspected(), "jackRipper");
  assert.equal(await page.locator(".figure-loadout-slot").count(), 7);
  assert.equal(await page.getByTestId("select-hero").isDisabled(), true);
  checks.push(step);

  step = "all classes";
  for (const [slot, heroId] of Object.entries(roster)) {
    await page.getByTestId(`class-${slot}`).click();
    assert.equal(await inspected(), heroId);
    const renderedIds = await page
      .locator(".figure-hero-card")
      .evaluateAll((cards) => cards.map((card) => card.dataset.testid));
    assert(
      renderedIds.every(
        (id) => HERO_REGISTRY_LIST.find((hero) => `hero-${hero.id}` === id)?.mainClass === slot,
      ),
    );
    assert.equal(
      await page.getByTestId("hero-details").locator(".ability-card").count(),
      HERO_REGISTRY_LIST.find((hero) => hero.id === heroId).abilities.length,
    );
  }
  checks.push(step);

  step = "inspection then selection";
  await page.getByTestId("class-assassin").click();
  await page.getByTestId("hero-frisk").click();
  assert.equal(await inspected(), "frisk");
  assert.deepEqual(await selection(), roster);
  await page.getByTestId("select-hero").click();
  assert.deepEqual(await selection(), { ...roster, assassin: "frisk" });
  assert.equal(await page.getByTestId("select-hero").isDisabled(), true);
  assert.match(await page.getByTestId("hero-frisk").innerText(), /Selected/);
  await page.reload();
  await page.getByTestId("hero-details").waitFor();
  assert.equal(await inspected(), "frisk");
  checks.push(step);

  step = "global search";
  await page.getByLabel("Search heroes", { exact: true }).fill("Papyrus");
  assert.equal(await page.locator(".figure-hero-card").count(), 1);
  assert.match(await page.getByTestId("hero-papyrus").innerText(), /Spearman/);
  await page.getByTestId("hero-papyrus").click();
  assert.equal(await inspected(), "papyrus");
  await page.getByLabel("Search heroes", { exact: true }).fill("odin");
  await page.getByTestId("hero-odin").click();
  await page.getByTestId("select-hero").click();
  assert.deepEqual(await selection(), { ...roster, assassin: "frisk", rider: "odin" });
  assert.equal(await page.getByLabel("Search heroes", { exact: true }).inputValue(), "odin");
  await capture("search-cross-class");
  await page.getByLabel("Search heroes", { exact: true }).fill("");
  assert.equal(await page.getByTestId("class-assassin").getAttribute("aria-pressed"), "true");
  await page.getByLabel("Search heroes", { exact: true }).fill("no-such-hero");
  assert.equal(await page.locator(".figure-hero-card").count(), 0);
  await page.getByLabel("Search heroes", { exact: true }).fill("");
  checks.push(step);

  step = "slot reset";
  await page.getByTestId("loadout-rider").click();
  assert.equal(await inspected(), "odin");
  await page.getByTestId("reset-slot").click();
  assert.equal(await inspected(), "base-rider");
  assert.deepEqual(await selection(), { ...roster, assassin: "frisk", rider: "base-rider" });
  checks.push(step);

  step = "export and import";
  await page.getByLabel("Loadout actions", { exact: true }).locator("visible=true").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export loadout", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "figure-set.json");
  const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(exported.version, 1);
  assert.deepEqual(exported.selection, await selection());
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("invalid"),
    });
  await page.getByRole("alert").waitFor();
  const beforeImport = await inspected();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "loadout.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(roster)),
    });
  await page.getByText("Loadout imported", { exact: true }).waitFor();
  assert.deepEqual(await selection(), roster);
  assert.equal(await inspected(), beforeImport);
  checks.push(step);

  step = "reset all confirmation and keyboard menu";
  const utilities = page.locator("summary[aria-label='Loadout actions']");
  await utilities.focus();
  await page.keyboard.press("Enter");
  await capture("utilities");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".figure-utilities").getAttribute("open"), null);
  await utilities.click();
  await page.getByRole("button", { name: "Reset All to Base", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual(await selection(), roster);
  await utilities.click();
  await page.getByRole("button", { name: "Reset All to Base", exact: true }).click();
  await page.getByTestId("confirm-reset").click();
  assert.deepEqual(await selection(), defaults);
  checks.push(step);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "loadout.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(roster)),
    });
  await page.getByText("Loadout imported", { exact: true }).waitFor();

  step = "responsive viewports";
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      ({ key, roster }) =>
        localStorage.setItem(key, JSON.stringify({ version: 1, selection: roster })),
      { key, roster },
    );
    await page.reload();
    await page.getByTestId("class-assassin").click();
    await capture(`viewport-${width}x${height}`);
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      columns: getComputedStyle(document.querySelector(".figure-workspace")).gridTemplateColumns,
    }));
    assert(metrics.scrollWidth <= width, JSON.stringify(metrics));
    if (width > 1100) {
      assert(metrics.scrollHeight <= height + 1, JSON.stringify(metrics));
      assert.equal(metrics.columns.split(" ").length, 3);
      await page.getByTestId("class-archer").click();
      await page.getByTestId("hero-mettaton").click();
      await page.locator(".figure-details-scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      assert(await page.getByTestId("select-hero").isVisible());
      await capture(`long-details-${width}`);
    } else {
      assert.equal(await page.getByTestId("hero-details").count(), 0);
      await page.getByTestId("hero-frisk").click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await inspected(), "frisk");
      await capture(`details-${width}`);
      const activeBefore = await selection();
      for (let index = 0; index < 7; index++) {
        await page.keyboard.press("Tab");
        assert(
          await page.evaluate(() =>
            document.querySelector("[role=dialog]").contains(document.activeElement),
          ),
        );
      }
      await page.getByTestId("select-hero").click();
      assert.deepEqual(await selection(), { ...activeBefore, assassin: "frisk" });
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(
        await page
          .getByTestId("hero-frisk")
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await page.getByTestId("loadout-knight").scrollIntoViewIfNeeded();
      await page.getByTestId("loadout-knight").click();
      assert.equal(await inspected(), "asgore");
      await page.keyboard.press("Escape");
      await page.getByTestId("class-spearman").scrollIntoViewIfNeeded();
      await page.getByTestId("class-spearman").click();
      assert.equal(await page.getByTestId("hero-papyrus").count(), 1);
    }
    checks.push(`${width}x${height}`);
  }

  step = "metadata retry and Ukrainian locale";
  await page.setViewportSize({ width: 1366, height: 768 });
  metadataMode = "error";
  await page.reload();
  await page.getByText("Unable to load hero details. Try again.", { exact: true }).waitFor();
  metadataMode = "normal";
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByText("Unable to load hero details. Try again.", { exact: true })
    .waitFor({ state: "hidden" });
  await page.evaluate(() => localStorage.setItem("FATE_LANGUAGE", "uk"));
  await page.reload();
  await page.getByRole("heading", { name: "Набір фігур", exact: true }).waitFor();
  await page.getByTestId("class-spearman").click();
  await page.getByTestId("hero-papyrus").click();
  await capture("ukrainian");
  checks.push(step);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  console.log(`Figure Set browser checks passed: ${checks.join(", ")}`);
  console.log(`Screenshots: ${output}`);
} catch (error) {
  if (page)
    await page
      .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  console.error(`Figure Set browser check failed at ${step}`);
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  child.kill();
}
