import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getLegalIntents,
  initKnowledgeForOwners,
  makePlayerView,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
export function testRiderPathHitsStealthed() {
  const rng = new SeededRNG(42);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  // place minimal subset: place rider and two enemies inline
  const rider = Object.values(state.units).find(u => u.owner === "P1" && u.class === "rider")!;
  const enemy1 = Object.values(state.units).find(u => u.owner === "P2" && u.class === "spearman")!;
  const enemy2 = Object.values(state.units).find(u => u.owner === "P2" && u.class === "archer")!;

  state = { ...state, units: { ...state.units } };
  state.units[rider.id] = { ...rider, position: { col: 0, row: 2 }, hasMovedThisTurn: false, hasActedThisTurn: false };
  state.units[enemy1.id] = { ...enemy1, position: { col: 2, row: 2 }, isStealthed: true, stealthTurnsLeft: 3 };
  state.units[enemy2.id] = { ...enemy2, position: { col: 4, row: 2 }, isStealthed: true, stealthTurnsLeft: 3 };

  state = { ...state, phase: "battle", currentPlayer: "P1", activeUnitId: rider.id };

  // start rider turn
  state = applyAction(state, { type: "unitStartTurn", unitId: rider.id } as any, rng).state;
  // move across and hit both (path attacks are now pending rolls)
  let moveRes = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 5, row: 2 } } as any,
    rng
  );
  moveRes = resolveAllPendingRolls(moveRes.state, rng);
  state = moveRes.state;

  // Both enemies should have been at least revealed (isStealthed=false) or dead
  const e1 = state.units[enemy1.id];
  const e2 = state.units[enemy2.id];
  assert(e1 == null || e1.isStealthed === false, "enemy1 should be revealed or dead");
  assert(e2 == null || e2.isStealthed === false, "enemy2 should be revealed or dead");

  console.log("testRiderPathHitsStealthed passed");
}


export function testAssassinAttackFromStealth() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 2, row: 2 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, defender.id, {
    position: { col: 2, row: 3 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.attackerId === attacker.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.damage === 2, "stealth attack damage should be 2");
  }

  assert(
    next.units[attacker.id].isStealthed === false,
    "assassin should be revealed after attack"
  );
  assert(
    next.knowledge["P2"][attacker.id] === true,
    "assassin should be revealed in enemy knowledge"
  );

  console.log("assassin_attack_from_stealth passed");
}


export function testAssassinAttackWithoutStealth() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 2, row: 2 },
    isStealthed: false,
    stealthTurnsLeft: 0,
  });
  state = setUnit(state, defender.id, {
    position: { col: 2, row: 3 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.attackerId === attacker.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(
      attackEvent.damage === attacker.attack,
      "non-stealth attack damage should be base attack"
    );
  }

  assert(
    next.units[attacker.id].isStealthed === false,
    "assassin should remain not stealthed"
  );

  console.log("assassin_attack_without_stealth passed");
}


export function testSearchRevealsOnlyInRadius() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const nearEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const farEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, nearEnemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, farEnemy.id, {
    position: { col: 8, row: 8 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;
  const events = resolved.events;
  const revealEvents = events.filter((e) => e.type === "stealthRevealed");

  assert(
    next.units[nearEnemy.id].isStealthed === false,
    "near enemy should be revealed"
  );
  assert(
    next.units[farEnemy.id].isStealthed === true,
    "far enemy should remain hidden"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === nearEnemy.id),
    "reveal event should be emitted for near enemy"
  );

  console.log("search_reveals_only_in_radius passed");
}


export function testSearchUpdatesOnlyPlayerKnowledge() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const next = resolved.state;

  assert(
    next.knowledge["P1"][enemy.id] === true,
    "searcher knowledge should include revealed enemy"
  );
  assert.deepStrictEqual(
    next.knowledge["P2"],
    knowledgeBefore["P2"],
    "other player knowledge should remain unchanged"
  );

  console.log("search_updates_only_player_knowledge passed");
}


export function testSearchStealthRollsLogged() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const searchEvent = resolved.events.find((e) => e.type === "searchStealth");
  assert(
    searchEvent && searchEvent.type === "searchStealth",
    "searchStealth event should be emitted"
  );
  assert(searchEvent.rolls && searchEvent.rolls.length === 1, "searchStealth should include rolls");
  if (searchEvent.rolls) {
    assert(
      searchEvent.rolls[0].targetId === hidden.id,
      "searchStealth roll should reference hidden unit"
    );
    assert(searchEvent.rolls[0].roll === 5, "searchStealth roll should match RNG");
    assert(searchEvent.rolls[0].success === true, "searchStealth roll should succeed");
  }

  console.log("search_stealth_rolls_logged passed");
}


export function testSearchActionBlockedAfterAttack() {
  const rng = new SeededRNG(1113);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, hidden.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const attackInitial = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    rng
  );
  const attackResolved = resolveAllPendingRolls(attackInitial.state, rng);

  const searchAttempt = applyAction(
    attackResolved.state,
    { type: "searchStealth", unitId: attacker.id, mode: "action" } as any,
    rng
  );

  assert(searchAttempt.events.length === 0, "search(action) should be blocked after attack");
  assert.deepStrictEqual(
    searchAttempt.state,
    attackResolved.state,
    "state should be unchanged when search(action) is blocked"
  );

  console.log("search_action_blocked_after_attack passed");
}


export function testSearchMoveBlockedAfterMove() {
  const rng = new SeededRNG(1114);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, mover.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, { position: { col: 8, row: 8 } });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const moveRes = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 4, row: 5 } } as any,
    rng
  );

  let afterMove = moveRes.state;
  afterMove = setUnit(afterMove, hidden.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  const searchAttempt = applyAction(
    afterMove,
    { type: "searchStealth", unitId: mover.id, mode: "move" } as any,
    rng
  );

  assert(searchAttempt.events.length === 0, "search(move) should be blocked after move");
  assert.deepStrictEqual(
    searchAttempt.state,
    afterMove,
    "state should be unchanged when search(move) is blocked"
  );

  console.log("search_move_blocked_after_move passed");
}


export function testSearchActionWorksBeforeAttack() {
  const rng = new SeededRNG(1115);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "searchStealth",
    "search(action) should request a roll before attack"
  );

  const resolved = resolveAllPendingRolls(initial.state, rng);
  assert(
    resolved.state.units[searcher.id].turn.actionUsed === true,
    "search(action) should consume action slot"
  );

  console.log("search_action_works_before_attack passed");
}


export function testSearchMoveWorksBeforeMove() {
  const rng = new SeededRNG(1116);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "searchStealth",
    "search(move) should request a roll before move"
  );

  const resolved = resolveAllPendingRolls(initial.state, rng);
  assert(
    resolved.state.units[searcher.id].turn.moveUsed === true,
    "search(move) should consume move slot"
  );

  console.log("search_move_works_before_move passed");
}


export function testSearchButtonsEnabledOnFreshUnitTurn() {
  const rng = new SeededRNG(1117);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);
  state = { ...state, activeUnitId: null };

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: searcher.id } as any,
    rng
  );

  let intents = getLegalIntents(started.state, "P1");
  assert(intents.canSearchMove === true, "search(move) should be legal on fresh turn");
  assert(intents.canSearchAction === true, "search(action) should be legal on fresh turn");
  assert(intents.searchMoveReason === undefined, "no search(move) reason expected");
  assert(intents.searchActionReason === undefined, "no search(action) reason expected");

  const searchMove = applyAction(
    started.state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );

  intents = getLegalIntents(searchMove.state, "P1");
  assert(intents.canSearchMove === false, "search(move) should be disabled after use");
  assert(intents.canSearchAction === true, "search(action) should remain after move search");

  const searchAction = applyAction(
    searchMove.state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );

  intents = getLegalIntents(searchAction.state, "P1");
  assert(intents.canSearchAction === false, "search(action) should be disabled after use");

  const ended = applyAction(
    searchAction.state,
    { type: "endTurn" } as any,
    rng
  );

  const restarted = applyAction(
    { ...ended.state, activeUnitId: null },
    { type: "unitStartTurn", unitId: searcher.id } as any,
    rng
  );

  intents = getLegalIntents(restarted.state, "P1");
  assert(intents.canSearchMove === true, "search(move) should reset on new turn");
  assert(intents.canSearchAction === true, "search(action) should reset on new turn");

  console.log("search_buttons_enabled_on_fresh_unit_turn passed");
}


export function testAttackAlreadyRevealedUnit() {
  const rng = new SeededRNG(12);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 3, row: 3 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 3, row: 4 },
    isStealthed: false,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P1: { ...state.knowledge["P1"], [defender.id]: true },
    },
  };
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const events = resolved.events;
  const revealEvents = events.filter((e) => e.type === "stealthRevealed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  assert(revealEvents.length === 0, "no stealthRevealed events expected");
  assert.deepStrictEqual(
    resolved.state.knowledge,
    knowledgeBefore,
    "knowledge should remain consistent"
  );

  console.log("attack_already_revealed_unit passed");
}


export function testAdjacencyRevealAfterMove() {
  const rng = new SeededRNG(99);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, mover.id, {
    position: { col: 3, row: 3 },
  });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const result = applyAction(
    state,
    {
      type: "move",
      unitId: mover.id,
      to: { col: 3, row: 4 },
    } as any,
    rng
  );

  const next = result.state;
  const revealEvent = result.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id
  );

  assert(
    next.units[hidden.id].isStealthed === false,
    "adjacent hidden unit should be revealed"
  );
  assert(revealEvent, "stealthRevealed event should be emitted");
  assert(
    next.knowledge["P1"][hidden.id] === true,
    "mover knowledge should include revealed unit"
  );

  console.log("adjacency_reveal_after_move passed");
}


export function testCannotAttackAfterSearchAction() {
  const rng = new SeededRNG(221);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const searchAction = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  const resolvedSearch = resolveAllPendingRolls(searchAction.state, rng);

  assert(
    resolvedSearch.state.units[searcher.id].turn.actionUsed === true,
    "search(action) should consume action slot"
  );

  const attackAfter = applyAction(
    resolvedSearch.state,
    { type: "attack", attackerId: searcher.id, defenderId: defender.id } as any,
    rng
  );

  assert(
    attackAfter.events.length === 0,
    "attack should be blocked after search(action)"
  );

  console.log("cannot_attack_after_search_action passed");
}


export function testCannotSearchMoveAfterMove() {
  const rng = new SeededRNG(222);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  state = setUnit(state, mover.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", mover.id);

  const moved = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 4, row: 3 } } as any,
    rng
  );

  const searchAfterMove = applyAction(
    moved.state,
    { type: "searchStealth", unitId: mover.id, mode: "move" } as any,
    rng
  );

  assert(
    searchAfterMove.events.length === 0,
    "search(move) should be blocked after move"
  );
  assert.deepStrictEqual(
    searchAfterMove.state,
    moved.state,
    "state should be unchanged after blocked search(move)"
  );

  console.log("cannot_search_move_after_move passed");
}


export function testRiderCannotEnterStealth() {
  const rng = new SeededRNG(223);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", rider.id);

  const res = applyAction(
    state,
    { type: "enterStealth", unitId: rider.id } as any,
    rng
  );

  const enter = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enter && enter.type === "stealthEntered" && enter.success === false,
    "rider should fail to enter stealth"
  );
  assert(
    res.state.units[rider.id].isStealthed === false,
    "rider should remain visible"
  );

  console.log("rider_cannot_enter_stealth passed");
}


export function testAssassinCanEnterStealth() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);

  const initial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const enter = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enter && enter.type === "stealthEntered" && enter.success === true,
    "assassin should successfully enter stealth"
  );
  assert(
    res.state.units[assassin.id].isStealthed === true,
    "assassin should become stealthed"
  );

  console.log("assassin_can_enter_stealth passed");
}


export function testStealthOnlyForUnitsWithAbility() {
  const rng = new SeededRNG(224);
  const nonStealthClasses = ["spearman", "rider", "trickster", "berserker", "knight"];

  for (const cls of nonStealthClasses) {
    let state = createEmptyGame();
    const a1 = createDefaultArmy("P1");
    const a2 = createDefaultArmy("P2");
    state = attachArmy(state, a1);
    state = attachArmy(state, a2);

    const unit = Object.values(state.units).find(
      (u) => u.owner === "P1" && u.class === cls
    )!;

    state = setUnit(state, unit.id, { position: { col: 4, row: 4 } });
    state = toBattleState(state, "P1", unit.id);

    const res = applyAction(
      state,
      { type: "enterStealth", unitId: unit.id } as any,
      rng
    );

    const enter = res.events.find((e) => e.type === "stealthEntered");
    assert(
      enter && enter.type === "stealthEntered" && enter.success === false,
      `unit ${cls} should not be able to enter stealth`
    );
  }

  console.log("stealth_only_for_units_with_ability passed");
}


export function testAllyCannotStepOnStealthedAlly() {
  const rng = new SeededRNG(77);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, ally.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );

  assert(res.events.length === 0, "move onto stealthed ally should be rejected");
  assert(
    res.state.units[mover.id].position!.row === 3 &&
      res.state.units[mover.id].position!.col === 3,
    "mover should stay in place"
  );
  assert(res.state.units[mover.id].hasMovedThisTurn === false, "move should not be spent");

  console.log("ally_cannot_step_on_ally_stealthed passed");
}


export function testEnemyStepsOnUnknownStealthedRevealsAndCancels() {
  const rng = new SeededRNG(88);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const mover = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", mover.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );

  assert(
    res.state.units[mover.id].position!.row === 3 &&
      res.state.units[mover.id].position!.col === 3,
    "mover should stay in place"
  );
  assert(res.state.units[mover.id].hasMovedThisTurn === true, "move should be spent");
  assert(res.state.units[hidden.id].isStealthed === false, "hidden enemy should be revealed");
  assert(res.state.knowledge["P1"][hidden.id] === true, "mover knowledge should include revealed enemy");

  const revealEvent = res.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id && e.reason === "steppedOnHidden"
  );
  assert(revealEvent, "stealthRevealed should be emitted with steppedOnHidden reason");

  console.log("enemy_steps_on_unknown_stealthed_reveals_and_cancels passed");
}


export function testCannotAttackStealthedEnemyDirectly() {
  const rng = new SeededRNG(90);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, attacker.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: hidden.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "attackResolved should not be emitted for hidden target");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden target should remain stealthed");

  console.log("cannot_attack_stealthed_enemy_directly passed");
}


export function testNoStealthStackingOnEnter() {
  const rng = new SeededRNG(91);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const stealthed = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "assassin")!;
  const entering = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;

  state = setUnit(state, stealthed.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, entering.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", entering.id);

  const res = applyAction(
    state,
    { type: "enterStealth", unitId: entering.id } as any,
    rng
  );

  const enterEvent = res.events.find((e) => e.type === "stealthEntered");
  assert(enterEvent && enterEvent.type === "stealthEntered" && enterEvent.success === false, "enterStealth should fail");
  assert(res.state.units[entering.id].isStealthed === false, "unit should remain visible");
  assert(res.state.units[entering.id].stealthAttemptedThisTurn === true, "stealth attempt should be spent");

  console.log("no_stealth_stacking_on_enter passed");
}


export function testStealthLasts3OwnTurnsThenExpiresOn4thStart() {
  const rng = new SeededRNG(5);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 6 },
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [assassin.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id, enemy.id],
    turnOrderIndex: 0,
  };

  // 1st own turn start: 3 -> 2
  let res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 2, "stealth should tick to 2 on 1st own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 1st own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 2nd own turn start: 2 -> 1
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 1, "stealth should tick to 1 on 2nd own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 2nd own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 3rd own turn start: 1 -> 0 (still stealthed)
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  assert(res.state.units[assassin.id].stealthTurnsLeft === 0, "stealth should tick to 0 on 3rd own turn");
  assert(res.state.units[assassin.id].isStealthed === true, "stealth should remain on 3rd own turn");

  // Enemy turn (no tick)
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  // 4th own turn start: reveal
  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  const revealRes = applyAction(state, { type: "unitStartTurn", unitId: assassin.id } as any, rng);
  const reveal = revealRes.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === assassin.id
  );
  assert(reveal, "stealth should be revealed on 4th own turn start");
  if (reveal && reveal.type === "stealthRevealed") {
    assert(reveal.reason === "timerExpired", "reveal reason should be timerExpired");
  }
  assert(
    revealRes.state.units[assassin.id].isStealthed === false,
    "assassin should exit stealth on 4th own turn start"
  );

  console.log("stealth_lasts_3_own_turns_then_expires_on_4th_start passed");
}


export function testStealthRollLogged() {
  const rng = new SeededRNG(1112);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
  });
  state = toBattleState(state, "P1", assassin.id);

  const initial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const enterEvent = res.events.find((e) => e.type === "stealthEntered");
  assert(
    enterEvent && enterEvent.type === "stealthEntered",
    "stealthEntered event should be emitted"
  );
  assert(
    typeof enterEvent.roll === "number",
    "stealthEntered should include roll"
  );
  assert(enterEvent.roll === 5, "stealthEntered roll should match RNG");
  assert(enterEvent.success === true, "stealthEntered should succeed");
  assert(
    res.state.units[assassin.id].isStealthed === true,
    "assassin should enter stealth"
  );

  console.log("stealth_roll_logged passed");
}


export function testLastKnownPositionsInView() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [hidden.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(!view.units[hidden.id], "stealthed enemy should be hidden in view");
  assert(
    view.lastKnownPositions[hidden.id] &&
      view.lastKnownPositions[hidden.id].col === 4 &&
      view.lastKnownPositions[hidden.id].row === 4,
    "lastKnownPositions should include hidden unit position"
  );

  console.log("last_known_positions_in_view passed");
}


export function testLastKnownPositionPersistsWhileHidden() {
  const rng = new SeededRNG(1113);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);
  state = initKnowledgeForOwners(state);

  const enterInitial = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const enterResolved = resolveAllPendingRolls(enterInitial.state, rng);

  const lastKnownBefore = enterResolved.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    lastKnownBefore && lastKnownBefore.col === 4 && lastKnownBefore.row === 4,
    "last known position should be set on stealth entry"
  );

  const moveRes = applyAction(
    enterResolved.state,
    { type: "move", unitId: assassin.id, to: { col: 4, row: 5 } } as any,
    rng
  );

  const lastKnownAfter = moveRes.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    lastKnownAfter && lastKnownAfter.col === 4 && lastKnownAfter.row === 4,
    "last known position should persist while hidden"
  );

  console.log("last_known_position_persists_while_hidden passed");
}


export function testLastKnownClearedOnStealthExit() {
  const rng = new SeededRNG(1114);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 0,
  });
  state = {
    ...state,
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P2: {
        ...(state.lastKnownPositions?.P2 ?? {}),
        [assassin.id]: { col: 4, row: 4 },
      },
    },
  };

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [assassin.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id],
    turnOrderIndex: 0,
  };

  const revealRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: assassin.id } as any,
    rng
  );

  const cleared = revealRes.state.lastKnownPositions?.P2?.[assassin.id];
  assert(
    cleared === undefined,
    "last known position should be cleared when stealth ends"
  );

  console.log("last_known_cleared_on_stealth_exit passed");
}


export function testTricksterAoERevealsHiddenInArea() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const nearHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;
  const midHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;
  const farHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, nearHidden.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, midHidden.id, {
    position: { col: 6, row: 6 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, farHidden.id, {
    position: { col: 8, row: 8 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 5, row: 5 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvent = events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === nearHidden.id && e.reason === "aoeHit"
  );
  assert(revealEvent, "aoe should reveal hidden enemy in area");
  assert(resolved.state.units[nearHidden.id].isStealthed === false, "near hidden should be revealed");
  assert(resolved.state.units[midHidden.id].isStealthed === false, "mid hidden should be revealed");
  assert(resolved.state.units[farHidden.id].isStealthed === true, "far hidden should remain stealthed");
  assert(resolved.state.knowledge["P1"][nearHidden.id] === true, "caster knowledge should include revealed unit");

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(
      aoeEvent &&
      aoeEvent.type === "aoeResolved" &&
      aoeEvent.affectedUnitIds.includes(nearHidden.id) &&
      aoeEvent.affectedUnitIds.includes(midHidden.id),
    "aoeResolved should list targets"
  );

  console.log("trickster_aoe_reveals_hidden_in_area passed");
}


export function testTricksterAoERevealsAllInArea() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 6, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvents = events.filter((e) => e.type === "stealthRevealed");
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === enemy.id),
    "enemy should be revealed by aoe"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === ally.id),
    "ally should be revealed by aoe"
  );
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be revealed by aoe"
  );

  console.log("trickster_aoe_reveals_all_in_area passed");
}


export function testTricksterAoERevealsStealthedUnits() {
  const rng = new SeededRNG(132);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, enemy.id, {
    position: { col: 6, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const revealEvents = events.filter(
    (e) => e.type === "stealthRevealed" && e.reason === "aoeHit"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === ally.id),
    "AoE should reveal stealthed ally"
  );
  assert(
    revealEvents.some((e) => e.type === "stealthRevealed" && e.unitId === enemy.id),
    "AoE should reveal stealthed enemy"
  );
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be cleared"
  );
  assert(
    resolved.state.units[enemy.id].isStealthed === false,
    "enemy stealth should be cleared"
  );

  console.log("trickster_aoe_reveals_stealthed_units passed");
}


export function testArcherCannotTargetHiddenEnemy() {
  const rng = new SeededRNG(203);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, hidden.id, {
    position: { col: 2, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: hidden.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "archer should not target hidden enemy directly");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden enemy should remain stealthed");

  console.log("archer_cannot_target_hidden_enemy passed");
}


export function testCannotStealthTwicePerTurn() {
  const rng = new SeededRNG(301);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", assassin.id);

  const first = applyAction(
    state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );
  const resolvedFirst = resolveAllPendingRolls(first.state, rng);
  const second = applyAction(
    resolvedFirst.state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second stealth attempt should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    resolvedFirst.state,
    "state should be unchanged after second stealth attempt"
  );

  console.log("cannot_stealth_twice_per_turn passed");
}


export function testSearchStealthSlots() {
  const rng = new SeededRNG(302);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const searcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, searcher.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", searcher.id);
  state = initKnowledgeForOwners(state);

  const searchMove = applyAction(
    state,
    { type: "searchStealth", unitId: searcher.id, mode: "move" } as any,
    rng
  );
  const resolvedSearchMove = resolveAllPendingRolls(searchMove.state, rng);

  const moveAfterSearch = applyAction(
    resolvedSearchMove.state,
    { type: "move", unitId: searcher.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  assert(
    moveAfterSearch.events.length === 0,
    "move should be blocked after searchStealth(mode=move)"
  );

  let state2 = toBattleState(state, "P1", searcher.id);
  state2 = initKnowledgeForOwners(state2);

  const searchAction = applyAction(
    state2,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  const resolvedSearchAction = resolveAllPendingRolls(searchAction.state, rng);

  const moveAfterActionSearch = applyAction(
    resolvedSearchAction.state,
    { type: "move", unitId: searcher.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  const moved = moveAfterActionSearch.events.find((e) => e.type === "unitMoved");
  assert(moved, "move should be allowed after searchStealth(mode=action)");

  const secondActionSearch = applyAction(
    resolvedSearchAction.state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  assert(
    secondActionSearch.events.length === 0,
    "second action search should be blocked"
  );

  console.log("search_stealth_slots passed");
}
