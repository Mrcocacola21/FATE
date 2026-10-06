import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { attachArmy, createDefaultArmy, createEmptyGame, evUnitMoved, SeededRNG, type GameEvent } from "rules";
import { identifyAcceptedEvents, projectDeliveryEvents } from "../../eventDelivery";
import { applyGameAction, createGameRoomWithId, restoreGameRoom, deleteGameRoom } from "../../store";
import { applyTestRoomCommand } from "../../testRoom/applyTestCommand";
import { serializeMatchSnapshot, deserializeMatchSnapshot } from "../../persistence/matchSnapshot";
import { toAcceptedActionRecord, toPersistedEvents } from "../../persistence/acceptedAction";
import { toActionHistoryDto } from "../../services/matchActionService";
import { createReplayFixture } from "../replayTestSupport";
import { MemoryMatchPersistence } from "../matchTestSupport";
import { MatchLifecycle } from "../../persistence/matchLifecycle";
import type { MatchSnapshot, MatchAction } from "@prisma/client";

function room() {
  return createGameRoomWithId(randomUUID(), { seed: 37, hostConnId: "host", publish: false });
}

test("revision_survives_bounded_action_log", () => {
  const previous = process.env.MAX_LOG_EVENTS;
  process.env.MAX_LOG_EVENTS = "3";
  try {
    const game = room();
    const revisions: number[] = [];
    for (let index = 0; index < 12; index++) {
      const result = applyGameAction(
        game,
        { type: "setReady", player: "P1", ready: index % 2 === 0 },
        "P1",
      );
      assert(result.ok);
      revisions.push(result.revision!);
      assert.equal(result.streamId, game.streamId);
    }
    assert.equal(game.actionLog.length, 3);
    assert.equal(game.revision, 12);
    assert.deepEqual(
      revisions,
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      game.actionLog.map((entry) => entry.revision),
      [10, 11, 12],
    );
  } finally {
    if (previous === undefined) delete process.env.MAX_LOG_EVENTS;
    else process.env.MAX_LOG_EVENTS = previous;
  }
});

test("recovery_continues_revision and stream_id_survives_recovery", () => {
  const source = createReplayFixture("classic");
  const saved = source.history.get(20)!;
  const checkpoint = deserializeMatchSnapshot(JSON.parse(JSON.stringify(saved)) as MatchSnapshot);
  const game = restoreGameRoom({
    roomId: source.room.id,
    matchId: source.match.id,
    seed: source.room.seed,
    gameMode: "classic",
    matchType: "CASUAL",
    lobbyName: "Recovered",
    origin: "MANUAL",
    hostSeat: "P2",
    createdAt: source.match.createdAt,
    participants: {
      P1: { userId: randomUUID(), username: "p1", displayName: "P1" },
      P2: { userId: randomUUID(), username: "p2", displayName: "P2" },
    },
    recovered: {
      matchId: source.match.id,
      revision: checkpoint.revision,
      state: checkpoint.state,
      rngState: checkpoint.rngState,
      draftState: null,
      figureSets: {},
      base: { type: "snapshot", revision: checkpoint.revision },
      actionsApplied: 0,
      verification: "checkpoint_loaded",
    },
  });
  assert.equal(game.streamId, source.match.id);
  assert.equal(game.streamId, source.room.streamId);
  assert.equal(game.actionLog.length, 0);
  assert.equal(game.revision, 20);
  const next = source.actions.find((action) => action.revision === 21)!;
  const { _replay, ...payload } = next.actionPayload as Record<string, unknown>;
  const result = applyGameAction(
    game,
    payload as Parameters<typeof applyGameAction>[1],
    next.actorSeat!,
  );
  assert(result.ok);
  assert.equal(result.revision, 21);
  assert.equal(result.streamId, source.match.id);
  assert.equal(serializeMatchSnapshot(game).revision, 21);
  assert.equal(game.rng instanceof SeededRNG, true);
});

test("same_event_id_for_all_recipients and duplicate_broadcast_preserves_event_id", () => {
  const game = room();
  const events = identifyAcceptedEvents([
    {
      type: "stakesPlaced",
      owner: "P1",
      positions: [{ col: 2, row: 3 }],
      hiddenFromOpponent: true,
    },
  ]);
  const deliveries = (["P1", "P2", "spectator"] as const).map((recipient) =>
    projectDeliveryEvents(game.state, events, recipient),
  );
  assert.equal(deliveries[0][0].type, "stakesPlaced");
  assert.equal(deliveries[1][0].type, "hiddenSetupCompleted");
  for (const projected of deliveries) assert.equal(projected[0].eventId, events[0].eventId);
  assert.deepEqual(projectDeliveryEvents(game.state, events, "P2"), deliveries[1]);
  assert.deepEqual(projectDeliveryEvents(game.state, events, "spectator"), deliveries[2]);
});

test("event-time movement authorization survives delivery identification and omits hidden paths", () => {
  const state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  const unit = Object.values(state.units)[0];
  state.units[unit.id] = { ...unit, position: { col: 3, row: 4 }, isStealthed: true };
  const movement = evUnitMoved(state, { unitId: unit.id, from: { col: 3, row: 4 }, to: { col: 4, row: 5 } });
  const deliveries = identifyAcceptedEvents([movement]);
  const visibleEnd = { ...state, units: { ...state.units, [unit.id]: { ...state.units[unit.id], isStealthed: false, position: { col: 4, row: 5 } } } };
  assert.deepEqual(projectDeliveryEvents(visibleEnd, deliveries, "P2"), []);
  assert.deepEqual(projectDeliveryEvents(visibleEnd, deliveries, "spectator"), []);
  const owner = projectDeliveryEvents(visibleEnd, deliveries, "P1");
  assert.equal(owner[0].eventId, deliveries[0].eventId);
  assert.deepEqual(Object.getOwnPropertySymbols(owner[0]), []);
  assert(!JSON.stringify(owner).includes("recipients"));
  const publicMove = identifyAcceptedEvents([evUnitMoved(visibleEnd, { unitId: unit.id, from: { col: 4, row: 5 }, to: { col: 5, row: 6 } })]);
  const opponent = projectDeliveryEvents(state, publicMove, "P2");
  assert.equal(opponent[0].eventId, publicMove[0].eventId);
});

test("different_real_events_get_different_ids and persistence retains accepted IDs", () => {
  const game = createGameRoomWithId(randomUUID(), { roomMode: "test", seed: 37, publish: false });
  const event: GameEvent = { type: "turnStarted", player: "P1", turnNumber: 2 };
  const first = identifyAcceptedEvents([event]);
  const second = identifyAcceptedEvents([event]);
  assert.notEqual(first[0].eventId, second[0].eventId);
  assert.match(first[0].eventId, /^[0-9a-f-]{36}$/);
  assert.equal("eventId" in event, false, "rules event objects are untouched");
  assert.deepEqual(toPersistedEvents(first), first);

  // Capture a real accepted start action, then round-trip its canonical JSON journal.
  const source = room();
  source.matchId = randomUUID();
  source.streamId = source.matchId;
  source.state = {
    ...source.state,
    seats: { P1: true, P2: true },
    playersReady: { P1: true, P2: true },
  };
  const result = applyGameAction(source, { type: "startGame" }, "P1");
  assert(result.ok);
  assert(result.events.length > 0);
  const twin = room();
  twin.state = {
    ...twin.state,
    seats: { P1: true, P2: true },
    playersReady: { P1: true, P2: true },
  };
  const otherAccepted = applyGameAction(twin, { type: "startGame" }, "P1");
  assert(otherAccepted.ok);
  const meaning = (items: typeof result.events) => items.map(({ eventId, ...event }) => event);
  assert.deepEqual(meaning(result.events), meaning(otherAccepted.events));
  const allIds = [...result.events, ...otherAccepted.events].map((item) => item.eventId);
  assert.equal(
    new Set(allIds).size,
    allIds.length,
    "identical real gameplay payloads have distinct IDs",
  );
  const entry = source.actionLog.at(-1)!;
  assert.deepEqual(entry.events, result.events);
  const saved = JSON.parse(JSON.stringify(toAcceptedActionRecord(source, entry)));
  assert.deepEqual(
    saved.events.map((item: { eventId: string }) => item.eventId),
    result.events.map((item) => item.eventId),
  );
  const history = toActionHistoryDto(
    {
      events: first,
      revision: 1,
      actorSeat: "P1",
      actorUserId: null,
      actionType: "unitStartTurn",
      createdAt: new Date(),
    } as unknown as MatchAction,
    "P1",
  );
  assert.equal(history.events[0].eventId, first[0].eventId);

  const rejected = applyGameAction(source, { type: "endTurn" }, "P1");
  assert.equal(rejected.ok, false);
  assert.equal(source.revision, result.revision);
  assert.equal(game.revision, 0);
});

test("new_match_gets_new_stream_id including room reuse and debug timeline replacement", () => {
  const id = randomUUID();
  const first = createGameRoomWithId(id, { publish: false });
  const second = createGameRoomWithId(id, { publish: false });
  assert.notEqual(first.streamId, second.streamId);
  const sandbox = createGameRoomWithId(id, { roomMode: "test", publish: false });
  const oldStream = sandbox.streamId;
  const result = applyTestRoomCommand(sandbox, { type: "debugClearBoard" });
  assert(result.command.ok);
  assert.notEqual(sandbox.streamId, oldStream);
  assert.equal(result.command.streamId, sandbox.streamId);
});

test("persisted new matches use their existing Match IDs as stream IDs", async () => {
  const lifecycle = new MatchLifecycle({ info() {}, error() {} }, new MemoryMatchPersistence());
  const first = await lifecycle.createRoom({ seed: 37 });
  const second = await lifecycle.createRoom({ seed: 37 });
  try {
    assert.equal(first.streamId, first.matchId);
    assert.equal(second.streamId, second.matchId);
    assert.notEqual(first.streamId, second.streamId);
  } finally {
    deleteGameRoom(first.id);
    deleteGameRoom(second.id);
    await lifecycle.close();
  }
});
