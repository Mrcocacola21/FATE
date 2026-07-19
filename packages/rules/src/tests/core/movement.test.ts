import {
  applyAction,
  assert,
  attachArmy,
  coordKeys,
  createDefaultArmy,
  createEmptyGame,
  getBerserkerMovesForRoll,
  getTricksterMovesForRoll,
  initKnowledgeForOwners,
  resolveAllPendingRolls,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupBerserkerBattleState,
  setupKaiserState,
  toBattleState,
} from "../helpers/testUtils";
export function testCannotMoveTwicePerTurn() {
  const rng = new SeededRNG(300);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );
  const second = applyAction(
    first.state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 5 } } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second move should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    first.state,
    "state should be unchanged after second move"
  );

  console.log("cannot_move_twice_per_turn passed");
}


export function testTricksterMoveOptionsGeneratedAndUsed() {
  const rng = new SeededRNG(400);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const optionsInitial = applyAction(
    state,
    { type: "requestMoveOptions", unitId: trickster.id } as any,
    rng
  );
  const options = resolveAllPendingRolls(optionsInitial.state, rng);

  const moveEvent = options.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === trickster.id
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    typeof moveEvent.roll === "number",
    "moveOptionsGenerated should include roll for trickster"
  );

  const expected = getTricksterMovesForRoll(
    state,
    trickster.id,
    moveEvent.roll as number
  );

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "trickster legal moves should match roll"
  );

  assert(
    options.state.pendingMove && options.state.pendingMove.unitId === trickster.id,
    "pendingMove should be stored for trickster"
  );

  const rejected = applyAction(
    options.state,
    { type: "move", unitId: trickster.id, to: { col: 8, row: 8 } } as any,
    rng
  );
  assert.deepStrictEqual(
    rejected.state,
    options.state,
    "illegal Trickster destination should not mutate movement state"
  );
  assert(
    rejected.events.length === 0 &&
      rejected.state.units[trickster.id].turn.moveUsed === false,
    "illegal Trickster destination should not consume movement"
  );

  const dest = expected[0];
  const moved = applyAction(
    options.state,
    { type: "move", unitId: trickster.id, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "trickster move should resolve to a legal cell");
  assert(
    moved.state.units[trickster.id].position!.col === dest.col &&
      moved.state.units[trickster.id].position!.row === dest.row,
    "trickster should end on chosen legal cell"
  );
  assert(moved.state.pendingMove === null, "pendingMove should be cleared after move");

  console.log("trickster_move_options_generated_and_used passed");
}


export function testBerserkerMoveOptionsGeneratedAndUsed() {
  const rng = new SeededRNG(401);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const berserker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, berserker.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", berserker.id);
  state = initKnowledgeForOwners(state);

  const optionsInitial = applyAction(
    state,
    { type: "requestMoveOptions", unitId: berserker.id } as any,
    rng
  );
  const options = resolveAllPendingRolls(optionsInitial.state, rng);

  const moveEvent = options.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === berserker.id
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    typeof moveEvent.roll === "number",
    "moveOptionsGenerated should include roll for berserker"
  );

  const expected = getBerserkerMovesForRoll(
    state,
    berserker.id,
    moveEvent.roll as number
  );

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "berserker legal moves should match roll"
  );

  const dest = expected[0];
  const moved = applyAction(
    options.state,
    { type: "move", unitId: berserker.id, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "berserker move should resolve to a legal cell");
  assert(moved.state.pendingMove === null, "pendingMove should be cleared after move");

  console.log("berserker_move_options_generated_and_used passed");
}


export function testBerserkerMoveRoll1GeneratesTopRoof() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  assert(
    requested.state.pendingRoll?.kind === "moveBerserker",
    "berserker move should request a pending roll"
  );

  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 1 should generate the top roof"
  );

  const dest = expected[0];
  const moved = applyAction(
    resolved.state,
    { type: "move", unitId: setup.berserkerId, to: dest } as any,
    rng
  );

  const moveResolved = moved.events.find((e) => e.type === "unitMoved");
  assert(moveResolved, "berserker move should resolve to a legal cell");
  assert(
    moved.state.units[setup.berserkerId].turn.moveUsed,
    "berserker move should consume the move slot"
  );

  console.log("berserker_move_roll_1_generates_top_roof passed");
}


export function testBerserkerMoveRoll3GeneratesLeftVertical() {
  const rng = new SeededRNG(251);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 3, row: 4 },
    { col: 3, row: 5 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 3 should generate the left vertical line"
  );

  console.log("berserker_move_roll_3_generates_left_vertical passed");
}


export function testBerserkerMoveRoll5GeneratesMooreRadius1() {
  const rng = new SeededRNG(1112);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
    { col: 3, row: 4 },
    { col: 5, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 5 },
    { col: 5, row: 5 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 5 should generate Moore radius 1"
  );

  console.log("berserker_move_roll_5_generates_moore_radius1 passed");
}


export function testBerserkerMoveRoll6GeneratesStarShape() {
  const rng = new SeededRNG(1542);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
    { col: 5, row: 3 },
    { col: 3, row: 4 },
    { col: 5, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 5 },
    { col: 5, row: 5 },
    { col: 4, row: 2 },
    { col: 6, row: 2 },
    { col: 6, row: 4 },
    { col: 6, row: 6 },
    { col: 4, row: 6 },
    { col: 2, row: 6 },
    { col: 2, row: 4 },
    { col: 2, row: 2 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 6 should generate the star shape"
  );

  console.log("berserker_move_roll_6_generates_star_shape passed");
}


export function testBerserkerMoveFiltersOutOfBounds() {
  const rng = new SeededRNG(1542);
  const setup = setupBerserkerBattleState(0, 0);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 0, row: 1 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 0, row: 2 },
    { col: 2, row: 0 },
    { col: 2, row: 2 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "roll 6 should filter out-of-bounds cells"
  );

  console.log("berserker_move_filters_out_of_bounds passed");
}


export function testBerserkerMoveCannotEndOnAlly() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const ally = Object.values(setup.state.units).find(
    (u) => u.owner === "P1" && u.id !== setup.berserkerId
  )!;
  const stateWithAlly = setUnit(setup.state, ally.id, {
    position: { col: 5, row: 3 },
  });

  const requested = applyAction(
    stateWithAlly,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");

  const expected = [
    { col: 3, row: 3 },
    { col: 4, row: 3 },
  ];

  assert.deepStrictEqual(
    coordKeys(moveEvent.legalTo),
    coordKeys(expected),
    "ally-occupied destinations should be excluded"
  );

  console.log("berserker_move_cannot_end_on_ally passed");
}


export function testBerserkerMoveRequiresManualRollNoAutoroll() {
  const rng = new SeededRNG(1972);
  const setup = setupBerserkerBattleState(4, 4);

  const requested = applyAction(
    setup.state,
    { type: "requestMoveOptions", unitId: setup.berserkerId } as any,
    rng
  );

  assert(
    requested.state.pendingRoll?.kind === "moveBerserker",
    "requestMoveOptions should create pending roll"
  );
  assert(
    requested.state.pendingMove === null,
    "requestMoveOptions should not create move options before roll"
  );
  assert(
    requested.events.some((e) => e.type === "rollRequested"),
    "requestMoveOptions should emit rollRequested"
  );

  const resolved = resolvePendingRollOnce(requested.state, rng);
  const moveEvent = resolved.events.find(
    (e) => e.type === "moveOptionsGenerated" && e.unitId === setup.berserkerId
  );
  assert(moveEvent && moveEvent.type === "moveOptionsGenerated", "moveOptionsGenerated should be emitted");
  assert(
    resolved.state.pendingMove && resolved.state.pendingMove.unitId === setup.berserkerId,
    "pendingMove should be stored after roll"
  );
  assert(
    !resolved.events.some((e) => e.type === "unitMoved"),
    "resolving the roll should not move the unit"
  );

  console.log("berserker_move_requires_manual_roll_no_autoroll passed");
}


export function testTricksterMoveRequiresPendingOptions() {
  const rng = new SeededRNG(402);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: trickster.id, to: { col: 5, row: 5 } } as any,
    rng
  );

  assert(res.events.length === 0, "trickster move should be blocked without pending options");
  assert(
    res.state.units[trickster.id].position!.col === 4 &&
      res.state.units[trickster.id].position!.row === 4,
    "trickster should stay in place without pending options"
  );

  console.log("trickster_move_requires_pending_options passed");
}


export function testBerserkerMoveRequiresPendingRollAndGeneratesOptions() {
  const rng = new SeededRNG(7788);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaiser.id, mode: "berserker" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveBerserker",
    "berserker move should request a roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "berserker move should clear pending roll");
  const moveEvent = res.events.find((e) => e.type === "moveOptionsGenerated");
  assert(
    moveEvent && moveEvent.type === "moveOptionsGenerated",
    "move options should be generated after roll"
  );
  if (moveEvent && moveEvent.type === "moveOptionsGenerated") {
    assert(
      moveEvent.legalTo.length > 0,
      "berserker move should produce legal destinations"
    );
  }
  assert(
    (res.state.pendingMove?.legalTo.length ?? 0) > 0,
    "pendingMove should be populated after berserker roll"
  );

  console.log("berserker_move_requires_pending_roll_and_generates_options passed");
}
