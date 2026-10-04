import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { PlayPage, CompetitiveIdentity } from "../pages/PlayPage";
import { competitiveApi } from "../play/api";
import { authStore } from "../auth/authStore";
import { queue } from "../matchmaking/store";
import { setLanguage } from "../i18n";
import { RoomBrowser } from "./RoomBrowser";
import { RoomConnectionDialog } from "./RoomConnectionDialog";
import { RatedCompatibilityPanel } from "./RatedCompatibilityPanel";
import { useGameStore } from "../store";
import type { RoomSummary } from "../api";
import { competitiveRatingFixture } from "../ranks/testFixtures";

test("Play shows real rating/uncertainty and configured qualification without a room browser", async () => {
  const auth = authStore.getState(),
    rating = competitiveApi.rating,
    config = competitiveApi.config;
  const user = {
    id: "player",
    username: "Max",
    displayName: null,
    avatarUrl: null,
    email: "private@example.test",
    createdAt: "2026-10-03T00:00:00Z",
  };
  authStore.setState({ user, status: "authenticated" });
  queue.owner(user.id);
  setLanguage("en", null);
  competitiveApi.rating = async () => competitiveRatingFixture(1750, 3);
  competitiveApi.config = async () => 7;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(
        <MemoryRouter>
          <PlayPage />
        </MemoryRouter>,
      );
    });
    const output = JSON.stringify(renderer.toJSON());
    assert.match(output, /1750/);
    assert.match(output, /blackmoon\.png/);
    assert.match(output, /Black Moon/);
    assert.match(output, /±74/);
    assert.match(output, /4 games until ranked/);
    assert.equal(renderer.root.findByProps({ className: "qualification-progress" }).props.max, 7);
    assert.equal(
      renderer.root.findByProps({ "data-testid": "rank-emblem" }).props["data-assigned"],
      true,
    );
    assert.equal(renderer.root.findAllByType("img").length, 1);
    assert(renderer.root.findByProps({ "data-testid": "matchmaking-panel" }));
    assert.equal(renderer.root.findAllByProps({ "data-testid": "room-browser" }).length, 0);
    assert(!/Bronze|Silver|Gold|Diamond|private@example/.test(output));
    act(() =>
      queue.event({
        type: "matchmakingStatus",
        revision: 1,
        status: {
          status: "QUEUED",
          joinedAt: new Date().toISOString(),
          waitMs: 10000,
          rating: 1578,
          currentRange: 150,
          gameMode: "classic",
          available: true,
        },
      }),
    );
    assert.equal(renderer.root.findAllByProps({ "data-testid": "rank-emblem" }).length, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /Searching for opponent/);
  } finally {
    act(() => renderer?.unmount());
    authStore.setState(auth, true);
    queue.owner(null);
    competitiveApi.rating = rating;
    competitiveApi.config = config;
  }
});

test("qualified identity shows backend rank progress separately from leaderboard qualification", () => {
  setLanguage("en", null);
  const html = renderToStaticMarkup(
    <CompetitiveIdentity
      rating={competitiveRatingFixture(1700, 27)}
      minRatedGames={7}
      name="Max"
    />,
  );
  assert.match(html, /Qualified for the ranked leaderboard/);
  assert.match(html, /eclipse\.png/);
  assert.match(html, /50 rating to Black Moon/);
  assert(html.includes('class="rank-progress-track"'));
  assert(!html.includes('class="qualification-progress"'));
});

test("browser hides IDs, escapes names, separates filters and always spectates active/reserved rooms", () => {
  setLanguage("en", null);
  const base: RoomSummary = {
    id: "hidden-room-uuid",
    lobbyName: "<b>Нічні ігри</b>",
    phase: "lobby",
    matchType: "RATED",
    createdAt: 0,
    players: { P1: true, P2: false },
    playerNames: { P1: "Max", P2: null },
    ready: { P1: false, P2: false },
    spectators: 3,
    canStart: false,
    roomMode: "normal",
    gameMode: "classic",
  };
  const rooms = [
    base,
    { ...base, id: "active", phase: "battle" as const, matchType: "CASUAL" as const },
    { ...base, id: "reserved", origin: "MATCHMAKING" as const, lobbyName: "Rated Match" },
  ];
  const requests: RoomSummary[] = [];
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <RoomBrowser
        rooms={rooms}
        refreshing={false}
        onRefresh={() => {}}
        onCreate={() => {}}
        onJoin={(room) => requests.push(room)}
      />,
    );
  });
  try {
    const html = renderToStaticMarkup(
      <RoomBrowser
        rooms={rooms}
        refreshing={false}
        onRefresh={() => {}}
        onCreate={() => {}}
        onJoin={() => {}}
      />,
    );
    assert(!html.includes("hidden-room-uuid"));
    assert(!html.includes("<b>"));
    assert.match(html, /&lt;b&gt;Нічні ігри/);
    assert.match(html, /Waiting for player/);
    assert.match(html, /Max/);
    assert.equal(
      renderer.root.findAllByType("button").filter((node) => node.children.includes("Join Lobby"))
        .length,
      1,
    );
    assert.equal(
      renderer.root.findAllByType("button").filter((node) => node.children.includes("Spectate"))
        .length,
      2,
    );
    act(() =>
      renderer.root.findAllByType("select")[0].props.onChange({ target: { value: "active" } }),
    );
    assert.equal(renderer.root.findAllByType("article").length, 1);
    act(() =>
      renderer.root
        .findAllByType("button")
        .find((node) => node.children.includes("Spectate"))!
        .props.onClick(),
    );
    assert.equal(requests[0].id, "active");
  } finally {
    act(() => renderer.unmount());
  }
});

test("reserved/active room dialog cannot offer competitor seats; guest names never use IDs", () => {
  const game = useGameStore.getState();
  const room: RoomSummary = {
    id: "private-room-id",
    origin: "MATCHMAKING",
    lobbyName: "Rated Match",
    phase: "lobby",
    matchType: "RATED",
    players: { P1: false, P2: false },
    ready: { P1: false, P2: false },
    createdAt: 0,
    spectators: 0,
    canStart: false,
    roomMode: "normal",
    gameMode: "classic",
  };
  useGameStore.setState({ roomsList: [room] });
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<RoomConnectionDialog kind="join" room={room} onClose={() => {}} />);
  });
  try {
    assert.equal(renderer.root.findByProps({ id: "lobby-role" }).props.value, "spectator");
    assert.equal(
      renderer.root.findAllByType("option").filter((option) => option.props.disabled).length,
      2,
    );
    assert(!JSON.stringify(renderer.toJSON()).includes(room.id));
  } finally {
    act(() => renderer.unmount());
    useGameStore.setState(game, true);
  }
  const html = renderToStaticMarkup(
    <RoomBrowser
      rooms={[{ ...room, origin: "MANUAL", players: { P1: true, P2: false } }]}
      refreshing={false}
      onRefresh={() => {}}
      onCreate={() => {}}
      onJoin={() => {}}
    />,
  );
  assert.match(html, /Guest/);
  assert.match(html, /Waiting for player/);
});

test("invalid rating compatibility presents the maximum and explicit Casual guidance", () => {
  const html = renderToStaticMarkup(
    <RatedCompatibilityPanel
      compatibility={{
        ratings: { P1: 1800, P2: 1350 },
        difference: 450,
        maxDifference: 400,
        eligible: false,
        reason: "RATED_RATING_DIFFERENCE_TOO_LARGE",
      }}
    />,
  );
  assert.match(html, /450/);
  assert.match(html, /400/);
  assert.match(html, /too large/);
  assert.match(html, /Casual lobby/);
});
