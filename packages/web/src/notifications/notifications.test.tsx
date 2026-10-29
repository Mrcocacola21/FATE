import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";
import { parseUserEvent, type AppNotification } from "../api/notificationApi";
import { friendApi } from "../friends/friendStore";
import { useGameStore } from "../store";
import { NotificationBell } from "./NotificationBell";
import { NotificationSync } from "./NotificationSync";
import { notificationApi, notificationStore } from "./notificationStore";
import { userEvents } from "./userEvents";

const ann = { id: "a1", username: "Ann", displayName: "Ann the Bold", avatarUrl: null };
const request: AppNotification = {
  id: "n1",
  kind: "friendRequest",
  player: ann,
  createdAt: new Date().toISOString(),
  read: false,
  requestId: "r1",
};
const accepted: AppNotification = { ...request, id: "n2", kind: "friendAccepted", requestId: null };

const originalAuth = authStore.getState();
const originalApi = { ...notificationApi };
const originalFriends = { ...friendApi };
const originalGame = useGameStore.getState();
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
        username: "me",
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-10-01T10:00:00Z",
      },
    },
    true,
  );
  notificationStore.getState().reset();
});
test.afterEach(() => {
  Object.assign(notificationApi, originalApi);
  Object.assign(friendApi, originalFriends);
  useGameStore.setState(originalGame, true);
  authStore.setState(originalAuth, true);
  notificationStore.getState().reset();
});

async function mount(element: React.ReactNode) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter>{element}</MemoryRouter>);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => {
  const found = renderer.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label || node.props["aria-label"] === label);
  assert(found, `button ${label}`);
  return found;
};

test("user events are decoded strictly and bad pushes are dropped", () => {
  assert.deepEqual(parseUserEvent({ type: "notification", notification: request, unread: 2 }), {
    type: "notification",
    notification: request,
    unread: 2,
  });
  assert.deepEqual(parseUserEvent({ type: "friendsChanged", extra: 1 }), { type: "friendsChanged" });
  assert.equal(
    parseUserEvent({
      type: "presence",
      userId: "a1",
      presence: { state: "online", lastSeenAt: null, activity: null },
    })?.type,
    "presence",
  );
  for (const bad of [
    null,
    { type: "notification", notification: { ...request, kind: "spam" }, unread: 1 },
    { type: "notification", notification: request, unread: -1 },
    { type: "presence", userId: "a1", presence: { state: "away" } },
    { type: "somethingElse" },
  ])
    assert.equal(parseUserEvent(bad), null);
});

test("the bell shows the unread count, lists notifications and marks them read on open", async () => {
  let marked = 0;
  notificationApi.list = async () => ({ notifications: [request, accepted], unread: 2 });
  notificationApi.markAllRead = async () => {
    marked++;
    return 0;
  };
  const accepts: string[] = [];
  friendApi.accept = async (id: string) => {
    accepts.push(id);
    return { player: ann, friendsSince: "2026-10-03T10:00:00Z", presence: { state: "offline", lastSeenAt: null, activity: null } };
  };
  friendApi.incomingCount = async () => 0;
  await act(async () => notificationStore.getState().load());
  const renderer = await mount(<NotificationBell />);
  try {
    const bell = renderer.root.findByProps({ "data-testid": "notification-bell" });
    assert.equal(bell.props["aria-label"], "Notifications, 2 unread");
    await act(async () => bell.props.onClick());
    assert.equal(marked, 1);
    assert.equal(notificationStore.getState().unread, 0);
    assert.match(text(renderer), /sent you a friend request/);
    assert.match(text(renderer), /accepted your friend request/);
    // Both were new when the bell opened, so both keep the gold mark while it stays open.
    assert.equal(renderer.root.findAll((node) => node.props["data-fresh"] === true).length, 2);
    await act(async () => button(renderer, "Accept").props.onClick());
    assert.deepEqual(accepts, ["r1"]);
    assert.equal(notificationStore.getState().items[0].requestId, null);
    assert.doesNotMatch(text(renderer), /"Accept"/);
  } finally {
    act(() => renderer.unmount());
  }
});

test("pushed notifications toast outside battle and wait in the bell during one", async () => {
  let loads = 0;
  notificationApi.list = async () => {
    loads++;
    return { notifications: [], unread: 0 };
  };
  friendApi.incomingCount = async () => 1;
  const renderer = await mount(<NotificationSync />);
  try {
    assert.equal(loads, 1);
    act(() => userEvents.emit({ type: "notification", notification: request, unread: 1 }));
    assert.equal(renderer.root.findAllByProps({ "data-testid": "notification-toast" }).length, 1);
    assert.match(text(renderer), /Ann the Bold/);
    act(() => button(renderer, "Dismiss").props.onClick());
    assert.equal(renderer.root.findAllByProps({ "data-testid": "notification-toast" }).length, 0);

    useGameStore.setState({
      joined: true,
      roomState: { ...(originalGame.roomState ?? {}), phase: "battle" } as never,
    });
    act(() => userEvents.emit({ type: "notification", notification: accepted, unread: 2 }));
    assert.equal(renderer.root.findAllByProps({ "data-testid": "notification-toast" }).length, 0);
    assert.equal(notificationStore.getState().unread, 2);
    assert.deepEqual(
      notificationStore.getState().items.map((item) => item.id),
      ["n2", "n1"],
    );

    await act(async () => userEvents.emit({ type: "friendsChanged" }));
    assert.equal(loads, 2);
  } finally {
    act(() => renderer.unmount());
  }
});

test("a push for another account is ignored", () => {
  notificationStore.setState({ owner: "someone-else" });
  notificationStore.getState().receive(request, 1, true);
  assert.deepEqual(notificationStore.getState().items, []);
  assert.deepEqual(notificationStore.getState().toasts, []);
});
