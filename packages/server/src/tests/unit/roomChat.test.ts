import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_HISTORY_LIMIT, ChatRateLimiter, RoomChatLog, canReceive, chatAccess, chatTextLength,
  loadBlockedPairs, normalizeChatText, toChatDto, type ChatParticipant,
} from "../../chat/roomChat";
import { ChatSendMessageSchema, ClientMessageSchema } from "../../schemas";

const p1: ChatParticipant = { role: "P1", seat: "P1", userId: "u1" };
const p2: ChatParticipant = { role: "P2", seat: "P2", userId: "u2" };
const watcher: ChatParticipant = { role: "spectator", seat: null, userId: "u3" };
const guest: ChatParticipant = { role: "spectator", seat: null, userId: null };

test("players write the match channel; spectators read both and write their own; guests only read", () => {
  assert.deepEqual(chatAccess(p1, "normal"), { read: ["match"], write: ["match"] });
  assert.deepEqual(chatAccess(watcher, "normal"), { read: ["match", "spectators"], write: ["spectators"] });
  assert.deepEqual(chatAccess(guest, "normal"), { read: ["match", "spectators"], write: [] });
  assert.deepEqual(chatAccess(p1, "test"), { read: [], write: [] }, "test rooms have no chat");
});

test("text loses control and direction-override characters and keeps its emoji", () => {
  assert.equal(normalizeChatText("  hi\n\tthere‮!\u0007 "), "hi there !");
  assert.equal(normalizeChatText("‏⁦ \n"), "");
  assert.equal(normalizeChatText("gg 👍🏽"), "gg 👍🏽");
  assert.equal(chatTextLength("👍🏽ab"), 4, "length counts code points");
});

test("a player may send five messages in ten seconds and not the same one twice in a row", () => {
  let now = 0;
  const limiter = new ChatRateLimiter(() => now);
  for (let i = 0; i < 5; i++) assert.equal(limiter.consume("u1", `m${i}`), null);
  const limited = limiter.consume("u1", "m5");
  assert.equal(limited?.code, "CHAT_RATE_LIMITED");
  assert(limited && "retryAfterMs" in limited && limited.retryAfterMs === 10_000);
  assert.equal(limiter.consume("u2", "other player"), null, "the budget is per player");
  now = 10_000;
  assert.equal(limiter.consume("u1", "m6"), null);
  assert.equal(limiter.consume("u1", "m6")?.code, "CHAT_DUPLICATE");
  assert.equal(limiter.consume("u1", null), null, "quick phrases are not repeats");
});

test("a block in either direction hides messages both ways, never the sender's own", async () => {
  const pairs = await loadBlockedPairs({ blocksAmong: async () => [["u2", "u1"]] }, ["u1", "u2", "u3"]);
  const fromP1 = { channel: "match" as const, sender: { userId: "u1", username: "a", name: "A", seat: "P1" as const } };
  const fromP2 = { ...fromP1, sender: { userId: "u2", username: "b", name: "B", seat: "P2" as const } };
  assert.equal(canReceive(fromP1, p2, chatAccess(p2, "normal"), pairs), false, "the blocker does not see the blocked");
  assert.equal(canReceive(fromP2, p1, chatAccess(p1, "normal"), pairs), false, "the blocked does not see the blocker");
  assert.equal(canReceive(fromP1, p1, chatAccess(p1, "normal"), pairs), true);
  assert.equal(canReceive(fromP1, watcher, chatAccess(watcher, "normal"), pairs), true);
  assert.equal(canReceive(fromP1, guest, chatAccess(guest, "normal"), pairs), true);
  const spectatorsOnly = { ...fromP1, channel: "spectators" as const };
  assert.equal(canReceive(spectatorsOnly, p1, chatAccess(p1, "normal"), new Set()), false, "players never read spectators");
  let asked = false;
  await loadBlockedPairs({ blocksAmong: async () => { asked = true; return []; } }, ["u1", "u1"]);
  assert.equal(asked, false, "one player alone needs no lookup");
});

test("each channel keeps its last 100 messages and the account id stays on the server", () => {
  const log = new RoomChatLog(() => 0);
  const room = {};
  const sender = { userId: "u1", username: "anika", name: "Anika", seat: "P1" as const };
  log.append(room, { channel: "spectators", sender: { ...sender, seat: null }, text: "first" });
  for (let i = 0; i < CHAT_HISTORY_LIMIT + 5; i++) log.append(room, { channel: "match", sender, text: `m${i}` });
  const messages = log.messages(room);
  assert.equal(messages.filter((m) => m.channel === "match").length, CHAT_HISTORY_LIMIT);
  assert.equal(messages.filter((m) => m.channel === "spectators").length, 1);
  assert.equal(messages.find((m) => m.channel === "match")?.text, "m5");
  const dto = toChatDto(messages.at(-1)!, p2);
  assert.equal(dto.own, false);
  assert.equal(toChatDto(messages.at(-1)!, p1).own, true);
  assert(!JSON.stringify(dto).includes("u1"));
  assert.deepEqual(log.messages({}), []);
});

test("the socket schema accepts chat and refuses forged senders", () => {
  assert(ClientMessageSchema.safeParse({ type: "chatSend", channel: "match", text: "hi" }).success);
  assert(ClientMessageSchema.safeParse({ type: "chatQuick", channel: "match", phrase: "goodGame" }).success);
  assert(!ClientMessageSchema.safeParse({ type: "chatQuick", channel: "match", phrase: "anything" }).success);
  assert(!ChatSendMessageSchema.safeParse({ type: "chatSend", channel: "match", text: "hi", userId: "u2" }).success);
  assert(!ChatSendMessageSchema.safeParse({ type: "chatSend", channel: "match", text: "hi", name: "Admin" }).success);
  assert(!ChatSendMessageSchema.safeParse({ type: "chatSend", channel: "all", text: "hi" }).success);
});
