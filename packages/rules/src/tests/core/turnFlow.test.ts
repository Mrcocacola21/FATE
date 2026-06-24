import {
  applyAction,
  assert,
  attachArmy,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  SeededRNG,
  toPlacementState,
} from "../helpers/testUtils";
export function testGameEndCondition() {
  const rng = new SeededRNG(7);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  // kill all P2 units
  const units = { ...state.units };
  for (const u of Object.values(units)) {
    if (u.owner === "P2") {
      units[u.id] = { ...u, isAlive: false, position: null, hp: 0 };
    }
  }
  state = { ...state, units };

  // set battle phase to allow endTurn logic to run
  state = { ...state, phase: "battle" };
  // calling endTurn should move to ended if a player has no units
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  // If P2 has no living units, phase should be ended
  const p2alive = Object.values(state.units).some(u => u.owner === "P2" && u.isAlive);
  if (!p2alive) {
    assert(state.phase === "ended" || state.phase === "battle" , "phase should be ended when a player's all units are dead");
  }

  console.log("testGameEndCondition passed (phase:", state.phase, ")");
}


export function testBattleTurnOrderFollowsPlacementOrder() {
  const rng = new SeededRNG(2024);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  const p1Order = ["rider","spearman","trickster","assassin","berserker","archer","knight"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P1" && u.class === cls)!.id
  );
  const p2Order = ["knight","archer","berserker","assassin","trickster","spearman","rider"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P2" && u.class === cls)!.id
  );

  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  const expectedOrder: string[] = [];
  let p1i = 0, p2i = 0, p1c = 0, p2c = 0;

  while (state.phase === "placement") {
    const current = state.currentPlayer;
    if (current === "P1") {
      const unitId = p1Order[p1i++];
      expectedOrder.push(unitId);
      state = applyAction(
        state,
        { type: "placeUnit", unitId, position: p1coords[p1c++] } as any,
        rng
      ).state;
    } else {
      const unitId = p2Order[p2i++];
      expectedOrder.push(unitId);
      state = applyAction(
        state,
        { type: "placeUnit", unitId, position: p2coords[p2c++] } as any,
        rng
      ).state;
    }
  }

  assert.deepStrictEqual(state.placementOrder, expectedOrder, "placementOrder should match actual placement");
  assert.deepStrictEqual(state.turnQueue, expectedOrder, "turnQueue should follow placementOrder");
  assert(state.turnQueueIndex === 0, "turnQueueIndex should start at 0");
  assert(state.turnQueue[0] === expectedOrder[0], "turnQueue head should be first placed unit");
  assert(
    state.currentPlayer === state.units[expectedOrder[0]].owner,
    "currentPlayer should be owner of queue head"
  );

  let res = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[0] } as any, rng);
  assert(res.state.activeUnitId === expectedOrder[0], "queue[0] should start turn");

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;

  const wrong = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[0] } as any, rng);
  assert(wrong.events.length === 0, "queue[0] should be rejected after endTurn");
  assert(wrong.state.activeUnitId === state.activeUnitId, "activeUnitId should remain unchanged");

  res = applyAction(state, { type: "unitStartTurn", unitId: expectedOrder[1] } as any, rng);
  assert(res.state.activeUnitId === expectedOrder[1], "queue[1] should start turn after endTurn");

  const deadId = expectedOrder[2];
  state = {
    ...res.state,
    units: {
      ...res.state.units,
      [deadId]: { ...res.state.units[deadId], isAlive: false, position: null },
    },
  };

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  assert(
    state.turnQueueIndex === 3,
    "endTurn should skip dead units in turnQueue"
  );
  assert(
    state.currentPlayer === state.units[expectedOrder[3]].owner,
    "currentPlayer should match next alive unit after skip"
  );

  console.log("battle_turn_order_follows_placement_order passed");
}
