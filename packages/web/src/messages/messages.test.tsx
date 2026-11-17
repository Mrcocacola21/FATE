import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";
import { ApiError } from "../api/client";
import { parseUserEvent } from "../api/notificationApi";
import { parseDirectMessage, type Conversation, type DirectMessage } from "../api/messageApi";
import { friendApi } from "../friends/friendStore";
import { FriendsPage } from "../friends/FriendsPage";
import { useGameStore } from "../store";
import { userEvents } from "../notifications/userEvents";
import { MessageDock } from "./MessageDock";
import { MessageThread } from "./MessageThread";
import { messageApi, messageStore, watchThread } from "./messageStore";

const ann = { id: "ann", username: "Ann", displayName: "Ann the Bold", avatarUrl: null };
const at = (minute: number) => new Date(Date.UTC(2026, 10, 17, 12, minute)).toISOString();
const message = (id: string, from: string, to: string, text: string, minute: number, readAt: string | null = null): DirectMessage => ({
  id, from, to, text, sentAt: at(minute), readAt,
});
const fromAnn = message("m1", "ann", "me", "hello there", 1);
const conversation: Conversation = { player: ann, lastMessage: fromAnn, unread: 1, canSend: true };

const originalAuth = authStore.getState();
const originalApi = { ...messageApi };
const originalFriends = { ...friendApi };
const originalGame = useGameStore.getState();
const calls: string[] = [];

test.beforeEach(() => {
  setLanguage("en", null);
  calls.length = 0;
  Object.assign(messageApi, {
    unread: async () => 1,
    conversations: async () => ({ conversations: [conversation], unread: 1 }),
    history: async () => ({ player: ann, messages: [fromAnn], hasMore: false, canSend: true, mutedUntil: null }),
    markRead: async (id: string) => {
      calls.push(`read:${id}`);
      return 0;
    },
    send: async (id: string, text: string) => {
      calls.push(`send:${id}:${text}`);
      return message("m2", "me", id, text, 2);
    },
  });
  authStore.setState(
    {
      ...originalAuth,
      initialized: true,
      status: "authenticated",
      user: {
        id: "me",
        role: "USER",
        email: "me@example.test",
        username: "me",
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-10-01T10:00:00Z",
      },
    },
    true,
  );
  messageStore.getState().reset();
});
test.afterEach(() => {
  Object.assign(messageApi, originalApi);
  Object.assign(friendApi, originalFriends);
  useGameStore.setState(originalGame, true);
  authStore.setState(originalAuth, true);
  messageStore.getState().reset();
});

async function mount(element: React.ReactNode, path = "/") {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const byTestId = (renderer: ReactTestRenderer, id: string) => renderer.root.findAll((node) => node.props["data-testid"] === id && typeof node.type === "string");

test("pushed private-message events decode, and malformed ones are dropped", () => {
  assert.deepEqual(parseUserEvent({ type: "directMessage", message: fromAnn, unread: 3 }), {
    type: "directMessage",
    message: fromAnn,
    unread: 3,
  });
  assert.deepEqual(parseUserEvent({ type: "directMessage", message: fromAnn }), { type: "directMessage", message: fromAnn });
  assert.equal(parseUserEvent({ type: "directMessage", message: { ...fromAnn, id: 5 } }), null);
  assert.equal(parseUserEvent({ type: "directMessage", message: fromAnn, unread: -1 }), null);
  assert.deepEqual(
    parseUserEvent({ type: "directMessagesRead", readerId: "ann", partnerId: "me", readAt: at(5) }),
    { type: "directMessagesRead", readerId: "ann", partnerId: "me", readAt: at(5) },
  );
  assert.equal(parseUserEvent({ type: "directMessagesRead", readerId: "ann" }), null);
  assert.throws(() => parseDirectMessage({ ...fromAnn, readAt: 1 }));
});

test("an incoming message counts as unread until its conversation is on screen", async () => {
  await messageStore.getState().loadConversations();
  userEvents.emit({ type: "directMessage", message: message("m3", "ann", "me", "again", 3), unread: 2 });
  let state = messageStore.getState();
  assert.equal(state.unread, 2);
  assert.equal(state.conversations?.[0].unread, 2);
  assert.equal(state.conversations?.[0].lastMessage.text, "again");
  // The same push twice (socket echo after a refresh) is not counted twice.
  userEvents.emit({ type: "directMessage", message: message("m3", "ann", "me", "again", 3) });
  assert.equal(messageStore.getState().conversations?.[0].unread, 2);

  await messageStore.getState().openThread("ann");
  const unwatch = watchThread("ann");
  await act(async () => {
    userEvents.emit({ type: "directMessage", message: message("m4", "ann", "me", "now", 4), unread: 1 });
  });
  unwatch();
  assert(calls.includes("read:ann"), "a message arriving in an open conversation is read at once");
  state = messageStore.getState();
  assert.equal(state.unread, 0);
  assert.deepEqual(state.threads.ann.messages.map((item) => item.id), ["m1", "m4"]);
});

test("the player's own message is never counted, and the partner's read receipt marks it read", async () => {
  await messageStore.getState().loadConversations();
  await messageStore.getState().openThread("ann");
  assert.equal(await messageStore.getState().send("ann", "hi Ann"), null);
  userEvents.emit({ type: "directMessage", message: message("m2", "me", "ann", "hi Ann", 2) });
  let state = messageStore.getState();
  assert.equal(state.conversations?.[0].unread, 1, "only Ann's earlier message is unread");
  assert.deepEqual(state.threads.ann.messages.map((item) => item.id), ["m1", "m2"]);
  userEvents.emit({ type: "directMessagesRead", readerId: "ann", partnerId: "me", readAt: at(9) });
  state = messageStore.getState();
  assert.equal(state.threads.ann.messages[1].readAt, at(9));
  assert.equal(state.threads.ann.messages[0].readAt, null, "the receipt is about the player's own messages");
  // Reading in another tab clears this one's counts.
  userEvents.emit({ type: "directMessagesRead", readerId: "me", partnerId: "ann", readAt: at(10), unread: 0 });
  state = messageStore.getState();
  assert.equal(state.conversations?.[0].unread, 0);
  assert.equal(state.threads.ann.messages[0].readAt, at(10));
});

test("a block makes the held conversation disappear on the next refresh", async () => {
  await messageStore.getState().openThread("ann");
  assert.equal(messageStore.getState().threads.ann.messages.length, 1);
  messageApi.history = async () => ({ player: ann, messages: [], hasMore: false, canSend: false, mutedUntil: null });
  messageApi.conversations = async () => ({ conversations: [], unread: 0 });
  await act(async () => userEvents.emit({ type: "friendsChanged" }));
  assert.deepEqual(messageStore.getState().threads.ann.messages, []);
  assert.equal(messageStore.getState().threads.ann.canSend, false);
});

test("another sign-in starts from nothing: the last account's conversations are dropped", async () => {
  await messageStore.getState().loadConversations();
  await messageStore.getState().openThread("ann");
  authStore.setState({ ...authStore.getState(), user: { ...authStore.getState().user!, id: "other" } });
  const state = messageStore.getState();
  assert.equal(state.conversations, null);
  assert.deepEqual(state.threads, {});
  assert.equal(state.owner, "other");
});

test("the thread shows text as plain text, sends on submit and reports refusals", async () => {
  messageApi.history = async () => ({
    player: ann,
    messages: [message("m1", "ann", "me", "<b>bold</b>", 1), message("m2", "me", "ann", "mine", 2, at(3))],
    hasMore: true,
    mutedUntil: null,
    canSend: true,
  });
  const renderer = await mount(<MessageThread partnerId="ann" />);
  const shown = text(renderer);
  assert(shown.includes("<b>bold</b>"), "markup is shown as text");
  assert(shown.includes("Earlier messages"));
  assert(shown.includes('" · ","read"'), "the latest own message shows it was read");
  const input = renderer.root.findByProps({ "data-testid": "dm-input" });
  await act(async () => input.props.onChange({ target: { value: "  hi Ann  " } }));
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert(calls.includes("send:ann:hi Ann"));
  assert(text(renderer).includes("hi Ann"));
  assert.equal(renderer.root.findByProps({ "data-testid": "dm-input" }).props.value, "");

  messageApi.send = async () => {
    throw new ApiError("MESSAGE_NOT_ALLOWED", 403);
  };
  await act(async () => renderer.root.findByProps({ "data-testid": "dm-input" }).props.onChange({ target: { value: "still there?" } }));
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  const after = text(renderer);
  assert(after.includes("You can only message your friends."));
  assert(after.includes("You can no longer write here"), "the box turns read-only");
  assert.equal(renderer.root.findAllByType("form").length, 0);
});

test("the dock opens from the pill to the list and into a conversation", async () => {
  await act(async () => messageStore.getState().loadUnread());
  const renderer = await mount(<MessageDock />);
  const pill = byTestId(renderer, "dm-dock-pill")[0];
  assert(text(renderer).includes("Unread messages: 1"));
  await act(async () => pill.props.onClick());
  assert.equal(byTestId(renderer, "dm-dock-list").length, 1);
  const row = byTestId(renderer, "dm-conversation")[0];
  assert(JSON.stringify(row.children.map(String)).length > 0);
  assert(text(renderer).includes("hello there"));
  await act(async () => row.props.onClick());
  assert.equal(byTestId(renderer, "dm-thread").length, 1);
  assert(calls.includes("read:ann"), "opening the conversation reads it");
  assert.equal(messageStore.getState().unread, 0);
});

test("the dock stays away from battles, sign-in pages, guests and the Friends messages tab", async () => {
  useGameStore.setState({ joined: true, roomState: { ...(originalGame.roomState ?? {}), phase: "battle" } as never });
  assert.equal(byTestId(await mount(<MessageDock />), "dm-dock").length, 0, "battle");
  useGameStore.setState(originalGame, true);
  assert.equal(byTestId(await mount(<MessageDock />, "/login"), "dm-dock").length, 0, "sign-in page");
  assert.equal(byTestId(await mount(<MessageDock />, "/friends?tab=messages"), "dm-dock").length, 0, "messages tab");
  assert.equal(byTestId(await mount(<MessageDock />, "/leaderboard"), "dm-dock").length, 1, "an ordinary page");
  authStore.setState({ ...authStore.getState(), status: "anonymous", user: null } as never);
  assert.equal(byTestId(await mount(<MessageDock />), "dm-dock").length, 0, "guest");
});

test("the Friends page has a Messages tab that opens the conversation named in the address", async () => {
  Object.assign(friendApi, { incomingCount: async () => 0 });
  await act(async () => messageStore.getState().loadUnread());
  const renderer = await mount(<FriendsPage />, "/friends?tab=messages&with=ann");
  const tab = renderer.root.findByProps({ id: "friends-tab-messages" });
  assert.equal(tab.props["aria-selected"], true);
  assert.equal(byTestId(renderer, "dm-page").length, 1);
  assert.equal(byTestId(renderer, "dm-thread").length, 1);
  assert(text(renderer).includes("hello there"));
  assert(text(renderer).includes("Only friends can message each other."));
});

test("a restricted player sees until when instead of the box, and gets it back when lifted", async () => {
  const until = new Date(Date.now() + 3_600_000).toISOString();
  messageApi.history = async () => ({ player: ann, messages: [fromAnn], hasMore: false, canSend: true, mutedUntil: until });
  const renderer = await mount(<MessageThread partnerId="ann" />);
  assert.match(text(renderer), /A moderator has restricted your chat until/);
  assert.equal(renderer.root.findAllByType("form").length, 0);
  await act(async () => userEvents.emit({ type: "chatMuted", until: null }));
  assert.equal(renderer.root.findAllByType("form").length, 1);
  // A send refused for a new restriction shows it at once.
  messageApi.send = async () => {
    throw new ApiError("CHAT_MUTED", 403, "muted", { until });
  };
  await act(async () => renderer.root.findByProps({ "data-testid": "dm-input" }).props.onChange({ target: { value: "hi" } }));
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(messageStore.getState().mutedUntil, until);
  assert.equal(renderer.root.findAllByType("form").length, 0);
});

test("only the partner's messages can be reported, and the report goes to the server", async () => {
  const reports: unknown[] = [];
  messageApi.history = async () => ({
    player: ann,
    messages: [fromAnn, message("m2", "me", "ann", "mine", 2)],
    hasMore: false,
    canSend: true,
    mutedUntil: null,
  });
  messageApi.report = async (...args: unknown[]) => {
    reports.push(args);
  };
  const renderer = await mount(<MessageThread partnerId="ann" />);
  const bubbles = renderer.root.findAll((node) => node.props["data-testid"] === "dm-message" && node.type === "li");
  const menuIn = (node: (typeof bubbles)[number]) =>
    node.findAll((child) => child.type === "button" && child.props.className?.includes("more-menu__button"));
  assert.equal(menuIn(bubbles[0]).length, 1, "Ann's message has a menu");
  assert.equal(menuIn(bubbles[1]).length, 0, "the player's own does not");
  await act(async () => menuIn(bubbles[0])[0].props.onClick());
  const reportItem = renderer.root.findAll((node) => node.type === "button" && node.props.role === "menuitem")[0];
  await act(async () => reportItem.props.onClick());
  assert.match(text(renderer), /Report a message/);
  await act(async () => renderer.root.findByProps({ "data-testid": "report-comment" }).props.onChange({ target: { value: " again " } }));
  const form = renderer.root.findAllByType("form").find((node) => node.props.className === "report-dialog__body")!;
  await act(async () => form.props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(reports, [["ann", "m1", "ABUSE", "again"]]);
  assert.equal(renderer.root.findAll((node) => node.props["data-testid"] === "report-sent" && node.type === "div").length, 1);
});
