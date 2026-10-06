import assert from "node:assert/strict";
import test from "node:test";
import { presentationSession, useGameStore } from "./store";

function hydrate(revision: number, streamId = "match") {
  const binding = { roomId: "room", recipient: JSON.stringify(["spectator", null, false]) };
  presentationSession.begin(binding);
  presentationSession.snapshot({ ...binding, streamId, revision });
  useGameStore.setState({ joined: true, roomId: "room", role: "spectator", seat: null,
    canControlTestRoom: false, pendingEventBatches: [], latestEventBatch: null,
    presentationHydration: "live", presentationSessionKey: presentationSession.key });
}

test("ordered ingress retains all batches before React commits and acknowledges only consumed batches", () => {
  const previous = useGameStore.getState();
  try {
    useGameStore.getState().resetGameState();
    hydrate(4999);
    const store = useGameStore.getState();
    for (const revision of [5000, 5001, 5002]) {
      store.applyActionResult(
        [{ type: "roundStarted", roundNumber: 2, eventId: `opaque-${revision}` }],
        revision,
        "match",
      );
    }
    const pending = useGameStore.getState().pendingEventBatches;
    assert.deepEqual(
      pending.map((batch) => batch.revision),
      [5000, 5001, 5002],
    );
    assert.deepEqual(
      pending.map((batch) => batch.events[0].eventId),
      ["opaque-5000", "opaque-5001", "opaque-5002"],
    );
    store.applyActionResult(
      [{ type: "roundStarted", roundNumber: 2, eventId: "opaque-5002" }],
      5002,
      "match",
    );
    assert.equal(useGameStore.getState().pendingEventBatches.length, 3);
    store.applyActionResult([], 5003, "match");
    store.acknowledgeEventBatches(pending);
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [5003],
    );
    store.applyActionResult([], 1, "new-match");
    assert.deepEqual(useGameStore.getState().pendingEventBatches.map(batch => batch.revision), [5003]);
    hydrate(0, "new-match");
    store.applyActionResult([], 1, "new-match");
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.revision),
      [1],
    );
    assert.equal(useGameStore.getState().eventStreamId, "new-match");
  } finally {
    useGameStore.setState(previous);
  }
});

test("debug_replay_does_not_use_live_revision_identity", () => {
  const previous = useGameStore.getState();
  try {
    useGameStore.getState().resetGameState();
    hydrate(119);
    const store = useGameStore.getState();
    store.applyActionResult(
      [{ type: "roundStarted", roundNumber: 2, eventId: "original-id" }],
      120,
      "match",
    );
    const live = useGameStore.getState().latestEventBatch;
    const watermarks = [presentationSession.streamId, presentationSession.baselineRevision,
      presentationSession.highestReceivedRevision, presentationSession.recentEventCount];
    store.replayLastEffects();
    assert.deepEqual([presentationSession.streamId, presentationSession.baselineRevision,
      presentationSession.highestReceivedRevision, presentationSession.recentEventCount], watermarks);
    const pending = useGameStore.getState().pendingEventBatches;
    const preview = pending[pending.length - 1];
    assert.match(preview.previewId!, /^preview:/);
    assert.equal(preview.events[0].eventId, "original-id");
    assert.equal(useGameStore.getState().latestEventBatch, live);
    assert.equal(useGameStore.getState().lastEventRevision, 120);
    assert.equal(useGameStore.getState().eventStreamId, "match");
    store.applyActionResult([], 121, "match");
    assert.equal(useGameStore.getState().lastEventRevision, 121);
    assert.deepEqual(
      useGameStore.getState().pendingEventBatches.map((batch) => batch.previewId ?? batch.revision),
      [120, preview.previewId, 121],
    );
  } finally {
    useGameStore.setState(previous);
  }
});
