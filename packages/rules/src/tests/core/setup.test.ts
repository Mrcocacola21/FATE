import {
  applyAction,
  assert,
  attachArmy,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  getHeroMeta,
  HERO_GRAND_KAISER_ID,
  HERO_REGISTRY,
  HERO_VLAD_TEPES_ID,
  resolveAllPendingRolls,
  resolvePendingRollOnce,
  SeededRNG,
  toPlacementState,
} from "../helpers/testUtils";
export function testPlacementToBattleAndTurnOrder() {
  const rng = new SeededRNG(12345);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = toPlacementState(state, "P1");

  // simulate simple alternating placement to reach battle
  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

  let p1i=0,p2i=0;
  while (state.phase === "placement") {
    const current = state.currentPlayer;
    const nextUnit = Object.values(state.units).find(u => u.owner === current && !u.position && u.isAlive);
    if (!nextUnit) { state = applyAction(state, { type: "endTurn" } as any, rng).state; continue; }
    const pos = current === "P1" ? p1coords[p1i++] : p2coords[p2i++];
    state = applyAction(state, { type: "placeUnit", unitId: nextUnit.id, position: pos } as any, rng).state;
  }

  // After placement we must be in battle and have turnOrder length 14
  assert(state.phase === "battle", "phase should be battle");
  assert(state.turnOrder.length === 14, "turnOrder length should be 14");
  // startingUnitId should equal first placed unit
  assert(state.startingUnitId === state.turnOrder[state.turnOrderIndex], "starting unit must be first in turnOrder");

  console.log("testPlacementToBattleAndTurnOrder passed");
}


export function testLobbyReadyAndStartRequiresBothReady() {
  const rng = new SeededRNG(500);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };

  const start1 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    !start1.state.pendingRoll,
    "startGame should not request initiative without both ready"
  );

  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;

  const start2 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    !start2.state.pendingRoll,
    "startGame should not request initiative until both ready"
  );

  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;

  const start3 = applyAction(state, { type: "startGame" } as any, rng);
  assert(
    start3.state.pendingRoll?.kind === "initiativeRoll",
    "startGame should request initiative roll when both ready"
  );
  assert(
    start3.state.pendingRoll?.player === "P1",
    "initiative roll should start with P1"
  );
  assert(start3.state.phase === "lobby", "phase should remain lobby during rolls");

  console.log("testLobbyReadyAndStartRequiresBothReady passed");
}


export function testInitiativeRollSequenceNoAutoroll() {
  const rng = new SeededRNG(501);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;
  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;

  state = applyAction(state, { type: "startGame" } as any, rng).state;
  assert(
    state.pendingRoll?.player === "P1",
    "startGame should request P1 initiative roll"
  );
  assert(
    state.initiative.P1 === null && state.initiative.P2 === null,
    "initiative should not be set before rolls"
  );

  const afterP1 = resolvePendingRollOnce(state, rng);
  assert(
    afterP1.state.pendingRoll?.player === "P2",
    "P2 roll should be requested after P1 resolves"
  );
  assert(
    afterP1.state.initiative.P1 !== null &&
      afterP1.state.initiative.P2 === null,
    "P1 initiative should be set after first roll only"
  );

  console.log("testInitiativeRollSequenceNoAutoroll passed");
}


export function testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement() {
  const rng = new SeededRNG(502);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);
  state = applyAction(state, { type: "lobbyInit", host: "P1" } as any, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(
    state,
    { type: "setReady", player: "P1", ready: true } as any,
    rng
  ).state;
  state = applyAction(
    state,
    { type: "setReady", player: "P2", ready: true } as any,
    rng
  ).state;
  state = applyAction(state, { type: "startGame" } as any, rng).state;

  const resolved = resolveAllPendingRolls(state, rng);
  const finalState = resolved.state;

  assert(finalState.phase === "placement", "phase should switch to placement");
  assert(
    finalState.initiative.winner !== null,
    "initiative winner should be set"
  );
  assert(
    finalState.placementFirstPlayer === finalState.initiative.winner,
    "placementFirstPlayer should match initiative winner"
  );
  assert(
    finalState.currentPlayer === finalState.initiative.winner,
    "currentPlayer should start as initiative winner"
  );

  console.log("testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement passed");
}


export function testGetHeroMetaReturnsCorrectData() {
  const meta = getHeroMeta(HERO_VLAD_TEPES_ID);
  assert(meta, "Vlad meta should exist");
  assert(meta?.mainClass === "spearman", "Vlad mainClass should be spearman");
  assert(meta?.baseStats.hp === 7, "Vlad base HP should be 7");

  console.log("getHeroMeta_returns_correct_data passed");
}


export function testHeroRegistryContainsPlayableHeroes() {
  const required = [
    HERO_GRAND_KAISER_ID,
    HERO_VLAD_TEPES_ID,
    "base-assassin",
    "base-archer",
    "base-berserker",
    "base-rider",
    "base-spearman",
    "base-trickster",
    "base-knight",
  ];
  for (const id of required) {
    assert(HERO_REGISTRY[id], `hero registry should include ${id}`);
  }

  console.log("hero_registry_contains_all_playable_heroes passed");
}
