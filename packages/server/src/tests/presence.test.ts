import assert from "node:assert/strict";
import WebSocket from "ws";
import { AccountConnections } from "../auth/accountConnections";
import { PresenceService, type PresenceSubject } from "../presence/presenceService";
import { createGameRoom, storeTestHooks, type GameRoom } from "../store";
import { PresenceNotifier } from "../presence/presenceNotifier";
import { NotificationService } from "../services/notificationService";
import type { NotificationRepository } from "../repositories/notificationRepository";
import type { FriendshipRow } from "../repositories/friendRepository";
import type { UserEvent } from "../realtime/userEvents";

const socket = () => ({ readyState: WebSocket.OPEN }) as unknown as WebSocket;

async function run() {
  // Connections: presence flips on the first socket and on the last one only.
  const connections = new AccountConnections();
  const changes: string[] = [];
  connections.onPresenceChange((userId, online) =>
    changes.push(`${userId}:${online ? "on" : "off"}`),
  );
  const tab1 = socket(),
    tab2 = socket();
  connections.bind(tab1, "ann");
  connections.bind(tab2, "ann");
  connections.bind(tab1, "ann"); // rebinding the same owner changes nothing
  assert(connections.isOnline("ann"));
  connections.remove(tab1);
  assert(connections.isOnline("ann"));
  connections.bind(tab2, "bob"); // the socket switched accounts
  assert(!connections.isOnline("ann"));
  assert(connections.isOnline("bob"));
  connections.remove(tab2);
  connections.remove(tab2);
  assert(!connections.isOnline("bob"));
  assert.deepEqual(changes, ["ann:on", "bob:on", "ann:off", "bob:off"]);

  // Presence: visibility rules per audience, activity from rooms.
  storeTestHooks.reset();
  const lobby = createGameRoom({ seed: 3, lobbyName: "Night duel" });
  lobby.seatIdentities.P1 = { userId: "ann", username: "Ann", displayName: null };
  lobby.seats.P1 = "conn-ann";
  const battle: GameRoom = createGameRoom({ seed: 4 });
  battle.seatIdentities.P2 = { userId: "cid", username: "Cid", displayName: null };
  battle.state = { ...battle.state, phase: "battle" };
  const online = new Set(["ann", "bob", "cid"]);
  const service = new PresenceService(
    (id) => online.has(id),
    () => [lobby, battle],
  );
  const seen = new Date("2026-10-28T10:00:00Z");
  const subject = (
    userId: string,
    presenceVisibility: PresenceSubject["presenceVisibility"] = "EVERYONE",
  ) => ({
    userId,
    presenceVisibility,
    lastSeenAt: seen,
  });

  const ann = service.presenceFor(subject("ann"), "friend");
  assert.equal(ann.state, "lobby");
  assert.deepEqual(ann.activity, {
    roomId: lobby.id,
    lobbyName: "Night duel",
    gameMode: lobby.gameMode,
    openSeat: true,
  });
  assert.equal(service.presenceFor(subject("cid"), "friend").state, "battle");
  assert.equal(service.presenceFor(subject("cid"), "friend").activity?.openSeat, false);
  // Strangers see only "online": no lobby, no battle.
  assert.deepEqual(service.presenceFor(subject("ann"), "other"), {
    state: "online",
    lastSeenAt: null,
    activity: null,
  });
  assert.equal(service.presenceFor(subject("bob"), "other").state, "online");
  // Offline players show when they were last seen.
  assert.deepEqual(service.presenceFor(subject("dee"), "other"), {
    state: "offline",
    lastSeenAt: seen.toISOString(),
    activity: null,
  });
  // FRIENDS and NOBODY hide the status from strangers; blocks hide it from everyone.
  const hidden = { state: "offline", lastSeenAt: null, activity: null };
  assert.deepEqual(service.presenceFor(subject("ann", "FRIENDS"), "other"), hidden);
  assert.equal(service.presenceFor(subject("ann", "FRIENDS"), "friend").state, "lobby");
  assert.deepEqual(service.presenceFor(subject("ann", "NOBODY"), "friend"), hidden);
  assert.equal(service.presenceFor(subject("ann", "NOBODY"), "self").state, "lobby");
  assert.deepEqual(service.presenceFor(subject("ann"), "blocked"), hidden);
  // Finished and test rooms do not count as activity.
  battle.state = { ...battle.state, phase: "ended" };
  assert.equal(service.presenceFor(subject("cid"), "friend").state, "online");
  // Live presence: friends who are online hear each real change once, nobody else does.
  battle.state = { ...battle.state, phase: "battle" };
  const sent: { to: string; event: UserEvent }[] = [];
  const channel = {
    isOnline: (id: string) => online.has(id),
    onlineUserIds: () => online.values(),
    send: (to: string, event: UserEvent) => sent.push({ to, event }),
  };
  const friendsOf: Record<string, string[]> = { ann: ["bob", "dee"], cid: ["ann"], bob: [] };
  const lookups: string[] = [];
  const notifier = new PresenceNotifier(service, channel, async (userId) => {
    lookups.push(userId);
    return {
      subject: subject(userId, userId === "bob" ? "NOBODY" : "EVERYONE"),
      friendIds: friendsOf[userId] ?? [],
    };
  });
  const presenceSent = () =>
    sent.map(({ to, event }) => (event.type === "presence" ? `${to}<${event.userId}:${event.presence.state}` : ""));
  assert.deepEqual((await notifier.sweep()).sort(), ["ann", "bob", "cid"]);
  // Dee is offline and Bob hides his status, so only these two pushes go out.
  assert.deepEqual(presenceSent().sort(), ["ann<cid:battle", "bob<ann:lobby"]);
  sent.length = 0;
  lookups.length = 0;
  assert.deepEqual(await notifier.sweep(), []);
  assert.deepEqual(lookups, []);
  lobby.state = { ...lobby.state, phase: "battle" };
  assert.deepEqual(await notifier.sweep(), ["ann"]);
  assert.deepEqual(presenceSent(), ["bob<ann:battle"]);
  sent.length = 0;
  online.delete("ann");
  assert.deepEqual(await notifier.sweep(), ["ann"]);
  const gone = sent[0].event;
  assert(gone.type === "presence" && gone.presence.state === "offline" && gone.presence.lastSeenAt);
  assert.deepEqual(await notifier.sweep(), []);

  // Notifications: stored for the right side, pushed to them, friendsChanged to both.
  sent.length = 0;
  const stored: unknown[] = [];
  const profile = (userId: string, username: string) => ({
    profile: { userId, username, displayName: null, avatarUrl: null },
  });
  const row = {
    id: "f1",
    requesterId: "bob",
    addresseeId: "cid",
    requester: profile("bob", "Bob"),
    addressee: profile("cid", "Cid"),
  } as unknown as FriendshipRow;
  const repository = {
    async create(input: { userId: string; actorId: string; kind: string; friendshipId: string }) {
      stored.push(input);
      return {
        id: `n${stored.length}`,
        ...input,
        createdAt: seen,
        readAt: null,
        actor: input.actorId === "bob" ? row.requester : row.addressee,
        friendship: { id: "f1", status: input.kind === "FRIEND_REQUEST" ? "PENDING" : "ACCEPTED" },
      };
    },
    countUnread: async () => 1,
  } as unknown as NotificationRepository;
  const notifications = new NotificationService(repository, channel);
  await notifications.friendEvent({ type: "requested", row });
  await notifications.friendEvent({ type: "accepted", row });
  await notifications.friendEvent({ type: "ended", userIds: ["bob", "cid"] });
  assert.deepEqual(stored, [
    { userId: "cid", actorId: "bob", kind: "FRIEND_REQUEST", friendshipId: "f1" },
    { userId: "bob", actorId: "cid", kind: "FRIEND_ACCEPTED", friendshipId: "f1" },
  ]);
  assert.deepEqual(
    sent.map(({ to, event }) =>
      event.type === "notification"
        ? `${to}:${event.notification.kind}:${event.notification.requestId}`
        : `${to}:${event.type}`,
    ),
    [
      "cid:friendRequest:f1",
      "bob:friendsChanged",
      "cid:friendsChanged",
      "bob:friendAccepted:null",
      "bob:friendsChanged",
      "cid:friendsChanged",
      "bob:friendsChanged",
      "cid:friendsChanged",
    ],
  );
  // A failing store never fails the friend action.
  const failing = new NotificationService(
    { create: async () => Promise.reject(new Error("db down")) } as unknown as NotificationRepository,
    channel,
  );
  await failing.friendEvent({ type: "requested", row });

  console.log(
    "presence: connection counting, visibility rules, activity, live pushes and notifications passed",
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
