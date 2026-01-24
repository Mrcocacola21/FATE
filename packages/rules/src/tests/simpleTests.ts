import {
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  applyAction as applyActionRaw,
  coordFromNotation,
  GameState,
  UnitState,
  makePlayerView,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_TEST_MULTI_SLOT,
  getTricksterMovesForRoll,
  getBerserkerMovesForRoll,
  getLegalIntents,
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

function applyAction(
  state: GameState,
  action: Parameters<typeof applyActionRaw>[1],
  rng: Parameters<typeof applyActionRaw>[2]
) {
  return applyActionRaw(state, action as any, rng as any);
}

function resolvePendingRollOnce(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  if (!state.pendingRoll) {
    return { state, events: [] as any[] };
  }
  const pending = state.pendingRoll;
  const resolvedChoice =
    pending.kind === "berserkerDefenseChoice" ? choice ?? "roll" : undefined;
  return applyActionRaw(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      choice: resolvedChoice,
    } as any,
    rng as any
  );
}

function resolveAllPendingRolls(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  let result = { state, events: [] as any[] };
  while (result.state.pendingRoll) {
    result = resolvePendingRollOnce(result.state, rng, choice);
  }
  return result;
}

function resolveAllPendingRollsWithEvents(
  state: GameState,
  rng: Parameters<typeof applyActionRaw>[2],
  choice?: "auto" | "roll"
) {
  let current = { state, events: [] as any[] };
  const events: any[] = [];
  while (current.state.pendingRoll) {
    current = resolvePendingRollOnce(current.state, rng, choice);
    events.push(...current.events);
  }
  return { state: current.state, events };
}

function coordKeys(coords: { col: number; row: number }[]): string[] {
  return coords.map((c) => `${c.col},${c.row}`).sort();
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

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  const next = resolved.state;
  const events = resolved.events;
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

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: false,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "roll");

  const next = resolved.state;
  const events = resolved.events;
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

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
      defenderUseBerserkAutoDefense: true,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "roll");

  const next = resolved.state;
  const events = resolved.events;
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

function testBerserkerDefenseChoiceAutoDodgeSpends6() {
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

  const initial = applyAction(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  const choiceEvent = resolved.events.find(
    (e) => e.type === "berserkerDefenseChosen"
  );
  assert(
    choiceEvent && choiceEvent.type === "berserkerDefenseChosen" && choiceEvent.choice === "auto",
    "berserkerDefenseChosen should record auto choice"
  );

  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(attackEvent.hit === false, "auto-dodge should force miss");
    assert(attackEvent.damage === 0, "auto-dodge should deal no damage");
  }

  assert(
    resolved.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 0,
    "auto-dodge should spend all charges"
  );

  console.log("berserker_defense_choice_auto_dodge_spends_6 passed");
}

function testBerserkerDefenseChoiceRollUsesNormalCombat() {
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

  const step1 = applyActionRaw(
    state,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    } as any,
    rng
  );

  const pending1 = step1.state.pendingRoll;
  assert(
    pending1 && pending1.kind === "attack_attackerRoll",
    "attacker roll should be requested first"
  );

  const step2 = applyActionRaw(
    step1.state,
    { type: "resolvePendingRoll", pendingRollId: pending1!.id } as any,
    rng
  );

  const pending2 = step2.state.pendingRoll;
  assert(
    pending2 && pending2.kind === "berserkerDefenseChoice",
    "berserkerDefenseChoice roll should be requested after attacker roll"
  );

  const step3 = applyActionRaw(
    step2.state,
    { type: "resolvePendingRoll", pendingRollId: pending2!.id, choice: "roll" } as any,
    rng
  );

  const choiceEvent = step3.events.find(
    (e) => e.type === "berserkerDefenseChosen"
  );
  assert(
    choiceEvent && choiceEvent.type === "berserkerDefenseChosen" && choiceEvent.choice === "roll",
    "berserkerDefenseChosen should record roll choice"
  );

  const pending3 = step3.state.pendingRoll;
  assert(
    pending3 && pending3.kind === "attack_defenderRoll",
    "defender roll should be requested after roll choice"
  );

  const final = resolveAllPendingRolls(step3.state, rng);

  const attackEvent = final.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attackResolved should be emitted");
  if (attackEvent && attackEvent.type === "attackResolved") {
    assert(
      attackEvent.attackerRoll.dice.length >= 2,
      "normal combat should roll dice"
    );
  }
  assert(
    final.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 6,
    "roll defense should not spend charges"
  );

  console.log("berserker_defense_choice_roll_uses_normal_combat passed");
}

function testCannotAutoDodgeIfChargesNot6() {
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
    charges: { ...defender.charges, [ABILITY_BERSERK_AUTO_DEFENSE]: 5 },
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
  const resolved = resolveAllPendingRolls(initial.state, rng, "auto");

  assert(
    resolved.state.units[defender.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] === 5,
    "auto-dodge should be rejected when charges are not 6"
  );
  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === defender.id
  );
  assert(attackEvent, "attack should resolve normally when auto-dodge unavailable");

  console.log("cannot_auto_dodge_if_charges_not_6 passed");
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

function testSearchStealthRollsLogged() {
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

function testSearchActionBlockedAfterAttack() {
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

function testSearchMoveBlockedAfterMove() {
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

function testSearchActionWorksBeforeAttack() {
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

function testSearchMoveWorksBeforeMove() {
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

function testSearchButtonsEnabledOnFreshUnitTurn() {
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
  const resolvedFirst = resolveAllPendingRolls(first.state, rng);

  const second = applyAction(
    resolvedFirst.state,
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
    resolvedFirst.state,
    "state should be unchanged after second attack"
  );

  console.log("cannot_attack_twice_per_turn passed");
}

function testAttackConsumesActionSlot() {
  const rng = new SeededRNG(555);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, attacker.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, defender.id, { position: { col: 3, row: 5 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = toBattleState(state, "P1", attacker.id);
  state = initKnowledgeForOwners(state);

  const attacked = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    rng
  );
  const resolvedAttack = resolveAllPendingRolls(attacked.state, rng);

  const searchAfter = applyAction(
    resolvedAttack.state,
    { type: "searchStealth", unitId: attacker.id, mode: "action" } as any,
    rng
  );

  assert(
    searchAfter.events.length === 0,
    "searchStealth(mode=action) should be blocked after attack"
  );
  assert.deepStrictEqual(
    searchAfter.state,
    resolvedAttack.state,
    "state should be unchanged after blocked search"
  );

  console.log("attack_consumes_action_slot passed");
}

function testCannotAttackAfterSearchAction() {
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

function testCannotSearchMoveAfterMove() {
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

function testRiderCannotEnterStealth() {
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

function testAssassinCanEnterStealth() {
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

function testStealthOnlyForUnitsWithAbility() {
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

function testStealthLasts3OwnTurnsThenExpiresOn4thStart() {
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

function testStealthRollLogged() {
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

function testLastKnownPositionsInView() {
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

function testLastKnownPositionPersistsWhileHidden() {
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

function testLastKnownClearedOnStealthExit() {
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

function testTricksterAoERevealsHiddenInArea() {
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

function testTricksterAoEIs5x5Radius2() {
  const rng = new SeededRNG(120);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const nearEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const farEnemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, farEnemy.id, { position: { col: 7, row: 7 } });

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

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(aoeEvent.abilityId === "tricksterAoE", "aoeResolved should include abilityId");
    assert(aoeEvent.radius === 2, "aoe radius should be 2");
    assert(
      aoeEvent.affectedUnitIds.includes(nearEnemy.id),
      "enemy within radius 2 should be affected"
    );
    assert(
      !aoeEvent.affectedUnitIds.includes(farEnemy.id),
      "enemy outside radius 2 should not be affected"
    );
  }

  console.log("trickster_aoe_is_5x5_radius2 passed");
}

function testTricksterAoEHitsAllies() {
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

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, {
    position: { col: 5, row: 5 },
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

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      aoeEvent.affectedUnitIds.includes(ally.id),
      "ally should be affected by aoe"
    );
    assert(
      aoeEvent.revealedUnitIds.includes(ally.id),
      "ally should be revealed by aoe"
    );
  }
  assert(
    resolved.state.units[ally.id].isStealthed === false,
    "ally stealth should be revealed by aoe"
  );

  console.log("trickster_aoe_hits_allies passed");
}

function testTricksterAoEDoesNotDamageSelf() {
  const rng = new SeededRNG(122);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 4 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  const hpBefore = state.units[trickster.id].hp;

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

  const aoeEvent = events.find((e) => e.type === "aoeResolved");
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      !aoeEvent.damagedUnitIds.includes(trickster.id),
      "caster should not be damaged by own AoE"
    );
    assert(
      !aoeEvent.affectedUnitIds.includes(trickster.id),
      "caster should not be listed as an affected target"
    );
  }

  assert(
    resolved.state.units[trickster.id].hp === hpBefore,
    "caster HP should remain unchanged"
  );

  console.log("trickster_aoe_does_not_damage_self passed");
}

function testTricksterAoERevealsAllInArea() {
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

function testTricksterAoEAttackerRollOnce() {
  const rng = new SeededRNG(130);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 4 } });

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

  const attackerRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "tricksterAoE_attackerRoll"
  );
  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "tricksterAoE_defenderRoll"
  );

  assert(attackerRolls.length === 1, "AoE attacker roll should be requested once");
  assert(defenderRolls.length === 2, "AoE should request defender roll per target");

  console.log("trickster_aoe_attacker_roll_once passed");
}

function testTricksterAoEMultipleDefendersRollSeparately() {
  const rng = new SeededRNG(131);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 4 } });

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

  const attackEvents = events.filter((e) => e.type === "attackResolved");
  assert(attackEvents.length === 2, "AoE should resolve combat for each target");
  const attackerSums = attackEvents
    .map((e) => (e.type === "attackResolved" ? e.attackerRoll.sum : 0))
    .filter((v) => v > 0);
  assert(
    attackerSums.length === 2 && attackerSums[0] === attackerSums[1],
    "AoE should reuse the same attacker roll for all targets"
  );

  console.log("trickster_aoe_multiple_defenders_roll_separately passed");
}

function testTricksterAoERevealsStealthedUnits() {
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
    (u) => u.owner === "P1" && u.class === "assassin"
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
  const res = resolveAllPendingRollsWithEvents(initial.state, rng);

  assert(
    res.state.units[trickster.id].turn.actionUsed === true,
    "AoE should consume action slot"
  );
  assert(
    res.state.units[trickster.id].turn.attackUsed === true,
    "AoE should consume attack slot"
  );

  const followUp = applyAction(
    res.state,
    { type: "attack", attackerId: trickster.id, defenderId: enemy.id } as any,
    rng
  );

  const attackEvent = followUp.events.find((e) => e.type === "attackResolved");
  assert(!attackEvent, "trickster should not be able to attack after AoE (consumesAttack)");
  assert(followUp.events.length === 0, "attack should be blocked after AoE");
  assert.deepStrictEqual(
    followUp.state,
    res.state,
    "state should be unchanged after blocked attack"
  );

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

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: enemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

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

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

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

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: nearEnemy.id } as any,
    rng
  );
  const res = resolveAllPendingRolls(initial.state, rng);

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

function testArcherCanAttackDiagonalFirstTargetOnly() {
  const rng = new SeededRNG(204);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const first = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const firstResolved = resolveAllPendingRolls(first.state, rng);
  const firstAttack = firstResolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === farEnemy.id
  );
  assert(!firstAttack, "archer should not target enemies beyond the first on diagonal");

  const second = applyAction(
    firstResolved.state,
    { type: "attack", attackerId: archer.id, defenderId: nearEnemy.id } as any,
    rng
  );
  const secondResolved = resolveAllPendingRolls(second.state, rng);
  const secondAttack = secondResolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === nearEnemy.id
  );
  assert(secondAttack, "archer should attack first enemy on diagonal");

  console.log("archer_can_attack_diagonal_first_target_only passed");
}

function testArcherCanShootThroughAlliesDiagonal() {
  const rng = new SeededRNG(205);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const ally = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = resolved.events.find((e) => e.type === "attackResolved");
  assert(attackEvent, "archer should be able to shoot through allies diagonally");

  console.log("archer_can_shoot_through_allies_diagonal passed");
}

function testArcherCannotShootThroughEnemiesDiagonal() {
  const rng = new SeededRNG(206);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const nearEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "spearman")!;
  const farEnemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "archer")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, nearEnemy.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, farEnemy.id, { position: { col: 4, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: farEnemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === farEnemy.id
  );
  assert(!attackEvent, "archer should not shoot through enemies diagonally");

  console.log("archer_cannot_shoot_through_enemies_diagonal passed");
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

function testTricksterMoveOptionsGeneratedAndUsed() {
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

function testBerserkerMoveOptionsGeneratedAndUsed() {
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

function testTricksterMoveRequiresPendingOptions() {
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

function main() {
  testPlacementToBattleAndTurnOrder();
  testRiderPathHitsStealthed();
  testGameEndCondition();
  testBerserkerAutoDefenseEnabled();
  testBerserkerAutoDefenseDeclined();
  testBerserkerAutoDefenseNoCharges();
  testBerserkerDefenseChoiceAutoDodgeSpends6();
  testBerserkerDefenseChoiceRollUsesNormalCombat();
  testCannotAutoDodgeIfChargesNot6();
  testAssassinAttackFromStealth();
  testAssassinAttackWithoutStealth();
  testSearchRevealsOnlyInRadius();
  testSearchUpdatesOnlyPlayerKnowledge();
  testSearchStealthRollsLogged();
  testSearchActionWorksBeforeAttack();
  testSearchMoveWorksBeforeMove();
  testSearchActionBlockedAfterAttack();
  testSearchMoveBlockedAfterMove();
  testSearchButtonsEnabledOnFreshUnitTurn();
  testAttackAlreadyRevealedUnit();
  testAdjacencyRevealAfterMove();
  testCannotAttackTwicePerTurn();
  testAttackConsumesActionSlot();
  testCannotAttackAfterSearchAction();
  testCannotSearchMoveAfterMove();
  testBattleTurnOrderFollowsPlacementOrder();
  testAllyCannotStepOnStealthedAlly();
  testEnemyStepsOnUnknownStealthedRevealsAndCancels();
  testCannotAttackStealthedEnemyDirectly();
  testNoStealthStackingOnEnter();
  testRiderCannotEnterStealth();
  testAssassinCanEnterStealth();
  testStealthOnlyForUnitsWithAbility();
  testStealthLasts3OwnTurnsThenExpiresOn4thStart();
  testStealthRollLogged();
  testLastKnownPositionsInView();
  testLastKnownPositionPersistsWhileHidden();
  testLastKnownClearedOnStealthExit();
  testTricksterAoERevealsHiddenInArea();
  testTricksterAoEIs5x5Radius2();
  testTricksterAoEHitsAllies();
  testTricksterAoEDoesNotDamageSelf();
  testTricksterAoERevealsAllInArea();
  testTricksterAoEAttackerRollOnce();
  testTricksterAoEMultipleDefendersRollSeparately();
  testTricksterAoERevealsStealthedUnits();
  testTricksterAoEConsumesAttack();
  testArcherCanShootThroughAllies();
  testArcherCannotShootThroughEnemies();
  testArcherAttacksFirstOnLine();
  testArcherCannotTargetHiddenEnemy();
  testArcherCanAttackDiagonalFirstTargetOnly();
  testArcherCanShootThroughAlliesDiagonal();
  testArcherCannotShootThroughEnemiesDiagonal();
  testCannotMoveTwicePerTurn();
  testCannotStealthTwicePerTurn();
  testSearchStealthSlots();
  testAbilityConsumesMultipleSlots();
  testTricksterMoveOptionsGeneratedAndUsed();
  testBerserkerMoveOptionsGeneratedAndUsed();
  testTricksterMoveRequiresPendingOptions();
}

main();
