import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(web, "test-results/dice-result");
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  root: web,
  server: { host: "127.0.0.1", port: 5198, strictPort: true },
});
let browser;
const errors = [];
const report = [];
const roll = (id, defense = false, dice = [4, 5], sides = 6, rollKind) => ({
  type: "rollResolved",
  eventId: id,
  rollId: id,
  rollIndex: 0,
  unitId: defense ? "target" : "attacker",
  rollerPlayerId: defense ? "P2" : "P1",
  rollKind: rollKind ?? (defense ? "attack_defenderRoll" : "attack_attackerRoll"),
  dice,
  sides,
  total: dice.reduce((sum, value) => sum + value, 0),
});
try {
  await server.listen();
  const executablePath = (
    await Promise.all(
      [
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "/usr/bin/chromium",
      ]
        .filter(Boolean)
        .map(async (candidate) => {
          try {
            await fs.access(candidate);
            return candidate;
          } catch {
            return null;
          }
        }),
    )
  ).find(Boolean);
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const html = await server.transformIndexHtml(
    "/__dice-result",
    '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="/src/styles.css"></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/dice-result.fixture.tsx"></script></body></html>',
  );
  await page.route("**/__dice-result", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("http://127.0.0.1:5198/__dice-result");
  await page.getByTestId("dice-fixture").waitFor();
  async function reset(options = {}) {
    await page.evaluate((options) => window.diceTest.reset(options), options);
    await page.locator("[data-combat-roll]").waitFor({ state: "detached" });
  }
  async function receive(events, stale = false) {
    await page.evaluate(({ events, stale }) => window.diceTest.receive(events, stale), {
      events,
      stale,
    });
  }
  async function settled(id) {
    await page.locator(`[data-combat-roll="${id}"]`).waitFor();
    await page.waitForFunction(
      (id) => {
        const dice = [
          ...document.querySelectorAll(`[data-combat-roll="${id}"] .combat-roll-feedback__die`),
        ];
        return (
          dice.length > 0 && dice.every((die) => Number(getComputedStyle(die).opacity) >= 0.999)
        );
      },
      id,
      { timeout: 1800 },
    );
  }
  for (const { width, height, theme, reduced, language } of [
    { width: 1440, height: 1000, theme: "dark", reduced: false, language: "en" },
    { width: 1280, height: 800, theme: "light", reduced: false, language: "uk" },
    { width: 768, height: 1024, theme: "dark", reduced: false, language: "en" },
    { width: 390, height: 844, theme: "dark", reduced: false, language: "uk" },
    { width: 320, height: 568, theme: "light", reduced: true, language: "en" },
  ]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await reset({ pending: true, viewer: "P2", language });
    const id = `attack-${width}`;
    await receive([roll(id)]);
    await settled(id);
    assert.deepEqual(await page.locator("[data-combat-die]").allTextContents(), ["4", "5"]);
    assert.equal(await page.locator("[data-combat-total]").textContent(), "9");
    assert.equal(
      await page.locator('[data-roll-side="attack"] .combat-roll-feedback__title').textContent(),
      language === "uk" ? "Кидок атаки" : "Attack Roll",
    );
    const card = await page.locator(".combat-roll-feedback").boundingBox();
    const dialog = await page.locator(".game-pending-modal-card").boundingBox();
    assert(
      card && dialog && card.y + card.height <= dialog.y,
      "dice card must not cover pending dialog",
    );
    assert(card.x >= 0 && card.x + card.width <= width, "card stays in viewport");
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "no horizontal overflow",
    );
    assert.equal(
      await page
        .locator(".combat-roll-layer")
        .evaluate((layer) => getComputedStyle(layer).pointerEvents),
      "none",
    );
    assert.equal(
      await page.evaluate(() => window.diceTest.sent.length),
      0,
      "opening a decision must not autoroll",
    );
    if (reduced) {
      assert.equal(
        await page
          .locator(".combat-roll-feedback__die")
          .first()
          .evaluate((die) => getComputedStyle(die).animationName),
        "none",
      );
    }
    const name = `${width}-${theme}-${reduced ? "reduced" : "motion"}`;
    assert.equal(await page.locator('[data-combat-preparing="true"]').count(), reduced ? 0 : 1);
    if (width === 390) {
      await page.waitForTimeout(1300);
      assert.equal(
        await page.locator(`[data-combat-roll="${id}"]`).count(),
        1,
        "attack remains readable throughout a slow manual response",
      );
      assert.equal(
        await page.locator('[data-combat-preparing="true"]').count(),
        1,
        "preparation holds while waiting without releasing an attack",
      );
    }
    await page.screenshot({ path: path.join(output, `${name}-attack.png`) });
    const button = page.getByRole("button", {
      name: language === "uk" ? "Кинути 2d6" : "Roll 2d6",
      exact: true,
    });
    await button.click();
    assert.equal(await page.evaluate(() => window.diceTest.sent.length), 1);
    assert.equal(
      await page.locator(`[data-combat-roll="${id}"]`).count(),
      1,
      "required decision remains usable during the result hold",
    );
    // Inject the next authoritative result only after the explicit click.
    await receive([roll(`defense-${width}`, true, [2, 6])]);
    await settled(`defense-${width}`);
    assert.deepEqual(await page.locator("[data-combat-die]").allTextContents(), [
      "4",
      "5",
      "2",
      "6",
    ]);
    assert.deepEqual(await page.locator("[data-combat-total]").allTextContents(), ["9", "8"]);
    assert.equal(
      await page.locator('[data-roll-side="defense"] .combat-roll-feedback__title').textContent(),
      language === "uk" ? "Кидок захисту" : "Defense Roll",
    );
    await page.screenshot({ path: path.join(output, `${name}-defense.png`) });
    report.push({ width, height, theme, reduced, language, pendingRollClickable: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const event of [
    roll("tie", true, [6]),
    roll("area", false, [8, 9], 9, "kaiserCarpetStrikeCenter"),
  ]) {
    await reset({ viewer: null });
    await receive([event]);
    await settled(event.rollId);
    assert.equal(await page.locator("[data-combat-die]").count(), event.dice.length);
    assert.equal(
      await page.locator(".combat-roll-feedback__notation").textContent(),
      `${event.dice.length}d${event.sides}`,
    );
    await page.screenshot({ path: path.join(output, `${event.rollId}.png`) });
  }
  await reset();
  await receive([roll("queue-first"), roll("queue-second", true, [2, 6])]);
  await settled("queue-first");
  const readableAt = Date.now();
  await page.waitForFunction(() => document.querySelector('[data-combat-roll="queue-second"]'));
  assert(Date.now() - readableAt < 1200, "paired results must not queue a second full hold");
  await settled("queue-second");
  assert.deepEqual(await page.locator("[data-combat-total]").allTextContents(), ["9", "8"]);
  await page.screenshot({ path: path.join(output, "paired-results.png") });
  await receive([roll("queue-second", true, [2, 6])]);
  await page.locator(".combat-roll-layer").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-combat-roll]").count(), 0);
  await reset();
  await receive([roll("stale")], true);
  assert.equal(await page.locator("[data-combat-roll]").count(), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      { checks: report, queue: "passed", duplicate: "passed", stale: "passed", errors },
      null,
      2,
    ),
  );
  console.log(
    `Dice visual smoke passed: ${report.length} viewport/theme/motion combinations, special dice, paired reveal, duplicate and stale delivery. Screenshots: ${output}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
