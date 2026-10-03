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
import { createEmptyGame, makeReplayView } from "rules";
import { MatchReplayPage } from "../pages/MatchReplayPage";
import { MatchDetailsPage } from "../pages/MatchDetailsPage";
import {
  replayApi,
  parseReplayMetadata,
  parseReplayState,
  createReplayApi,
} from "../api/replayApi";
import { matchApi } from "../api/matchApi";
import { createApiClient, ApiError } from "../api/client";
import { translate, setLanguage } from "../i18n";
import { replayRevisions, parseRevision, ReplayStateCache, REPLAY_CACHE_LIMIT } from "./navigation";
import type { ReplayMetadata, ReplayStateResponse } from "./types";
import { authStore } from "../auth/authStore";

const metadata: ReplayMetadata = {
  matchId: "replay-one",
  status: "FINISHED",
  gameMode: "classic",
  initialRevision: 0,
  finalRevision: 4,
  participants: (["P1", "P2"] as const).map((seat) => ({
    seat,
    userId: null,
    displayName: `Historical ${seat}`,
    username: null,
    avatarUrl: null,
    outcome: seat === "P1" ? "WIN" : "LOSS",
  })),
  winnerSeat: "P1",
  finishReason: "allEnemyUnitsDefeated",
  startedAt: null,
  finishedAt: null,
  durationMs: 1000,
  timeline: [1, 2, 4].map((revision) => ({
    revision,
    actorSeat: "P1",
    actionType: "endTurn",
    createdAt: "2026-01-01T12:00:00Z",
  })),
};
const response = (revision: number): ReplayStateResponse => ({
  matchId: metadata.matchId,
  revision,
  state: makeReplayView(createEmptyGame()),
  action: metadata.timeline.find((a) => a.revision === revision) ?? null,
});
const originalReplay = { ...replayApi },
  originalMatch = { ...matchApi },
  originalAuth = authStore.getState();
let renderer: ReactTestRenderer | undefined, navigate: NavigateFunction;
let location = "";
const calls: number[] = [],
  signals: (AbortSignal | undefined)[] = [];
function Probe() {
  navigate = useNavigate();
  const value = useLocation();
  location = value.pathname + value.search;
  return null;
}
beforeEach(() => {
  setLanguage("en", null);
  calls.length = 0;
  signals.length = 0;
  replayApi.getMetadata = async () => metadata;
  replayApi.getState = async (_id, revision, signal) => {
    calls.push(revision);
    signals.push(signal);
    return response(revision);
  };
});
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = undefined;
  Object.assign(replayApi, originalReplay);
  Object.assign(matchApi, originalMatch);
  authStore.setState(originalAuth, true);
});
async function mount(path = "/matches/replay-one/replay", details = false) {
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <Routes>
          <Route path="/matches/:id/replay" element={<MatchReplayPage />} />
          {details && <Route path="/matches/:id" element={<MatchDetailsPage />} />}
        </Routes>
      </MemoryRouter>,
    );
  });
}
async function click(label: string) {
  await act(async () =>
    renderer!.root.findByProps({ "aria-label": translate(`replay.${label}`) }).props.onClick(),
  );
}
const text = () => JSON.stringify(renderer?.toJSON());

test("page loads only one board, historical participants/result, and disables gameplay", async () => {
  await mount();
  assert(text().includes("Historical P1"));
  assert(text().includes("Historical P2"));
  assert(text().includes("Historical P1 won"));
  assert(text().includes("Revision 0 / 4"));
  assert.deepEqual(calls, [0]);
  // The shared board renders native disabled buttons; invoking click handlers remains inert.
  const boardButtons = renderer!.root.findAll(
    (node) => node.type === "button" && node.props.disabled === true && node.props.onMouseEnter,
  );
  assert.equal(boardButtons.length, 81);
  for (const cell of boardButtons) cell.props.onClick();
  assert.deepEqual(calls, [0]);
  assert(
    renderer!.root.findByProps({ "aria-label": translate("replay.beginning") }).props.disabled,
  );
  assert(renderer!.root.findByProps({ "aria-label": translate("replay.previous") }).props.disabled);
});

test("previous/next follow actual timeline gaps and beginning/end use endpoints", async () => {
  await mount("/matches/replay-one/replay?revision=2");
  assert.deepEqual(calls, [2]);
  await click("next");
  assert(location.endsWith("revision=4"));
  assert(text().includes("Revision 4 / 4"));
  assert(renderer!.root.findByProps({ "aria-label": translate("replay.end") }).props.disabled);
  await click("previous");
  assert(location.endsWith("revision=2"));
  await click("beginning");
  assert(location.endsWith("revision=0"));
  await click("end");
  assert(location.endsWith("revision=4"));
  assert.deepEqual(calls, [2, 4, 0], "recent results are reused");
});

test("jump rejects gaps and malformed input without fetching; URL and history retain selection", async () => {
  await mount();
  const submit = async (value: string) => {
    await act(async () =>
      renderer!.root.findByProps({ id: "replay-jump" }).props.onChange({ target: { value } }),
    );
    await act(async () =>
      renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
    );
  };
  for (const value of ["3", "-1", "999", "1.5", "invalid", ""]) await submit(value);
  assert.deepEqual(calls, [0]);
  assert(text().includes(translate("replay.invalidRevision")));
  await submit("2");
  assert(location.endsWith("revision=2"));
  assert.deepEqual(calls, [0, 2]);
  await act(async () => navigate(-1));
  assert(!location.includes("revision="));
  assert(text().includes("Revision 0 / 4"));
  await act(async () => navigate("/matches/replay-one/replay?revision=3"));
  assert.deepEqual(calls, [0, 2]);
  assert(text().includes(translate("replay.invalidRevision")));
});

test("slow obsolete state cannot replace newest revision, even if transport ignores abort", async () => {
  let resolveSlow: (value: ReplayStateResponse) => void = () => undefined;
  replayApi.getState = async (_id, revision, signal) => {
    calls.push(revision);
    signals.push(signal);
    if (revision === 1)
      return new Promise((resolve) => {
        resolveSlow = resolve;
      });
    return response(revision);
  };
  await mount();
  await click("next");
  assert.deepEqual(calls, [0, 1]);
  await click("next");
  assert(text().includes("Revision 2 / 4"));
  assert(signals[1]?.aborted);
  await act(async () => resolveSlow(response(1)));
  assert(text().includes("Revision 2 / 4"));
  assert(location.endsWith("revision=2"));
});

test("scrubbing debounces requests and maps slider indices to real revisions", async () => {
  await mount();
  await act(async () => {
    const range = renderer!.root.findByProps({ id: "replay-scrubber" });
    for (const value of ["1", "2", "3"]) range.props.onChange({ target: { value } });
  });
  assert.deepEqual(calls, [0]);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 220));
  });
  assert.deepEqual(calls, [0, 4]);
});

test("100 actions do not trigger mass prefetch; cache stays bounded", async () => {
  const long = {
    ...metadata,
    finalRevision: 100,
    timeline: Array.from({ length: 100 }, (_, i) => ({ ...metadata.timeline[0], revision: i + 1 })),
  };
  replayApi.getMetadata = async () => long;
  await mount();
  assert.deepEqual(calls, [0]);
  const cache = new ReplayStateCache();
  for (let i = 0; i < 100; i++) {
    cache.set(response(i));
    assert(cache.size <= REPLAY_CACHE_LIMIT);
  }
  assert.equal(cache.get(0), undefined);
  assert(cache.get(99));
  assert.deepEqual(replayRevisions(metadata), [0, 1, 2, 4]);
  assert.equal(parseRevision("3", [0, 1, 2, 4]), null);
});

test("controlled unavailable and state errors keep metadata/controls available", async () => {
  replayApi.getState = async () => {
    throw new ApiError("REPLAY_INTEGRITY_ERROR", 500);
  };
  await mount();
  assert(text().includes(translate("replay.integrityError")));
  assert(text().includes("Historical P1"));
});

test("Match Details enables replay only after successful availability metadata", async () => {
  authStore.setState({ status: "authenticated" });
  matchApi.getMatchDetails = async () => ({
    id: metadata.matchId,
    status: "FINISHED",
    gameMode: "classic",
    createdAt: "2026-01-01",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    finishReason: null,
    finalRevision: 4,
    turnCount: null,
    winner: null,
    loser: null,
    participants: metadata.participants,
  });
  await mount("/matches/replay-one", true);
  assert(text().includes(translate("replay.watch")));
  act(() => renderer?.unmount());
  replayApi.getMetadata = async () => {
    throw new ApiError("MATCH_NOT_REPLAYABLE", 409);
  };
  await mount("/matches/replay-one", true);
  assert(!text().includes(translate("replay.watch")));
  assert(text().includes(translate("replay.unavailable")));
});

test("explicit decoders reject malformed DTOs and API passes cancellation signal", async () => {
  assert.deepEqual(parseReplayMetadata(metadata), metadata);
  assert.deepEqual(parseReplayState(response(0)), response(0));
  assert.throws(
    () => parseReplayMetadata({ ...metadata, timeline: [...metadata.timeline].reverse() }),
    /INVALID_RESPONSE/,
  );
  assert.throws(
    () => parseReplayState({ ...response(0), state: { ...response(0).state, boardSize: -1 } }),
    /INVALID_RESPONSE/,
  );
  const seen: { url: string; signal?: AbortSignal | null }[] = [];
  const controller = new AbortController();
  const api = createReplayApi(
    createApiClient("https://api.example.test", async (url, init) => {
      seen.push({ url: String(url), signal: init?.signal });
      return new Response(JSON.stringify(response(2)), { status: 200 });
    }),
  );
  await api.getState(metadata.matchId, 2, controller.signal);
  assert(seen[0].url.endsWith("/replay/state?revision=2"));
  assert.equal(seen[0].signal, controller.signal);
  await assert.rejects(api.getState(metadata.matchId, 4), /INVALID_RESPONSE/);
});
