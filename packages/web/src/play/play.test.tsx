import assert from "node:assert/strict";
import test from "node:test";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { MatchmakingPanel } from "../matchmaking/MatchmakingPanel";
import { queue } from "../matchmaking/store";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";
import { ApiError } from "../api/client";
import { BotChallenge, parseBotMatch } from "./botMatch";
import { opponentName } from "../matches/presentation";
import { translate } from "../i18n";

const alice = {
  id: "alice",
  username: "Alice",
  displayName: null,
  avatarUrl: null,
  email: "test@example.test",
  role: "USER" as const,
  createdAt: "2026-10-03T00:00:00Z",
};

test("a Casual search shows no rating or range, only that nothing is at stake", async () => {
  const original = authStore.getState();
  let panel!: ReactTestRenderer;
  setLanguage("en", null);
  queue.owner("alice");
  authStore.setState({ user: alice, status: "authenticated" });
  queue.event({
    type: "matchmakingStatus",
    revision: 1,
    status: {
      status: "QUEUED",
      joinedAt: new Date().toISOString(),
      waitMs: 5000,
      rating: 1512,
      currentRange: 400,
      gameMode: "standard",
      available: true,
      matchType: "CASUAL",
    },
  });
  try {
    await act(async () => {
      panel = create(
        <MemoryRouter>
          <MatchmakingPanel matchType="RATED" />
        </MemoryRouter>,
      );
    });
    const text = JSON.stringify(panel.toJSON());
    assert.match(text, /Casual battle/, "the panel follows the queue the search is in");
    assert.match(text, /Rating and calibration do not change/);
    assert.doesNotMatch(text, /1112|1912/, "no rating range for a Casual search");
  } finally {
    act(() => panel?.unmount());
    queue.owner(null);
    authStore.setState(original, true);
  }
});

test("a missed Casual match pauses only the Casual search button", async () => {
  const original = authStore.getState();
  let panel!: ReactTestRenderer;
  setLanguage("en", null);
  queue.owner("alice");
  authStore.setState({ user: alice, status: "authenticated" });
  queue.event({
    type: "matchmakingStatus",
    revision: 1,
    status: {
      status: "NOT_QUEUED",
      casualPenaltyUntil: new Date(Date.now() + 30_000).toISOString(),
    },
  });
  try {
    const find = (matchType: "RATED" | "CASUAL") => {
      act(() => {
        panel = create(
          <MemoryRouter>
            <MatchmakingPanel matchType={matchType} />
          </MemoryRouter>,
        );
      });
      const button = panel.root
        .findAllByType("button")
        .find((b) => JSON.stringify(b.children).match(/Find/))!;
      const disabled = button.props.disabled as boolean;
      act(() => panel.unmount());
      return disabled;
    };
    assert.equal(find("CASUAL"), true);
    assert.equal(find("RATED"), false);
  } finally {
    queue.owner(null);
    authStore.setState(original, true);
  }
});

test("the bot challenge creates the match for the chosen difficulty and mode", async () => {
  const original = authStore.getState();
  setLanguage("en", null);
  authStore.setState({ user: alice, status: "authenticated" });
  const calls: unknown[][] = [];
  let view!: ReactTestRenderer;
  try {
    await act(async () => {
      view = create(
        <MemoryRouter>
          <BotChallenge
            difficulty="archmage"
            gameMode="draft"
            create={async (...args) => {
              calls.push(args);
              throw new ApiError("MATCHMAKING_IN_QUEUE");
            }}
          />
        </MemoryRouter>,
      );
    });
    const button = view.root.findByProps({ "data-testid": "bot-challenge" });
    await act(async () => {
      button.props.onClick();
    });
    assert.deepEqual(calls, [["archmage", "draft"]]);
    assert.match(JSON.stringify(view.toJSON()), /alert/, "a search in progress is reported");
  } finally {
    act(() => view?.unmount());
    authStore.setState(original, true);
  }
});

test("bot match responses are checked, and the bot is named by its difficulty", () => {
  const valid = {
    roomId: "room",
    matchId: "match",
    seat: "P2",
    gameMode: "classic",
    difficulty: "apprentice",
    matchType: "CASUAL",
  };
  assert.equal(parseBotMatch(valid).seat, "P2");
  assert.throws(() => parseBotMatch({ ...valid, difficulty: "god" }));
  assert.throws(() => parseBotMatch({ ...valid, seat: "spectator" }));
  setLanguage("uk", null);
  assert.equal(
    opponentName({ bot: "archmage", opponent: { displayName: "Archmage" } }, translate),
    "Архімаг (бот)",
  );
  assert.equal(opponentName({ bot: null, opponent: { displayName: "Olena" } }, translate), "Olena");
  setLanguage("en", null);
});
