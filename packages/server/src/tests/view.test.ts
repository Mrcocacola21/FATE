// packages/server/src/tests/view.test.ts

import assert from "assert";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
} from "rules";

function setupState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  return state;
}

function testHiddenEnemyOmitted() {
  let state = setupState();
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  );
  assert(enemy, "enemy unit should exist");

  state = {
    ...state,
    units: {
      ...state.units,
      [enemy!.id]: {
        ...enemy!,
        position: { col: 4, row: 4 },
        isStealthed: true,
        stealthTurnsLeft: 3,
      },
    },
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [enemy!.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(
    !view.units[enemy!.id],
    "stealthed unknown enemy should be omitted from view"
  );
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position"
  );

  console.log("view_hidden_enemy_omitted passed");
}

function testKnownStealthedEnemyUsesLastKnown() {
  let state = setupState();
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  );
  assert(enemy, "enemy unit should exist");

  state = {
    ...state,
    units: {
      ...state.units,
      [enemy!.id]: {
        ...enemy!,
        position: { col: 4, row: 4 },
        isStealthed: true,
        stealthTurnsLeft: 3,
      },
    },
    knowledge: {
      ...state.knowledge,
      P1: { ...state.knowledge.P1, [enemy!.id]: true },
    },
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [enemy!.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(
    !view.units[enemy!.id],
    "stealthed enemy should be hidden even if previously known"
  );
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position"
  );

  console.log("view_known_stealthed_enemy_uses_last_known passed");
}

function main() {
  testHiddenEnemyOmitted();
  testKnownStealthedEnemyUsesLastKnown();
}

main();
