import assert from "node:assert/strict";
import { applyAction, createEmptyGame } from "../../index";
import { makeRngSequence } from "../helpers/testUtils";

export function testForfeitMatch() {
  const rng = makeRngSequence([]);
  const base = createEmptyGame();

  for (const reason of ["surrender", "disconnect"] as const) {
    // A roll the absent player owes must not hold the result back.
    const waiting = { ...base, phase: "battle" as const, pendingRoll: { id: "r", kind: "initiativeRoll", player: "P2" } } as typeof base;
    const { state, events, rejectionReason } = applyAction(waiting, { type: "forfeitMatch", player: "P2", reason }, rng);
    assert.equal(rejectionReason, undefined);
    assert.equal(state.phase, "ended");
    assert.equal(state.pendingRoll, null);
    assert.equal(state.gameOver?.winnerPlayerId, "P1");
    assert.equal(state.gameOver?.loserPlayerId, "P2");
    assert.equal(state.gameOver?.reason, reason);
    assert.deepEqual(events.map(event => event.type), ["gameEnded"]);

    // A finished match cannot be lost again.
    const again = applyAction(state, { type: "forfeitMatch", player: "P1", reason }, rng);
    assert.equal(again.state, state);
    assert(again.rejectionReason);
  }
  console.log("forfeit_match_ends_over_pending_rolls passed");
}
