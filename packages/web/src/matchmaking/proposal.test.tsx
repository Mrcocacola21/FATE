import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { parseMatchmakingStatus } from "../api/matchmakingApi";
import { authStore } from "../auth/authStore";
import { setLanguage } from "../i18n";
import { MatchmakingPanel } from "./MatchmakingPanel";
import { MatchProposal } from "./MatchProposal";
import { createQueueStore, queue } from "./store";
import type { MatchmakingStatus } from "./types";

const offer = {
  status: "MATCH_PROPOSED" as const,
  joinedAt: "2026-11-19T10:00:00.000Z",
  gameMode: "draft" as const,
  expiresAt: "2026-11-19T10:00:20.000Z",
  acceptMs: 20000,
  accepted: false,
  opponentAccepted: false,
};

test("the decoder takes an offered match and a search ban, and rejects malformed ones", () => {
  assert.deepEqual(parseMatchmakingStatus(offer), offer);
  assert.deepEqual(
    parseMatchmakingStatus({ status: "NOT_QUEUED", penaltyUntil: "2026-11-19T10:05:00.000Z" }),
    { status: "NOT_QUEUED", penaltyUntil: "2026-11-19T10:05:00.000Z" },
  );
  assert.throws(() => parseMatchmakingStatus({ ...offer, accepted: "yes" }));
  assert.throws(() => parseMatchmakingStatus({ status: "NOT_QUEUED", penaltyUntil: "soon" }));
});

test("the offer counts down, and Accept and Decline reach the server", async () => {
  setLanguage("en", null);
  const calls: string[] = [];
  const answer = (status: MatchmakingStatus) => async () => status;
  const store = createQueueStore(
    {
      status: answer({ status: "NOT_QUEUED" }),
      join: answer({ status: "NOT_QUEUED" }),
      cancel: answer({ status: "NOT_QUEUED" }),
      rating: async () => 1500,
      accept: async () => {
        calls.push("accept");
        return { ...offer, accepted: true };
      },
      decline: async () => {
        calls.push("decline");
        return { status: "NOT_QUEUED", penaltyUntil: "2026-11-19T10:01:00.000Z" };
      },
    },
    async () => undefined,
  );
  store.owner("alice");
  await store.accept();
  assert.deepEqual(calls, ["accept"]);
  assert.equal(store.state.getState().status.status, "MATCH_PROPOSED");
  await store.decline();
  assert.deepEqual(calls, ["accept", "decline"]);
  assert.equal(store.state.getState().status.status, "NOT_QUEUED");

  let dialog!: ReactTestRenderer;
  await act(async () => {
    dialog = create(<MatchProposal offer={offer} />);
  });
  try {
    const text = JSON.stringify(dialog.toJSON());
    assert.match(text, /Match found/);
    assert.match(text, /20/);
    const buttons = dialog.root.findAllByType("button").map((b) => b.children.join(""));
    assert.deepEqual(buttons, ["Accept", "Decline"]);
    await act(async () => {
      dialog.update(
        <MatchProposal offer={{ ...offer, accepted: true, opponentAccepted: false }} />,
      );
    });
    const waiting = JSON.stringify(dialog.toJSON());
    assert.match(waiting, /Waiting for your opponent/);
    assert.equal(dialog.root.findAllByType("button").length, 0, "nothing left to press");
  } finally {
    act(() => dialog.unmount());
  }
});

test("a search ban shows how long is left and holds the Find button", async () => {
  const original = authStore.getState();
  setLanguage("en", null);
  queue.owner("bob");
  authStore.setState({
    user: {
      id: "bob",
      username: "Bob",
      displayName: null,
      avatarUrl: null,
      email: "bob@example.test",
      role: "USER" as const,
      createdAt: "2026-10-03T00:00:00Z",
    },
    status: "authenticated",
  });
  queue.event({
    type: "matchmakingStatus",
    revision: 1,
    status: { status: "NOT_QUEUED", penaltyUntil: new Date(Date.now() + 61_000).toISOString() },
  });
  let panel!: ReactTestRenderer;
  try {
    await act(async () => {
      panel = create(
        <MemoryRouter>
          <MatchmakingPanel />
        </MemoryRouter>,
      );
    });
    assert.match(JSON.stringify(panel.toJSON()), /search again in 1:0[01]/);
    const find = panel.root
      .findAllByType("button")
      .find((b) => b.children.includes("Find Rated Match"));
    assert.equal(find?.props.disabled, true);
  } finally {
    act(() => panel.unmount());
    queue.owner(null);
    authStore.setState(original);
  }
});
