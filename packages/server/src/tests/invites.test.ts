import assert from "node:assert/strict";
import { InviteService, INVITE_TTL_MS } from "../invites/inviteService";
import type { UserEvent } from "../realtime/userEvents";
import { createGameRoom, storeTestHooks } from "../store";

type Policy = "EVERYONE" | "FRIENDS" | "NOBODY";

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: { code?: string }) => error.code === code);
}

async function run() {
  storeTestHooks.reset();
  const room = createGameRoom({ seed: 7, lobbyName: "Night duel" });
  room.seatIdentities.P1 = { userId: "ann", username: "Ann", displayName: null };
  room.seats.P1 = "conn-ann";
  const other = createGameRoom({ seed: 8 });

  const policies: Record<string, Policy> = {};
  const friends = new Set<string>();
  const blocked = new Set<string>();
  const ids = ["ann", "bob", "cid", "dee", ...Array.from({ length: 12 }, (_, i) => `p${i}`)];
  const players = {
    findPlayerById: async (userId: string) =>
      ids.includes(userId)
        ? {
            userId,
            username: userId.toUpperCase(),
            displayName: null,
            avatarUrl: null,
            lobbyInvites: policies[userId] ?? "EVERYONE",
          }
        : null,
    blocksBetween: async (a: string, b: string) => ({
      iBlocked: blocked.has(`${a}>${b}`),
      blockedMe: blocked.has(`${b}>${a}`),
    }),
    findPair: async (a: string, b: string) =>
      (friends.has([a, b].sort().join("+")) ? { status: "ACCEPTED" } : null) as never,
  } as unknown as ConstructorParameters<typeof InviteService>[0];
  const sent: { to: string; event: UserEvent }[] = [];
  let now = Date.parse("2026-10-30T10:00:00Z");
  const service = new InviteService(
    players,
    (id) => [room, other].find((candidate) => candidate.id === id),
    { send: (to, event) => sent.push({ to, event }), isOnline: () => true },
    () => now,
  );
  const events = () =>
    sent.map(({ to, event }) => `${to}:${event.type}`);

  // Ann invites Bob into her free P2 seat; both sides hear about it.
  const { invite } = await service.send("ann", room.id, "bob");
  assert.equal(invite.seat, "P2");
  assert.equal(invite.lobbyName, "Night duel");
  assert.equal(invite.from.id, "ann");
  assert.equal(Date.parse(invite.expiresAt) - Date.parse(invite.createdAt), INVITE_TTL_MS);
  assert.deepEqual(events(), ["bob:invite", "ann:invite"]);
  // Asking again returns the same invite without another push.
  assert.equal((await service.send("ann", room.id, "bob")).invite.id, invite.id);
  assert.equal(sent.length, 2);
  assert.deepEqual(service.list("bob").incoming.map((item) => item.id), [invite.id]);
  assert.deepEqual(service.list("ann").outgoing.map((item) => item.id), [invite.id]);
  assert.deepEqual(service.list("cid"), { incoming: [], outgoing: [] });

  // Who may invite whom.
  await rejects(service.send("ann", room.id, "ann"), "INVITE_SELF");
  await rejects(service.send("bob", room.id, "cid"), "LOBBY_NOT_INVITABLE");
  await rejects(service.send("ann", other.id, "cid"), "LOBBY_NOT_INVITABLE");
  await rejects(service.send("ann", "missing", "cid"), "LOBBY_NOT_INVITABLE");
  await rejects(service.send("ann", room.id, "nobody"), "USER_NOT_FOUND");
  policies.cid = "NOBODY";
  await rejects(service.send("ann", room.id, "cid"), "INVITE_NOT_ALLOWED");
  policies.cid = "FRIENDS";
  await rejects(service.send("ann", room.id, "cid"), "INVITE_NOT_ALLOWED");
  friends.add("ann+cid");
  assert.equal((await service.send("ann", room.id, "cid")).invite.to.id, "cid");
  blocked.add("dee>ann");
  await rejects(service.send("ann", room.id, "dee"), "INVITE_NOT_ALLOWED");

  // Declining is for the two players only; both hear it is gone.
  sent.length = 0;
  assert.throws(() => service.remove("dee", invite.id), { code: "INVITE_NOT_FOUND" });
  service.remove("bob", invite.id);
  assert.deepEqual(events(), ["bob:inviteGone", "ann:inviteGone"]);
  assert.throws(() => service.remove("bob", invite.id), { code: "INVITE_NOT_FOUND" });

  // Ten new invites a minute; the window slides.
  for (let i = 0; i < 8; i++) await service.send("ann", room.id, `p${i}`);
  await rejects(service.send("ann", room.id, "p8"), "RATE_LIMITED");
  // Repeating a live invite does not count against the limit.
  await service.send("ann", room.id, "p0");
  now += 61_000;
  await service.send("ann", room.id, "p8");

  // Invites expire after two minutes.
  sent.length = 0;
  now += INVITE_TTL_MS - 61_000 + 1;
  assert.equal(service.sweep(), 9);
  assert.deepEqual(service.list("ann").outgoing.map((item) => item.to.id), ["p8"]);

  // They also go when the seat is taken, and when the inviter leaves.
  sent.length = 0;
  room.seatIdentities.P2 = { userId: "p9", username: "P9", displayName: null };
  assert.equal(service.sweep(), 1);
  assert.deepEqual(events(), ["p8:inviteGone", "ann:inviteGone"]);
  await rejects(service.send("ann", room.id, "bob"), "LOBBY_NOT_INVITABLE");
  room.seatIdentities.P2 = null;
  await service.send("ann", room.id, "bob");
  room.seatIdentities.P1 = null;
  room.seats.P1 = null;
  assert.equal(service.sweep(), 1);
  assert.deepEqual(service.list("bob").incoming, []);
  console.log("invites: rules, policy, blocks, rate limit, expiry and closing lobbies passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
