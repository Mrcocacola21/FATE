import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { setLanguage } from "../i18n";
import {
  createFriendApi,
  parsePresence,
  parseRelationship,
  type Presence,
  type Relationship,
} from "../api/friendApi";
import { presenceText, relativeTime } from "./PresenceLine";
import { translate } from "../i18n";
import { friendApi } from "./friendStore";
import { FriendsPage } from "./FriendsPage";
import { RelationshipButton } from "./RelationshipActions";

const ann = { id: "a1", username: "Ann", displayName: "Ann the Bold", avatarUrl: null };
const bob = { id: "b2", username: "Bob", displayName: null, avatarUrl: null };
const none: Relationship = { status: "none", requestId: null, blocked: false, canRequest: true };
const offline: Presence = { state: "offline", lastSeenAt: null, activity: null };

const original = { ...friendApi };
test.beforeEach(() => setLanguage("en", null));
test.afterEach(() => Object.assign(friendApi, original));

async function mount(element: React.ReactNode, path = "/friends") {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => {
  const found = renderer.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label);
  assert(found, `button ${label}`);
  return found;
};

test("relationship decoding accepts the four states and rejects anything else", () => {
  assert.deepEqual(parseRelationship({ ...none, extra: 1 }), none);
  assert.deepEqual(
    parseRelationship({ status: "incoming", requestId: "r", blocked: false, canRequest: false }),
    {
      status: "incoming",
      requestId: "r",
      blocked: false,
      canRequest: false,
    },
  );
  for (const bad of [{ ...none, status: "maybe" }, { ...none, blocked: "no" }, null])
    assert.throws(() => parseRelationship(bad), /INVALID_RESPONSE/);
});

test("the client calls the documented endpoints with the right methods", async () => {
  const calls: [string, string | undefined, unknown][] = [];
  const client = {
    async request<T>(path: string, decode: (value: unknown) => T, options?: RequestInit) {
      calls.push([path, options?.method, options?.body]);
      if (path === "/api/friends/requests")
        return decode({
          relationship: { ...none, status: "outgoing", requestId: "r1", canRequest: false },
        });
      if (path.startsWith("/api/players/search"))
        return decode({ players: [{ player: ann, relationship: none }] });
      return decode(undefined);
    },
  };
  const api = createFriendApi(client);
  assert.equal((await api.sendRequest("Ann")).status, "outgoing");
  assert.equal((await api.search("an d"))[0].player.username, "Ann");
  await api.block("b2");
  await api.unblock("b2");
  assert.deepEqual(calls, [
    ["/api/friends/requests", "POST", JSON.stringify({ username: "Ann" })],
    ["/api/players/search?q=an%20d", "GET", undefined],
    ["/api/friends/blocks/b2", "PUT", undefined],
    ["/api/friends/blocks/b2", "DELETE", undefined],
  ]);
});

test("friends tab lists friends, filters them and removes one through the menu", async () => {
  let friends = [
    { player: ann, friendsSince: "2026-10-01T10:00:00Z", presence: offline },
    { player: bob, friendsSince: "2026-10-02T10:00:00Z", presence: offline },
  ];
  const removed: string[] = [];
  friendApi.friends = async () => friends;
  friendApi.blocks = async () => [];
  friendApi.incomingCount = async () => 0;
  friendApi.remove = async (id: string) => {
    removed.push(id);
    friends = friends.filter((friend) => friend.player.id !== id);
  };
  const renderer = await mount(<FriendsPage />);
  try {
    assert.equal(renderer.root.findAllByProps({ "data-testid": "player-row" }).length, 2);
    assert.match(text(renderer), /Ann the Bold/);
    act(() =>
      renderer.root
        .findByProps({ id: "friends-filter" })
        .props.onChange({ target: { value: "bob" } }),
    );
    assert.equal(renderer.root.findAllByProps({ "data-testid": "player-row" }).length, 1);
    act(() => button(renderer, "⋯").props.onClick());
    await act(async () => button(renderer, "Remove from friends").props.onClick());
    assert.deepEqual(removed, ["b2"]);
    act(() =>
      renderer.root.findByProps({ id: "friends-filter" }).props.onChange({ target: { value: "" } }),
    );
    assert.equal(renderer.root.findAllByProps({ "data-testid": "player-row" }).length, 1);
  } finally {
    act(() => renderer.unmount());
  }
});

test("requests tab accepts incoming and cancels outgoing requests", async () => {
  let requests = {
    incoming: [{ id: "in-1", player: ann, createdAt: "2026-10-01T10:00:00Z" }],
    outgoing: [{ id: "out-1", player: bob, createdAt: "2026-10-01T10:00:00Z" }],
  };
  const actions: string[] = [];
  friendApi.requests = async () => requests;
  friendApi.incomingCount = async () => requests.incoming.length;
  friendApi.accept = async (id: string) => {
    actions.push(`accept ${id}`);
    requests = { ...requests, incoming: [] };
    return { player: ann, friendsSince: "2026-10-03T10:00:00Z", presence: offline };
  };
  friendApi.deleteRequest = async (id: string) => {
    actions.push(`delete ${id}`);
    requests = { ...requests, outgoing: [] };
  };
  const renderer = await mount(<FriendsPage />, "/friends?tab=requests");
  try {
    assert.match(text(renderer), /Received/);
    await act(async () => button(renderer, "Accept").props.onClick());
    await act(async () => button(renderer, "Cancel request").props.onClick());
    assert.deepEqual(actions, ["accept in-1", "delete out-1"]);
    assert.match(text(renderer), /No pending requests/);
  } finally {
    act(() => renderer.unmount());
  }
});

test("relationship button shows the next step for each state", async () => {
  const sent: string[] = [];
  friendApi.sendRequest = async (username: string) => {
    sent.push(username);
    return { ...none, status: "outgoing", requestId: "r", canRequest: false };
  };
  friendApi.incomingCount = async () => 0;
  let changed = 0;
  const render = (relationship: Relationship) => (
    <RelationshipButton player={ann} relationship={relationship} onChange={() => changed++} />
  );
  const renderer = await mount(render(none));
  try {
    await act(async () => button(renderer, "Add friend").props.onClick());
    assert.deepEqual(sent, ["Ann"]);
    assert.equal(changed, 1);
    for (const [relationship, expected] of [
      [{ ...none, status: "outgoing", requestId: "r", canRequest: false }, /Request sent/],
      [{ ...none, status: "incoming", requestId: "r", canRequest: false }, /Accept request/],
      [{ ...none, status: "friends", canRequest: false }, /"Friends"/],
      [{ ...none, canRequest: false }, /Not accepting requests/],
      [{ ...none, blocked: true }, /You blocked this player/],
    ] as const) {
      act(() => renderer.update(<MemoryRouter>{render(relationship)}</MemoryRouter>));
      assert.match(text(renderer), expected);
    }
  } finally {
    act(() => renderer.unmount());
  }
});

test("presence decoding, wording and relative times", () => {
  const lobby: Presence = {
    state: "lobby",
    lastSeenAt: null,
    activity: { roomId: "room-1", lobbyName: "Night duel", gameMode: "standard", openSeat: true },
  };
  assert.deepEqual(parsePresence(lobby), lobby);
  assert.deepEqual(parsePresence(undefined), offline);
  assert.throws(() => parsePresence({ ...lobby, state: "away" }), /INVALID_RESPONSE/);
  assert.throws(() => parsePresence({ ...lobby, activity: { roomId: "r" } }), /INVALID_RESPONSE/);
  assert.equal(presenceText(lobby, translate, "en"), "In lobby “Night duel” · seat open");
  assert.equal(
    presenceText(
      { ...lobby, state: "battle", activity: { ...lobby.activity!, gameMode: "draft" } },
      translate,
      "en",
    ),
    "In battle · Draft",
  );
  assert.equal(presenceText({ ...offline, state: "online" }, translate, "en"), "Online");
  assert.equal(presenceText(offline, translate, "en"), "Offline");
  const now = Date.parse("2026-10-29T12:00:00Z");
  assert.equal(relativeTime("2026-10-29T09:00:00Z", "en", now), "3 hours ago");
  assert.equal(relativeTime("2026-10-28T12:00:00Z", "en", now), "yesterday");
  assert.equal(relativeTime("2026-10-29T11:59:30Z", "en", now), "this minute");
});

test("friends are grouped by status with join and watch links", async () => {
  const lobbyPresence: Presence = {
    state: "lobby",
    lastSeenAt: null,
    activity: { roomId: "room-1", lobbyName: null, gameMode: "standard", openSeat: true },
  };
  friendApi.friends = async () => [
    { player: ann, friendsSince: "2026-10-01T10:00:00Z", presence: lobbyPresence },
    {
      player: bob,
      friendsSince: "2026-10-01T10:00:00Z",
      presence: {
        ...lobbyPresence,
        state: "battle",
        activity: { ...lobbyPresence.activity!, roomId: "room-2" },
      },
    },
    {
      player: { ...bob, id: "c3", username: "Cid" },
      friendsSince: "2026-10-01T10:00:00Z",
      presence: { ...offline, lastSeenAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    },
  ];
  friendApi.blocks = async () => [];
  friendApi.incomingCount = async () => 0;
  const renderer = await mount(<FriendsPage />);
  try {
    const titles = renderer.root
      .findAll((node) => node.props.className === "friends-group__title")
      .map((node) => String(node.children[0]));
    assert.deepEqual(titles, ["In battle", "In a lobby", "Offline"]);
    const links = renderer.root
      .findAllByType("a")
      .filter((node) => String(node.props.href).startsWith("/lobby"));
    assert.deepEqual(
      links.map((node) => [node.props.href, node.children.join("")]),
      [
        ["/lobby?join=room-2", "Watch"],
        ["/lobby?join=room-1", "Join"],
      ],
    );
    assert.match(text(renderer), /Last seen 2 hours ago/);
  } finally {
    act(() => renderer.unmount());
  }
});
