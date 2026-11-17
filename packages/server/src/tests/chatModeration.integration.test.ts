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
    JWT_ACCESS_SECRET: "moderation-integration-access-01234567890123456789",
    JWT_REFRESH_SECRET: "moderation-integration-refresh-01234567890123456789",
  });
  const [{ PrismaClient }, { buildServer }] = await Promise.all([import("@prisma/client"), import("../index")]);
  const database = new PrismaClient();
  const server = await buildServer();
  const suffix = randomUUID().slice(0, 6);
  const names = ["Ann", "Bob", "Mod", "Adm"];
  const emails = names.map((name) => `cm-${name.toLowerCase()}-${suffix}@example.test`);
  const password = "moderation test password";
  try {
    const ids: string[] = [];
    for (const [index, name] of names.entries()) {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: emails[index], username: `Cm${name}_${suffix}`, password },
      });
      assert.equal(response.statusCode, 201, response.body);
      ids.push(response.json().user.id);
    }
    await database.user.update({ where: { id: ids[2] }, data: { role: "MODERATOR" } });
    await database.user.update({ where: { id: ids[3] }, data: { role: "ADMIN" } });
    const login = async (index: number) => {
      const response = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: emails[index], password },
      });
      assert.equal(response.statusCode, 200, response.body);
      return { id: ids[index], token: response.json().accessToken as string, username: `Cm${names[index]}_${suffix}` };
    };
    const [ann, bob, mod, adm] = await Promise.all([0, 1, 2, 3].map(login));
    const call = (who: { token: string }, method: string, url: string, payload?: object) =>
      server.inject({
        method: method as "GET",
        url,
        headers: { authorization: `Bearer ${who.token}` },
        ...(payload ? { payload } : {}),
      });

    // Ann and Bob are friends and talk.
    await call(ann, "POST", "/api/friends/requests", { username: bob.username });
    const requestId = (await call(bob, "GET", "/api/friends/requests")).json().incoming[0].id;
    await call(bob, "POST", `/api/friends/requests/${requestId}/accept`);
    for (const text of ["hi", "how are you"]) await call(ann, "POST", `/api/messages/${bob.id}`, { text });
    const rude = (await call(bob, "POST", `/api/messages/${ann.id}`, { text: "you are terrible" })).json();
    const mine = (await call(ann, "POST", `/api/messages/${bob.id}`, { text: "rude" })).json();

    // Only the recipient reports, only the other player's messages.
    const report = (who: { token: string }, partner: string, messageId: string, extra: object = {}) =>
      call(who, "POST", `/api/messages/${partner}/report`, { messageId, reason: "ABUSE", ...extra });
    assert.equal((await report(ann, bob.id, mine.id)).json().error.code, "CHAT_REPORT_INVALID", "not your own message");
    assert.equal((await report(mod, bob.id, rude.id)).json().error.code, "CHAT_REPORT_INVALID", "not someone else's conversation");
    const filed = await report(ann, bob.id, rude.id, { comment: "  again\n" });
    assert.equal(filed.statusCode, 204, filed.body);
    assert.equal((await report(ann, bob.id, rude.id)).statusCode, 204, "a repeat is accepted");
    assert.equal(await database.chatReport.count({ where: { reporterId: ann.id } }), 1, "and stored once");

    // A regular player has no access to the queue.
    assert.equal((await call(ann, "GET", "/api/admin/chat-reports")).statusCode, 403);

    const queue = await call(mod, "GET", "/api/admin/chat-reports");
    assert.equal(queue.statusCode, 200, queue.body);
    assertDocumentedResponse("AdminChatReports", queue.json());
    const row = queue.json().items.find((item: { reported: { id: string } }) => item.reported.id === bob.id);
    assert(row, "the report is in the open queue");
    assert.equal(row.body, "you are terrible");
    assert.equal(row.comment, "again");
    assert.equal(row.source, "DIRECT");
    assert((await call(mod, "GET", "/api/admin/summary")).json().chatReports.open >= 1);

    const detail = await call(mod, "GET", `/api/admin/chat-reports/${row.id}`);
    assertDocumentedResponse("AdminChatReport", detail.json());
    const context = detail.json().report.context as Array<{ text: string; reported: boolean }>;
    assert.deepEqual(context.map((line) => line.text), ["hi", "how are you", "you are terrible"], "only messages up to the reported one");
    assert.deepEqual(context.map((line) => line.reported), [false, false, true]);
    assert.equal(
      await database.auditLog.count({ where: { eventType: "CHAT_REPORT_VIEWED", actorUserId: mod.id, targetUserId: bob.id } }),
      1,
      "opening private messages is audited",
    );
    await call(mod, "GET", `/api/admin/chat-reports/${row.id}`);
    assert.equal(
      await database.auditLog.count({ where: { eventType: "CHAT_REPORT_VIEWED", actorUserId: mod.id, targetUserId: bob.id } }),
      1,
      "reopening within five minutes is not logged again",
    );

    // A moderator cannot restrict an admin; restricting Bob closes the report and stops his messages.
    assert.equal((await call(mod, "POST", `/api/admin/users/${adm.id}/chat-mute`, { hours: 1 })).json().error.code, "INSUFFICIENT_TARGET_ROLE");
    assert.equal((await call(mod, "POST", `/api/admin/users/${mod.id}/chat-mute`, { hours: 1 })).json().error.code, "CANNOT_BLOCK_SELF");
    assert.equal((await call(mod, "POST", `/api/admin/chat-reports/${row.id}/resolve`, { action: "MUTE", hours: 2 })).statusCode, 400, "only the offered durations");
    const resolved = await call(mod, "POST", `/api/admin/chat-reports/${row.id}/resolve`, { action: "MUTE", hours: 24, reason: "insults" });
    assert.equal(resolved.statusCode, 200, resolved.body);
    assertDocumentedResponse("AdminChatReportResolution", resolved.json());
    assert.equal(resolved.json().status, "MUTED");
    assert.equal((await call(mod, "POST", `/api/admin/chat-reports/${row.id}/resolve`, { action: "DISMISS" })).json().error.code, "CHAT_REPORT_CLOSED");
    const blockedSend = await call(bob, "POST", `/api/messages/${ann.id}`, { text: "sorry" });
    assert.equal(blockedSend.statusCode, 403);
    assert.equal(blockedSend.json().error.code, "CHAT_MUTED");
    assert(blockedSend.json().error.details.until);
    assert((await call(bob, "GET", `/api/messages/${ann.id}`)).json().mutedUntil, "the thread says until when");
    const user = (await call(mod, "GET", `/api/admin/users/${bob.id}`)).json().user;
    assert(user.chatMutedUntil);
    assert.equal(user.chatMuteReason, "insults");
    for (const eventType of ["CHAT_REPORT_RESOLVED", "CHAT_MUTED"] as const)
      assert.equal(await database.auditLog.count({ where: { eventType, targetUserId: bob.id } }), 1, eventType);

    // Lifting it lets him write again.
    const lifted = await call(mod, "POST", `/api/admin/users/${bob.id}/chat-unmute`);
    assertDocumentedResponse("AdminChatMute", lifted.json());
    assert.equal((await call(bob, "POST", `/api/messages/${ann.id}`, { text: "sorry" })).statusCode, 201);
    assert.equal(await database.auditLog.count({ where: { eventType: "CHAT_UNMUTED", targetUserId: bob.id } }), 1);

    // "Nobody" keeps the history readable and stops new messages to Ann.
    const patched = await call(ann, "PATCH", "/api/profile", { directMessages: "NOBODY" });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.json().profile.directMessages, "NOBODY");
    assert.equal((await call(bob, "POST", `/api/messages/${ann.id}`, { text: "hello?" })).json().error.code, "MESSAGE_NOT_ALLOWED");
    const bobView = (await call(bob, "GET", `/api/messages/${ann.id}`)).json();
    assert.equal(bobView.canSend, false);
    assert(bobView.messages.length >= 4);
    assert.equal((await call(bob, "GET", "/api/messages")).json().conversations[0].canSend, false);
    console.log("Chat moderation PostgreSQL integration passed: reports, queue, audited views, mutes, unmute, NOBODY policy");
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
