import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const outputRoot = path.join(webRoot, "test-results", "vfx-visual");
const screenshotDir = path.join(outputRoot, "screenshots");
const videoDir = path.join(outputRoot, "videos");
const gifDir = path.join(outputRoot, "gifs");
const tempVideoDir = path.join(outputRoot, ".video-temp");
const logPath = path.join(outputRoot, "capture.log");

const args = new Set(process.argv.slice(2));
const shouldRecordVideo = !args.has("--no-video");
const shouldMakeGif = shouldRecordVideo && !args.has("--no-gif");
const port = Number(process.env.VFX_PREVIEW_PORT ?? 5174);
const baseUrl = `http://127.0.0.1:${port}`;

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function log(message) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(logPath, `${line}\n`);
  console.log(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

function findBrowserExecutable() {
  const envCandidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
  ].filter(Boolean);
  const windowsCandidates = [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const unixCandidates = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  return [...envCandidates, ...windowsCandidates, ...unixCandidates].find((candidate) =>
    fs.existsSync(candidate),
  );
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return;
    } catch {
      // Keep polling until Vite is ready.
    } finally {
      clearTimeout(timeout);
    }
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite() {
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: webRoot,
    env: { ...process.env, VITE_ENABLE_TEST_ROOM: "true" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    const text = data.toString();
    fs.appendFileSync(logPath, text);
    process.stdout.write(data);
  });
  child.stderr.on("data", (data) => {
    const text = data.toString();
    fs.appendFileSync(logPath, text);
    process.stderr.write(data);
  });
  child.on("error", (error) => log(`Vite spawn error: ${error.message}`));
  child.on("exit", (code, signal) => log(`Vite exited: code=${code ?? "null"} signal=${signal ?? "null"}`));
  return child;
}

async function launchBrowser() {
  const executablePath = findBrowserExecutable();
  if (executablePath) {
    return chromium.launch({ executablePath, headless: true });
  }

  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try the next installed browser channel.
    }
  }
  return null;
}

async function captureScenario(browser, scenario) {
  log(`Scenario start: ${scenario.id}`);
  const contextOptions = {
    viewport: { width: 980, height: 820 },
    deviceScaleFactor: 1,
  };
  if (shouldRecordVideo) {
    contextOptions.recordVideo = {
      dir: tempVideoDir,
      size: { width: 980, height: 820 },
    };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const screenshotPath = path.join(screenshotDir, `${scenario.id}.png`);
  const videoPath = path.join(videoDir, `${scenario.id}.webm`);

  try {
    await page.goto(`${baseUrl}/vfx-preview`, { waitUntil: "domcontentloaded" });
    log(`Scenario page loaded: ${scenario.id}`);
    const trigger = page.locator(`[data-vfx-preview-trigger="${scenario.id}"]`);
    await trigger.click();
    log(`Scenario clicked: ${scenario.id}`);
    await page.waitForSelector(".vfx-sprite, .vfx-line", { state: "attached", timeout: 2_000 });
    await page.waitForTimeout(scenario.waitMs);
    await page.locator("[data-vfx-preview-board]").screenshot({ path: screenshotPath });
    log(`Scenario screenshot: ${scenario.id}`);
    await page.waitForTimeout(1_200);
    await page.waitForSelector(".vfx-sprite, .vfx-line", { state: "detached", timeout: 4_000 });
    log(`Scenario detached: ${scenario.id}`);
  } finally {
    await page.close();
    await context.close();
  }

  if (shouldRecordVideo) {
    const files = fs.readdirSync(tempVideoDir).filter((file) => file.endsWith(".webm"));
    const newest = files
      .map((file) => path.join(tempVideoDir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (newest) {
      fs.renameSync(newest, videoPath);
    }
  }

  return { screenshotPath, videoPath: shouldRecordVideo ? videoPath : null };
}

function convertGifs(scenarios) {
  if (!shouldMakeGif) return [];
  if (!commandExists("ffmpeg")) {
    console.log("ffmpeg was not found; GIF conversion skipped.");
    return [];
  }

  fs.mkdirSync(gifDir, { recursive: true });
  const gifs = [];
  for (const scenario of scenarios) {
    const input = path.join(videoDir, `${scenario.id}.webm`);
    const output = path.join(gifDir, `${scenario.id}.gif`);
    if (!fs.existsSync(input)) continue;
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        input,
        "-vf",
        "fps=12,scale=640:-1:flags=lanczos",
        "-loop",
        "0",
        output,
      ],
      { stdio: "ignore" },
    );
    if (result.status === 0 && fs.existsSync(output)) gifs.push(output);
  }
  return gifs;
}

function writeReadme(scenarios, captured, gifs) {
  const lines = [
    "# VFX Visual Capture",
    "",
    `Generated from \`/vfx-preview\` at ${new Date().toISOString()}.`,
    "",
    "## Screenshots",
    "",
    ...captured.map((item) => `- \`screenshots/${path.basename(item.screenshotPath)}\``),
    "",
    "## Videos",
    "",
    ...(shouldRecordVideo
      ? captured
          .filter((item) => item.videoPath && fs.existsSync(item.videoPath))
          .map((item) => `- \`videos/${path.basename(item.videoPath)}\``)
      : ["- Video capture was disabled for this run."]),
    "",
    "## GIFs",
    "",
    ...(gifs.length > 0
      ? gifs.map((item) => `- \`gifs/${path.basename(item)}\``)
      : ["- GIFs were not generated for this run."]),
    "",
    "## Previewed Effects",
    "",
    ...scenarios.map((scenario) => `- ${scenario.label} (\`${scenario.id}\`)`),
    "",
  ];
  fs.writeFileSync(path.join(outputRoot, "README.md"), `${lines.join("\n")}\n`);
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  log("Capture start");
  ensureCleanDir(screenshotDir);
  if (shouldRecordVideo) ensureCleanDir(videoDir);
  ensureCleanDir(tempVideoDir);

  const server = startVite();
  log(`Started Vite pid=${server.pid ?? "unknown"}`);
  const shutdown = () => {
    if (server.killed) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    server.kill();
  };
  process.on("exit", shutdown);
  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });

  try {
    await waitForServer(`${baseUrl}/vfx-preview`);
    console.log(`VFX preview server is ready at ${baseUrl}/vfx-preview`);
    log(`Server ready: ${baseUrl}/vfx-preview`);
    const browser = await launchBrowser();
    if (!browser) {
      console.log(
        "No local Chrome/Edge browser was found. Install a Chromium browser or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
      );
      return;
    }

    log("Browser launched");
    const page = await browser.newPage({ viewport: { width: 980, height: 820 } });
    await page.goto(`${baseUrl}/vfx-preview`, { waitUntil: "domcontentloaded" });
    log("Manifest page loaded");
    const scenarios = await page
      .locator("[data-vfx-preview-trigger]")
      .evaluateAll((buttons) =>
        buttons
          .map((button) => ({
            id: button.getAttribute("data-vfx-preview-trigger") ?? "",
            label: button.textContent?.trim() ?? "",
            waitMs: 260,
          }))
          .filter((item) => item.id && item.id !== "all"),
      );
    await page.close();
    log(`Scenario count: ${scenarios.length}`);

    const captured = [];
    for (const scenario of scenarios) {
      log(`Capturing ${scenario.id}`);
      captured.push(await captureScenario(browser, scenario));
    }
    await browser.close();

    const gifs = convertGifs(scenarios);
    writeReadme(scenarios, captured, gifs);
    console.log(`VFX visual artifacts written to ${outputRoot}`);
  } finally {
    shutdown();
    fs.rmSync(tempVideoDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
