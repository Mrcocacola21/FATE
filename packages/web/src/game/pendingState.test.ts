import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerView } from "rules";
import {
  getPendingRollForPlayer,
  getPlayerIdForViewer,
  hasAuthoritativeMatchStarted,
  isPendingRollForPlayer,
} from "./pendingState";

const pendingP2 = {
  id: "roll-2",
  kind: "initiativeRoll" as const,
  player: "P2" as const,
};

const lobbyView = {
  phase: "lobby",
  pendingRoll: null,
  initiative: { P1: null, P2: null, winner: null },
} as Pick<PlayerView, "phase" | "pendingRoll" | "initiative">;

test("the authoritative seat maps P2 to the pending initiative actor", () => {
  const playerId = getPlayerIdForViewer("spectator", "P2");
  assert.equal(playerId, "P2");
  assert.equal(isPendingRollForPlayer(pendingP2, playerId), true);
  assert.equal(isPendingRollForPlayer(pendingP2, "P1"), false);
});

test("public initiative metadata remains actionable for its player", () => {
  assert.deepEqual(getPendingRollForPlayer(null, pendingP2, "P2"), {
    ...pendingP2,
    context: { step: "P2" },
  });
  assert.equal(getPendingRollForPlayer(null, pendingP2, "P1"), null);
});

test("pending state outranks the lobby phase when selecting the mobile screen", () => {
  assert.equal(hasAuthoritativeMatchStarted(lobbyView, null), false);
  assert.equal(hasAuthoritativeMatchStarted(lobbyView, pendingP2), true);
  assert.equal(
    hasAuthoritativeMatchStarted(
      {
        ...lobbyView,
        initiative: { P1: 11, P2: null, winner: null },
      },
      null,
    ),
    true,
  );
});
