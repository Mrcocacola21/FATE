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
  };

  const view = makePlayerView(state, "P1");
  assert(
    !view.units[enemy!.id],
    "stealthed unknown enemy should be omitted from view"
  );

  console.log("view_hidden_enemy_omitted passed");
}

function testKnownStealthedEnemyIncluded() {
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
  };

  const view = makePlayerView(state, "P1");
  assert(
    !!view.units[enemy!.id],
    "stealthed known enemy should be included in view"
  );
  assert(
    view.units[enemy!.id].charges &&
      Object.keys(view.units[enemy!.id].charges).length === 0,
    "stealthed known enemy should have charges masked"
  );

  console.log("view_known_stealthed_enemy_included passed");
}

function main() {
  testHiddenEnemyOmitted();
  testKnownStealthedEnemyIncluded();
}

main();
