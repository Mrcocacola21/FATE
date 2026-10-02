import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Run against a local development stack with its existing Test/Sandbox enabled.
const baseUrl = process.env.VISUAL_TEST_URL ?? "http://localhost:5173";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname),
  "Visual smoke requires a local target",
);
const output = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/visual-revamp",
);
fs.mkdirSync(output, { recursive: true });
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((candidate) => candidate && fs.existsSync(candidate));
assert.ok(executablePath, "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH");
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ colorScheme: "dark", locale: "en-US" });
await context.addInitScript(() => {
  localStorage.setItem("FATE_LANGUAGE", "en");
  localStorage.setItem("theme", "dark");
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
const sizes = [
  [1920, 1080],
  [1366, 768],
  [820, 1180],
  [390, 844],
];
let step = "lobby";
let roomCreated = false;

async function capture(name) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${name}: horizontal overflow at ${width}px`);
    await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

try {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(baseUrl);
  await page.getByTestId("create-test-room").waitFor();
  await capture("lobby");
  step = "rules dialog";
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await capture("rules");
  // Responsive layout switches remount the opener. Check restoration without a resize.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  for (let index = 0; index < 8; index++) await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
    true,
    "Rules traps keyboard focus",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Rules", exact: true })
      .evaluate((button) => button === document.activeElement),
    true,
    "Rules restores focus to opener",
  );

  step = "sandbox";
  await page.getByTestId("create-test-room").click();
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  roomCreated = true;
  await page.getByRole("button", { name: "Basic attack duel", exact: true }).click();
  await page.locator('.board-cell:has(.unit-token[data-owner="P1"])').waitFor();
  await page.getByRole("tab", { name: "Actions", exact: true }).click();
  await page.locator('.board-cell:has(.unit-token[data-owner="P1"])').click();
  await capture("selected-match");
  // Returning from mobile remounts the existing responsive side panel.
  await page.getByRole("tab", { name: "Actions", exact: true }).click();
  await page.getByRole("button", { name: "Attack", exact: true }).click();
  await page.locator(".board-preview--validTarget").first().waitFor();
  await capture("attack-targets");
  await page.getByRole("tab", { name: "Actions", exact: true }).click();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.locator('.board-cell:has(.unit-token[data-owner="P1"])').click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.waitForTimeout(400);
  await capture("move-or-pending");

  step = "players";
  // Use only the sandbox's existing commands to prepare the next presentation state.
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/store.ts");
    useGameStore.getState().sendTestRoomCommand({ type: "debugClearPendingRoll" });
    useGameStore.getState().setActionMode(null);
  });
  await page.getByRole("tab", { name: "Players", exact: true }).click();
  await capture("players");

  step = "reduced motion";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".turn-indicator"), "::before").animationName ===
      "none",
  );
  assert.equal(
    await page
      .locator(".turn-indicator")
      .evaluate((element) => getComputedStyle(element, "::before").animationName),
    "none",
  );
  await page.screenshot({ path: path.join(output, "reduced-motion.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  step = "battle result";
  await page.evaluate(async () => {
    const { useGameStore } = await import("/src/store.ts");
    const state = useGameStore.getState();
    for (const unit of Object.values(state.roomState.units)) {
      if (unit.owner === "P2")
        state.sendTestRoomCommand({ type: "debugDirectDamage", unitId: unit.id, amount: 99 });
    }
  });
  await page.getByTestId("battle-end-overlay").waitFor();
  await capture("battle-result");
  await page.getByTestId("battle-end-view-board").click();
  await page.getByRole("tab", { name: "Rules", exact: true }).click();
  await page.getByRole("button", { name: "Delete test room", exact: true }).click();
  roomCreated = false;
  await page.getByTestId("create-test-room").waitFor();

  step = "information screens";
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel("Email", { exact: true }).waitFor();
  await capture("login");
  await page.goto(`${baseUrl}/register`);
  await page.getByLabel("Username", { exact: true }).waitFor();
  await capture("register");
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Switch to Light mode" }).click();
  await capture("light-lobby");
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    `Visual smoke passed: ${sizes.map(([width, height]) => `${width}x${height}`).join(", ")}; screenshots: ${output}`,
  );
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  console.error(`Visual smoke failed at: ${step}`);
  throw error;
} finally {
  if (roomCreated) {
    await page
      .evaluate(async () => {
        const { useGameStore } = await import("/src/store.ts");
        if (useGameStore.getState().roomMeta?.roomMode === "test") {
          useGameStore.getState().sendTestRoomCommand({ type: "debugDeleteRoom" });
        }
      })
      .catch(() => {});
  }
  await browser.close();
}
