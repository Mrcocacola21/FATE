import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { makePlayerView } from "rules";
import { buildServer } from "../../server/src/index";
import { getGameRoom, storeTestHooks } from "../../server/src/store";
import { broadcastRoomState, wsTestHooks } from "../../server/src/ws";
import { databaseFixture } from "../../server/src/tests/helpers/databaseFixture";

const RECONNECT_WINDOW_MS = 40_000;
const SILENCEABLE_MARKER = "fate-silenceable-link";

async function stopVite(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>(resolve => child.once("exit", () => resolve()));
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
  await closed;
  clearTimeout(timer);
}

async function startVite(root: string, diagnostics: string[]) {
  const child = spawn(process.execPath, [path.join(root, "packages/web/scripts/journey-vite.mjs")], {
    cwd: path.join(root, "packages/web"), env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr!.on("data", chunk => diagnostics.push(`Vite: ${String(chunk).slice(-2000)}`));
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Vite readiness timed out")), 15000);
      let buffered = "";
      child.stdout!.on("data", chunk => {
        buffered += chunk;
        const match = buffered.match(/^FATE_VITE_READY (.+)$/m);
        if (!match) return;
        clearTimeout(timer); resolve((JSON.parse(match[1]) as { port: number }).port);
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Vite exited before readiness (exit ${code})`)); });
    });
    return { child, port };
  } catch (error) { await stopVite(child); throw error; }
}

/**
 * The browser's own offline emulation leaves an open WebSocket answering pings, unlike a real
 * outage. This link just stops carrying bytes and sends no FIN, so both ends have to notice.
 */
async function startSilenceableLink(targetPort: number) {
  let down = false;
  const pairs = new Set<net.Socket>();
  const server = net.createServer(client => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    let silenceable: boolean | undefined;
    const silent = () => down && silenceable === true;
    client.on("data", chunk => {
      // The upgrade request names the browser; only the player losing the network is cut off.
      const handshake = silenceable === undefined;
      silenceable ??= chunk.includes(SILENCEABLE_MARKER);
      if (silenceable) pairs.add(client);
      // New attempts fail fast like an unreachable host; bytes on an open link just vanish.
      if (silent() && handshake) client.destroy();
      if (!silent()) upstream.write(chunk);
    });
    upstream.on("data", chunk => { if (!silent()) client.write(chunk); });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => { pairs.delete(client); upstream.destroy(); });
    upstream.on("close", () => client.destroy());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const destroyAll = () => { for (const socket of pairs) socket.destroy(); };
  return {
    port: (server.address() as net.AddressInfo).port,
    goSilent: () => { down = true; },
    restore: () => { destroyAll(); down = false; },
    close: () => { destroyAll(); server.close(); },
  };
}

async function liveSnapshot(page: Page) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const live = await page.evaluate(async () => {
      const store = (await import("/src/store.ts")).useGameStore.getState();
      return store.joined && store.hasSnapshot && !!store.roomState && store.connectionStatus === "connected";
    });
    if (live) return;
    await page.waitForTimeout(100);
  }
  throw new Error("The page did not return to a live snapshot");
}
const storeView = (page: Page) => page.evaluate(async () => {
  const store = (await import("/src/store.ts")).useGameStore.getState();
  return { view: store.roomState, revision: store.roomMeta?.revision, roomId: store.roomId, seat: store.seat };
});

async function run() {
  const fixture = databaseFixture(); // Guard before servers, browser or data writes.
  const root = path.resolve(__dirname, "../../..");
  const suffix = randomUUID().slice(0, 8);
  const output = path.join(root, "test-results/reconnect", suffix);
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, process.env.CHROME_PATH, process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromium.executablePath()].find(candidate => candidate && existsSync(candidate));
  const envBefore = { ...process.env };
  process.env.JWT_ACCESS_SECRET = "fate-journey-access-secret-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "fate-journey-refresh-secret-01234567890123456789";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  process.env.RECONNECT_GRACE_MS = String(RECONNECT_WINDOW_MS);
  process.env.WS_HEARTBEAT_INTERVAL_MS = "1000";
  storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
  let browser: Browser | undefined, vite: ChildProcess | undefined;
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  let link: Awaited<ReturnType<typeof startSilenceableLink>> | undefined;
  const contexts: BrowserContext[] = [], pages: Page[] = [];
  const diagnostics: string[] = [], emails: string[] = [];
  const names = [`ReturnA_${suffix}`, `ReturnB_${suffix}`];
  let stage = "startup";
  try {
    await mkdir(output, { recursive: true });
    assert(executablePath, "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser");
    await fixture.db.$connect();
    server = await buildServer({ roomSeed: () => 37 });
    const api = await server.listen({ host: "127.0.0.1", port: 0 });
    process.env.VITE_API_URL = api;
    link = await startSilenceableLink(Number(new URL(api).port));
    process.env.VITE_WS_URL = `ws://127.0.0.1:${link.port}/ws`;
    const frontend = await startVite(root, diagnostics);
    vite = frontend.child;
    const web = `http://127.0.0.1:${frontend.port}`;
    process.env.WEB_ORIGIN = process.env.AUTH_TRUSTED_ORIGINS = web;
    browser = await chromium.launch({ executablePath, headless: true });
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 },
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36${index === 0 ? ` ${SILENCEABLE_MARKER}` : ""}` });
      contexts.push(context);
      const page = await context.newPage(); pages.push(page);
      page.setDefaultTimeout(15000);
      page.on("dialog", dialog => { void dialog.accept(); });
      page.setDefaultNavigationTimeout(60000); // Vite transforms the whole app on the first load.
      page.on("pageerror", error => diagnostics.push(`P${index + 1} pageerror: ${error.message}`));
      stage = `register P${index + 1}`;
      const email = `reconnect-${index}-${suffix}@example.test`; emails.push(email);
      await page.goto(web + "/register");
      await page.getByLabel("Username", { exact: true }).fill(names[index]);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill("Fate-browser-test-password-123!");
      await page.getByLabel("Confirm password", { exact: true }).fill("Fate-browser-test-password-123!");
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL(web + "/");
      await page.goto(web + "/lobby");
    }
    const [a, b] = pages;
    const [contextA] = contexts;
    const network = link;

    const startMatch = async (lobbyName: string, matchType = "Casual") => {
      stage = "start match";
      await a.getByRole("button", { name: "Create Lobby", exact: true }).first().click();
      await a.getByLabel("Lobby name (optional)", { exact: true }).fill(lobbyName);
      await a.getByRole("combobox", { name: "Game mode", exact: true }).selectOption("classic");
      await a.getByRole("radio", { name: matchType, exact: true }).check();
      await a.getByTestId("submit-room").click();
      await a.getByRole("button", { name: "Ready up", exact: true }).waitFor();
      const roomId = (await storeView(a)).roomId;
      assert(roomId);
      const room = getGameRoom(roomId)!;
      fixture.matches.push(room.matchId!);
      await b.getByRole("button", { name: "Refresh", exact: true }).first().click();
      await b.locator("article").filter({ hasText: lobbyName }).getByRole("button", { name: /^Take seat/ }).click();
      await b.getByTestId("submit-room").click();
      await b.getByRole("button", { name: "Ready up", exact: true }).waitFor();
      for (const page of pages) await page.getByRole("button", { name: "Ready up", exact: true }).click();
      await a.getByRole("button", { name: "Start game", exact: true }).click();
      for (let attempt = 0; !room.participantsLocked; attempt++) {
        assert(attempt < 100, "The match did not start");
        await a.waitForTimeout(100);
      }
      await liveSnapshot(a); await liveSnapshot(b);
      return room;
    };
    const room = await startMatch(`Return ${suffix}`);
    const roomId = room.id;
    const revision = room.revision;
    const matchRow = () => fixture.db.match.findUniqueOrThrow({ where: { id: room.matchId! } });

    stage = "network drop";
    network.goSilent();
    const reconnecting = a.getByTestId("minimal-connection-banner");
    await reconnecting.waitFor({ timeout: 30000 });
    assert.match((await reconnecting.textContent()) ?? "", /Reconnecting/);
    assert((await storeView(a)).view, "the last board stays under the banner");
    const away = b.getByTestId("opponent-disconnected-banner");
    await away.waitFor({ timeout: 30000 });
    const awayText = (await away.textContent()) ?? "";
    assert(awayText.includes(names[0]), awayText);
    assert.match(awayText, /\d:\d\d/);
    await a.screenshot({ path: path.join(output, "disconnected-player.png") });
    await b.screenshot({ path: path.join(output, "waiting-opponent.png") });

    stage = "return after the network is back";
    network.restore();
    await liveSnapshot(a);
    await away.waitFor({ state: "detached" });
    await reconnecting.waitFor({ state: "detached" });
    const returned = await storeView(a);
    assert.equal(returned.roomId, roomId);
    assert.equal(returned.seat, "P1");
    assert.equal(returned.revision, revision);
    assert.deepEqual(returned.view, JSON.parse(JSON.stringify(makePlayerView(room.state, "P1"))));

    stage = "reload while the token cannot refresh";
    const refresh = "**/api/auth/refresh";
    await contextA.route(refresh, route => route.abort());
    await a.reload();
    await a.getByRole("heading", { name: "Connection lost" }).waitFor();
    await a.getByText("Reconnecting automatically.", { exact: false }).waitFor();
    await a.screenshot({ path: path.join(output, "reload-reconnecting.png") });
    await contextA.unroute(refresh);
    await liveSnapshot(a); // No online or visibility event helps here: the retry loop must do it.
    const reloaded = await storeView(a);
    assert.equal(reloaded.roomId, roomId);
    assert.deepEqual(reloaded.view, JSON.parse(JSON.stringify(makePlayerView(room.state, "P1"))));
    assert.equal((await matchRow()).status, "IN_PROGRESS");

    stage = "window expires";
    network.goSilent();
    await away.waitFor({ timeout: 30000 });
    const interrupted = b.getByText("This match ended because", { exact: false }).first();
    await interrupted.waitFor({ timeout: RECONNECT_WINDOW_MS + 15000 });
    await b.screenshot({ path: path.join(output, "window-expired.png") });
    const row = await matchRow();
    assert.equal(row.status, "CANCELLED");
    assert.equal(row.finishReason, "SERVER_RECONNECT_GRACE_EXPIRED");
    assert.equal(row.winnerSeat, null);
    assert.equal(getGameRoom(roomId), undefined);
    network.restore();
    await a.getByText("This match ended because", { exact: false }).first().waitFor({ timeout: 30000 });
    assert.equal((await storeView(a)).roomId, null);

    // The loser's network is gone when the winning action lands: the win is written anyway.
    await Promise.all(pages.map(page => page.goto(web + "/lobby")));
    const decided = await startMatch(`Victory ${suffix}`);
    stage = "victory while the loser is away";
    network.goSilent();
    await away.waitFor({ timeout: 30000 });
    decided.state = {
      ...decided.state, phase: "battle", pendingRoll: null, currentPlayer: "P2",
      ruleDeclaration: { ...decided.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
      units: Object.fromEntries(Object.entries(decided.state.units).map(([id, unit]) => [
        id, unit.owner === "P1" ? { ...unit, hp: 0, isAlive: false } : unit,
      ])),
    };
    broadcastRoomState(decided);
    await b.waitForTimeout(500); // The client refuses an end of turn while it still shows the old roll.
    await b.evaluate(async () => {
      (await import("/src/store.ts")).useGameStore.getState().sendAction({ type: "endTurn" });
    });
    await b.getByTestId("battle-end-overlay").waitFor({ timeout: 30000 });
    const finishedRow = async () => fixture.db.match.findUniqueOrThrow({
      where: { id: decided.matchId! }, include: { participants: true },
    });
    let finished = await finishedRow();
    for (let attempt = 0; finished.status !== "FINISHED"; attempt++) {
      assert(attempt < 100, `The win was not recorded: ${finished.status}`);
      await b.waitForTimeout(100);
      finished = await finishedRow();
    }
    assert.equal(finished.winnerSeat, "P2");
    assert.equal(finished.loserSeat, "P1");
    assert.equal(finished.participants.find(p => p.seat === "P2")?.outcome, "WIN");
    assert.equal(finished.participants.find(p => p.seat === "P1")?.outcome, "LOSS");

    stage = "the loser returns to the result";
    network.restore();
    await a.getByTestId("battle-end-overlay").waitFor({ timeout: 30000 });
    await b.screenshot({ path: path.join(output, "victory-winner.png") });
    await a.screenshot({ path: path.join(output, "victory-returned-loser.png") });
    assert.equal((await finishedRow()).status, "FINISHED");

    stage = "players are free after the result";
    for (const page of pages) await page.getByTestId("battle-end-leave").click();
    for (let attempt = 0; getGameRoom(decided.id); attempt++) {
      assert(attempt < 100, "The finished room did not close");
      await a.waitForTimeout(100);
    }
    // Rated: not returning in time is a loss, the opponent wins and ratings move.
    await Promise.all(pages.map(page => page.goto(web + "/lobby")));
    const rated = await startMatch(`Rated ${suffix}`, "Rated");
    stage = "rated window expires";
    network.goSilent();
    await away.waitFor({ timeout: 30000 });
    assert.match((await away.textContent()) ?? "", /then they lose/);
    await b.screenshot({ path: path.join(output, "rated-waiting-opponent.png") });
    await b.getByTestId("battle-end-overlay").waitFor({ timeout: RECONNECT_WINDOW_MS + 15000 });
    await b.getByText("You won", { exact: false }).first().waitFor();
    await b.screenshot({ path: path.join(output, "rated-forfeit-winner.png") });
    const ratedRow = () => fixture.db.match.findUniqueOrThrow({ where: { id: rated.matchId! } });
    for (let attempt = 0; (await ratedRow()).status !== "FINISHED"; attempt++) {
      assert(attempt < 100, "The forfeit was not recorded");
      await b.waitForTimeout(100);
    }
    assert.equal((await ratedRow()).finishReason, "disconnect");
    assert.equal((await ratedRow()).winnerSeat, "P2");
    for (let attempt = 0; await fixture.db.ratingHistory.count({ where: { matchId: rated.matchId! } }) !== 2; attempt++) {
      assert(attempt < 100, "The forfeit did not move the ratings");
      await b.waitForTimeout(100);
    }

    stage = "the loser returns after the room closed";
    await b.getByTestId("battle-end-leave").click();
    for (let attempt = 0; getGameRoom(rated.id); attempt++) {
      assert(attempt < 100, "The forfeited room did not close");
      await b.waitForTimeout(100);
    }
    network.restore();
    await a.getByText("This match is over", { exact: false }).first().waitFor({ timeout: 30000 });
    await a.screenshot({ path: path.join(output, "rated-forfeit-late-return.png") });

    await Promise.all(pages.map(page => page.goto(web + "/lobby")));
    await a.getByRole("button", { name: "Create Lobby", exact: true }).first().click();
    await a.getByLabel("Lobby name (optional)", { exact: true }).fill(`Next ${suffix}`);
    await a.getByTestId("submit-room").click();
    await a.getByRole("button", { name: "Ready up", exact: true }).waitFor();
    const nextRoom = getGameRoom((await storeView(a)).roomId!)!;
    fixture.matches.push(nextRoom.matchId!);
    assert.equal(await fixture.db.match.count({ where: { id: { in: fixture.matches }, status: "IN_PROGRESS" } }), 0, "no zombie rows");

    assert.equal(diagnostics.filter(line => line.includes("pageerror")).length, 0, diagnostics.join("\n"));
    console.log("E2E reconnect passed: network drop, both banners, same seat and state after return, reload without token refresh, neutral expiry, win recorded with the loser away, Rated forfeit with ratings, late return told the result, players released.");
    console.log(`[reconnect] Screenshots: test-results/reconnect/${suffix}`);
  } catch (error) {
    diagnostics.push(`Failed stage: ${stage}`, String(error));
    await writeFile(path.join(output, "failure.log"), diagnostics.join("\n"));
    for (const [index, page] of pages.entries()) await page.screenshot({ path: path.join(output, `failure-P${index + 1}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    await browser?.close();
    await stopVite(vite);
    link?.close();
    await server?.close();
    const registered = await fixture.db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    fixture.users.push(...registered.map(user => user.id));
    await fixture.dispose();
    storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
    process.env = envBefore;
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
