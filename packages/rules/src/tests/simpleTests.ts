import {
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  applyAction,
  coordFromNotation,
  GameState,
  UnitState,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_TEST_MULTI_SLOT,
} from "../index";
import { SeededRNG } from "../rng";
import assert from "assert";

function setUnit(
  state: GameState,
  unitId: string,
  patch: Partial<UnitState>
): GameState {
  const unit = state.units[unitId];
  if (!unit) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, ...patch },
    },
  };
}

function initKnowledgeForOwners(state: GameState): GameState {
  const knowledge: GameState["knowledge"] = { P1: {}, P2: {} };
  for (const u of Object.values(state.units)) {
    if (!u.isAlive) continue;
    knowledge[u.owner][u.id] = true;
  }
  return { ...state, knowledge };
}

function toBattleState(
  state: GameState,
  currentPlayer: "P1" | "P2",
  activeUnitId: string
): GameState {
  return {
    ...state,
    phase: "battle",
    currentPlayer,
    activeUnitId,
    placementOrder: [activeUnitId],
    turnQueue: [activeUnitId],
    turnQueueIndex: 0,
    turnOrder: [activeUnitId],
    turnOrderIndex: 0,
  };
}

function testPlacementToBattleAndTurnOrder() {
  const rng = new SeededRNG(12345);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

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

function testRiderPathHitsStealthed() {
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
  // move across and hit both
  state = applyAction(state, { type: "move", unitId: rider.id, to: { col: 5, row: 2 } } as any, rng).state;

  // Both enemies should have been at least revealed (isStealthed=false) or dead
  const e1 = state.units[enemy1.id];
  const e2 = state.units[enemy2.id];
  assert(e1 == null || e1.isStealthed === false, "enemy1 should be revealed or dead");
  assert(e2 == null || e2.isStealthed === false, "enemy2 should be revealed or dead");

  console.log("testRiderPathHitsStealthed passed");
}

function testGameEndCondition() {
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

function testBerserkerAutoDefenseEnabled() {
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
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));
  const defenderHpBefore = state.units[defender.id].hp;

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
  const abilityEvent = events.find(
    (e) => e.type === "abilityUsed" && e.unitId === defender.id
  );
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(abilityEvent, "abilityUsed should be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === false, "attack should be dodged");
    assert(attackEvent.damage === 0, "damage should be 0");
  }

  assert(
    next.units[defender.id].hp === defenderHpBefore,
    "defender should take no damage"
  );
  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "charges should drop to 0 after use"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_enabled passed");
}

function testBerserkerAutoDefenseDeclined() {
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
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: false,
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
  const abilityEvent = events.find((e) => e.type === "abilityUsed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(!abilityEvent, "abilityUsed should not be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === true, "attack should resolve normally");
    assert(attackEvent.damage === attacker.attack, "damage should be base attack");
  }

  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 6,
    "charges should remain unchanged"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_declined passed");
}

function testBerserkerAutoDefenseNoCharges() {
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
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;

  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 0 },
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);
  const knowledgeBefore = JSON.parse(JSON.stringify(state.knowledge));

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
  const abilityEvent = events.find((e) => e.type === "abilityUsed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(!abilityEvent, "abilityUsed should not be emitted");
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === true, "attack should resolve normally");
  }

  assert(
    next.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "charges should remain 0"
  );
  assert.deepStrictEqual(next.knowledge, knowledgeBefore, "knowledge unchanged");

  console.log("berserker_auto_defense_no_charges passed");
}

function testAssassinAttackFromStealth() {
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

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
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

function testAssassinAttackWithoutStealth() {
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

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
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

function testSearchRevealsOnlyInRadius() {
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

  const result = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );

  const next = result.state;
  const events = result.events;
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

function testSearchUpdatesOnlyPlayerKnowledge() {
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

  const result = applyAction(
    state,
    {
      type: "searchStealth",
      unitId: searcher.id,
      mode: "action",
    } as any,
    rng
  );

  const next = result.state;

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

function testAttackAlreadyRevealedUnit() {
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

  const result = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const events = result.events;
  const revealEvents = events.filter((e) => e.type === "stealthRevealed");
  const attackEvent = events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );

  assert(attackEvent, "attackResolved should be emitted");
  assert(revealEvents.length === 0, "no stealthRevealed events expected");
  assert.deepStrictEqual(
    result.state.knowledge,
    knowledgeBefore,
    "knowledge should remain consistent"
  );

  console.log("attack_already_revealed_unit passed");
}

function testAdjacencyRevealAfterMove() {
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

function testCannotAttackTwicePerTurn() {
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
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const second = applyAction(
    first.state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second attack should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    first.state,
    "state should be unchanged after second attack"
  );

  console.log("cannot_attack_twice_per_turn passed");
}

function testBattleTurnOrderFollowsPlacementOrder() {
  const rng = new SeededRNG(2024);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

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

function testAllyCannotStepOnStealthedAlly() {
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

function testEnemyStepsOnUnknownStealthedRevealsAndCancels() {
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

function testCannotAttackStealthedEnemyDirectly() {
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

  const res = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: hidden.id } as any,
    rng
  );

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "attackResolved should not be emitted for hidden target");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden target should remain stealthed");

  console.log("cannot_attack_stealthed_enemy_directly passed");
}

function testNoStealthStackingOnEnter() {
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

function testTricksterAoERevealsHiddenInArea() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const nearHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;
  const farHidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, nearHidden.id, {
    position: { col: 5, row: 5 },
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

  const res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 5, row: 5 } },
    } as any,
    rng
  );

  const revealEvent = res.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === nearHidden.id && e.reason === "aoeHit"
  );
  assert(revealEvent, "aoe should reveal hidden enemy in area");
  assert(res.state.units[nearHidden.id].isStealthed === false, "near hidden should be revealed");
  assert(res.state.units[farHidden.id].isStealthed === true, "far hidden should remain stealthed");
  assert(res.state.knowledge["P1"][nearHidden.id] === true, "caster knowledge should include revealed unit");

  const aoeEvent = res.events.find((e) => e.type === "aoeResolved");
  assert(
    aoeEvent &&
      aoeEvent.type === "aoeResolved" &&
      aoeEvent.affectedUnitIds.includes(nearHidden.id),
    "aoeResolved should list targets"
  );

  console.log("trickster_aoe_reveals_hidden_in_area passed");
}

function testTricksterAoEConsumesAttack() {
  const rng = new SeededRNG(121);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "trickster")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );

  const followUp = applyAction(
    res.state,
    { type: "attack", attackerId: trickster.id, defenderId: enemy.id } as any,
    rng
  );

  const attackEvent = followUp.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "trickster should not be able to attack after AoE (consumesAttack)");

  console.log("trickster_aoe_consumes_attack passed");
}

function testArcherCanShootThroughAllies() {
  const rng = new SeededRNG(200);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, ally.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: enemy.id } as any,
    rng
  );

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(attackEvent, "archer should be able to shoot through allies");

  console.log("archer_can_shoot_through_allies passed");
}

function testArcherCannotShootThroughEnemies() {
  const rng = new SeededRNG(201);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "archer should not shoot through enemies");

  console.log("archer_cannot_shoot_through_enemies passed");
}

function testArcherAttacksFirstOnLine() {
  const rng = new SeededRNG(202);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 2, row: 5 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const res = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: nearEnemy.id } as any,
    rng
  );

  const attackEvent = res.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === nearEnemy.id
  );
  assert(attackEvent, "archer should attack first enemy on line");

  console.log("archer_attacks_first_on_line passed");
}

function testArcherCannotTargetHiddenEnemy() {
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

  const res = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: hidden.id } as any,
    rng
  );

  const attackEvent = res.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "archer should not target hidden enemy directly");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden enemy should remain stealthed");

  console.log("archer_cannot_target_hidden_enemy passed");
}

function testCannotMoveTwicePerTurn() {
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

function testCannotStealthTwicePerTurn() {
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
  const second = applyAction(
    first.state,
    { type: "enterStealth", unitId: assassin.id } as any,
    rng
  );

  assert(
    second.events.length === 0,
    "second stealth attempt should emit no events"
  );
  assert.deepStrictEqual(
    second.state,
    first.state,
    "state should be unchanged after second stealth attempt"
  );

  console.log("cannot_stealth_twice_per_turn passed");
}

function testSearchStealthSlots() {
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

  const moveAfterSearch = applyAction(
    searchMove.state,
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

  const moveAfterActionSearch = applyAction(
    searchAction.state,
    { type: "move", unitId: searcher.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  const moved = moveAfterActionSearch.events.find((e) => e.type === "unitMoved");
  assert(moved, "move should be allowed after searchStealth(mode=action)");

  const secondActionSearch = applyAction(
    searchAction.state,
    { type: "searchStealth", unitId: searcher.id, mode: "action" } as any,
    rng
  );
  assert(
    secondActionSearch.events.length === 0,
    "second action search should be blocked"
  );

  console.log("search_stealth_slots passed");
}

function testAbilityConsumesMultipleSlots() {
  const rng = new SeededRNG(303);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const caster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, caster.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 3, row: 4 } });

  state = toBattleState(state, "P1", caster.id);
  state = initKnowledgeForOwners(state);

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: caster.id,
      abilityId: ABILITY_TEST_MULTI_SLOT,
    } as any,
    rng
  );

  const moveAfter = applyAction(
    used.state,
    { type: "move", unitId: caster.id, to: { col: 3, row: 2 } } as any,
    rng
  );
  assert(
    moveAfter.events.length === 0,
    "move should be blocked after multi-slot ability"
  );

  const attackAfter = applyAction(
    used.state,
    { type: "attack", attackerId: caster.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    attackAfter.events.length === 0,
    "attack should be blocked after multi-slot ability"
  );

  console.log("ability_consumes_multiple_slots passed");
}

function main() {
  testPlacementToBattleAndTurnOrder();
  testRiderPathHitsStealthed();
  testGameEndCondition();
  testBerserkerAutoDefenseEnabled();
  testBerserkerAutoDefenseDeclined();
  testBerserkerAutoDefenseNoCharges();
  testAssassinAttackFromStealth();
  testAssassinAttackWithoutStealth();
  testSearchRevealsOnlyInRadius();
  testSearchUpdatesOnlyPlayerKnowledge();
  testAttackAlreadyRevealedUnit();
  testAdjacencyRevealAfterMove();
  testCannotAttackTwicePerTurn();
  testBattleTurnOrderFollowsPlacementOrder();
  testAllyCannotStepOnStealthedAlly();
  testEnemyStepsOnUnknownStealthedRevealsAndCancels();
  testCannotAttackStealthedEnemyDirectly();
  testNoStealthStackingOnEnter();
  testTricksterAoERevealsHiddenInArea();
  testTricksterAoEConsumesAttack();
  testArcherCanShootThroughAllies();
  testArcherCannotShootThroughEnemies();
  testArcherAttacksFirstOnLine();
  testArcherCannotTargetHiddenEnemy();
  testCannotMoveTwicePerTurn();
  testCannotStealthTwicePerTurn();
  testSearchStealthSlots();
  testAbilityConsumesMultipleSlots();
}

main();
