import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import rankTiers from "../../server/src/rating/rankTiers.ts";
const { getRankMetadata } = rankTiers;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const webRoot = path.join(root, "packages/web");
const output = path.join(webRoot, "test-results/ranks");
const url = "http://127.0.0.1:5201";
const ranks = ["SHADOW", "CRESCENT", "HALF", "FULL", "ECLIPSE", "BLACK_MOON", "NOVA", "DESTINY"];
const samples = Object.fromEntries(
  [100, 525, 900, 1500, 1675, 1800, 1925, 2150].map((rating) => [
    getRankMetadata(rating).rankTier,
    { rating, ratingDeviation: 74, ratedGames: 27, ...getRankMetadata(rating) },
  ]),
);
samples.PROVISIONAL = { ...samples.FULL, ratedGames: 1 };
samples.NEAR_DESTINY = {
  rating: 1999.7,
  ratingDeviation: 74,
  ratedGames: 27,
  ...getRankMetadata(1999.7),
};
samples.FUTURE = { ...samples.FULL, rankTier: "FUTURE" };
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
].find((value) => value && fs.existsSync(value));
assert(executablePath, "A local Chromium browser is required");
fs.mkdirSync(output, { recursive: true });
const fixture = path.join(output, "fixture.html");
// A temporary local fixture exercises production components; it is never a public route.
fs.writeFileSync(
  fixture,
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { AppShell } from '/src/layout/AppShell.tsx';
import { CompetitiveIdentity } from '/src/pages/PlayPage.tsx';
import { MatchmakingPanel } from '/src/matchmaking/MatchmakingPanel.tsx';
import { RankEmblem } from '/src/ranks/RankEmblem.tsx';
import { RANK_ASSETS } from '/src/ranks/rankAssets.ts';
import { authStore } from '/src/auth/authStore.ts';
import { setLanguage, translate } from '/src/i18n/index.ts';
import { setTheme } from '/src/theme.ts';
import '/src/styles.css';
import '/src/layout/app-shell.css';
import '/src/play/play.css';
import '/src/ranks/ranks.css';
const params = new URLSearchParams(location.search);
const samples = ${JSON.stringify(samples)};
setLanguage(params.get('language') === 'uk' ? 'uk' : 'en', null);
setTheme(params.get('theme') === 'light' ? 'light' : 'dark');
authStore.setState({status:'authenticated', user:{id:'fixture',username:'Max',displayName:'Max',avatarUrl:null}});
const h = React.createElement;
const identity = h('div', {className:'play-page competitive-page mx-auto max-w-5xl'},
  h('header', {className:'play-header mb-7'}, h('p',{className:'section-kicker'},translate('competitive.kicker')),
    h('h1',{className:'font-display mt-1 text-3xl font-semibold sm:text-4xl'},translate('shell.play')),
    h('p',{className:'mt-2 text-sm text-muted'},translate('competitive.description'))),
  h('div',{className:'competitive-hub'}, h(CompetitiveIdentity, {
    rating:samples[params.get('rank') || 'FULL'], minRatedGames:5, name:'Max'}), h(MatchmakingPanel)));
const gallery = h('div', {style:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:32,padding:40}},
  ...Object.values(RANK_ASSETS).map(rank => h('div',{key:rank.id,style:{textAlign:'center'}},
    h(RankEmblem,{rank:rank.id,size:'hero'}),h('p',{},translate(rank.labelKey)),
    h('div',{style:{display:'flex',alignItems:'center',marginTop:20}},
      h(RankEmblem,{rank:rank.id,size:'medium'}),h(RankEmblem,{rank:rank.id,size:'small'})))));
createRoot(document.getElementById('root')).render(h(MemoryRouter,{}, params.has('gallery') ? gallery : h(AppShell,{},identity)));
</script></body></html>`,
);
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5201",
    "--strictPort",
  ],
  {
    cwd: webRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "",
  browser,
  page;
const errors = [];
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (chunk) => {
    serverOutput += chunk;
  });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(serverOutput);
    try {
      ready = (await fetch(url)).ok;
    } catch {
      /* startup */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(ready, serverOutput);
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`${url}/api/**`, (route) =>
    route.fulfill({ contentType: "application/json", body: "{}" }),
  );
  async function capture(name, query) {
    await page.goto(`${url}/test-results/ranks/fixture.html?${query}`);
    await page.getByTestId("rank-emblem").first().waitFor();
    await page.locator(".rank-emblem img").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name);
    for (const image of await page.locator(".rank-emblem img").all()) {
      assert.equal(await image.evaluate((img) => img.naturalWidth), 1254);
      assert.equal(await image.evaluate((img) => getComputedStyle(img).objectFit), "contain");
      assert(await image.evaluate((img) => Math.abs(img.clientWidth - img.clientHeight) < 1));
    }
    await page.screenshot({
      path: path.join(output, name + ".png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await capture(`all-ranks-${theme}`, `gallery&theme=${theme}`);
    assert.equal(await page.locator(".rank-emblem img").count(), 24);
    for (const rank of ranks)
      assert.equal(await page.locator(`[data-rank="${rank}"] img`).count(), 3);
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await capture(
        `play-black-moon-${theme}-${width}`,
        `rank=BLACK_MOON&language=uk&theme=${theme}`,
      );
      assert.equal(await page.getByTestId("competitive-rank-name").textContent(), "Чорний місяць");
      assert(
        await page
          .getByRole("button", { name: "Знайти рейтинговий матч", exact: true })
          .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      );
    }
  }
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const rank of [...ranks, "PROVISIONAL", "NEAR_DESTINY"]) {
      await capture(`play-${rank.toLowerCase()}-${width}`, `rank=${rank}&theme=dark`);
      const expected = samples[rank].rankTier;
      assert.equal(await page.locator(`.rank-emblem[data-rank="${expected}"] img`).count(), 1);
      assert.equal(
        await page.getByTestId("competitive-rating").textContent(),
        String(Math.floor(samples[rank].rating)),
      );
      assert(
        await page
          .getByRole("button", { name: "Find Rated Match", exact: true })
          .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
      );
      if (rank === "SHADOW" || rank === "DESTINY")
        assert.equal(await page.locator(".rank-progress-track").count(), 0);
      if (rank === "DESTINY") assert.equal(await page.getByTestId("max-rank").count(), 1);
      if (rank === "PROVISIONAL")
        assert.equal(await page.locator(".qualification-progress").count(), 1);
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await capture("reduced-motion", "rank=ECLIPSE&theme=dark");
  assert.equal(
    await page.locator(".rank-emblem img").evaluate((img) => getComputedStyle(img).animationName),
    "none",
  );
  await capture("unknown-rank", "rank=FUTURE&theme=dark");
  assert.equal(await page.locator(".rank-emblem img").count(), 0);
  assert.equal(await page.getByTestId("competitive-rank-name").textContent(), "Rank unassigned");
  assert.deepEqual(errors, []);
  console.log(
    "Rank artwork: all eight at hero/64/40px, dark/light; Play 1920/1366/768/390, Ukrainian Black Moon, CTA in viewport, unknown fallback, reduced motion; no overflow/page errors.",
  );
} catch (error) {
  console.error({ errors, serverOutput: serverOutput.slice(-3000) });
  await page?.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser?.close();
  child.kill();
  fs.rmSync(fixture, { force: true });
}
