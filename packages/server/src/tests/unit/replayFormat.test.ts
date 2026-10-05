import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyGame } from "rules";
import { deserializeReplayAction } from "../../replay/deserializeAction";
import { ReplayError } from "../../replay/replayError";
import { withAcceptedRevision } from "../../replay/stateRevision";

test("journal deserialization enforces revision, actor, type and format without persistence", () => {
  const row = { matchId: "fixture", revision: 1, actorSeat: "P1" as const, actionType: "setReady", actionPayload: { type: "setReady", player: "P1", ready: true } };
  const before = structuredClone(row);
  assert.deepEqual(deserializeReplayAction(row).action, row.actionPayload);
  assert.deepEqual(row, before);
  for (const revision of [0, -1, 1.5, Infinity, 2147483648]) assert.throws(() => deserializeReplayAction({ ...row, revision }), ReplayError);
  assert.throws(() => deserializeReplayAction({ ...row, actorSeat: "P2" }), ReplayError);
  assert.throws(() => deserializeReplayAction({ ...row, actionType: "unknown" }), ReplayError);
  assert.throws(() => deserializeReplayAction({ ...row, actionPayload: { ...row.actionPayload, unexpected: true } }), ReplayError);
  assert.throws(() => deserializeReplayAction({ ...row, actionPayload: { ...row.actionPayload, _replay: { formatVersion: 999 } } }), error => error instanceof ReplayError && error.code === "UNSUPPORTED_ACTION_FORMAT");
});

test("accepted final revision belongs to first terminal transition and does not mutate inputs", () => {
  const previous = createEmptyGame();
  const ended = { ...previous, phase: "ended" as const, gameOver: {
    winnerPlayerId: "P1" as const, loserPlayerId: "P2" as const,
    reason: "allEnemyUnitsDefeated" as const, endedAtTurn: 1, endedAtRevision: 0,
  } };
  const stamped = withAcceptedRevision(previous, ended, 42);
  assert.equal(stamped.gameOver?.endedAtRevision, 42);
  assert.equal(ended.gameOver.endedAtRevision, 0);
  assert.equal(withAcceptedRevision(stamped, stamped, 43), stamped);
});
