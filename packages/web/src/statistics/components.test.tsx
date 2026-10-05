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
import { profileStore } from "../profile/profileStore";
import { competitiveApi } from "../play/api";
import { competitiveRatingFixture } from "../ranks/testFixtures";
import { PlayerStatisticsSection } from "./PlayerStatisticsSection";
import { StatisticsSummary } from "./StatisticsSummary";
import { statisticsFixture, emptyStatisticsFixture, recentFixture } from "./fixtures";
import type { PlayerStatistics } from "./types";

const originalStats = statisticsApi.getPlayerStatistics;
const originalMatches = matchApi.getUserMatches;
const originalProfile = profileApi.getPublic;
const originalProfileState = profileStore.getState();
const originalRatings = competitiveApi.ratings;
const originalConfig = competitiveApi.config;
test.beforeEach(() => {
  setLanguage("en", null);
  statisticsApi.getPlayerStatistics = async (id) => statisticsFixture(id);
  matchApi.getUserMatches = async () => recentFixture;
  competitiveApi.ratings = async () => ({
    standard: competitiveRatingFixture(1500, 2),
    draft: competitiveRatingFixture(1500, 0),
    classic: competitiveRatingFixture(1500, 0),
  });
  competitiveApi.config = async () => 5;
});
test.afterEach(() => {
  statisticsApi.getPlayerStatistics = originalStats;
  matchApi.getUserMatches = originalMatches;
  profileApi.getPublic = originalProfile;
  competitiveApi.ratings = originalRatings;
  competitiveApi.config = originalConfig;
  profileStore.setState(originalProfileState, true);
  setLanguage("en", null);
});

async function mount(element: React.ReactNode, path = "/profile") {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
  });
  return renderer;
}
function content(renderer: ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}
function cleanup(renderer: ReactTestRenderer) {
  act(() => renderer.unmount());
}

test("summary shows seven canonical backend metrics and honest tracked coverage", async () => {
  const renderer = await mount(<StatisticsSummary overall={statisticsFixture().overall} />);
  try {
    const text = content(renderer);
    for (const value of [
      "60%",
      "10",
      "6 / 4",
      "Win × 4",
      "15m 00s",
      "18.5",
      "Based on 8 of 10 matches",
      "Based on 6 of 10 matches",
    ])
      assert(text.includes(value), value);
    assert.equal(renderer.root.findAllByType("dt").length, 7);
    assert.doesNotMatch(text, /draws|NaN|undefined/);
  } finally {
    cleanup(renderer);
  }
});

test("null averages, loss/draw/empty streaks and draws render explicit text", async () => {
  const overall = {
    ...statisticsFixture().overall,
    averageDurationMs: null,
    averageTurns: null,
    durationSampleSize: 0,
    turnCountSampleSize: 0,
    draws: 2,
  };
  const renderer = await mount(
    <StatisticsSummary overall={{ ...overall, currentStreak: { type: "LOSS", count: 2 } }} />,
  );
  try {
    assert.match(content(renderer), /Loss × 2/);
    assert.match(content(renderer), /2 draws/);
    assert.equal(
      renderer.root.findAllByType("dd").filter((node) => node.children.join("") === "—").length,
      2,
    );
    assert.doesNotMatch(content(renderer), /NaN|0m 00s|undefined/);
    act(() =>
      renderer.update(
        <MemoryRouter>
          <StatisticsSummary overall={{ ...overall, currentStreak: { type: "DRAW", count: 1 } }} />
        </MemoryRouter>,
      ),
    );
    assert.match(content(renderer), /Draw × 1/);
    act(() =>
      renderer.update(
        <MemoryRouter>
          <StatisticsSummary overall={{ ...overall, currentStreak: { type: null, count: 0 } }} />
        </MemoryRouter>,
      ),
    );
    assert.equal(
      renderer.root.findAllByType("dd").filter((node) => node.children.join("") === "—").length,
      3,
    );
  } finally {
    cleanup(renderer);
  }
});

test("zero matches show a deliberate empty state; Play is available only to the owner", async () => {
  statisticsApi.getPlayerStatistics = async (id) => emptyStatisticsFixture(id);
  const renderer = await mount(<PlayerStatisticsSection userId="player-a" username="Player" own />);
  try {
    assert.match(content(renderer), /No match data yet/);
    assert.equal(
      renderer.root.findAllByType("svg").filter((node) => node.props.role === "img").length,
      0,
    );
    assert.equal(renderer.root.findAllByType("dt").length, 0);
    assert(renderer.root.findAllByType("a").some((node) => node.props.href === "/"));
    act(() =>
      renderer.update(
        <MemoryRouter>
          <PlayerStatisticsSection userId="player-a" username="Player" />
        </MemoryRouter>,
      ),
    );
    assert.equal(renderer.root.findAllByType("a").length, 0);
    assert.match(content(renderer), /This player has no completed matches yet/);
  } finally {
    cleanup(renderer);
  }
});

test("mode chart shows localized modes, low samples, records, draws, averages and backend rates", async () => {
  const fixture = statisticsFixture();
  fixture.byGameMode.push({
    ...fixture.byGameMode[0],
    gameMode: "standard",
    gamesPlayed: 1,
    wins: 0,
    losses: 0,
    draws: 1,
    winRate: 0,
    averageDurationMs: null,
    averageTurns: null,
    durationSampleSize: 0,
    turnCountSampleSize: 0,
  });
  statisticsApi.getPlayerStatistics = async () => fixture;
  const renderer = await mount(<PlayerStatisticsSection userId="player-a" username="Player" />);
  try {
    const text = content(renderer);
    for (const value of [
      "Classic",
      "Standard",
      "10 games",
      "1 game",
      "6 wins",
      "4 losses",
      "1 draw",
    ])
      assert(text.includes(value), value);
    const bars = renderer.root.findAllByProps({ className: "stats-mode-bar" });
    assert.deepEqual(
      bars.map((bar) => bar.findByType("span").props.style.width),
      ["60%", "0%"],
    );
    act(() => setLanguage("uk", null));
    assert.match(content(renderer), /Режими гри/);
    assert.match(content(renderer), /1 матч/);
  } finally {
    cleanup(renderer);
  }
});

test("current DTO omits hero and Figure Set analytics without rendering invented historical sections", async () => {
  const renderer = await mount(<PlayerStatisticsSection userId="player-a" username="Player" />);
  try {
    assert.doesNotMatch(
      content(renderer),
      /Hero Performance|Hero performance|Figure Set|Loadout|rating|rank|percentile/i,
    );
  } finally {
    cleanup(renderer);
  }
});

test("recent requests are bounded; chronological outcomes, context, detail links and textual chart values are available", async () => {
  const calls: unknown[] = [];
  matchApi.getUserMatches = async (...args) => {
    calls.push(args);
    return recentFixture;
  };
  const renderer = await mount(
    <PlayerStatisticsSection userId="player-a" username="Other Player" />,
  );
  try {
    assert.deepEqual(calls, [["player-a", { page: 1, limit: 10 }]]);
    const results = renderer.root
      .findAllByType("a")
      .filter((node) => node.props.className === "stats-result");
    assert.deepEqual(
      results.map((node) => node.props["data-outcome"]),
      ["WIN", "DRAW", "LOSS"],
    );
    assert.deepEqual(
      results.map((node) => node.props.href),
      ["/matches/match-2", "/matches/match-1", "/matches/match-0"],
    );
    assert.match(
      results[0].props["aria-label"],
      /Win · vs Historical opponent · Classic · 15m 00s/,
    );
    assert(
      renderer.root
        .findAllByType("a")
        .some((node) => node.props.href === "/users/Other%20Player/matches"),
    );
    assert.match(content(renderer), /sample win rate 33.3%/);
    assert.equal(
      renderer.root.findAllByType("svg").filter((node) => node.props.role === "img").length,
      1,
    );
  } finally {
    cleanup(renderer);
  }
});

test("one or two matches keep the results strip and avoid a misleading trend", async () => {
  matchApi.getUserMatches = async () => ({
    ...recentFixture,
    items: recentFixture.items.slice(0, 2),
  });
  const renderer = await mount(<PlayerStatisticsSection userId="player-a" username="Player" />);
  try {
    assert.equal(
      renderer.root.findAllByType("a").filter((node) => node.props.className === "stats-result")
        .length,
      2,
    );
    assert.equal(renderer.root.findAllByType("svg").length, 0);
    assert.match(content(renderer), /at least 3/);
  } finally {
    cleanup(renderer);
  }
});

test("recent failure and retry leave career metrics visible without refetching statistics", async () => {
  let statsCalls = 0;
  let recentCalls = 0;
  statisticsApi.getPlayerStatistics = async () => {
    statsCalls++;
    return statisticsFixture();
  };
  matchApi.getUserMatches = async () => {
    if (++recentCalls === 1) throw new ApiError("NETWORK_ERROR");
    return recentFixture;
  };
  const renderer = await mount(<PlayerStatisticsSection userId="player-a" username="Player" />);
  try {
    assert.match(content(renderer), /60%/);
    assert.match(content(renderer), /Unable to load recent performance/);
    await act(async () => renderer.root.findByType("button").props.onClick());
    assert.equal(statsCalls, 1);
    assert.equal(recentCalls, 2);
    assert.match(content(renderer), /Last 3 completed matches/);
  } finally {
    cleanup(renderer);
  }
});

test("statistics failure leaves own profile identity/editing usable and retries just the failed request", async () => {
  let calls = 0;
  statisticsApi.getPlayerStatistics = async (id) => {
    if (++calls === 1) throw new ApiError("NETWORK_ERROR");
    return statisticsFixture(id);
  };
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
  const renderer = await mount(<ProfilePage />);
  try {
    assert.match(content(renderer), /Visible identity/);
    assert.match(content(renderer), /Statistics unavailable/);
    const edit = renderer.root
      .findAllByType("button")
      .find((node) => node.children.join("") === "Edit profile");
    assert(edit);
    act(() => edit.props.onClick());
    assert.equal(renderer.root.findAllByType("form").length, 1);
    await act(async () =>
      renderer.root.findByProps({ role: "alert" }).findByType("button").props.onClick(),
    );
    assert.match(content(renderer), /60%/);
    assert.equal(calls, 2);
  } finally {
    cleanup(renderer);
  }
});

test("player and revision switches hide old data immediately and ignore late responses", async () => {
  const pending = new Map<string, (data: PlayerStatistics) => void>();
  statisticsApi.getPlayerStatistics = (id) => new Promise((resolve) => pending.set(id, resolve));
  const renderer = await mount(<PlayerStatisticsSection userId="a" username="A" />);
  try {
    assert.equal(renderer.root.findAllByType("dt").length, 0);
    await act(async () => pending.get("a")!(statisticsFixture("a")));
    assert.match(content(renderer), /60%/);
    act(() =>
      renderer.update(
        <MemoryRouter>
          <PlayerStatisticsSection userId="b" username="B" />
        </MemoryRouter>,
      ),
    );
    assert.doesNotMatch(content(renderer), /60%/);
    act(() =>
      renderer.update(
        <MemoryRouter>
          <PlayerStatisticsSection userId="c" username="C" />
        </MemoryRouter>,
      ),
    );
    await act(async () => pending.get("b")!(statisticsFixture("b")));
    assert.equal(renderer.root.findAllByType("dt").length, 0);
    await act(async () => pending.get("c")!(emptyStatisticsFixture("c")));
    assert.match(content(renderer), /No match data yet/);
    act(() =>
      renderer.update(
        <MemoryRouter>
          <PlayerStatisticsSection userId="c" username="C" revision={1} />
        </MemoryRouter>,
      ),
    );
    assert.doesNotMatch(content(renderer), /No match data yet/);
    await act(async () => pending.get("c")!(statisticsFixture("c")));
    assert.match(content(renderer), /60%/);
  } finally {
    cleanup(renderer);
  }
});

test("public routing requests each viewed player's id and never keeps the previous player's charts", async () => {
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
    await act(async () => {
      void navigate("/users/Bob");
    });
    assert.deepEqual(calls, ["id-Alice", "id-Bob"]);
    assert.doesNotMatch(content(renderer), /60%/);
    assert.match(content(renderer), /No match data yet/);
    assert.equal(
      renderer.root.findByProps({ "data-testid": "player-statistics" }).findAllByType("button").length,
      0,
    );
  } finally {
    cleanup(renderer);
  }
});
