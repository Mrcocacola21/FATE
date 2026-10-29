import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { authStore } from "../auth/authStore";
import { ApiError } from "../api/client";
import { parseInvite, type LobbyInvite } from "../api/inviteApi";
import { parseUserEvent } from "../api/notificationApi";
import { setLanguage } from "../i18n";
import { NotificationBell } from "../notifications/NotificationBell";
import { NotificationSync } from "../notifications/NotificationSync";
import { notificationApi } from "../notifications/notificationStore";
import { userEvents } from "../notifications/userEvents";
import { useGameStore } from "../store";
import { InviteButton } from "./InviteButton";
import { inviteApi, inviteStore } from "./inviteStore";

const me = { id: "me", username: "Me", displayName: null, avatarUrl: null };
const ann = { id: "a1", username: "Ann", displayName: "Ann the Bold", avatarUrl: null };
const incoming: LobbyInvite = {
  id: "i1",
  from: ann,
  to: me,
  roomId: "room-1",
  seat: "P2",
  lobbyName: "Night duel",
  gameMode: "standard",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

const originalAuth = authStore.getState();
const originalGame = useGameStore.getState();
const originalInvites = { ...inviteApi };
const originalNotifications = { ...notificationApi };
test.beforeEach(() => {
  setLanguage("en", null);
  authStore.setState(
    {
      ...originalAuth,
      initialized: true,
      status: "authenticated",
      user: {
        id: "me",
        role: "USER",
        email: "me@example.test",
        username: "Me",
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-10-01T10:00:00Z",
      },
    },
    true,
  );
  inviteStore.setState({ owner: "me", incoming: [], outgoing: [], toasts: [] });
  inviteApi.list = async () => ({ incoming: [], outgoing: [] });
  notificationApi.list = async () => ({ notifications: [], unread: 0 });
});
test.afterEach(() => {
  Object.assign(inviteApi, originalInvites);
  Object.assign(notificationApi, originalNotifications);
  useGameStore.setState(originalGame, true);
  authStore.setState(originalAuth, true);
  inviteStore.getState().reset();
});

/** Seats this player in their own lobby with P2 free. */
function sitInLobby(players = { P1: true, P2: false }) {
  useGameStore.setState({
    joined: true,
    roomId: "room-9",
    seat: "P1",
    roomMeta: {
      roomMode: "normal",
      origin: "MANUAL",
      draftState: null,
      phase: "lobby",
      players,
    } as never,
  });
}

async function mount(element: React.ReactNode) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter>{element}</MemoryRouter>);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => {
  const found = renderer.root.findAllByType("button").find((node) => node.children.join("") === label);
  assert(found, `button ${label}`);
  return found;
};

test("invites and invite events are decoded strictly", () => {
  assert.deepEqual(parseInvite({ ...incoming, extra: true }), incoming);
  assert.throws(() => parseInvite({ ...incoming, seat: "P3" }), /INVALID_RESPONSE/);
  assert.throws(() => parseInvite({ ...incoming, roomId: "" }), /INVALID_RESPONSE/);
  assert.deepEqual(parseUserEvent({ type: "invite", invite: incoming }), {
    type: "invite",
    invite: incoming,
  });
  assert.deepEqual(parseUserEvent({ type: "inviteGone", inviteId: "i1" }), {
    type: "inviteGone",
    inviteId: "i1",
  });
  assert.equal(parseUserEvent({ type: "invite", invite: { id: "x" } }), null);
});

test("the store sorts pushed invites into incoming and outgoing", () => {
  const outgoing = { ...incoming, id: "i2", from: me, to: ann };
  inviteStore.getState().received(incoming, true);
  inviteStore.getState().received(outgoing, true);
  assert.deepEqual(inviteStore.getState().incoming.map((item) => item.id), ["i1"]);
  assert.deepEqual(inviteStore.getState().outgoing.map((item) => item.id), ["i2"]);
  assert.deepEqual(inviteStore.getState().toasts, ["i1"]);
  inviteStore.getState().gone("i1");
  assert.deepEqual(inviteStore.getState().incoming, []);
  assert.deepEqual(inviteStore.getState().toasts, []);
  // Someone else's invite never lands here.
  inviteStore.getState().received({ ...incoming, id: "i3", to: { ...ann, id: "zz" } }, true);
  assert.deepEqual(inviteStore.getState().incoming, []);
});

test("the invite button shows only in an open lobby, sends, withdraws and explains refusals", async () => {
  const sent: string[] = [];
  const removed: string[] = [];
  inviteApi.send = async (roomId: string, userId: string) => {
    sent.push(`${roomId}>${userId}`);
    if (userId === "blocked") throw new ApiError("INVITE_NOT_ALLOWED", 403);
    return { ...incoming, id: "out-1", from: me, to: ann, roomId };
  };
  inviteApi.remove = async (id: string) => {
    removed.push(id);
  };
  const renderer = await mount(<InviteButton player={ann} />);
  try {
    assert.equal(renderer.toJSON(), null);
    act(() => sitInLobby());
    await act(async () => button(renderer, "Invite to lobby").props.onClick());
    assert.deepEqual(sent, ["room-9>a1"]);
    assert.match(text(renderer), /Invited/);
    await act(async () => button(renderer, "Invited").props.onClick());
    assert.deepEqual(removed, ["out-1"]);
    assert.match(text(renderer), /Invite to lobby/);
    // A full lobby hides the button again.
    act(() => sitInLobby({ P1: true, P2: true }));
    assert.equal(renderer.toJSON(), null);
  } finally {
    act(() => renderer.unmount());
  }
  act(() => sitInLobby());
  const refused = await mount(<InviteButton player={{ ...ann, id: "blocked" }} />);
  try {
    await act(async () => button(refused, "Invite to lobby").props.onClick());
    assert.match(text(refused), /does not accept lobby invites/);
  } finally {
    act(() => refused.unmount());
  }
});

test("a pushed invite toasts, counts on the bell and joins the free seat", async () => {
  const joins: unknown[] = [];
  useGameStore.setState({
    joinRoom: async (params: unknown) => {
      joins.push(params);
    },
  } as never);
  const renderer = await mount(
    <>
      <NotificationBell />
      <NotificationSync />
    </>,
  );
  try {
    act(() => userEvents.emit({ type: "invite", invite: incoming }));
    assert.equal(renderer.root.findAllByProps({ "data-testid": "invite-toast" }).length, 1);
    assert.match(text(renderer), /invites you to the lobby “Night duel”/);
    assert.equal(
      renderer.root.findByProps({ "data-testid": "notification-bell" }).props["aria-label"],
      "Notifications, 1 unread",
    );
    await act(async () => button(renderer, "Join lobby").props.onClick());
    assert.deepEqual(joins, [{ mode: "join", roomId: "room-1", role: "P2" }]);
    assert.deepEqual(inviteStore.getState().incoming, []);
    assert.equal(renderer.root.findAllByProps({ "data-testid": "invite-toast" }).length, 0);

    // During a battle the invite only waits in the bell; it leaves when the server says so.
    useGameStore.setState({ joined: true, roomState: { phase: "battle" } as never });
    act(() => userEvents.emit({ type: "invite", invite: { ...incoming, id: "i5" } }));
    assert.equal(renderer.root.findAllByProps({ "data-testid": "invite-toast" }).length, 0);
    assert.equal(inviteStore.getState().incoming.length, 1);
    act(() => userEvents.emit({ type: "inviteGone", inviteId: "i5" }));
    assert.equal(inviteStore.getState().incoming.length, 0);
  } finally {
    act(() => renderer.unmount());
  }
});
