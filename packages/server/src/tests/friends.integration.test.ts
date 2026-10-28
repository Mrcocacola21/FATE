import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureTestDatabase } from "./testDatabase";
import { assertDocumentedResponse } from "./assertDocumentedResponse";

async function run() {
  configureTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_ACCESS_SECRET: "friends-integration-access-01234567890123456789",
    JWT_REFRESH_SECRET: "friends-integration-refresh-01234567890123456789",
  });
  const [{ PrismaClient }, { buildServer }] = await Promise.all([
    import("@prisma/client"),
    import("../index"),
  ]);
  const database = new PrismaClient();
  const server = await buildServer();
  const suffix = randomUUID().slice(0, 6);
  const emails = ["ann", "bob", "cid", "dee"].map(
    (name) => `friends-${name}-${suffix}@example.test`,
  );
  try {
    const players: { id: string; username: string; token: string }[] = [];
    for (const [index, name] of ["Ann", "Bob", "Cid", "Dee"].entries()) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: emails[index],
          username: `Fr${name}_${suffix}`,
          password: "friends test password",
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      const body = response.json();
      players.push({ id: body.user.id, username: body.user.username, token: body.accessToken });
    }
    const [ann, bob, cid, dee] = players;
    const call = (who: (typeof players)[number], method: string, url: string, payload?: object) =>
      server.inject({
        method: method as "GET",
        url,
        headers: { authorization: `Bearer ${who.token}` },
        ...(payload ? { payload } : {}),
      });
    const relation = async (who: (typeof players)[number], other: (typeof players)[number]) =>
      (await call(who, "GET", `/api/friends/relationship/${other.id}`)).json().relationship;

    // Everything is private to the signed-in player.
    assert.equal((await server.inject({ url: "/api/friends" })).statusCode, 401);
    assert.equal((await server.inject({ url: "/api/players/search?q=Fr" })).statusCode, 401);

    // Ann asks Bob; Bob sees it incoming, Ann outgoing; Bob accepts.
    const sent = await call(ann, "POST", "/api/friends/requests", { username: bob.username });
    assert.equal(sent.statusCode, 200, sent.body);
    assertDocumentedResponse("Relationship", sent.json());
    assert.equal(sent.json().relationship.status, "outgoing");
    // Repeating the request is harmless.
    assert.equal(
      (await call(ann, "POST", "/api/friends/requests", { username: bob.username })).json()
        .relationship.status,
      "outgoing",
    );
    const bobRequests = (await call(bob, "GET", "/api/friends/requests")).json();
    assertDocumentedResponse("FriendRequests", bobRequests);
    assert.equal(bobRequests.incoming.length, 1);
    assert.equal(bobRequests.incoming[0].player.username, ann.username);
    assert.deepEqual(bobRequests.outgoing, []);
    assert.deepEqual((await call(bob, "GET", "/api/friends/requests/count")).json(), {
      incoming: 1,
    });
    assert.equal((await relation(bob, ann)).status, "incoming");
    // Only the addressee can accept.
    const requestId = bobRequests.incoming[0].id;
    assert.equal(
      (await call(ann, "POST", `/api/friends/requests/${requestId}/accept`)).statusCode,
      404,
    );
    const accepted = await call(bob, "POST", `/api/friends/requests/${requestId}/accept`);
    assert.equal(accepted.statusCode, 200, accepted.body);
    assertDocumentedResponse("Friend", accepted.json());
    assert.equal(accepted.json().friend.player.id, ann.id);
    const annFriends = (await call(ann, "GET", "/api/friends")).json();
    assertDocumentedResponse("Friends", annFriends);
    assert.deepEqual(
      annFriends.friends.map((friend: { player: { id: string } }) => friend.player.id),
      [bob.id],
    );
    assert.doesNotMatch(JSON.stringify(annFriends), /@example\.test|passwordHash|role/);
    // Presence: nobody is connected here, so everyone is offline; "last seen" and visibility apply.
    assert.deepEqual(annFriends.friends[0].presence, {
      state: "offline",
      lastSeenAt: null,
      activity: null,
    });
    const seenAt = new Date("2026-10-28T10:00:00.000Z");
    await database.profile.update({ where: { userId: bob.id }, data: { lastSeenAt: seenAt } });
    const anonymous = await server.inject({ url: `/api/users/${bob.id}/presence` });
    assert.equal(anonymous.statusCode, 200, anonymous.body);
    assertDocumentedResponse("Presence", anonymous.json());
    assert.equal(anonymous.json().presence.lastSeenAt, seenAt.toISOString());
    await database.profile.update({
      where: { userId: bob.id },
      data: { presenceVisibility: "FRIENDS" },
    });
    assert.equal(
      (await server.inject({ url: `/api/users/${bob.id}/presence` })).json().presence.lastSeenAt,
      null,
    );
    const asFriend = await call(ann, "GET", `/api/users/${bob.id}/presence`);
    assert.equal(asFriend.json().presence.lastSeenAt, seenAt.toISOString());
    assert.equal(
      (await call(cid, "GET", `/api/users/${bob.id}/presence`)).json().presence.lastSeenAt,
      null,
    );
    await database.profile.update({
      where: { userId: bob.id },
      data: { presenceVisibility: "EVERYONE" },
    });
    assert.equal(
      (await server.inject({ url: `/api/users/${randomUUID()}/presence` })).statusCode,
      404,
    );
    const presencePatch = await call(dee, "PATCH", "/api/profile", {
      presenceVisibility: "NOBODY",
    });
    assert.equal(presencePatch.json().profile.presenceVisibility, "NOBODY");
    assert.equal((await relation(ann, bob)).status, "friends");
    const again = await call(ann, "POST", "/api/friends/requests", { username: bob.username });
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error.code, "ALREADY_FRIENDS");

    // Two players asking each other meet on one row and become friends.
    await call(cid, "POST", "/api/friends/requests", { username: dee.username });
    const mutual = await call(dee, "POST", "/api/friends/requests", { username: cid.username });
    assert.equal(mutual.json().relationship.status, "friends");
    assert.equal(
      await database.friendship.count({
        where: { OR: [{ requesterId: cid.id }, { requesterId: dee.id }] },
      }),
      1,
    );

    // Self, unknown players and closed requests are refused.
    assert.equal(
      (await call(ann, "POST", "/api/friends/requests", { username: ann.username })).json().error
        .code,
      "FRIEND_SELF",
    );
    assert.equal(
      (await call(ann, "POST", "/api/friends/requests", { username: `Nobody_${suffix}` }))
        .statusCode,
      404,
    );
    await database.profile.update({
      where: { userId: cid.id },
      data: { friendRequests: "NOBODY" },
    });
    const closed = await call(ann, "POST", "/api/friends/requests", { username: cid.username });
    assert.equal(closed.statusCode, 403);
    assert.equal(closed.json().error.code, "FRIEND_REQUEST_NOT_ALLOWED");
    assert.equal((await relation(ann, cid)).canRequest, false);
    await database.profile.update({
      where: { userId: cid.id },
      data: { friendRequests: "EVERYONE" },
    });

    // Cancel and decline.
    await call(ann, "POST", "/api/friends/requests", { username: cid.username });
    const pending = (await call(ann, "GET", "/api/friends/requests")).json().outgoing[0];
    assert.equal(
      (await call(dee, "DELETE", `/api/friends/requests/${pending.id}`)).statusCode,
      404,
    );
    assert.equal(
      (await call(ann, "DELETE", `/api/friends/requests/${pending.id}`)).statusCode,
      204,
    );
    assert.equal((await relation(cid, ann)).status, "none");

    // Search: prefix, case-insensitive, never the searcher, with relationship labels.
    const search = await call(ann, "GET", `/api/players/search?q=fr`);
    assertDocumentedResponse("PlayerSearch", search.json());
    const found = search
      .json()
      .players.filter((row: { player: { username: string } }) =>
        row.player.username.endsWith(suffix),
      );
    assert.deepEqual(
      found.map((row: { player: { username: string }; relationship: { status: string } }) => [
        row.player.username,
        row.relationship.status,
      ]),
      [
        [bob.username, "friends"],
        [cid.username, "none"],
        [dee.username, "none"],
      ],
    );
    assert.equal((await call(ann, "GET", "/api/players/search?q=a")).statusCode, 400);
    assert.equal((await call(ann, "GET", "/api/players/search?q=%25%25")).statusCode, 400);

    // Blocking ends the friendship, hides both from each other's search and stops requests.
    assert.equal((await call(bob, "PUT", `/api/friends/blocks/${ann.id}`)).statusCode, 204);
    assert.deepEqual((await call(ann, "GET", "/api/friends")).json().friends, []);
    const blocked = (await call(bob, "GET", "/api/friends/blocks")).json();
    assertDocumentedResponse("BlockedPlayers", blocked);
    assert.equal(blocked.blocked[0].player.id, ann.id);
    assert.equal((await relation(bob, ann)).blocked, true);
    const blockedRequest = await call(ann, "POST", "/api/friends/requests", {
      username: bob.username,
    });
    assert.equal(blockedRequest.json().error.code, "FRIEND_REQUEST_NOT_ALLOWED");
    const hidden = (
      await call(ann, "GET", `/api/players/search?q=${encodeURIComponent(bob.username)}`)
    ).json();
    assert.deepEqual(hidden.players, []);
    assert.equal((await call(bob, "DELETE", `/api/friends/blocks/${ann.id}`)).statusCode, 204);
    assert.equal((await relation(bob, ann)).status, "none");

    // Removing a friend.
    assert.equal((await call(cid, "DELETE", `/api/friends/${dee.id}`)).statusCode, 204);
    assert.equal(
      (await call(cid, "DELETE", `/api/friends/${dee.id}`)).json().error.code,
      "FRIEND_NOT_FOUND",
    );

    // The request policy is a profile preference.
    const policy = await call(dee, "PATCH", "/api/profile", { friendRequests: "NOBODY" });
    assert.equal(policy.statusCode, 200, policy.body);
    assert.equal(policy.json().profile.friendRequests, "NOBODY");
    console.log(
      "Friends PostgreSQL integration passed: requests, mutual requests, accept/decline/cancel, search, blocks, removal, policy and privacy",
    );
  } finally {
    await database.user.deleteMany({ where: { email: { in: emails } } });
    await server.close();
    await database.$disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
