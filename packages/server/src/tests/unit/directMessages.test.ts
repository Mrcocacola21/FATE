import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatRateLimiter } from "../../chat/roomChat";
import type { DirectMessageRepository, DirectMessageRow } from "../../repositories/directMessageRepository";
import type { UserEvent } from "../../realtime/userEvents";
import { DIRECT_MESSAGE_RETENTION_DAYS, DirectMessageService } from "../../services/directMessageService";

const ann = "00000000-0000-4000-8000-00000000000a";
const bob = "00000000-0000-4000-8000-00000000000b";
const cid = "00000000-0000-4000-8000-00000000000c";
const profile = (userId: string) => ({ userId, username: userId.slice(-1), displayName: null, avatarUrl: null });

function setup() {
  let clock = new Date("2026-11-17T12:00:00Z");
  const rows: DirectMessageRow[] = [];
  const friends = new Set([`${ann}|${bob}`]);
  const blocks: Array<[string, string]> = [];
  const sent: Array<[string, UserEvent]> = [];
  const online = new Set([ann, bob, cid]);
  const isFriend = (a: string, b: string) => friends.has(`${a}|${b}`) || friends.has(`${b}|${a}`);
  const isBlocked = (a: string, b: string) => blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  let next = 0;
  const repo = {
    async create(input: { senderId: string; recipientId: string; body: string }) {
      const row = { id: `m${++next}`, ...input, createdAt: new Date(clock.getTime() + next), readAt: null };
      rows.push(row);
      return row;
    },
    async page(a: string, b: string, limit: number, before?: { createdAt: Date; id: string }) {
      return rows
        .filter((r) => [r.senderId, r.recipientId].sort().join() === [a, b].sort().join())
        .filter((r) => !before || r.createdAt < before.createdAt)
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .slice(0, limit);
    },
    async findById(id: string) { return rows.find((r) => r.id === id) ?? null; },
    async latestPerConversation(userId: string) {
      const latest = new Map<string, DirectMessageRow>();
      for (const r of [...rows].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())) {
        if (r.senderId !== userId && r.recipientId !== userId) continue;
        const key = [r.senderId, r.recipientId].sort().join();
        if (!latest.has(key)) latest.set(key, r);
      }
      return [...latest.values()];
    },
    async unreadBySender(userId: string) {
      const counts = new Map<string, number>();
      for (const r of rows) if (r.recipientId === userId && !r.readAt && !isBlocked(userId, r.senderId))
        counts.set(r.senderId, (counts.get(r.senderId) ?? 0) + 1);
      return counts;
    },
    async countUnread(userId: string) {
      return rows.filter((r) => r.recipientId === userId && !r.readAt && !isBlocked(userId, r.senderId)).length;
    },
    async markRead(readerId: string, senderId: string, at: Date) {
      const unread = rows.filter((r) => r.recipientId === readerId && r.senderId === senderId && !r.readAt);
      for (const r of unread) r.readAt = at;
      return unread.length;
    },
    async partners(viewerId: string, ids: string[]) {
      return {
        profiles: ids.map(profile),
        friends: new Set(ids.filter((id) => isFriend(viewerId, id))),
        blocked: new Set(ids.filter((id) => isBlocked(viewerId, id))),
      };
    },
    async deleteOlderThan(cutoff: Date) {
      const old = rows.filter((r) => r.createdAt < cutoff);
      for (const r of old) rows.splice(rows.indexOf(r), 1);
      return old.length;
    },
  } as unknown as DirectMessageRepository;
  const lookups = {
    findPlayerById: async (id: string) => ([ann, bob, cid].includes(id) ? { ...profile(id), presenceVisibility: "EVERYONE", lastSeenAt: null, friendRequests: "EVERYONE", lobbyInvites: "EVERYONE" } : null),
    findPair: async (a: string, b: string) => (isFriend(a, b) ? { status: "ACCEPTED" } : null),
    blocksBetween: async (a: string, b: string) => ({
      iBlocked: blocks.some(([x, y]) => x === a && y === b),
      blockedMe: blocks.some(([x, y]) => x === b && y === a),
    }),
  };
  let now = 0;
  const service = new DirectMessageService(
    repo,
    lookups as never,
    { send: (userId, event) => sent.push([userId, event]), isOnline: (userId) => online.has(userId) },
    new ChatRateLimiter(() => now),
    () => clock,
  );
  return {
    service, rows, friends, blocks, sent,
    tick: (ms: number) => { now += ms; },
    setClock: (date: Date) => { clock = date; },
  };
}

test("a friend's message is stored, pushed to the recipient with their unread count and echoed to the sender", async () => {
  const { service, sent } = setup();
  const message = await service.send(ann, bob, "  hi\n there ‮ ");
  assert.equal(message.text, "hi there");
  assert.equal(message.from, ann);
  assert.equal(message.readAt, null);
  assert.deepEqual(sent.map(([to, event]) => [to, event.type]), [[ann, "directMessage"], [bob, "directMessage"]]);
  const pushed = sent[1][1];
  assert(pushed.type === "directMessage" && pushed.unread === 1);
  assert(sent[0][1].type === "directMessage" && sent[0][1].unread === undefined, "the sender's own count is not the recipient's");
});

test("only friends who have not blocked each other may write", async () => {
  const { service, blocks } = setup();
  await assert.rejects(service.send(ann, cid, "hello"), { code: "MESSAGE_NOT_ALLOWED" });
  await assert.rejects(service.send(ann, ann, "hello"), { code: "MESSAGE_SELF" });
  await assert.rejects(service.send(ann, "00000000-0000-4000-8000-0000000000ff", "hello"), { code: "USER_NOT_FOUND" });
  await assert.rejects(service.send(ann, bob, " \n‏ "), { code: "MESSAGE_EMPTY" });
  await assert.rejects(service.send(ann, bob, "x".repeat(1001)), { code: "MESSAGE_TOO_LONG" });
  blocks.push([bob, ann]);
  await assert.rejects(service.send(ann, bob, "hello"), { code: "MESSAGE_NOT_ALLOWED" }, "the blocked player cannot write");
  await assert.rejects(service.send(bob, ann, "hello"), { code: "MESSAGE_NOT_ALLOWED" }, "nor can the blocker");
});

test("a block hides the conversation from both sides, history and list alike", async () => {
  const { service, blocks } = setup();
  await service.send(ann, bob, "before the block");
  blocks.push([ann, bob]);
  for (const [viewer, other] of [[ann, bob], [bob, ann]]) {
    const history = await service.history(viewer, other);
    assert.deepEqual(history.messages, []);
    assert.equal(history.canSend, false);
    assert.deepEqual((await service.conversations(viewer)).conversations, []);
    assert.equal((await service.unreadCount(viewer)).unread, 0);
  }
});

test("five messages per ten seconds, and the same text twice is refused", async () => {
  const { service, tick } = setup();
  for (let i = 0; i < 5; i++) await service.send(ann, bob, `m${i}`);
  await assert.rejects(service.send(ann, bob, "m5"), { code: "RATE_LIMITED" });
  tick(10_000);
  await service.send(ann, bob, "again");
  await assert.rejects(service.send(ann, bob, "again"), { code: "MESSAGE_DUPLICATE" });
});

test("conversations list the latest message, unread counts and whether the player can still write", async () => {
  const { service, friends, tick } = setup();
  await service.send(bob, ann, "one");
  tick(1);
  await service.send(bob, ann, "two");
  const list = await service.conversations(ann);
  assert.equal(list.unread, 2);
  assert.equal(list.conversations[0].lastMessage.text, "two");
  assert.equal(list.conversations[0].player.id, bob);
  assert.equal(list.conversations[0].canSend, true);
  friends.clear();
  const after = await service.conversations(ann);
  assert.equal(after.conversations[0].canSend, false, "an old friend's history stays readable");
  assert.equal((await service.history(ann, bob)).canSend, false);
});

test("reading a conversation clears its unread and tells the sender", async () => {
  const { service, sent } = setup();
  const message = await service.send(bob, ann, "read me");
  sent.length = 0;
  assert.deepEqual(await service.markRead(ann, bob), { unread: 0 });
  assert.deepEqual(sent.map(([to, event]) => [to, event.type]), [[ann, "directMessagesRead"], [bob, "directMessagesRead"]]);
  const history = await service.history(bob, ann);
  assert.equal(history.messages.find((m) => m.id === message.id)?.readAt, "2026-11-17T12:00:00.000Z");
  sent.length = 0;
  await service.markRead(ann, bob);
  assert.equal(sent.length, 0, "nothing new to read sends nothing");
});

test("history pages run oldest first and continue before the oldest held message", async () => {
  const { service, tick } = setup();
  for (let i = 0; i < 55; i++) { tick(10_000); await service.send(ann, bob, `m${i}`); }
  const first = await service.history(bob, ann);
  assert.equal(first.messages.length, 50);
  assert.equal(first.hasMore, true);
  assert.equal(first.messages.at(-1)?.text, "m54");
  const older = await service.history(bob, ann, first.messages[0].id);
  assert.deepEqual(older.messages.map((m) => m.text), ["m0", "m1", "m2", "m3", "m4"]);
  assert.equal(older.hasMore, false);
  await assert.rejects(service.history(cid, ann, first.messages[0].id), { code: "MESSAGE_NOT_FOUND" }, "another conversation's id is not an anchor");
});

test(`messages older than ${DIRECT_MESSAGE_RETENTION_DAYS} days are deleted`, async () => {
  const { service, rows, setClock } = setup();
  await service.send(ann, bob, "old");
  setClock(new Date(Date.parse("2026-11-17T12:00:00Z") + (DIRECT_MESSAGE_RETENTION_DAYS + 1) * 86_400_000));
  await service.prune();
  assert.equal(rows.length, 0);
});
