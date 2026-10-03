import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { leaderboardApi } from "../api/leaderboardApi";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { setLanguage } from "../i18n";
import { leaderboardFixture, leaderboardPlayer, provisionalPlayer } from "./fixtures";
import type { LeaderboardQuery, LeaderboardResponse } from "./types";

const original = leaderboardApi.getLeaderboard;
let requests: LeaderboardQuery[] = [];
let navigate: NavigateFunction;
function Probe() {
  const location = useLocation();
  navigate = useNavigate();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}
test.beforeEach(() => {
  setLanguage("en", null);
  requests = [];
  leaderboardApi.getLeaderboard = async (query) => {
    requests.push(query);
    const fixture = leaderboardFixture(
      query.status === "provisional" ? [provisionalPlayer()] : [leaderboardPlayer()],
    );
    fixture.pagination = { page: query.page, limit: query.limit, total: 41, totalPages: 3 };
    return fixture;
  };
});
test.afterEach(() => {
  leaderboardApi.getLeaderboard = original;
  setLanguage("en", null);
});
async function mount(path = "/leaderboard") {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/users/:username" element={<p>{"Public profile"}</p>} />
        </Routes>
        <Probe />
      </MemoryRouter>,
    );
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) => {
  const node = renderer.root.findAllByType("button").find((node) => node.children.includes(label));
  assert(node, label);
  return node;
};
const cleanup = (renderer: ReactTestRenderer) => act(() => renderer.unmount());

test("default Ranked, rating sort, metrics, public player links and backend policy", async () => {
  const renderer = await mount();
  try {
    assert.deepEqual(requests[0], {
      status: "qualified",
      page: 1,
      limit: 20,
      sort: "rating",
      order: "desc",
    });
    assert.equal(
      renderer.root.findByProps({ id: "leaderboard-tab-qualified" }).props["aria-selected"],
      true,
    );
    for (const value of [
      "Established player",
      "1685",
      "60%",
      "±65",
      "after 5 rated matches",
      "lower uncertainty",
    ])
      assert(text(renderer).includes(value), value);
    assert.equal(
      renderer.root.findAllByType("th").find((node) => node.props["aria-sort"])!.props["aria-sort"],
      "descending",
    );
    const link = renderer.root
      .findAllByType("a")
      .find((node) => node.props.href === "/users/Tactician")!;
    await act(async () => link.props.onClick({ button: 0, preventDefault() {} }));
    assert.match(text(renderer), /Public profile/);
  } finally {
    cleanup(renderer);
  }
});
test("Provisional has progress/uncertainty, no official rank and resets page", async () => {
  const renderer = await mount("/leaderboard?page=2");
  try {
    await act(async () => button(renderer, "Provisional").props.onClick());
    assert.equal(requests[requests.length - 1].status, "provisional");
    assert.equal(requests[requests.length - 1].page, 1);
    assert.match(text(renderer), /3 games until ranked/);
    assert.match(text(renderer), /2 \/ 5/);
    assert.match(text(renderer), /±280/);
    assert(!renderer.root.findAllByType("span").some((node) => node.children.includes("Rank")));
    assert.equal(renderer.root.findAllByProps({ className: "leaderboard-rank" }).length, 0);
  } finally {
    cleanup(renderer);
  }
});
test("sort, direction, pagination and browser back are URL state", async () => {
  const renderer = await mount("/leaderboard?page=2");
  try {
    await act(async () =>
      renderer.root.findByType("select").props.onChange({ target: { value: "winRate" } }),
    );
    assert.deepEqual(requests[requests.length - 1], {
      status: "qualified",
      page: 1,
      limit: 20,
      sort: "winRate",
      order: "desc",
    });
    await act(async () => button(renderer, "Next").props.onClick());
    assert.equal(requests[requests.length - 1].page, 2);
    await act(async () => navigate(-1));
    assert.equal(requests[requests.length - 1].page, 1);
    assert.match(
      renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
      /sort=winRate/,
    );
    await act(async () =>
      renderer.root.findByProps({ "aria-label": "Sort ascending" }).props.onClick(),
    );
    assert.equal(requests[requests.length - 1].order, "asc");
  } finally {
    cleanup(renderer);
  }
});
test("invalid URLs normalize, and vanished/out-of-range pages recover", async () => {
  const renderer = await mount("/leaderboard?sort=hacker&page=banana&status=anything&limit=999");
  try {
    assert.equal(requests[0].page, 1);
    assert.equal(requests[0].sort, "rating");
    assert.doesNotMatch(
      renderer.root.findByProps({ "data-testid": "location" }).children.join(""),
      /hacker|banana|anything|999/,
    );
    await act(async () => navigate("/leaderboard?page=999"));
    assert.equal(requests[requests.length - 1].page, 3);
  } finally {
    cleanup(renderer);
  }
});
test("loading skeleton stays until request settles; superseded responses cannot replace current rows", async () => {
  const pending: { query: LeaderboardQuery; resolve: (value: LeaderboardResponse) => void }[] = [];
  leaderboardApi.getLeaderboard = (query) =>
    new Promise((resolve) => pending.push({ query, resolve }));
  const renderer = await mount();
  try {
    assert.match(text(renderer), /Loading leaderboard/);
    assert.doesNotMatch(text(renderer), /No ranked players yet/);
    assert(renderer.root.findAllByProps({ className: "leaderboard-skeleton" }).length > 0);
    await act(async () => button(renderer, "Provisional").props.onClick());
    await act(async () =>
      pending[pending.length - 1].resolve(leaderboardFixture([provisionalPlayer()])),
    );
    await act(async () =>
      pending[0].resolve(
        leaderboardFixture([
          leaderboardPlayer({
            user: {
              id: "stale",
              username: "Stale",
              displayName: "Stale response",
              avatarUrl: null,
            },
          }),
        ]),
      ),
    );
    assert.doesNotMatch(text(renderer), /Stale response/);
    assert.match(text(renderer), /3 games until ranked/);
  } finally {
    cleanup(renderer);
  }
});
test("qualified/provisional empty, error/retry and custom configured threshold", async () => {
  leaderboardApi.getLeaderboard = async () => {
    throw new Error("secret");
  };
  const renderer = await mount();
  try {
    assert.match(text(renderer), /Unable to load leaderboard/);
    assert.doesNotMatch(text(renderer), /secret/);
    leaderboardApi.getLeaderboard = async () => ({
      ...leaderboardFixture([]),
      qualification: { minRatedGames: 9 },
    });
    await act(async () => button(renderer, "Retry").props.onClick());
    assert.match(text(renderer), /No ranked players yet/);
    assert.match(text(renderer), /after 9 rated matches/);
    await act(async () => button(renderer, "Provisional").props.onClick());
    assert.match(text(renderer), /No provisional rated players yet/);
    setLanguage("uk", null);
    assert.match(text(renderer), /Таблиця лідерів/);
  } finally {
    cleanup(renderer);
  }
});

test("incomplete rated history shows unavailable performance with an explanation", async () => {
  leaderboardApi.getLeaderboard = async () =>
    leaderboardFixture([
      leaderboardPlayer({
        wins: null,
        losses: null,
        draws: null,
        winRate: null,
        lastActivity: null,
        performanceAvailable: false,
      }),
    ]);
  const renderer = await mount();
  try {
    assert.match(text(renderer), /Rated results are incomplete/);
    assert.doesNotMatch(text(renderer), /60%|NaN/);
    assert.match(text(renderer), /1685/);
  } finally {
    cleanup(renderer);
  }
});
