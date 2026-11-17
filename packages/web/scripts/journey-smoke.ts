import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright-core";
import { buildServer } from "../../server/src/index";
import { getGameRoom, storeTestHooks } from "../../server/src/store";
import { wsTestHooks } from "../../server/src/ws";
import { databaseFixture } from "../../server/src/tests/helpers/databaseFixture";
import { nextSmokeAction } from "../../server/src/tests/helpers/smokeActions";
import { eventually } from "../../server/src/tests/helpers/eventually";
import { ReplayService } from "../../server/src/services/replayService";
import { MatchRepository } from "../../server/src/repositories/matchRepository";
import { MatchActionRepository } from "../../server/src/repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../../server/src/repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../../server/src/services/matchSnapshotService";
import { makeReplayView } from "rules";

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
        const ready = JSON.parse(match[1]) as { port: number };
        if (!Number.isInteger(ready.port) || ready.port <= 0) return;
        clearTimeout(timer); resolve(ready.port);
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Vite exited before readiness (exit ${code})`)); });
    });
    return { child, port };
  } catch (error) { await stopVite(child); throw error; }
}

async function run() {
  const fixture = databaseFixture(); // Guard before servers, browser or data writes.
  const root = path.resolve(__dirname, "../../..");
  const suffix = randomUUID().slice(0, 8);
  const output = path.join(root, "test-results/journey", suffix);
  const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, process.env.CHROME_PATH, process.env.EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromium.executablePath()].find(candidate => candidate && existsSync(candidate));
  const envBefore = { ...process.env };
  process.env.JWT_ACCESS_SECRET = "fate-journey-access-secret-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "fate-journey-refresh-secret-01234567890123456789";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
  let browser: Browser | undefined, vite: ChildProcess | undefined;
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  const contexts: BrowserContext[] = [], pages: Page[] = [];
  const diagnostics: string[] = [], emails: string[] = [];
  const password = "Fate-browser-test-password-123!";
  const names = [`JourneyA_${suffix}`, `JourneyB_${suffix}`];
  const frames = ["blood-iron", "moon-gold"] as const;
  let stage = "startup";
  try {
    await mkdir(output, { recursive: true });
    assert(executablePath, "Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an installed Chromium browser");
    await fixture.db.$connect();
    console.log("[journey] PostgreSQL connected");
    server = await buildServer({ roomSeed: () => 37 });
    const api = await server.listen({ host: "127.0.0.1", port: 0 });
    console.log("[journey] Fastify ready");
    process.env.VITE_API_URL = api;
    process.env.VITE_WS_URL = api.replace("http:", "ws:") + "/ws";
    const frontend = await startVite(root, diagnostics);
    vite = frontend.child;
    console.log("[journey] Vite ready");
    const web = `http://127.0.0.1:${frontend.port}`;
    process.env.WEB_ORIGIN = process.env.AUTH_TRUSTED_ORIGINS = web;
    assert.equal((await server.inject({ url: "/ready" })).statusCode, 200);
    assert((await fetch(web)).ok);
    browser = await chromium.launch({ executablePath, headless: true });
    console.log("[journey] Chromium ready");
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
      contexts.push(context);
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage(); pages.push(page);
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(60000); // Vite transforms the whole app on the first load.
      page.on("pageerror", error => diagnostics.push(`P${index + 1} pageerror: ${error.message}`));
      page.on("console", message => { if (message.type() === "error") diagnostics.push(`P${index + 1} console: ${message.text()}`); });
      stage = `register P${index + 1}`;
      const email = `journey-${index}-${suffix}@example.test`; emails.push(email);
      await page.goto(web + "/register");
      await page.getByLabel("Username", { exact: true }).fill(names[index]);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL(web + "/");
      const user = await fixture.db.user.findUniqueOrThrow({ where: { email } }); fixture.users.push(user.id);
      await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      stage = `login P${index + 1}`;
      await page.goto(web + "/login?returnTo=%2Flobby");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(web + "/lobby");
      assert((await context.cookies(api + "/api/auth/refresh")).some(cookie => cookie.httpOnly && /refresh/i.test(cookie.name)), "real HttpOnly refresh cookie");
      stage = `frame P${index + 1}`;
      await page.goto(web + "/figures");
      await page.getByRole("tab", { name: "Frame", exact: true }).click();
      const frameSaved: Promise<Response> = page.waitForResponse((response: Response) => response.url().endsWith("/api/profile") && response.request().method() === "PATCH" && response.ok());
      await page.getByTestId(`frame-${frames[index]}`).click();
      const savedProfile = (await (await frameSaved).json()) as { profile: { figureFrame: string | null } };
      assert.equal(savedProfile.profile.figureFrame, frames[index]);
      assert.equal((await fixture.db.profile.findUniqueOrThrow({ where: { userId: user.id } })).figureFrame, frames[index]);
      await page.goto(web + "/lobby");
      await page.getByTestId("room-browser").waitFor();
    }
    const [a, b] = pages;
    console.log("[journey] Two accounts registered and logged in through UI");
    stage = "create lobby";
    await a.getByRole("button", { name: "Create Lobby", exact: true }).first().click();
    await a.getByLabel("Lobby name (optional)", { exact: true }).fill(`Journey ${suffix}`);
    await a.getByRole("combobox", { name: "Game mode", exact: true }).selectOption("classic");
    await a.getByRole("radio", { name: "Casual", exact: true }).check();
    await a.getByTestId("submit-room").click();
    await a.getByRole("button", { name: "Ready up", exact: true }).waitFor();
    const roomId = await a.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().roomId);
    assert(roomId);
    const room = getGameRoom(roomId)!; assert(room);
    fixture.matches.push(room.matchId!);
    stage = "join second player";
    await b.getByRole("button", { name: "Refresh", exact: true }).first().click();
    const card = b.locator("article").filter({ hasText: `Journey ${suffix}` });
    await card.getByRole("button", { name: /^Take seat/ }).click();
    await b.getByTestId("submit-room").click();
    await b.getByRole("button", { name: "Ready up", exact: true }).waitFor();
    assert.equal(room.seatIdentities.P1?.userId, fixture.users[0]);
    assert.equal(room.seatIdentities.P2?.userId, fixture.users[1]);
    console.log("[journey] UI lobby created and both seats joined");
    stage = "waiting room chat";
    const chatRevision = room.revision;
    await a.getByTestId("room-chat-input").fill("Good luck, have fun");
    await a.getByTestId("room-chat-send").click();
    await b.getByTestId("room-chat").getByText("Good luck, have fun", { exact: true }).waitFor();
    await b.getByTestId("room-chat").getByRole("button", { name: "Thanks", exact: true }).click();
    await a.getByTestId("room-chat").locator("q", { hasText: "Thanks" }).waitFor();
    assert.equal(room.revision, chatRevision, "chat does not move the room revision");
    console.log("[journey] Players exchanged chat messages in the waiting room");
    for (const page of pages) {
      const playerNames = await page.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().roomMeta?.playerNames);
      assert.deepEqual(playerNames, { P1: names[0], P2: names[1] });
      const playerFrames = await page.evaluate(async () => (await import("/src/store.ts")).useGameStore.getState().roomMeta?.playerFrames);
      assert.deepEqual(playerFrames, { P1: frames[0], P2: frames[1] }, "both players receive both frames");
      await page.getByRole("button", { name: "Ready up", exact: true }).click();
    }
    stage = "start match";
    await a.getByRole("button", { name: "Start game", exact: true }).click();
    await a.waitForFunction(async () => !!(await import("/src/store.ts")).useGameStore.getState().roomMeta?.pendingRoll);
    stage = "legal gameplay";
    console.log("[journey] Playing legal Classic actions");
    const actionTypes = new Set<string>();
    let framesSeen = false;
    for (let commands = 0; room.state.phase !== "ended" && commands < 2500; commands++) {
      const target = room.revision;
      await Promise.all(pages.map(client => client.waitForFunction(async revision => {
        const store = (await import("/src/store.ts")).useGameStore.getState();
        return (store.roomMeta?.revision ?? -1) >= revision &&
          (store.roomState?.phase !== "battle" || !!store.roomMeta?.pendingRoll || !!store.roomState.activeUnitId);
      }, target)));
      const { seat, action } = nextSmokeAction(room.state);
      const page = seat === "P1" ? a : b;
      const before = room.revision;
      // UI auto-starts a unit turn after placement/endTurn. Do not race that normal behavior.
      const sent = await page.evaluate(async ({ action, revision }) => {
        const { useGameStore } = await import("/src/store.ts");
        const store = useGameStore.getState();
        if (store.roomMeta?.revision !== revision) return false;
        // Clear any earlier (e.g. auto-action) rejection so the wait below sees only this reply.
        useGameStore.setState({ lastActionResult: null });
        store.sendAction(action); return true;
      }, { action, revision: before });
      if (!sent) continue;
      await page.waitForFunction(async revision => {
        const store = (await import("/src/store.ts")).useGameStore.getState();
        return (store.roomMeta?.revision ?? -1) > revision || store.lastActionResult?.ok === false;
      }, before);
      const rejection = await page.evaluate(async () => {
        const store = (await import("/src/store.ts")).useGameStore.getState();
        return store.lastActionResult?.ok === false ? store.lastActionResult.error ?? "no error text" : null;
      });
      // A rejection the client saw may belong to a UI auto-action; let the server finish ours.
      const accepted = room.revision >= before + 1 ||
        await eventually(async () => room.revision >= before + 1, `${action.type} at ${before}`, 2000).then(() => true, () => false);
      assert(accepted, `${action.type} rejected at ${before}: ${rejection ?? "server revision did not advance"}`);
      assert(room.actionLog.some(entry => entry.revision === before + 1 && entry.action.type === action.type), `${action.type} accepted through normal journal`);
      actionTypes.add(action.type);
      if (!framesSeen && room.state.phase === "battle") {
        // Each board dresses every visible figure in its owner's frame, the opponent's included.
        for (const page of pages) {
          const tokens = await page.$$eval(".unit-token[data-owner]", nodes =>
            nodes.map(node => ({ owner: node.getAttribute("data-owner"), frame: node.getAttribute("data-frame") })));
          assert(tokens.some(token => token.owner === "P1") && tokens.some(token => token.owner === "P2"), "both sides on the board");
          for (const token of tokens) assert.equal(token.frame, frames[token.owner === "P1" ? 0 : 1], `${token.owner} figure frame`);
        }
        framesSeen = true;
      }
    }
    assert(framesSeen, "frames were checked during the battle");
    assert.equal(room.state.phase, "ended", "normal rules victory, no seeded result or debug command");
    assert(actionTypes.has("placeUnit") && actionTypes.has("move") && actionTypes.has("attack") && actionTypes.has("resolvePendingRoll"));
    await Promise.all(pages.map(page => page.getByTestId("battle-end-overlay").waitFor()));
    stage = "durable finish";
    const matchId = room.matchId!;
    const match = await eventually(async () => {
      const saved = await fixture.db.match.findUniqueOrThrow({ where: { id: matchId }, include: { participants: true } });
      return saved.status === "FINISHED" ? saved : false;
    }, "persistent normal match finish");
    assert.equal(match.status, "FINISHED"); assert.equal(match.isRated, false); assert.equal(match.gameMode, "classic");
    assert.equal(match.finalRevision, room.revision);
    assert.equal(match.winnerSeat, room.state.gameOver?.winnerPlayerId);
    assert(match.participants.every(participant => participant.outcome));
    assert.deepEqual(Object.fromEntries(match.participants.map(p => [p.seat, p.figureFrame])), { P1: frames[0], P2: frames[1] }, "frames kept with the match");
    assert.equal(await fixture.db.matchAction.count({ where: { matchId } }), room.revision);
    assert(await fixture.db.matchSnapshot.findUnique({ where: { matchId_revision: { matchId, revision: room.revision } } }));
    assert.equal(await fixture.db.ratingHistory.count({ where: { matchId } }), 0);
    stage = "history and replay";
    a.once("dialog", dialog => void dialog.accept());
    await a.getByTestId("battle-end-leave").click();
    await a.getByTestId("room-browser").waitFor();
    await a.getByRole("link", { name: "Match history", exact: true }).click();
    const history = a.locator(`a[href="/matches/${matchId}"]`);
    await history.waitFor(); assert((await history.textContent())?.includes(names[1]));
    await history.click();
    await a.getByRole("link", { name: "Watch Replay", exact: true }).click();
    await a.getByTestId("replay-page").waitFor();
    const visible = a.getByTestId("replay-visible-revision");
    await a.getByRole("button", { name: "Next action", exact: true }).click();
    await a.waitForFunction(() => document.querySelector('[data-testid="replay-visible-revision"]')?.textContent?.includes("Revision 1 /"));
    const finalResponse = a.waitForResponse(response => response.url().includes(`/api/matches/${matchId}/replay/state`) && new URL(response.url()).searchParams.get("revision") === String(room.revision) && response.ok());
    await a.getByRole("button", { name: "Go to end", exact: true }).click();
    const replay = await (await finalResponse).json();
    await visible.waitFor();
    await a.waitForFunction(revision => document.querySelector('[data-testid="replay-visible-revision"]')?.textContent?.includes(`Revision ${revision} /`), room.revision);
    assert.equal(replay.revision, room.revision);
    assert.deepEqual(replay.state, JSON.parse(JSON.stringify(makeReplayView(room.state))));
    await a.locator(".replay-board").waitFor();
    assert.equal(await a.locator(".replay-board button:not(:disabled)").count(), 0);
    const replayTokens = await a.$$eval(".replay-board .unit-token[data-owner]", nodes =>
      nodes.map(node => ({ owner: node.getAttribute("data-owner"), frame: node.getAttribute("data-frame") })));
    assert(replayTokens.length > 0, "the final replay board shows figures");
    for (const token of replayTokens) assert.equal(token.frame, frames[token.owner === "P1" ? 0 : 1], `replay ${token.owner} frame`);
    const service = new ReplayService(new MatchRepository(fixture.db), new MatchActionRepository(fixture.db), new MatchSnapshotService(new MatchSnapshotRepository(fixture.db)));
    assert.equal((await service.validateFinalDeterminism(matchId)).deterministic, true);
    assert.equal(await fixture.db.matchAction.count({ where: { matchId } }), room.revision, "replay is read-only");

    stage = "friends and private messages";
    // B leaves the finished battle too: the mini-chat stays out of the way while a room is open.
    b.once("dialog", dialog => void dialog.accept());
    await b.getByTestId("battle-end-leave").click();
    await b.getByTestId("room-browser").waitFor();
    await a.goto(web + "/friends?tab=find");
    await a.locator("#friends-search").fill(names[1]);
    await a.getByTestId("player-row").filter({ hasText: names[1] }).getByRole("button", { name: "Add friend", exact: true }).click();
    await a.getByRole("button", { name: "Cancel request", exact: true }).waitFor();
    await b.goto(web + "/friends?tab=requests");
    await b.getByTestId("player-row").filter({ hasText: names[0] }).getByRole("button", { name: "Accept", exact: true }).click();
    await b.getByText("No pending requests.", { exact: true }).waitFor();
    await a.goto(web + "/friends");
    const friendRow = a.getByTestId("player-row").filter({ hasText: names[1] });
    await friendRow.getByRole("button", { name: "More actions", exact: true }).click();
    await friendRow.getByRole("menuitem", { name: "Message", exact: true }).click();
    await a.getByTestId("dm-thread").waitFor();
    // B waits on another page; the corner mini-chat counts the message as it arrives.
    await b.goto(web + "/leaderboard");
    await b.getByTestId("dm-dock-pill").waitFor();
    const dmText = `Rematch tonight? ${suffix}`;
    await a.getByTestId("dm-input").fill(dmText);
    await a.getByTestId("dm-send").click();
    await a.getByTestId("dm-thread").getByText(dmText, { exact: true }).waitFor();
    await b.getByTestId("dm-dock-pill").getByLabel("Unread messages: 1", { exact: true }).waitFor();
    await b.getByTestId("dm-dock-pill").click();
    await b.getByTestId("dm-conversation").filter({ hasText: names[0] }).click();
    const bThread = b.getByTestId("dm-dock").getByTestId("dm-thread");
    await bThread.getByText(dmText, { exact: true }).waitFor();
    // Opening it reads it, and A sees so without reloading.
    await a.getByTestId("dm-thread").locator(".dm-message__meta", { hasText: "read" }).waitFor();
    await bThread.getByTestId("dm-input").fill("Yes, at eight");
    await bThread.getByTestId("dm-send").click();
    await a.getByTestId("dm-thread").getByText("Yes, at eight", { exact: true }).waitFor();
    // B reports A's message from the message's own menu.
    const reported = bThread.getByTestId("dm-message").filter({ hasText: dmText });
    await reported.hover();
    await reported.getByRole("button", { name: "More actions", exact: true }).click();
    await reported.getByRole("menuitem", { name: "Report…", exact: true }).click();
    await b.getByTestId("report-comment").fill("e2e report");
    await b.getByTestId("report-submit").click();
    await b.getByTestId("report-sent").waitFor();
    const [userA, userB] = await Promise.all(emails.map(email => fixture.db.user.findUniqueOrThrow({ where: { email } })));
    const reports = await fixture.db.chatReport.findMany({ where: { reporterId: userB.id } });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].reportedId, userA.id);
    assert.equal(reports[0].source, "DIRECT");
    assert.equal(reports[0].body, dmText);
    assert.equal(reports[0].comment, "e2e report");
    assert.equal(await fixture.db.directMessage.count({ where: { OR: [{ senderId: userA.id }, { senderId: userB.id }] } }), 2);
    console.log("[journey] Players became friends, exchanged private messages with read receipts and filed a report");
    assert.equal(diagnostics.filter(line => line.includes("pageerror")).length, 0, diagnostics.join("\n"));
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, seed: 37, gameMode: "classic", matchType: "CASUAL", finalRevision: room.revision, actionTypes: [...actionTypes], winnerSeat: match.winnerSeat, accounts: 2 }, null, 2));
    console.log(`E2E journey passed: real registration/login, two browser players, UI create/join/start, ${room.revision} legal WS revisions, normal finish, durable result/snapshot, UI history, exact final replay, friends and private messages.`);
    console.log(`[journey] Result: test-results/journey/${suffix}/result.json`);
  } catch (error) {
    diagnostics.push(`Failed stage: ${stage}`, String(error));
    await writeFile(path.join(output, "failure.log"), diagnostics.join("\n"));
    for (const [index, page] of pages.entries()) await page.screenshot({ path: path.join(output, `failure-P${index + 1}.png`), fullPage: true }).catch(() => {});
    for (const [index, context] of contexts.entries()) await context.tracing.stop({ path: path.join(output, `failure-P${index + 1}.zip`) }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) { await context.tracing.stop().catch(() => {}); await context.close(); }
    await browser?.close();
    await stopVite(vite);
    await server?.close();
    const registered = await fixture.db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    fixture.users.push(...registered.map(user => user.id));
    await fixture.dispose();
    storeTestHooks.reset(); wsTestHooks.resetWsStateForTests();
    process.env = envBefore;
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1; });
