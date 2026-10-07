import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveredGameEvent, LiveEventBatch, PlayerView } from "rules";
import {
  PresentationSession,
  MAX_PREBASELINE_BATCHES,
  MAX_RECENT_EVENT_IDS,
  presentationBatchIsCurrent,
  presentationBatchHasExpired,
  MAX_PRESENTATION_AGE_MS,
} from "./presentationSession";
import { advanceVisualResolution, createVisualResolutionState } from "./visualResolution";

const binding = { roomId: "room", recipient: "P1" };
const snapshot = (revision: number, streamId = "S") => ({ ...binding, streamId, revision });
const event = (eventId: string): Extract<DeliveredGameEvent, { type: "roundStarted" }> => ({
  type: "roundStarted",
  roundNumber: 2,
  eventId,
});
const batch = (
  revision: number,
  events: DeliveredGameEvent[] = [event(`e${revision}`)],
  streamId = "S",
): LiveEventBatch => ({ revision, streamId, events });
function session(revision?: number) {
  const result = new PresentationSession();
  result.begin(binding);
  if (revision !== undefined) result.snapshot(snapshot(revision));
  return result;
}

test("initial_snapshot_establishes_silent_baseline", () => {
  const s = session();
  assert.deepEqual(s.snapshot(snapshot(100)), []);
  assert.equal(s.hydration, "live");
  assert.equal(s.baselineRevision, 100);
  assert.deepEqual(s.receive(batch(100), binding), []);
});

test("reconnect_snapshot_suppresses_old_results", () => {
  const s = session(100);
  const accepted = s.receive(batch(101), binding)[0];
  s.begin(binding);
  assert.equal(accepted.presentationToken?.cancelled, true);
  s.snapshot(snapshot(200));
  for (const revision of [199, 200]) assert.deepEqual(s.receive(batch(revision), binding), []);
  assert.equal(s.receive(batch(201), binding).length, 1);
  assert.equal(s.receive(batch(201), binding).length, 0);
});

test("live_room_state_does_not_suppress_same_revision_result", () => {
  const s = session(100);
  s.snapshot(snapshot(101));
  assert.equal(s.baselineRevision, 100);
  assert.equal(s.highestReceivedRevision, 100);
  assert.equal(s.receive(batch(101), binding).length, 1);
});

test("duplicate_action_result_is_processed_once", () => {
  const s = session(100);
  const received = batch(101);
  assert.equal(s.receive(received, binding)[0].events.length, 1);
  assert.deepEqual(s.receive(received, binding), []);
});

test("duplicate_event_id_inside_rebroadcast_is_processed_once", () => {
  const s = session(100);
  s.receive(batch(101, [event("same")]), binding);
  const received = s.receive(batch(102, [event("same"), event("new"), event("new")]), binding);
  assert.deepEqual(
    received[0].events.map((e) => e.eventId),
    ["new"],
  );
  // Equal payloads with different IDs remain distinct events.
  assert.equal(s.receive(batch(103, [event("another")]), binding)[0].events.length, 1);
});

test("multiple_fast_batches_are_delivered_in_order_with_revision_gaps", () => {
  const s = session(299);
  const received = [300, 301, 302, 310].flatMap((revision) => s.receive(batch(revision), binding));
  assert.deepEqual(
    received.map((b) => b.revision),
    [300, 301, 302, 310],
  );
  assert.deepEqual(s.receive(batch(305), binding), []);
});

test("prebaseline_results_are_buffered_then_filtered_and_sorted", () => {
  const s = session();
  for (const revision of [401, 400]) assert.deepEqual(s.receive(batch(revision), binding), []);
  assert.equal(s.bufferedBatchCount, 2);
  assert.deepEqual(
    s.snapshot(snapshot(400)).map((b) => b.revision),
    [401],
  );
  assert.equal(s.bufferedBatchCount, 0);
  const sorted = session();
  for (const revision of [403, 401, 402]) sorted.receive(batch(revision), binding);
  assert.deepEqual(
    sorted.snapshot(snapshot(400)).map((b) => b.revision),
    [401, 402, 403],
  );
});

for (const [name, nextBinding] of [
  ["room_change_clears_old_session", { roomId: "B", recipient: "P1" }],
  ["role_change_clears_old_private_presentation", { roomId: "room", recipient: "spectator" }],
] as const)
  test(name, () => {
    const s = session(100);
    const old = s.receive(batch(101), binding)[0];
    s.begin(nextBinding);
    assert.equal(presentationBatchIsCurrent(old), false);
    assert.equal(s.recentEventCount, 0);
    assert.equal(s.bufferedBatchCount, 0);
    assert.deepEqual(s.receive(batch(102), binding), []);
    s.snapshot({ ...nextBinding, streamId: "S", revision: 103 });
    assert.equal(s.receive(batch(104), nextBinding).length, 1);
  });

test("recipient_change_during_hydration_drops_old_private_buffer", () => {
  const s = session();
  s.receive(batch(101), binding);
  assert.deepEqual(s.snapshot({ ...snapshot(100), recipient: "spectator" }), []);
  assert.equal(s.recentEventCount, 0);
});

test("stream_change_resets_revision_domain_and_ignores_old_stream", () => {
  const s = session(900);
  const oldToken = s.token;
  s.snapshot(snapshot(3, "S2"));
  assert.equal(oldToken.cancelled, true);
  assert.equal(s.baselineRevision, 3);
  assert.equal(s.receive(batch(4, undefined, "S2"), binding).length, 1);
  assert.deepEqual(s.receive(batch(901), binding), []);
  assert.equal(s.highestReceivedRevision, 4);
});

test("future_stream_results_are_ignored_until_snapshot_hydration", () => {
  const s = session(100);
  assert.deepEqual(s.receive(batch(1, undefined, "S2"), binding), []);
  assert.equal(s.streamId, "S");
  s.snapshot(snapshot(1, "S2"));
  assert.equal(s.receive(batch(2, undefined, "S2"), binding).length, 1);
});

test("deferred_event_survives_newer_received_revision", () => {
  const s = session(499);
  const view = { units: {}, pendingCombatQueueCount: 0 } as unknown as PlayerView;
  let resolution = createVisualResolutionState({ batch: null, view, enabled: true });
  const deferred = { ...event("A"), chainId: "chain", deferVisuals: true };
  const complete: DeliveredGameEvent = {
    type: "combatVisualBatchReady",
    chainId: "chain",
    visualBatchId: "chain",
    isChainComplete: true,
    deferVisuals: false,
    eventId: "completion",
  };
  for (const received of [batch(500, [deferred]), batch(501), batch(502), batch(503, [complete])]) {
    for (const accepted of s.receive(received, binding)) {
      resolution = advanceVisualResolution(resolution, { batch: accepted, view, enabled: true });
    }
  }
  assert.equal(s.highestReceivedRevision, 503);
  assert.deepEqual(
    resolution.visualBatch?.events.map((e) => e.eventId),
    ["A"],
  );
  assert.equal(resolution.deferredVisualsByChainId.size, 0);
  assert.deepEqual(s.receive(batch(503, [complete]), binding), []);
});

test("buffers_are_bounded_and_evicted_ids_do_not_allow_ancient_revision_replay", () => {
  const s = session();
  for (let revision = 1; revision <= MAX_PREBASELINE_BATCHES * 2; revision++)
    s.receive(batch(revision), binding);
  assert.equal(s.bufferedBatchCount, MAX_PREBASELINE_BATCHES);
  s.snapshot(snapshot(0));
  for (let revision = 129; revision < MAX_RECENT_EVENT_IDS + 200; revision++)
    s.receive(batch(revision), binding);
  assert.equal(s.recentEventCount, MAX_RECENT_EVENT_IDS);
  assert.deepEqual(s.receive(batch(1), binding), []);
});

test("cancelled_and_suspended_presentation_work_can_be_dropped", () => {
  const s = session(100);
  const accepted = s.receive(batch(101), binding)[0];
  assert.equal(
    presentationBatchHasExpired(accepted, accepted.receivedAt! + MAX_PRESENTATION_AGE_MS + 1),
    true,
  );
  assert.equal(presentationBatchHasExpired(accepted, accepted.receivedAt!), false);
  s.begin(binding);
  assert.equal(presentationBatchIsCurrent(accepted), false);
});


test("phase4_semantics_survive_ingress_without_reusing_gameplay_ids_for_delivery", () => {
  const s=session(100);
  const events:DeliveredGameEvent[]=[
    {type:"rollResolved",eventId:"delivery-1",rollId:"roll-7",rollKind:"attack_attackerRoll",rollerPlayerId:"P1",unitId:"caster",
      rollIndex:0,dice:[5,4],sides:6,total:9,abilityId:"asgoreFireball",abilityUseId:"ability-use-2",chainId:"combat-chain-3"},
    {type:"rollResolved",eventId:"delivery-2",rollId:"roll-8",rollKind:"attack_defenderRoll",rollerPlayerId:"P2",unitId:"target",
      rollIndex:0,dice:[1,2],sides:6,total:3,abilityId:"asgoreFireball",abilityUseId:"ability-use-2",chainId:"combat-chain-3"},
    {type:"unitMoved",eventId:"delivery-3",unitId:"caster",from:{col:1,row:1},to:{col:1,row:3},provenance:{kind:"tralala"},
      abilityId:"riverTraLaLa",abilityUseId:"ability-use-4"},
    {type:"snareTriggered",eventId:"delivery-4",unitId:"target",cell:{col:1,row:3},immobilized:true},
  ];
  const received=s.receive(batch(101,events),binding);
  assert.equal(received.length,1);assert.deepEqual(received[0].events,events);
  assert.equal(received[0].events.length,4,"shared ability/chain IDs must not deduplicate separate dice events");
  assert.deepEqual(s.receive(batch(101,events),binding),[]);
  s.begin(binding);s.snapshot(snapshot(102));assert.deepEqual(s.receive(batch(101,events),binding),[]);
});
