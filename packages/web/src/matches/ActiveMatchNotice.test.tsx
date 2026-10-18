import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { authStore } from "../auth/authStore";
import { useGameStore } from "../store";
import { setLanguage } from "../i18n";
import { activeMatchApi, type ActiveMatch } from "./activeMatchApi";
import { ActiveMatchNotice } from "./ActiveMatchNotice";

test("active match offers authenticated rejoin and clears after server reconciliation", async () => {
  const auth = authStore.getState(), game = useGameStore.getState(), get = activeMatchApi.get;
  const joins: unknown[] = [];
  let match: ActiveMatch | null = { id: "match", roomId: "room", seat: "P2", rejoinable: true };
  let rendered!: ReactTestRenderer;
  try {
    setLanguage("en", null);
    authStore.setState({ status: "authenticated", user: {
      id: "player", username: "Player", displayName: null, avatarUrl: null,
      email: "player@example.test", role: "USER", createdAt: "2026-10-03T00:00:00Z",
    } });
    activeMatchApi.get = async () => match;
    useGameStore.setState({ joinError: null, joinRoom: async params => { joins.push(params); } });
    await act(async () => { rendered = create(<MemoryRouter><ActiveMatchNotice /></MemoryRouter>); });
    assert.match(JSON.stringify(rendered.toJSON()), /You have an active match/);
    await act(async () => rendered.root.findByType("button").props.onClick());
    assert.deepEqual(joins, [{ mode: "join", roomId: "room", role: "P2" }]);
    match = null;
    await act(async () => useGameStore.setState({ joinError: "MATCH_INTERRUPTED" }));
    assert.equal(rendered.toJSON(), null, "API null must clear cached match state");
    // The banner never grants or disables creation based on a cached match.
    assert.equal(rendered.root.findAllByType("button").length, 0);
  } finally {
    act(() => rendered?.unmount());
    authStore.setState(auth, true); useGameStore.setState(game, true); activeMatchApi.get = get;
    setLanguage("en", null);
  }
});
