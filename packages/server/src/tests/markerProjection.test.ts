import assert from "node:assert/strict";
import {
  createEmptyGame,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  type GameEvent,
  type GameState,
} from "rules";

const baseState = createEmptyGame();
const forestMarker = { owner: "P1" as const, position: { col: 4, row: 4 } };
const state: GameState = {
  ...baseState,
  forestMarkers: [forestMarker],
  forestMarker,
  stakeMarkers: [
    {
      id: "hidden-p1-stake",
      owner: "P1",
      position: { col: 2, row: 3 },
      createdAt: 1,
      isRevealed: false,
    },
    {
      id: "revealed-p1-stake",
      owner: "P1",
      position: { col: 5, row: 6 },
      createdAt: 2,
      isRevealed: true,
    },
  ],
};

const ownerView = makePlayerView(state, "P1");
const opponentView = makePlayerView(state, "P2");
const spectatorView = makeSpectatorView(state);

assert.deepEqual(ownerView.stakeMarkers, [
  { position: { col: 2, row: 3 }, isRevealed: false },
  { position: { col: 5, row: 6 }, isRevealed: true },
]);
assert.deepEqual(opponentView.stakeMarkers, [
  { position: { col: 5, row: 6 }, isRevealed: true },
]);
assert.deepEqual(spectatorView.stakeMarkers, [
  { position: { col: 5, row: 6 }, isRevealed: true },
]);
assert.deepEqual(opponentView.forestMarkers, [forestMarker]);
assert.deepEqual(spectatorView.forestMarkers, [forestMarker]);

const placedEvent: GameEvent = {
  type: "stakesPlaced",
  owner: "P1",
  positions: [{ col: 2, row: 3 }],
  hiddenFromOpponent: true,
};
assert.deepEqual(projectEventsForRecipient(state, [placedEvent], "P1"), [placedEvent]);
assert.deepEqual(projectEventsForRecipient(state, [placedEvent], "P2"), []);
assert.deepEqual(projectEventsForRecipient(state, [placedEvent], "spectator"), []);

const triggeredEvent: GameEvent = {
  type: "stakeTriggered",
  markerPos: { col: 5, row: 6 },
  unitId: "triggering-unit",
  damage: 1,
  stopped: true,
  stakeIdsRevealed: ["revealed-p1-stake"],
};
assert.deepEqual(projectEventsForRecipient(state, [triggeredEvent], "P2"), [triggeredEvent]);

console.log("marker_projection_hidden_stake_safety passed");
