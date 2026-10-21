import assert from "node:assert/strict";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";

const web = fileURLToPath(new URL("../", import.meta.url)), root = path.resolve(web, "../..");
const output = path.join(web, "test-results/all-slashes-review");
mkdirSync(output, { recursive: true });
const generated = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.join(root, "tsconfig.tests.json"),
  path.join(web, "scripts/vfx-expansion-fixtures.ts"), path.join(web, "test-results/vfx-expansion-game/fixtures.json")], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(generated.status, 0, generated.stderr);
const fixtures = JSON.parse(readFileSync(path.join(web, "test-results/vfx-expansion-game/fixtures.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(root, "docs/assets/vfx-workflow/integration-state.json"), "utf8"));
const inventory = state.assets.filter(row => /\/(attack_swing|berserk_swing|centipede_attack|undying_swing)\.png$/.test(row.filename));
const scenes = Object.entries(fixtures).filter(([id]) => id.startsWith("swing.") && !/\.(north|southwest|miss)$/.test(id));
assert.deepEqual(new Set(scenes.flatMap(([, fixture]) => fixture.expected)), new Set(inventory.flatMap(row => row.effectIds)));
const names = { griffith: "Гриффит", femto: "Фемто", guts: "Гатс", kaneki: "Канеки", undyne: "Андайн", asgore: "Азгор", grozny: "Грозный",
  donKihote: "Дон Кихот", elCidCompeador: "Эль Сид", genghisKhan: "Чингисхан", hassan: "Хассан", jackRipper: "Джек Потрошитель", chikatilo: "Чикатило",
  loki: "Локи", kaladin: "Каладин", duolingo: "Дуолинго", odin: "Один", luche: "Луче", papyrus: "Папирус", lechy: "Леший", sans: "Санс", riverPerson: "Речной человек", vladTepes: "Влад Цепеш", frisk: "Фриск" };
const forms = { berserk: " — Берсерк", centipede: " — Сколопендра", undying: " — Бессмертная форма" };
const records = [], errors = [];
const saveState = () => writeFileSync(path.join(output, "recording.json"), JSON.stringify({
  status: records.length === scenes.length ? "complete" : "recording", expectedCount: scenes.length,
  renderer: "Actual Board with current source, rules-produced accepted attacks and P1-projected events",
  timing: "Shared combat clock stepped at 60fps; CSS animations seeked to the same phase. Slow playback x4 after capture.",
  silent: true, manualNetworkMatch: false, errors, records,
}, null, 2));
const ffmpeg = args => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { windowsHide: true, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
};
const title = async (file, label, speed, index) => {
  const text = `<svg width="1152" height="72"><rect width="1152" height="72" fill="#15181f"/><text x="24" y="31" fill="#fff" font-family="Arial" font-size="24">${String(index + 1).padStart(2, "0")} / ${scenes.length} · ${label}</text><text x="24" y="57" fill="#aeb9c9" font-family="Arial" font-size="17">${speed}</text></svg>`;
  await sharp(Buffer.from(text)).png().toFile(file);
};
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5196", "--strictPort"],
  { cwd: web, windowsHide: true, stdio: "ignore" });
let browser;
saveState();
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch("http://127.0.0.1:5196")).ok) break; } catch { /* starting */ }
    assert(i < 150); await new Promise(resolve => setTimeout(resolve, 100));
  }
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].find(file => file && existsSync(file));
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5196/test-results/vfx-expansion-game/index.html");
  await page.getByLabel("Fixture").waitFor();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (const [index, [id, fixture]] of scenes.entries()) {
    const [, hero, form] = id.split("."), label = names[hero] + (forms[form] ?? "");
    const folder = id.slice(6), dir = path.join(output, folder), frames = path.join(dir, "frames");
    mkdirSync(frames, { recursive: true });
    await page.getByLabel("Fixture").selectOption(id); await page.clock.runFor(40);
    assert.equal(await page.getByLabel("Fixture").inputValue(), id);
    await page.evaluate(() => window.warmPortraits());
    await page.getByRole("button", { name: "Play", exact: true }).click(); await page.clock.runFor(16);
    const cue = page.locator(`[data-vfx-effect="${fixture.expected[0]}"]`);
    assert.equal(await cue.count(), 1, `${id}: exactly one live slash`);
    const start = await cue.evaluate(el => Number(el.dataset.vfxStart));
    const contactMs = await cue.evaluate(el => Number(el.dataset.vfxContact) - Number(el.dataset.vfxStart));
    const contactFrame = Math.ceil((150 + contactMs) * 60 / 1000);
    await cue.locator(".vfx-artwork").evaluateAll(elements => Promise.all(elements.map(async el => {
      const img = new Image(); img.src = getComputedStyle(el).backgroundImage.slice(5, -2); await img.decode();
    })));
    await page.clock.fastForward(Math.max(0, start - 150 - await page.evaluate(() => Date.now())));
    const event = fixture.recipients.P1.events.find(event => event.type === "attackResolved");
    assert(event?.hit, `${id}: review captures a confirmed hit`);
    const bounds = await page.locator(`[data-unit-id="${event.defenderId}"]`).boundingBox(); assert(bounds);
    const clip = { x: Math.round(bounds.x + bounds.width / 2 - 230), y: Math.round(bounds.y + bounds.height / 2 - 108), width: 384, height: 216 };
    let painted = false, lunged = false;
    for (let i = 0; i < 72; i++) {
      await page.clock.runFor(Math.max(0, Math.round(start - 150 + i * 1000 / 60 - await page.evaluate(() => Date.now()))));
      await page.locator("[data-vfx-cue]").evaluateAll(elements => {
        for (const el of elements) {
          for (const animation of el.getAnimations({ subtree: true })) {
            animation.pause(); animation.currentTime = Date.now() - Number(el.dataset.vfxStart) + (parseFloat(el.style.getPropertyValue("--vfx-delay")) || 0);
          }
          for (const art of el.querySelectorAll(".vfx-artwork")) art.style.willChange = "auto";
        }
      });
      if (i === contactFrame) {
        painted = await cue.locator(".vfx-melee-stroke").evaluate(el => Number(getComputedStyle(el).opacity) > .1);
        lunged = await page.locator(`[data-unit-id="${fixture.sourceId}"] [data-melee-lunge]`).count() === 1;
      }
      await page.screenshot({ clip, path: path.join(frames, `frame-${String(i).padStart(3, "0")}.png`) });
    }
    assert(painted && lunged, `${id}: cut and token lunge both painted at contact`);
    assert.equal(await page.locator("[data-melee-lunge]").count(), 0, `${id}: natural return`);
    const normalHeader = path.join(dir, "title-normal.png"), slowHeader = path.join(dir, "title-slow.png");
    await title(normalHeader, label, "Обычная скорость · 1×", index); await title(slowHeader, label, "Замедление · ×4", index);
    for (const [file, speed, header] of [["normal.mp4", 1, normalHeader], ["slow-x4.mp4", 4, slowHeader]]) {
      ffmpeg(["-framerate", "60", "-i", path.join(frames, "frame-%03d.png"), "-i", header, "-filter_complex",
        `[0:v]setpts=${speed}*PTS,fps=60,scale=1152:648:flags=lanczos,pad=1152:720:0:72:color=0x15181f[v];[v][1:v]overlay=0:0`,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(dir, file)]);
    }
    await sharp({ create: { width: 1152, height: 720, channels: 4, background: "#15181f" } }).composite([
      { input: await sharp(path.join(frames, `frame-${String(contactFrame).padStart(3, "0")}.png`)).resize(1152, 648).toBuffer(), left: 0, top: 72 },
      { input: normalHeader, left: 0, top: 0 },
    ]).png().toFile(path.join(dir, "poster.png"));
    writeFileSync(path.join(dir, "concat.txt"), "file 'normal.mp4'\nfile 'slow-x4.mp4'\n");
    ffmpeg(["-f", "concat", "-safe", "0", "-i", path.join(dir, "concat.txt"), "-c", "copy", "-movflags", "+faststart", path.join(dir, "review.mp4")]);
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(dir, "review.mp4")], { encoding: "utf8", windowsHide: true });
    assert.equal(probe.status, 0, probe.stderr);
    const duration = Number(probe.stdout.trim()); assert(duration > 5.8 && duration < 6.2, `${id}: complete clip duration`);
    records.push({ id, label, effectId: fixture.expected[0], folder, frames: 72, duration,
      normal: `${folder}/normal.mp4`, slow: `${folder}/slow-x4.mp4`, review: `${folder}/review.mp4`, painted, lunged });
    saveState(); console.log(`${records.length}/${scenes.length}: ${label} recorded`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, "concat.txt"), records.map(row => `file '${row.review}'`).join("\n") + "\n");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", path.join(output, "concat.txt"), "-c", "copy", "-movflags", "+faststart", path.join(output, "all-slashes.mp4")]);
  const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Слеши — визуальная проверка</title><style>body{background:#11151c;color:#eef2f8;font:16px system-ui;max-width:1200px;margin:32px auto;padding:0 20px}a{color:#a9c8ff}video{width:100%;background:#080a0f;border-radius:12px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{border:1px solid #303a49;border-radius:16px;padding:16px}h2{margin:0 0 12px;font-size:20px}p{line-height:1.5}nav{margin:24px 0;line-height:2}</style><h1>Все 27 вариантов мили-слеша</h1><p>Каждая запись: обычная скорость, затем замедление ×4. Нападающий слева, цель справа. Текущий разрез и выпад токена сняты на игровом поле. Без звука.</p><p><a href="all-slashes.mp4">Общий ролик — все фигуры подряд</a></p><nav>${records.map((row, i) => `<a href="#${row.folder}">${i + 1}. ${escape(row.label)}</a>`).join(" · ")}</nav><main>${records.map((row, i) => `<article id="${row.folder}"><h2>${i + 1}. ${escape(row.label)}</h2><video controls playsinline preload="none" poster="${row.folder}/poster.png" src="${row.review}"></video><p><a href="${row.normal}">Обычная скорость</a> · <a href="${row.slow}">Замедление ×4</a></p></article>`).join("")}</main></html>`);
  let elapsed = 0;
  const stamp = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const rows = records.map(row => { const time = stamp(elapsed); elapsed += row.duration; return `| ${time} | ${row.label} | [Обычно + ×4](${row.review}) |`; });
  writeFileSync(path.join(output, "README_RU.md"), `# Записи всех мили-слешей\n\n[Общий ролик](all-slashes.mp4) · [Галерея отдельных записей](index.html)\n\n27 вариантов, включая три формы. В каждом фрагменте сначала обычная скорость, затем ×4. Без звука.\n\n| Начало | Фигура | Отдельная запись |\n| --- | --- | --- |\n${rows.join("\n")}\n\nНастоящий Board, принятые действия rules и разрешённые P1-проекции. Общий clock продвинут с шагом 60 fps; CSS-анимации приведены к той же фазе. Это детерминированная запись игрового presentation, не ручной сетевой матч. Запись не означает визуальное одобрение пользователем. Снаряды и прежние уникальные сцены способностей вне этого набора мили-слешей.\n`);
  saveState(); console.log(`Saved ${records.length} individually labeled slash clips and all-slashes.mp4 (${elapsed.toFixed(1)}s).`);
} catch (error) {
  errors.push(String(error)); saveState(); throw error;
} finally {
  await browser?.close();
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else server.kill("SIGTERM");
}
