import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { buildServer } from "../index";
import { getGameRoom, storeTestHooks } from "../store";
import { refreshRoomChatFor, wsTestHooks, type ServerMessage } from "../ws";
import { MemoryMatchPersistence, testAccessToken, testIdentityService } from "./matchTestSupport";
import { connectWs, type WsClient } from "./helpers/wsClient";
import type { NewChatReport } from "../repositories/chatReportRepository";

type ChatMessage = Extract<ServerMessage, { type: "chatMessage" }>;
type ChatHistory = Extract<ServerMessage, { type: "chatHistory" }>;

const users = {
  anika: randomUUID(), ragnar: randomUUID(), vedana: randomUUID(), til: randomUUID(),
};
/** Anika has blocked Til. */
const blocks: Array<[string, string]> = [[users.anika, users.til]];
const muted = new Map<string, Date>();
const reports: NewChatReport[] = [];

let server: Awaited<ReturnType<typeof buildServer>>;
let url = "";
const clients: WsClient[] = [];
const roomId = randomUUID();

async function client() {
  const ws = await connectWs(url);
  clients.push(ws);
  return ws;
}

async function join(ws: WsClient, role: "P1" | "P2" | "spectator", token?: string, mode: "create" | "join" = "join") {
  ws.send({ type: "joinRoom", mode, roomId, role, ...(token ? { accessToken: token } : {}) });
  await ws.wait("joinAck");
  return ws.wait("chatHistory");
}

/** Proves a frame did not arrive: the sender's later probe overtakes it on the same socket. */
async function assertNoChat(ws: WsClient, description: string) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(ws.messages.filter((m) => m.type === "chatMessage").length, 0, description);
}

function nextChat(ws: WsClient, text: string) {
  return ws.waitFor((m) => m.type === "chatMessage" && (m.message.text === text || m.message.phrase === text), `chat ${text}`) as Promise<ChatMessage>;
}

let p1: WsClient, p2: WsClient, watcher: WsClient, guest: WsClient, blocked: WsClient;

before(async () => {
  process.env.LOG_LEVEL = "silent";
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  server = await buildServer({
    matchPersistence: new MemoryMatchPersistence(),
    connectionIdentity: testIdentityService(),
    chatBlocks: {
      blocksAmong: async (ids) => blocks.filter(([a, b]) => ids.includes(a) && ids.includes(b)),
      block: async (blocker, blocked) => {
        blocks.push([blocker, blocked]);
      },
    },
    chatModeration: {
      mutedUntil: async (userId) => muted.get(userId) ?? null,
      report: async (input) => {
        if (reports.some((r) => r.reporterId === input.reporterId && r.messageKey === input.messageKey)) return "duplicate";
        reports.push(input);
        return "created";
      },
    },
  });
  url = (await server.listen({ port: 0, host: "127.0.0.1" })).replace("http:", "ws:") + "/ws";
  p1 = await client();
  const history = await join(p1, "P1", testAccessToken("P1", "anika", users.anika), "create");
  assert.deepEqual(history.access, { read: ["match"], write: ["match"] });
  assert.deepEqual(history.messages, []);
  p2 = await client();
  await join(p2, "P2", testAccessToken("P2", "ragnar", users.ragnar));
  watcher = await client();
  const watching = await join(watcher, "spectator", testAccessToken("P1", "vedana", users.vedana));
  assert.deepEqual(watching.access, { read: ["match", "spectators"], write: ["spectators"] });
  guest = await client();
  const guestHistory = await join(guest, "spectator");
  assert.deepEqual(guestHistory.access, { read: ["match", "spectators"], write: [] });
  blocked = await client();
  await join(blocked, "spectator", testAccessToken("P1", "til", users.til));
});

after(async () => {
  await Promise.all(clients.map((ws) => ws.close()));
  await server.close();
});

test("a player's message reaches the opponent and every spectator, but not someone they blocked", async () => {
  const room = getGameRoom(roomId)!;
  const revision = room.revision, journal = room.actionLog.length;
  for (const ws of [p2, watcher, guest, blocked]) ws.messages.length = 0;
  p1.send({ type: "chatSend", channel: "match", text: "  Удачи!‮\n" });
  const own = await nextChat(p1, "Удачи!");
  assert.equal(own.message.own, true);
  const opponent = await nextChat(p2, "Удачи!");
  assert.equal(opponent.message.own, false);
  assert.deepEqual(opponent.message.sender, { username: "anika", name: "anika", seat: "P1" });
  assert.equal(opponent.message.channel, "match");
  assert(!JSON.stringify(opponent).includes(users.anika), "the account id stays on the server");
  await nextChat(watcher, "Удачи!");
  await nextChat(guest, "Удачи!");
  await assertNoChat(blocked, "Til is blocked by Anika and does not get her messages");
  assert.equal(room.revision, revision, "chat does not move the revision");
  assert.equal(room.actionLog.length, journal, "chat is not journaled");
  assert(!JSON.stringify(room.state).includes("Удачи"), "chat is not in the game state");
});

test("the spectators channel stays among spectators", async () => {
  p1.messages.length = 0;
  p2.messages.length = 0;
  blocked.send({ type: "chatSend", channel: "spectators", text: "hello watchers" });
  await nextChat(blocked, "hello watchers");
  await nextChat(watcher, "hello watchers");
  await nextChat(guest, "hello watchers");
  await assertNoChat(p1, "players do not read the spectators channel");
  await assertNoChat(p2, "players do not read the spectators channel");
});

test("quick phrases go out as phrase ids for the reader's own language", async () => {
  p2.send({ type: "chatQuick", channel: "match", phrase: "goodLuck" });
  const message = await nextChat(p1, "goodLuck");
  assert.equal(message.message.phrase, "goodLuck");
  assert.equal(message.message.text, undefined);
  assert.equal(message.message.sender.seat, "P2");
  await nextChat(blocked, "goodLuck");
});

test("only players write the match channel, only signed-in spectators write theirs", async () => {
  p2.messages.length = 0;
  const cases: Array<[WsClient, object, string]> = [
    [watcher, { type: "chatSend", channel: "match", text: "hint: go left" }, "CHAT_FORBIDDEN"],
    [p1, { type: "chatSend", channel: "spectators", text: "hi" }, "CHAT_FORBIDDEN"],
    [guest, { type: "chatSend", channel: "spectators", text: "hi" }, "CHAT_AUTH_REQUIRED"],
    [p1, { type: "chatSend", channel: "match", text: " \n‏ " }, "CHAT_EMPTY"],
    [p1, { type: "chatSend", channel: "match", text: "x".repeat(201) }, "CHAT_TOO_LONG"],
  ];
  for (const [ws, message, code] of cases) {
    ws.send(message);
    const rejected = await ws.wait("chatRejected");
    assert.equal(rejected.code, code);
  }
  p1.send({ type: "chatSend", channel: "match", text: "hi", userId: users.ragnar });
  assert.equal((await p1.wait("error")).code, "INVALID_PAYLOAD", "a forged sender is refused");
  await assertNoChat(p2, "no refused message was delivered");
});

test("a sixth message within ten seconds is refused", async () => {
  // Ragnar has sent one phrase; four more fit in the window.
  for (let i = 0; i < 4; i++) {
    p2.send({ type: "chatSend", channel: "match", text: `m${i}` });
    await nextChat(p2, `m${i}`);
  }
  p2.send({ type: "chatSend", channel: "match", text: "one too many" });
  const rejected = await p2.wait("chatRejected");
  assert.equal(rejected.code, "CHAT_RATE_LIMITED");
  assert(rejected.retryAfterMs! > 0 && rejected.retryAfterMs! <= 10_000);
});

test("history on joining keeps channel rules and blocks", async () => {
  const late = await client();
  const history = await join(late, "spectator", testAccessToken("P1", "til", users.til)) as ChatHistory;
  const texts = history.messages.map((m) => m.text ?? m.phrase);
  assert(!texts.includes("Удачи!"), "the blocked player's history skips the blocker");
  assert(texts.includes("goodLuck") && texts.includes("hello watchers"));
  assert(history.messages.find((m) => m.text === "hello watchers")?.own, "own messages are marked");

  const opponentView = await client();
  // A second socket for a seat replaces the first: read the room as a fresh spectator instead.
  const spectatorHistory = await join(opponentView, "spectator", testAccessToken("P2", "vedana", users.vedana));
  assert(spectatorHistory.messages.some((m) => m.text === "Удачи!"));
  assert(spectatorHistory.messages.some((m) => m.channel === "spectators"));
});

test("a report copies the message and what the reporter saw before it; nobody reports what they cannot see", async () => {
  watcher.messages.length = 0;
  p1.send({ type: "chatSend", channel: "match", text: "ты вообще играть умеешь?" });
  const seen = await nextChat(watcher, "ты вообще играть умеешь?");
  const blockedSeen = (await join(await client(), "spectator", testAccessToken("P1", "til", users.til)))
    .messages.find((m) => m.text === "hello watchers")!;

  watcher.send({ type: "chatReport", messageId: seen.message.id, reason: "ABUSE", comment: " третий раз\n " });
  const ack = await watcher.wait("chatReported");
  assert.equal(ack.messageId, seen.message.id);
  const report = reports.at(-1)!;
  assert.equal(report.reporterId, users.vedana);
  assert.equal(report.reportedId, users.anika, "the author comes from the server's log, not the client");
  assert.equal(report.source, "MATCH");
  assert.equal(report.body, "ты вообще играть умеешь?");
  assert.equal(report.comment, "третий раз");
  assert.equal(report.roomId, roomId);
  const last = report.context.at(-1)!;
  assert.deepEqual([last.text, last.reported, last.username], ["ты вообще играть умеешь?", true, "anika"]);
  assert(report.context.length <= 11 && report.context.slice(0, -1).every((line) => !line.reported));
  assert(report.context.some((line) => line.text === "[goodLuck]"), "quick phrases are copied by id");

  const before = reports.length;
  watcher.send({ type: "chatReport", messageId: seen.message.id, reason: "SPAM" });
  await watcher.wait("chatReported");
  assert.equal(reports.length, before, "a second report of the same message adds nothing");

  const refused: Array<[WsClient, string, string]> = [
    [p1, seen.message.id, "CHAT_REPORT_INVALID"], // own message
    [p1, blockedSeen.id, "CHAT_REPORT_INVALID"], // players do not read the spectators channel
    [blocked, seen.message.id, "CHAT_REPORT_INVALID"], // Til does not see Anika
    [guest, seen.message.id, "CHAT_AUTH_REQUIRED"],
    [watcher, randomUUID(), "CHAT_REPORT_INVALID"],
  ];
  for (const [ws, messageId, code] of refused) {
    ws.send({ type: "chatReport", messageId, reason: "ABUSE" });
    assert.equal((await ws.wait("chatRejected")).code, code);
  }
  assert.equal(reports.length, before);
  watcher.send({ type: "chatReport", messageId: seen.message.id, reason: "INSULT" });
  assert.equal((await watcher.wait("error")).code, "INVALID_PAYLOAD", "unknown reasons are refused");
});

test("a restricted player reads but cannot write, and their history says until when", async () => {
  const until = new Date(Date.now() + 60 * 60 * 1000);
  muted.set(users.vedana, until);
  try {
    p1.messages.length = 0;
    watcher.send({ type: "chatSend", channel: "spectators", text: "still here" });
    const rejected = await watcher.wait("chatRejected");
    assert.equal(rejected.code, "CHAT_MUTED");
    assert.equal(rejected.until, until.toISOString());
    const again = await join(await client(), "spectator", testAccessToken("P1", "vedana", users.vedana));
    assert.deepEqual(again.access, { read: ["match", "spectators"], write: ["spectators"], mutedUntil: until.toISOString() });
    assert(again.messages.length > 0, "reading goes on");
  } finally {
    muted.delete(users.vedana);
  }
});

test("blocking by message id hides the author's messages without telling the client who they are", async () => {
  // Ragnar is P2; the spectator Vedana blocks him from one of his messages.
  const ragnarLine = (await join(await client(), "spectator", testAccessToken("P1", "vedana", users.vedana)))
    .messages.find((m) => m.sender.username === "ragnar")!;
  assert(ragnarLine, "Vedana has read Ragnar");
  const refused: Array<[WsClient, string, string]> = [
    [p2, ragnarLine.id, "CHAT_BLOCK_INVALID"], // own message
    [guest, ragnarLine.id, "CHAT_AUTH_REQUIRED"],
    [watcher, randomUUID(), "CHAT_BLOCK_INVALID"],
  ];
  for (const [ws, messageId, code] of refused) {
    ws.send({ type: "chatBlock", messageId });
    assert.equal((await ws.wait("chatRejected")).code, code);
  }
  watcher.messages.length = 0;
  watcher.send({ type: "chatBlock", messageId: ragnarLine.id });
  assert.equal((await watcher.wait("chatBlocked")).messageId, ragnarLine.id);
  assert.deepEqual(blocks.at(-1), [users.vedana, users.ragnar], "the server found the author itself");
  const fresh = await watcher.wait("chatHistory");
  assert(!fresh.messages.some((m) => m.sender.username === "ragnar"), "the fresh history leaves him out");
  p2.messages.length = 0;
  const ragnarFresh = await p2.wait("chatHistory");
  assert(!ragnarFresh.messages.some((m) => m.sender.username === "vedana"), "and Ragnar no longer reads her either");
});

test("unblocking sends both players the room chat again, with each other's messages back", async () => {
  const at = blocks.findIndex(([a, b]) => a === users.vedana && b === users.ragnar);
  assert(at >= 0, "the previous test blocked Ragnar");
  blocks.splice(at, 1);
  watcher.messages.length = 0;
  p2.messages.length = 0;
  refreshRoomChatFor([users.vedana, users.ragnar]);
  const vedanaView = await watcher.wait("chatHistory");
  assert(vedanaView.messages.some((m) => m.sender.username === "ragnar"), "Ragnar's old messages are back for Vedana");
  // Ragnar is seated: Vedana's spectator channel stays closed to him, but he is sent the chat again too.
  const ragnarView = await p2.wait("chatHistory");
  assert(ragnarView.messages.every((m) => m.channel === "match"));
  p1.messages.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(p1.messages.filter((m) => m.type === "chatHistory").length, 0, "players outside the pair are left alone");
});
