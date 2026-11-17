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
    JWT_ACCESS_SECRET: "messages-integration-access-01234567890123456789",
    JWT_REFRESH_SECRET: "messages-integration-refresh-01234567890123456789",
  });
  const [{ PrismaClient }, { buildServer }] = await Promise.all([
    import("@prisma/client"),
    import("../index"),
  ]);
  const database = new PrismaClient();
  const server = await buildServer();
  const suffix = randomUUID().slice(0, 6);
  const emails = ["ann", "bob", "cid"].map((name) => `dm-${name}-${suffix}@example.test`);
  try {
    const players: { id: string; username: string; token: string }[] = [];
    for (const [index, name] of ["Ann", "Bob", "Cid"].entries()) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: emails[index], username: `Dm${name}_${suffix}`, password: "messages test password" },
      });
      assert.equal(response.statusCode, 201, response.body);
      const body = response.json();
      players.push({ id: body.user.id, username: body.user.username, token: body.accessToken });
    }
    const [ann, bob, cid] = players;
    const call = (who: (typeof players)[number], method: string, url: string, payload?: object) =>
      server.inject({
        method: method as "GET",
        url,
        headers: { authorization: `Bearer ${who.token}` },
        ...(payload ? { payload } : {}),
      });

    // Private to the signed-in player.
    assert.equal((await server.inject({ url: "/api/messages" })).statusCode, 401);
    assert.equal((await server.inject({ method: "POST", url: `/api/messages/${bob.id}`, payload: { text: "hi" } })).statusCode, 401);

    // Strangers cannot write.
    const stranger = await call(ann, "POST", `/api/messages/${bob.id}`, { text: "hello" });
    assert.equal(stranger.statusCode, 403, stranger.body);
    assert.equal(stranger.json().error.code, "MESSAGE_NOT_ALLOWED");

    // Ann and Bob become friends.
    await call(ann, "POST", "/api/friends/requests", { username: bob.username });
    const requestId = (await call(bob, "GET", "/api/friends/requests")).json().incoming[0].id;
    assert.equal((await call(bob, "POST", `/api/friends/requests/${requestId}/accept`)).statusCode, 200);

    const sent = await call(ann, "POST", `/api/messages/${bob.id}`, { text: "  Привет,\n Боб!  ", userId: cid.id });
    assert.equal(sent.statusCode, 400, "a forged sender is refused by the strict body");
    const ok = await call(ann, "POST", `/api/messages/${bob.id}`, { text: "  Привет,\n Боб!  " });
    assert.equal(ok.statusCode, 201, ok.body);
    assertDocumentedResponse("DirectMessage", ok.json());
    assert.equal(ok.json().text, "Привет, Боб!");
    assert.equal(ok.json().from, ann.id);
    assert.equal((await call(ann, "POST", `/api/messages/${bob.id}`, { text: "x".repeat(1001) })).json().error.code, "MESSAGE_TOO_LONG");
    assert.equal((await call(ann, "POST", `/api/messages/${ann.id}`, { text: "me" })).json().error.code, "MESSAGE_SELF");

    // Bob sees an unread conversation; Cid sees nothing and cannot read it.
    assertDocumentedResponse("DirectMessageUnread", (await call(bob, "GET", "/api/messages/unread")).json());
    assert.deepEqual((await call(bob, "GET", "/api/messages/unread")).json(), { unread: 1 });
    const bobList = (await call(bob, "GET", "/api/messages")).json();
    assertDocumentedResponse("Conversations", bobList);
    assert.equal(bobList.unread, 1);
    assert.equal(bobList.conversations[0].player.id, ann.id);
    assert.equal(bobList.conversations[0].canSend, true);
    assert.deepEqual((await call(cid, "GET", "/api/messages")).json(), { conversations: [], unread: 0 });
    assert.deepEqual((await call(cid, "GET", `/api/messages/${ann.id}`)).json().messages, []);

    const history = (await call(bob, "GET", `/api/messages/${ann.id}`)).json();
    assertDocumentedResponse("DirectMessages", history);
    assert.deepEqual(history.messages.map((m: { text: string }) => m.text), ["Привет, Боб!"]);
    assert.equal(history.player.username, ann.username);

    // Reading clears the badge and the sender sees the read time.
    assert.deepEqual((await call(bob, "POST", `/api/messages/${ann.id}/read`)).json(), { unread: 0 });
    assert((await call(ann, "GET", `/api/messages/${bob.id}`)).json().messages[0].readAt);

    // A block hides everything both ways and stops new messages.
    assert.equal((await call(bob, "PUT", `/api/friends/blocks/${ann.id}`)).statusCode, 204);
    for (const [viewer, other] of [[ann, bob], [bob, ann]]) {
      assert.deepEqual((await call(viewer, "GET", `/api/messages/${other.id}`)).json().messages, []);
      assert.deepEqual((await call(viewer, "GET", "/api/messages")).json().conversations, []);
    }
    assert.equal((await call(ann, "POST", `/api/messages/${bob.id}`, { text: "are you there" })).json().error.code, "MESSAGE_NOT_ALLOWED");
    assert.equal((await call(bob, "POST", `/api/messages/${ann.id}`, { text: "bye" })).json().error.code, "MESSAGE_NOT_ALLOWED");

    // Unblocking shows the history again; without the friendship it is read-only.
    assert.equal((await call(bob, "DELETE", `/api/friends/blocks/${ann.id}`)).statusCode, 204);
    const after = (await call(ann, "GET", `/api/messages/${bob.id}`)).json();
    assert.equal(after.messages.length, 1);
    assert.equal(after.canSend, false);

    // Retention: rows older than the window are deleted.
    await database.directMessage.updateMany({
      where: { senderId: ann.id },
      data: { createdAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1000) },
    });
    const { DirectMessageRepository } = await import("../repositories/directMessageRepository");
    assert.equal(await new DirectMessageRepository(database).deleteOlderThan(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)), 1);
    console.log("Direct messages PostgreSQL integration passed: friends only, blocks both ways, unread, read receipts, history, retention");
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
