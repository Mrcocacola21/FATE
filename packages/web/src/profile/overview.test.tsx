import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router";
import { statisticsApi } from "../api/statisticsApi";
import { matchApi } from "../api/matchApi";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { setLanguage } from "../i18n";
import { PublicProfilePage } from "../pages/PublicProfilePage";
import { ProfilePage } from "../pages/ProfilePage";
import { profileStore } from "./profileStore";
import { competitiveApi, parseRatingHistory, type RatingHistoryEntry } from "../play/api";
import { competitiveRatingFixture } from "../ranks/testFixtures";
import { statisticsFixture, emptyStatisticsFixture, recentFixture } from "../statistics/fixtures";
import {
  chartPoints,
  chartScale,
  favoriteMode,
  mostPlayedMode,
  peakRating,
  ratingDeltaByMatch,
  type RatingHistories,
} from "./profileData";
import { formatRatingDelta } from "./RatingChart";

function entry(
  matchId: string,
  result: RatingHistoryEntry["result"],
  before: number,
  after: number,
  day: number,
): RatingHistoryEntry {
  return {
    matchId,
    result,
    ratingBefore: before,
    ratingAfter: after,
    ratingDelta: after - before,
    createdAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00Z`,
  };
}
/** Newest first, like the API; the classic games are recentFixture's WIN, DRAW, LOSS. */
const historiesFixture: RatingHistories = {
  standard: [],
  draft: [entry("draft-1", "WIN", 1500, 1530, 1)],
  classic: [
    entry("match-0", "LOSS", 1514, 1503, 3),
    entry("match-1", "DRAW", 1514, 1514, 2),
    entry("match-2", "WIN", 1500, 1514, 1),
  ],
};

const original = {
  stats: statisticsApi.getPlayerStatistics,
  matches: matchApi.getUserMatches,
  publicProfile: profileApi.getPublic,
  ratings: competitiveApi.ratings,
  config: competitiveApi.config,
  history: competitiveApi.ratingHistory,
  profileState: profileStore.getState(),
};
test.beforeEach(() => {
  setLanguage("en", null);
  statisticsApi.getPlayerStatistics = async (id) => statisticsFixture(id);
  matchApi.getUserMatches = async () => recentFixture;
  competitiveApi.ratings = async () => ({
    standard: competitiveRatingFixture(1500, 0),
    draft: competitiveRatingFixture(1530, 1),
    classic: competitiveRatingFixture(1517, 3),
  });
  competitiveApi.config = async () => 5;
  competitiveApi.ratingHistory = async (_id, mode) => historiesFixture[mode];
});
test.afterEach(() => {
  statisticsApi.getPlayerStatistics = original.stats;
  matchApi.getUserMatches = original.matches;
  profileApi.getPublic = original.publicProfile;
  competitiveApi.ratings = original.ratings;
  competitiveApi.config = original.config;
  competitiveApi.ratingHistory = original.history;
  profileStore.setState(original.profileState, true);
});

async function mount(element: React.ReactNode, path = "/profile") {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  });
  return renderer;
}
const content = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const byTestId = (renderer: ReactTestRenderer, id: string) =>
  renderer.root.findByProps({ "data-testid": id });
function signedInOwner() {
  profileStore.setState({
    profile: {
      id: "owner",
      username: "Owner",
      displayName: "Visible identity",
      avatarUrl: null,
      email: "owner@example.test",
      preferredLanguage: "en",
      preferredTheme: "dark",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    },
  });
}

test("chart data reads oldest to newest from the rating before the first game", () => {
  const points = chartPoints(historiesFixture.classic);
  assert.deepEqual(
    points.map((point) => point.rating),
    [1500, 1514, 1514, 1503],
  );
  assert.equal(points[0].entry, null);
  assert.equal(points[3].entry?.matchId, "match-0");
  assert.deepEqual(chartPoints([]), []);
  assert.equal(chartPoints(historiesFixture.classic, 1).length, 2);
});

test("chart scale pads the range, keeps a nearby rank threshold and rounds its ticks", () => {
  const near = chartScale([1500, 1514], 1550);
  assert(near.showThreshold);
  assert(near.min < 1500 && near.max > 1550);
  assert(near.ticks.every((tick) => tick % 5 === 0 && tick >= near.min && tick <= near.max));
  assert.equal(chartScale([1500, 1514], 2400).showThreshold, false);
  assert.equal(chartScale([1500, 1514], null).showThreshold, false);
});

test("profile summaries pick the peak, the favorite format, the default chart mode and deltas", () => {
  assert.deepEqual(peakRating(historiesFixture), { rating: 1530, mode: "draft" });
  assert.equal(peakRating({ standard: [], draft: [], classic: [] }), null);
  assert.equal(
    favoriteMode([
      { ...statisticsFixture().byGameMode[0], gameMode: "standard", gamesPlayed: 3 },
      { ...statisticsFixture().byGameMode[0], gameMode: "draft", gamesPlayed: 7 },
    ])?.gameMode,
    "draft",
  );
  assert.equal(favoriteMode([]), null);
  assert.equal(
    mostPlayedMode({
      standard: competitiveRatingFixture(1500, 2),
      draft: competitiveRatingFixture(1500, 9),
      classic: competitiveRatingFixture(1500, 9),
    }),
    "draft",
  );
  const deltas = ratingDeltaByMatch(historiesFixture);
  assert.equal(deltas.get("match-2"), 14);
  assert.equal(deltas.get("match-0"), -11);
  assert.equal(deltas.get("match-1"), 0);
  assert.equal(formatRatingDelta(14.4), "+14");
  assert.equal(formatRatingDelta(-11), "−11");
  assert.equal(formatRatingDelta(0.2), "0");
});

test("rating history parser keeps the API fields and rejects malformed items", () => {
  const item = { ...historiesFixture.classic[0], id: "x", ratedGameNumber: 3 };
  assert.deepEqual(parseRatingHistory({ items: [item] }), [historiesFixture.classic[0]]);
  assert.deepEqual(
    parseRatingHistory({ items: [{ ...item, matchId: null, result: null }] })[0].matchId,
    null,
  );
  assert.throws(() => parseRatingHistory({ items: [{ ...item, ratingAfter: "1500" }] }));
  assert.throws(() => parseRatingHistory({ items: [{ ...item, result: "MAYBE" }] }));
  assert.throws(() => parseRatingHistory({}));
});

test("own profile shows chart, tiles, heroes, recent matches with rating change and the private block", async () => {
  signedInOwner();
  statisticsApi.getPlayerStatistics = async (id) => ({
    ...statisticsFixture(id),
    byHero: [
      { heroId: "guts", gamesPlayed: 3, wins: 2, losses: 1, draws: 0, winRate: 2 / 3 },
      { heroId: "loki", gamesPlayed: 1, wins: 0, losses: 1, draws: 0, winRate: 0 },
    ],
    heroSampleSize: 3,
  });
  matchApi.getUserMatches = async () => ({
    ...recentFixture,
    items: recentFixture.items.map((item, index) =>
      index === 0
        ? {
            ...item,
            squad: [
              { class: "rider", heroId: "guts" },
              { class: "trickster", heroId: "loki" },
              { class: "knight", heroId: null },
            ],
          }
        : item,
    ),
  });
  const renderer = await mount(<ProfilePage />);
  try {
    // Classic has the most rated games, so the chart opens on it.
    const chart = byTestId(renderer, "profile-rating-chart");
    assert.match(
      JSON.stringify(chart.findByType("title").children),
      /last 3 rated games: from 1500 to 1503, peak 1514/,
    );
    assert.match(
      content(renderer),
      /"data-testid":"profile-rank-classic"[^}]*"data-selected":true/,
    );
    const tiles = JSON.stringify(
      byTestId(renderer, "player-statistics")
        .findAllByType("dd")
        .map((dd) => dd.children),
    );
    assert.match(tiles, /60%/);
    assert.match(tiles, /4 rated games/);
    assert.match(tiles, /1530/);
    assert.match(tiles, /Draft/);
    const matches = byTestId(renderer, "profile-recent-matches");
    const deltas = matches
      .findAll((node) => node.props.className === "profile-match__delta")
      .map((node) => node.children.join(""));
    assert.deepEqual(deltas, ["−11", "0", "+14"]);
    assert(
      matches.findAllByType("a").some((link) => link.props.href === "/matches/match-2/replay"),
    );
    const heroes = byTestId(renderer, "profile-heroes");
    assert.deepEqual(
      heroes.findAllByType("strong").map((node) => node.children.join("")),
      ["Guts", "Loki"],
    );
    assert.match(JSON.stringify(heroes.findAllByType("b").map((b) => b.children)), /66\.7%/);
    assert.match(
      JSON.stringify(heroes.findAllByType("p").map((p) => p.children)),
      /Matches with a recorded squad: 3/,
    );
    const squads = matches.findAll((node) => node.props.className === "profile-squad");
    assert.equal(squads.length, 1);
    assert.equal(squads[0].props["aria-label"], "Squad: Guts, Loki");
    assert.equal(squads[0].findAllByType("img").length, 2);
    const privateBlock = byTestId(renderer, "profile-private");
    assert.match(
      JSON.stringify(privateBlock.findAllByType("dd").map((dd) => dd.children)),
      /owner@example.test/,
    );
    const standardTab = chart
      .findAllByType("button")
      .find((button) => button.children.join("") === "Standard")!;
    act(() => standardTab.props.onClick());
    assert.match(content(renderer), /No rated games in this format yet/);
    assert.match(
      content(renderer),
      /"data-testid":"profile-rank-standard"[^}]*"data-selected":true/,
    );
    act(() =>
      privateBlock
        .findAllByType("button")
        .find((button) => button.children.join("") === "Account settings")!
        .props.onClick(),
    );
    assert.equal(renderer.root.findAllByType("form").length, 1);
  } finally {
    act(() => renderer.unmount());
  }
});

test("a failed block keeps the rest of the profile usable and retries only itself", async () => {
  signedInOwner();
  let statsCalls = 0;
  let historyCalls = 0;
  statisticsApi.getPlayerStatistics = async (id) => {
    if (++statsCalls === 1) throw new ApiError("NETWORK_ERROR");
    return statisticsFixture(id);
  };
  competitiveApi.ratingHistory = async (_id, mode) => {
    historyCalls++;
    if (mode === "draft") throw new ApiError("NETWORK_ERROR");
    return historiesFixture[mode];
  };
  const renderer = await mount(<ProfilePage />);
  try {
    assert.match(content(renderer), /Visible identity/);
    assert.match(content(renderer), /Statistics unavailable/);
    assert.match(content(renderer), /Unable to load the rating history/);
    assert.match(content(renderer), /Historical opponent/);
    const statsPanel = byTestId(renderer, "player-statistics");
    await act(async () =>
      statsPanel.findByProps({ role: "alert" }).findByType("button").props.onClick(),
    );
    assert.match(content(renderer), /60%/);
    assert.equal(statsCalls, 2);
    assert.equal(historyCalls, 3);
  } finally {
    act(() => renderer.unmount());
  }
});

test("public profile hides private details and never keeps the previous player's data", async () => {
  const calls: string[] = [];
  profileApi.getPublic = async (username) => ({
    id: `id-${username}`,
    username,
    displayName: username,
    avatarUrl: null,
    createdAt: "2026-09-01T00:00:00Z",
  });
  statisticsApi.getPlayerStatistics = async (id) => {
    calls.push(id);
    return id === "id-Alice" ? statisticsFixture(id) : emptyStatisticsFixture(id);
  };
  let navigate!: NavigateFunction;
  function Probe() {
    navigate = useNavigate();
    return null;
  }
  const renderer = await mount(
    <>
      <Probe />
      <Routes>
        <Route path="/users/:username" element={<PublicProfilePage />} />
      </Routes>
    </>,
    "/users/Alice",
  );
  try {
    assert.match(content(renderer), /60%/);
    assert.equal(renderer.root.findAllByProps({ "data-testid": "profile-private" }).length, 0);
    assert.doesNotMatch(content(renderer), /Edit profile|Change avatar|@example\.test/);
    assert(
      byTestId(renderer, "profile-recent-matches")
        .findAllByType("a")
        .some((link) => link.props.href === "/users/Alice/matches"),
    );
    await act(async () => {
      void navigate("/users/Bob");
    });
    assert.deepEqual(calls, ["id-Alice", "id-Bob"]);
    assert.doesNotMatch(content(renderer), /60%/);
    assert.match(content(renderer), /No match data yet/);
    assert.equal(byTestId(renderer, "player-statistics").findAllByType("a").length, 0);
  } finally {
    act(() => renderer.unmount());
  }
});
