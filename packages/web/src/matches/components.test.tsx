import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router";
import { MatchHistoryPage, PublicMatchHistoryPage } from "../pages/MatchHistoryPage";
import { MatchDetailsPage } from "../pages/MatchDetailsPage";
import { RequireAuth } from "../auth/RequireAuth";
import { authStore } from "../auth/authStore";
import { matchApi } from "../api/matchApi";
import { replayApi } from "../api/replayApi";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { setLanguage, translate } from "../i18n";
import type {
  MatchDetails,
  MatchHistoryFilters,
  MatchHistoryItem,
  MatchHistoryResponse,
} from "./types";

const item: MatchHistoryItem = {
  id: "match-one",
  status: "FINISHED",
  matchType: "CASUAL",
  result: "WIN",
  seat: "P1",
  gameMode: "classic",
  createdAt: "2026-01-01T12:00:00Z",
  startedAt: "2026-01-01T12:01:00Z",
  finishedAt: "2026-01-01T12:04:00Z",
  durationMs: 180000,
  finishReason: "allEnemyUnitsDefeated",
  finalRevision: 42,
  turnCount: 18,
  opponent: {
    userId: "bob-id",
    seat: "P2",
    displayName: "Historical Bob",
    username: "Bob_now",
    avatarUrl: null,
  },
};
const response: MatchHistoryResponse = {
  items: [item],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};
const detail: MatchDetails = {
  ...item,
  winner: { userId: "alice-id", seat: "P1", displayName: "Historical Alice" },
  loser: item.opponent,
  participants: [
    {
      userId: "alice-id",
      seat: "P1",
      displayName: "Historical Alice",
      username: "Alice_now",
      avatarUrl: null,
      outcome: "WIN",
    },
    { ...item.opponent!, outcome: "LOSS" },
  ],
};
const originalAuth = authStore.getState();
const originalMatches = { ...matchApi },
  originalProfiles = { ...profileApi };
const originalReplay = { ...replayApi };
let renderer: ReactTestRenderer | undefined;
let navigate: NavigateFunction;
let location = "";
const calls: { userId: string; filters: MatchHistoryFilters }[] = [];

beforeEach(() => {
  replayApi.getMetadata = async () => {
    throw new ApiError("MATCH_NOT_REPLAYABLE", 409);
  };
  setLanguage("en", null);
  calls.length = 0;
  authStore.setState(
    {
      ...originalAuth,
      status: "authenticated",
      initialized: true,
      user: {
        id: "alice-id",
        email: "private@example.test",
        role: "USER",
        username: "Alice",
        displayName: null,
        avatarUrl: null,
        createdAt: item.createdAt,
      },
    },
    true,
  );
  matchApi.getUserMatches = async (userId, filters) => {
    calls.push({ userId, filters });
    return response;
  };
  matchApi.getMatchDetails = async () => detail;
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = undefined;
  Object.assign(matchApi, originalMatches);
  Object.assign(profileApi, originalProfiles);
  Object.assign(replayApi, originalReplay);
  authStore.setState(originalAuth, true);
});
function Probe() {
  navigate = useNavigate();
  const current = useLocation();
  location = current.pathname + current.search;
  return null;
}
async function mount(path = "/matches") {
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route
            path="/matches"
            element={
              <RequireAuth>
                <MatchHistoryPage />
              </RequireAuth>
            }
          />
          <Route path="/matches/:id" element={<MatchDetailsPage />} />
          <Route path="/users/:username/matches" element={<PublicMatchHistoryPage />} />
          <Route path="/login" element={<p>{translate("auth.login")}</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return renderer!;
}
function text() {
  return JSON.stringify(renderer?.toJSON());
}
function button(label: string) {
  const found = renderer!.root
    .findAllByType("button")
    .find((node) => node.children.join("") === label);
  assert(found, `button ${label}`);
  return found;
}

test("own history uses authenticated user ID, shows metadata and navigates to details", async () => {
  const view = await mount();
  assert.equal(calls[0].userId, "alice-id");
  for (const value of ["Win", "Historical Bob", "Classic", "3m 00s", "2026"])
    assert(text().includes(value), value);
  assert.doesNotMatch(text(), /private@example.test/);
  const link = view.root
    .findAllByType("a")
    .find((node) => node.props.href === "/matches/match-one");
  assert(link);
  await act(async () => link.props.onClick({ button: 0, preventDefault() {} }));
  assert.equal(location, "/matches/match-one");
  assert.match(text(), /Match details/);
});

test("result and mode filters reset page and preserve query through remount and back navigation", async () => {
  matchApi.getUserMatches = async (userId, filters) => {
    calls.push({ userId, filters });
    return {
      ...response,
      pagination: { page: filters.page, limit: 20, total: 120, totalPages: 6 },
    };
  };
  let view = await mount("/matches?page=5");
  await act(async () =>
    view.root.findByProps({ name: "result" }).props.onChange({ target: { value: "WIN" } }),
  );
  assert.equal(calls[calls.length - 1]?.filters.result, "WIN");
  assert.equal(calls[calls.length - 1]?.filters.page, 1);
  assert.match(location, /page=1/);
  assert.match(location, /result=WIN/);
  await act(async () =>
    view.root.findByProps({ name: "gameMode" }).props.onChange({ target: { value: "classic" } }),
  );
  assert.equal(calls[calls.length - 1]?.filters.gameMode, "classic");
  assert.equal(calls[calls.length - 1]?.filters.result, "WIN");
  const saved = location;
  await act(async () => {
    await navigate(-1);
  });
  assert.equal(calls[calls.length - 1]?.filters.gameMode, undefined);
  act(() => view.unmount());
  view = await mount(saved);
  assert.equal(view.root.findByProps({ name: "gameMode" }).props.value, "classic");
  assert.equal(view.root.findByProps({ name: "result" }).props.value, "WIN");
  assert.equal(calls[calls.length - 1]?.filters.gameMode, "classic");
});

test("pagination requests correct server pages, preserves filters and disables boundaries", async () => {
  matchApi.getUserMatches = async (userId, filters) => {
    calls.push({ userId, filters });
    return { ...response, pagination: { page: filters.page, limit: 20, total: 40, totalPages: 2 } };
  };
  await mount("/matches?result=LOSS");
  assert.equal(button("Previous").props.disabled, true);
  assert.equal(button("Next").props.disabled, false);
  await act(async () => button("Next").props.onClick());
  assert.equal(calls[calls.length - 1]?.filters.page, 2);
  assert.equal(calls[calls.length - 1]?.filters.result, "LOSS");
  assert.match(location, /page=2/);
  assert.equal(button("Next").props.disabled, true);
  await act(async () => button("Previous").props.onClick());
  assert.equal(calls[calls.length - 1]?.filters.page, 1);
});

test("out-of-range URL recovers to last available page", async () => {
  matchApi.getUserMatches = async (userId, filters) => {
    calls.push({ userId, filters });
    return {
      ...response,
      items: filters.page > 2 ? [] : [item],
      pagination: { page: filters.page, limit: 20, total: 30, totalPages: 2 },
    };
  };
  await mount("/matches?page=5");
  assert.deepEqual(
    calls.map((call) => call.filters.page),
    [5, 2],
  );
  assert.equal(location, "/matches?page=2");
  assert.match(text(), /Historical Bob/);
});

test("empty and filtered-empty states differ, invalid filters can be reset", async () => {
  matchApi.getUserMatches = async () => ({
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  });
  await mount();
  assert.match(text(), /No matches yet/);
  await act(async () => {
    await navigate("/matches?result=WIN");
  });
  assert.match(text(), /No matches match these filters/);
  await act(async () => {
    await navigate("/matches?page=-100");
  });
  assert.match(text(), /Check the match ID or history filters/);
  await act(async () => button("Reset filters").props.onClick());
  assert.equal(location, "/matches");
});

test("loading, network errors and retry remain local to history", async () => {
  let resolve!: (data: MatchHistoryResponse) => void;
  matchApi.getUserMatches = () =>
    new Promise((done) => {
      resolve = done;
    });
  await mount();
  assert.match(text(), /Loading matches/);
  assert.equal(renderer!.root.findAllByType("select").length, 2);
  await act(async () => resolve(response));
  assert.match(text(), /Historical Bob/);
  matchApi.getUserMatches = async () => {
    throw new ApiError("NETWORK_ERROR");
  };
  await act(async () => {
    await navigate("/matches?result=WIN");
  });
  assert.match(text(), /Unable to load matches/);
  matchApi.getUserMatches = async () => response;
  await act(async () => button("Try again").props.onClick());
  assert.match(text(), /Historical Bob/);
});

test("late responses from earlier filters cannot overwrite current history", async () => {
  let resolve!: (data: MatchHistoryResponse) => void;
  matchApi.getUserMatches = (_id, filters) =>
    filters.result
      ? Promise.resolve({ ...response, items: [{ ...item, result: "LOSS" }] })
      : new Promise((done) => {
          resolve = done;
        });
  await mount();
  await act(async () => {
    await navigate("/matches?result=LOSS");
  });
  await act(async () => resolve(response));
  const link = renderer!.root
    .findAllByType("a")
    .find((node) => node.props.href === "/matches/match-one")!;
  assert.match(
    JSON.stringify(link.children.map((node) => (typeof node === "string" ? node : node.children))),
    /Loss/,
  );
});

test("public user history resolves username to ID and uses the same list without login", async () => {
  authStore.setState({ user: null, status: "unauthenticated" });
  profileApi.getPublic = async (username) => ({
    id: "bob-id",
    username,
    displayName: "Current Bob",
    avatarUrl: null,
    createdAt: item.createdAt,
  });
  await mount("/users/Bob_now/matches?gameMode=classic");
  assert.equal(calls[0].userId, "bob-id");
  assert.equal(calls[0].filters.gameMode, "classic");
  assert.match(text(), /Historical Bob/);
  assert(renderer!.root.findAllByType("a").some((node) => node.props.href === "/users/Bob_now"));
  profileApi.getPublic = async () => {
    throw new ApiError("USER_NOT_FOUND", 404);
  };
  await act(async () => {
    await navigate("/users/Missing/matches");
  });
  assert.match(text(), /User not found/);
});

test("own history waits for session restoration and redirects unauthenticated visitors", async () => {
  authStore.setState({ status: "initializing", initialized: false, user: null });
  await mount();
  assert.equal(calls.length, 0);
  assert.match(text(), /Restoring session/);
  await act(async () => authStore.setState({ status: "unauthenticated", initialized: true }));
  assert.match(location, /^\/login\?returnTo=%2Fmatches/);
  assert.equal(calls.length, 0);
});

test("details display seats, historical names, outcomes, current profile links and finish metadata", async () => {
  await mount("/matches/match-one");
  for (const value of [
    "P1",
    "P2",
    "Historical Alice",
    "Historical Bob",
    "Win",
    "Loss",
    "3m 00s",
    "Final revision",
    "42",
    "Turns",
    "18",
    "All opposing units defeated",
  ])
    assert(text().includes(value), value);
  assert(renderer!.root.findAllByType("a").some((node) => node.props.href === "/users/Bob_now"));
  assert.doesNotMatch(text(), /actionPayload|rngState|rating|win rate/);
  assert(!text().includes(translate("replay.watch")), "legacy result has no replay data");
});

test("legacy details render nulls and draws without fabricated results", async () => {
  matchApi.getMatchDetails = async () => ({
    ...detail,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    turnCount: null,
    finalRevision: null,
    finishReason: null,
    winner: null,
    loser: null,
    participants: detail.participants.map((p) => ({
      ...p,
      username: null,
      avatarUrl: null,
      outcome: "DRAW",
    })),
  });
  await mount("/matches/legacy");
  assert.match(text(), /Not available/);
  assert.match(text(), /Draw/);
  assert.equal(renderer!.root.findAllByType("a").length, 0);
});

test("details handle loading, missing or unfinished matches, errors and retry", async () => {
  let reject!: (error: unknown) => void;
  matchApi.getMatchDetails = () =>
    new Promise((_resolve, fail) => {
      reject = fail;
    });
  await mount("/matches/missing");
  assert.match(text(), /Loading matches/);
  await act(async () => reject(new ApiError("MATCH_NOT_FOUND", 404)));
  assert.match(text(), /Match not found/);
  matchApi.getMatchDetails = async () => {
    throw new ApiError("MATCH_NOT_FINISHED");
  };
  await act(async () => button("Try again").props.onClick());
  assert.match(text(), /not finished yet/);
  matchApi.getMatchDetails = async () => detail;
  await act(async () => button("Try again").props.onClick());
  assert.match(text(), /Historical Alice/);
});
