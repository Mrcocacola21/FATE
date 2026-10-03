import assert from "node:assert/strict";
import test from "node:test";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { MatchmakingPanel } from "./MatchmakingPanel";
import { queue } from "./store";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";

test("Rated queue panel shows server range, elapsed time and accessible Cancel", async () => {
  const original = authStore.getState();
  let panel!: ReactTestRenderer;
  setLanguage("en", null);
  queue.owner("alice");
  authStore.setState({
    user: {
      id: "alice",
      username: "Alice",
      displayName: null,
      avatarUrl: null,
      email: "test@example.test",
      createdAt: "2026-10-03T00:00:00Z",
    },
    status: "authenticated",
  });
  queue.event({
    type: "matchmakingStatus",
    revision: 1,
    status: {
      status: "QUEUED",
      joinedAt: new Date().toISOString(),
      waitMs: 34000,
      rating: 1512,
      currentRange: 200,
      gameMode: "classic",
      available: true,
    },
  });
  try {
    await act(async () => {
      panel = create(
        <MemoryRouter>
          <MatchmakingPanel />
        </MemoryRouter>,
      );
    });
    const text = JSON.stringify(panel.toJSON());
    assert.match(text, /Searching for opponent/);
    assert.match(text, /1312/);
    assert.match(text, /1712/);
    assert.match(text, /00:34/);
    assert(panel.root.findAllByType("button").some((b) => b.children.includes("Cancel search")));
    assert(!text.includes("Estimated"));
    act(() =>
      queue.event({
        type: "matchmakingFound",
        revision: 2,
        status: {
          status: "MATCH_FOUND",
          roomId: "room",
          matchId: "match",
          seat: "P1",
          gameMode: "classic",
          matchType: "RATED",
          opponent: { displayName: "Opponent" },
        },
      }),
    );
    assert.match(JSON.stringify(panel.toJSON()), /Match found/);
    assert.match(JSON.stringify(panel.toJSON()), /Opponent/);
  } finally {
    act(() => panel?.unmount());
    queue.owner(null);
    authStore.setState(original, true);
  }
});
