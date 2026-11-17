import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { setLanguage } from "../i18n";
import { useGameStore } from "../store";
import type { ChatAccess, ChatMessage } from "../ws";
import { RoomChatPanel } from "./RoomChatPanel";
import { authStore } from "../auth/authStore";
import { userEvents } from "../notifications/userEvents";
import { roomChat, totalUnread, useRoomChat, visibleChatMessages } from "./chatStore";

const player: ChatAccess = { read: ["match"], write: ["match"] };
const spectator: ChatAccess = { read: ["match", "spectators"], write: ["spectators"] };
const guest: ChatAccess = { read: ["match", "spectators"], write: [] };

function message(id: string, patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    channel: "match",
    sentAt: "2026-11-17T21:04:00.000Z",
    sender: { username: "ragnar", name: "Ragnar", seat: "P2" },
    own: false,
    text: `text ${id}`,
    ...patch,
  };
}

const originalGame = useGameStore.getState();
test.beforeEach(() => {
  setLanguage("en", null);
  roomChat.reset(null);
});
test.afterEach(() => {
  useGameStore.setState(originalGame, true);
  roomChat.reset(null);
});

function textOf(renderer: ReactTestRenderer) {
  return renderer.root.findAll((node) => typeof node.type === "string")
    .flatMap((node) => node.children.filter((child): child is string => typeof child === "string"))
    .join(" ");
}

async function mount(role: "P1" | "spectator", opponentSeated = true) {
  useGameStore.setState({
    joined: true,
    roomId: "room",
    role,
    seat: role === "P1" ? "P1" : null,
    roomMeta: { ...originalGame.roomMeta!, players: { P1: true, P2: opponentSeated } },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter>
        <RoomChatPanel />
      </MemoryRouter>,
    );
  });
  return renderer;
}

test("history replaces the old room's chat and keeps live messages that came first", () => {
  roomChat.reset("room");
  roomChat.message("room", message("live"));
  roomChat.history("room", player, [message("old"), message("live")]);
  assert.deepEqual(useRoomChat.getState().messages.map((m) => m.id), ["old", "live"]);
  roomChat.message("other-room", message("stray"));
  assert.equal(useRoomChat.getState().messages.length, 2, "another room's message is dropped");
  roomChat.reset("next-room");
  assert.deepEqual(useRoomChat.getState().messages, []);
});

test("unread counts only others' messages in channels nobody is looking at", () => {
  roomChat.reset("room");
  roomChat.history("room", spectator, []);
  roomChat.message("room", message("1"));
  roomChat.message("room", message("2", { own: true }));
  roomChat.message("room", message("3", { channel: "spectators", sender: { username: "v", name: "V", seat: null } }));
  assert.deepEqual(useRoomChat.getState().unread, { match: 1, spectators: 1 });
  assert.equal(totalUnread(useRoomChat.getState()), 2);
  roomChat.setViewing("match", true);
  roomChat.message("room", message("4"));
  assert.deepEqual(useRoomChat.getState().unread, { match: 0, spectators: 1 });
});

test("hiding the opponent hides their messages for this match only", () => {
  roomChat.reset("room");
  roomChat.history("room", player, [message("1"), message("2", { own: true, sender: { username: "a", name: "A", seat: "P1" } })]);
  roomChat.setSeatHidden("P2", true);
  assert.deepEqual(visibleChatMessages(useRoomChat.getState(), "match").map((m) => m.id), ["2"]);
  roomChat.message("room", message("3"));
  assert.equal(useRoomChat.getState().unread.match, 0, "hidden messages do not count as unread");
  roomChat.reset("next-room");
  assert.equal(useRoomChat.getState().hiddenSeats.P2, false);
});

test("a player writes to the battle channel and reads quick phrases in their own language", async () => {
  roomChat.reset("room");
  roomChat.history("room", player, [
    message("1", { text: "hello <b>there</b> https://x.test" }),
    message("2", { text: undefined, phrase: "goodGame" }),
  ]);
  const renderer = await mount("P1");
  const text = textOf(renderer);
  assert.match(text, /hello <b>there<\/b> https:\/\/x\.test/, "markup and links stay plain text");
  assert.match(text, /Good game/);
  assert.equal(renderer.root.findAll((node) => node.type === "a").length, 0, "nothing in a message is a link");
  assert.equal(renderer.root.findAllByProps({ role: "tab" }).length, 0, "players have one channel");
  assert(renderer.root.findByProps({ "data-testid": "room-chat-input" }));
  assert.match(text, /Hide opponent/);

  await act(async () => setLanguage("uk", null));
  assert.match(textOf(renderer), /Гарна гра/);
  renderer.unmount();
});

test("a signed-in spectator reads both channels and writes only their own", async () => {
  roomChat.reset("room");
  roomChat.history("room", spectator, [message("1")]);
  const renderer = await mount("spectator");
  const tabs = renderer.root.findAllByProps({ role: "tab" });
  assert.equal(tabs.length, 2);
  assert.equal(tabs[1].props["aria-selected"], true, "spectators start in their own channel");
  assert(renderer.root.findByProps({ "data-testid": "room-chat-input" }));
  await act(async () => tabs[0].props.onClick());
  assert.equal(renderer.root.findAllByProps({ "data-testid": "room-chat-input" }).length, 0);
  assert.match(textOf(renderer), /Only the players write in this channel/);
  renderer.unmount();
});

test("a guest reads and is asked to sign in to write", async () => {
  roomChat.reset("room");
  roomChat.history("room", guest, []);
  const renderer = await mount("spectator");
  assert.equal(renderer.root.findAllByProps({ "data-testid": "room-chat-input" }).length, 0);
  assert.match(textOf(renderer), /to write in the chat/);
  assert.equal(renderer.root.findAll((node) => node.type === "a").length, 1);
  renderer.unmount();
});

test("there is no opponent to hide until someone takes the other seat", async () => {
  roomChat.reset("room");
  roomChat.history("room", player, []);
  const renderer = await mount("P1", false);
  assert.doesNotMatch(textOf(renderer), /Hide opponent/);
  renderer.unmount();
});

test("a refused message explains why and the rate limit counts down", async () => {
  roomChat.reset("room");
  roomChat.history("room", player, []);
  roomChat.rejected("CHAT_RATE_LIMITED", 6000);
  const renderer = await mount("P1");
  assert.match(textOf(renderer), /wait 6 s/);
  assert.equal(renderer.root.findByProps({ "data-testid": "room-chat-send" }).props.disabled, true);
  await act(async () => roomChat.rejected("CHAT_DUPLICATE"));
  assert.match(textOf(renderer), /You just sent that/);
  renderer.unmount();
});

test("a room without chat shows nothing", async () => {
  roomChat.reset("room");
  roomChat.history("room", { read: [], write: [] }, []);
  const renderer = await mount("P1");
  assert.equal(renderer.toJSON(), null);
  renderer.unmount();
});

test("a restricted player reads on, sees until when, and can write again once it is lifted", async () => {
  roomChat.reset("room");
  const until = new Date(Date.now() + 3_600_000).toISOString();
  roomChat.history("room", { ...player, mutedUntil: until }, [message("1")]);
  const renderer = await mount("P1");
  assert.match(textOf(renderer), /A moderator has restricted your chat until/);
  assert.equal(renderer.root.findAll((node) => node.props["data-testid"] === "room-chat-input").length, 0);
  assert.match(textOf(renderer), /text 1/, "reading goes on");
  await act(async () => userEvents.emit({ type: "chatMuted", until: null }));
  assert.equal(renderer.root.findAll((node) => node.props["data-testid"] === "room-chat-input" && node.type === "input").length, 1);
  // A refused send carries the end of a restriction set while the panel was open.
  await act(async () => roomChat.rejected("CHAT_MUTED", undefined, until));
  assert.equal(useRoomChat.getState().access.mutedUntil, until);
  assert.equal(useRoomChat.getState().rejection, null, "the notice replaces the box, not an error line");
});

test("a report waits for the server's answer and never shows as a send error", async () => {
  roomChat.reset("room");
  roomChat.history("room", spectator, [message("m1")]);
  const sent: unknown[] = [];
  const stored = roomChat.report((item) => (sent.push(item), true), "m1", "ABUSE", "  rude ");
  assert.deepEqual(sent, [{ type: "chatReport", messageId: "m1", reason: "ABUSE", comment: "rude" }]);
  roomChat.reported("m1");
  assert.equal(await stored, null);
  const limited = roomChat.report(() => true, "m1", "SPAM", "");
  roomChat.rejected("CHAT_REPORT_LIMIT");
  assert.equal(await limited, "CHAT_REPORT_LIMIT");
  assert.equal(useRoomChat.getState().rejection, null);
  assert.equal(await roomChat.report(() => false, "m1", "SPAM", ""), "CHAT_UNAVAILABLE", "no socket, no report");
});

test("signed-in readers can report other players' messages, not their own", async () => {
  const originalAuth = authStore.getState();
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
  try {
    roomChat.reset("room");
    roomChat.history("room", player, [message("1"), message("2", { own: true }), message("3", { phrase: "goodLuck", text: undefined })]);
    const renderer = await mount("P1");
    const menus = renderer.root.findAll((node) => node.type === "button" && node.props.className?.includes("more-menu__button"));
    assert.equal(menus.length, 2, "one menu per message from someone else");
  } finally {
    authStore.setState(originalAuth, true);
  }
});

test("after blocking an author the chat says who, until the reader dismisses it", async () => {
  roomChat.reset("room");
  roomChat.history("room", spectator, [message("1")]);
  roomChat.blocked("1");
  assert.equal(useRoomChat.getState().blockedName, "Ragnar");
  // The fresh history that follows no longer holds his messages; the notice stays.
  roomChat.history("room", spectator, []);
  const renderer = await mount("spectator");
  assert.match(textOf(renderer), /Ragnar is blocked/);
  const ok = renderer.root.findAll((node) => node.type === "button" && node.children.join("") === "OK")[0];
  await act(async () => ok.props.onClick());
  assert.equal(useRoomChat.getState().blockedName, null);
});
