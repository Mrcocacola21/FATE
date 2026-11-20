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
  matchType: "RATED" as const,
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

  // A very long name still sits under its seal, whole in the tooltip.
  const longName = "Wolfeschlegelsteinhausenbergerdorff_the_Unyielding_of_the_Northern_Marches";
  const mine = { name: longName, seal: "night-pact" as const };
  let dialog!: ReactTestRenderer;
  await act(async () => {
    dialog = create(<MatchProposal offer={offer} mine={mine} />);
  });
  try {
    const text = JSON.stringify(dialog.toJSON());
    assert.match(text, /Match found/);
    assert.match(text, /20/);
    const buttons = dialog.root.findAllByType("button").map((b) => b.children.join(""));
    assert.deepEqual(buttons, ["Accept", "Decline"]);
    await act(async () => {
      dialog.update(
        <MatchProposal offer={{ ...offer, accepted: true, opponentAccepted: false }} mine={mine} />,
      );
    });
    const waiting = JSON.stringify(dialog.toJSON());
    assert.match(waiting, /Waiting for your opponent/);
    // The buttons keep their place, so the card does not change size, but nothing is left to press.
    assert.ok(
      dialog.root.findAllByType("button").every((button) => button.props.disabled),
      "nothing left to press",
    );
    // The player's own seal is set under their name; the opponent's place stays hidden.
    const seal = (id: string) => dialog.root.findByProps({ "data-testid": id });
    assert.equal(seal("match-proposal-seal-mine").props["data-on"], true);
    assert.equal(seal("match-proposal-seal-mine").findAllByType("img").length, 1);
    assert.match(
      JSON.stringify(seal("match-proposal-seal-mine").findByType("figcaption").children),
      new RegExp(longName),
    );
    assert.equal(seal("match-proposal-seal-opponent").props["data-on"], undefined);
    assert.equal(seal("match-proposal-seal-opponent").findAllByType("img").length, 0);
    // Once the match is found the opponent stamps theirs, under their name.
    await act(async () => {
      dialog.update(
        <MatchProposal
          offer={{ ...offer, accepted: true, opponentAccepted: true }}
          sealed
          mine={mine}
          opponent={{ name: "Polina", seal: "serpent" }}
        />,
      );
    });
    assert.equal(seal("match-proposal-seal-opponent").props["data-on"], true);
    assert.match(seal("match-proposal-seal-opponent").findByType("img").props.src, /serpent/);
    assert.equal(
      seal("match-proposal-seal-opponent").findByType("figcaption").props.title,
      "Polina",
    );
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
