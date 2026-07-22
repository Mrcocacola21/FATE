import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getLegalIntents,
  HERO_ODIN_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  makePlayerView,
  resolveAttack,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
import { resolveAoE } from "../../aoe";
import { projectEventsForRecipient } from "../../view/events";
import { HERO_DUOLINGO_ID, HERO_HASSAN_ID } from "../../heroes";

export function testRiderPathIgnoresHiddenEnemies() {
  const rng = new SeededRNG(42);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  // Place the rider and hidden enemies directly on the touched path.
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
  const hpBefore = {
    [enemy1.id]: state.units[enemy1.id].hp,
    [enemy2.id]: state.units[enemy2.id].hp,
  };
  const moveRes = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 5, row: 2 } } as any,
    rng
  );

  assert(!moveRes.state.pendingRoll, "hidden path occupants should not queue Rider attacks");
  for (const enemy of [enemy1, enemy2]) {
    assert(
      moveRes.state.units[enemy.id].hp === hpBefore[enemy.id],
      "hidden path occupants should take no Rider damage"
    );
    assert(
      moveRes.state.units[enemy.id].isStealthed === true,
      "hidden path occupants should remain stealthed"
    );
    assert(
      !moveRes.events.some(
        (event) =>
          (event.type === "attackResolved" && event.defenderId === enemy.id) ||
          (event.type === "stealthRevealed" && event.unitId === enemy.id)
      ),
      "Rider movement should emit neither attack nor reveal events for hidden occupants"
    );
  }

  const projected = projectEventsForRecipient(moveRes.state, moveRes.events, "P1");
  const serialized = JSON.stringify(projected);
  assert(!serialized.includes(enemy1.id), "projected events should not mention hidden enemy 1");
  assert(!serialized.includes(enemy2.id), "projected events should not mention hidden enemy 2");

  console.log("rider_path_ignores_hidden_enemies passed");
}

export function testRiderPathHitsVisibleEnemy() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  state = setUnit(state, rider.id, { position: { col: 0, row: 2 } });
  state = setUnit(state, enemy.id, { position: { col: 2, row: 2 } });
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const moved = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 4, row: 2 } } as any,
    rng
  );
  assert(
    moved.state.pendingRoll?.kind === "riderPathAttack_attackerRoll",
    "visible touched enemy should still queue a Rider path attack"
  );
  const resolved = resolveAllPendingRollsWithEvents(moved.state, rng);
  assert(
    [...moved.events, ...resolved.events].some(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === rider.id &&
        event.defenderId === enemy.id
    ),
    "visible touched enemy should resolve through normal Rider combat"
  );

  console.log("rider_path_hits_visible_enemy passed");
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

function setupHiddenHassanAgainstDuolingo() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { assassin: HERO_HASSAN_ID })
  );
  state = attachArmy(
    state,
    createDefaultArmy("P2", { trickster: HERO_DUOLINGO_ID })
  );
  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID
  )!;
  const duolingo = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_DUOLINGO_ID
  )!;
  state = setUnit(state, hassan.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, duolingo.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", hassan.id));
  return { state, hassan, duolingo };
}

export function testHiddenHassanMissesDuolingoAndReveals() {
  const { state, hassan, duolingo } = setupHiddenHassanAgainstDuolingo();
  const rejected = resolveAttack(state, {
    attackerId: hassan.id,
    defenderId: duolingo.id,
    rolls: { attackerDice: [1], defenderDice: [6, 6] },
  });
  assert(rejected.nextState === state, "an invalid attack resolution must not mutate state");
  assert(rejected.events.length === 0, "an invalid attack resolution must emit no events");
  assert(
    state.units[hassan.id].isStealthed,
    "a rejected attack must not consume Hassan's stealth"
  );

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  const declared = applyAction(
    state,
    { type: "attack", attackerId: hassan.id, defenderId: duolingo.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(declared.state, rng);
  const events = [...declared.events, ...resolved.events];
  const attack = events.find(
    (event) => event.type === "attackResolved"
  );
  const reveals = events.filter(
    (event) => event.type === "stealthRevealed" && event.unitId === hassan.id
  );

  assert(attack?.type === "attackResolved" && !attack.hit, "Hassan should miss");
  assert(
    resolved.state.units[hassan.id].isStealthed === false,
    "hidden Hassan must reveal after a missed attack"
  );
  assert(reveals.length === 1, "a missed attack should emit one attacker reveal event");
  assert(
    resolved.state.knowledge.P1[hassan.id] === true &&
      resolved.state.knowledge.P2[hassan.id] === true,
    "both projections should know the revealed attacker"
  );
  assert(
    makePlayerView(resolved.state, "P1").units[hassan.id]?.isStealthed === false &&
      makePlayerView(resolved.state, "P2").units[hassan.id]?.isStealthed === false,
    "both player views should project Hassan as revealed"
  );

  console.log("hidden_hassan_misses_duolingo_and_reveals passed");
}

export function testHiddenHassanHitsDuolingoAndReveals() {
  const { state, hassan, duolingo } = setupHiddenHassanAgainstDuolingo();
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const declared = applyAction(
    state,
    { type: "attack", attackerId: hassan.id, defenderId: duolingo.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(declared.state, rng);
  const events = [...declared.events, ...resolved.events];
  const attack = events.find(
    (event) => event.type === "attackResolved"
  );

  assert(attack?.type === "attackResolved" && attack.hit, "Hassan should hit");
  assert(attack.damage === 2, "the successful attack should retain stealth damage");
  assert(
    resolved.state.units[hassan.id].isStealthed === false,
    "hidden Hassan must reveal after a successful attack"
  );
  assert(
    events.filter(
      (event) => event.type === "stealthRevealed" && event.unitId === hassan.id
    ).length === 1,
    "a hit should emit one attacker reveal event"
  );

  console.log("hidden_hassan_hits_duolingo_and_reveals passed");
}

export function testHiddenAttackAutoDefendedStillReveals() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "berserker"
  )!;
  state = setUnit(state, attacker.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, defender.id, {
    position: { col: 4, row: 5 },
    charges: { ...defender.charges, berserkerAutoDefense: 6 },
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", attacker.id));

  const defended = resolveAttack(state, {
    attackerId: attacker.id,
    defenderId: defender.id,
    defenderUseBerserkAutoDefense: true,
    rolls: { attackerDice: [6, 5], defenderDice: [] },
  });

  assert(
    defended.events.some(
      (event) => event.type === "attackResolved" && !event.hit
    ),
    "automatic defense should resolve the attack as a miss"
  );
  assert(
    defended.nextState.units[attacker.id].isStealthed === false,
    "automatic defense must not preserve attacker stealth"
  );

  console.log("hidden_attack_auto_defended_still_reveals passed");
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


export function testAdjacentHiddenEnemyStaysHiddenAfterMove() {
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
    next.units[mover.id].position!.col === 3 &&
      next.units[mover.id].position!.row === 4,
    "mover should complete normal movement"
  );
  assert(
    next.units[hidden.id].isStealthed === true,
    "adjacent hidden unit should stay hidden"
  );
  assert(!revealEvent, "adjacent movement should not emit stealthRevealed");
  assert(
    next.knowledge["P1"][hidden.id] !== true,
    "mover knowledge should not learn adjacent hidden unit"
  );

  console.log("adjacent_hidden_enemy_stays_hidden_after_move passed");
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


export function testEnemyCanStepOnUnknownStealthedWithoutReveal() {
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
    res.state.units[mover.id].position!.row === 4 &&
      res.state.units[mover.id].position!.col === 3,
    "mover should complete movement onto an unknown hidden enemy cell"
  );
  assert(res.state.units[mover.id].hasMovedThisTurn === true, "move should be spent");
  assert(res.state.units[hidden.id].isStealthed === true, "hidden enemy should remain stealthed");
  assert(res.state.knowledge["P1"][hidden.id] !== true, "mover knowledge should not include hidden enemy");

  const revealEvent = res.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id
  );
  assert(!revealEvent, "stepping onto unknown hidden enemy should not reveal it");

  console.log("enemy_can_step_on_unknown_stealthed_without_reveal passed");
}


export function testUnknownStealthedEnemyDoesNotBlockArcherLine() {
  const rng = new SeededRNG(89);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const archer = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "archer")!;
  const hidden = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin")!;
  const visible = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "knight")!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, hidden.id, {
    position: { col: 2, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, visible.id, { position: { col: 2, row: 4 } });

  state = toBattleState(state, "P1", archer.id);
  state = initKnowledgeForOwners(state);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: visible.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);
  const attackEvent = resolved.events.find(
    (e) => e.type === "attackResolved" && e.defenderId === visible.id
  );
  const revealEvent = resolved.events.find(
    (e) => e.type === "stealthRevealed" && e.unitId === hidden.id
  );

  assert(attackEvent, "archer should be able to attack visible target behind unknown hidden enemy");
  assert(resolved.state.units[hidden.id].isStealthed === true, "hidden line occupant should stay hidden");
  assert(!revealEvent, "line scan should not reveal unknown hidden enemy");
  assert(resolved.state.knowledge["P1"][hidden.id] !== true, "line scan should not learn hidden enemy");

  console.log("unknown_stealthed_enemy_does_not_block_archer_line passed");
}

export function testStealthEntryClearsOpponentExactKnowledge() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, hidden.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hidden.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P2: { ...state.knowledge.P2, [hidden.id]: true },
    },
  };
  assert(
    state.knowledge.P2[hidden.id] === true,
    "opponent should know visible unit before stealth"
  );

  const initial = applyAction(
    state,
    { type: "enterStealth", unitId: hidden.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);

  assert(resolved.state.units[hidden.id].isStealthed === true, "unit should enter stealth");
  assert(
    resolved.state.knowledge.P2[hidden.id] !== true,
    "opponent exact knowledge should be cleared on stealth entry"
  );
  assert.deepStrictEqual(
    resolved.state.lastKnownPositions.P2[hidden.id],
    { col: 4, row: 4 },
    "opponent should retain only a last-known position"
  );

  const opponentView = makePlayerView(resolved.state, "P2");
  assert(!opponentView.units[hidden.id], "hidden unit should be omitted from opponent view");
  assert.deepStrictEqual(
    opponentView.lastKnownPositions[hidden.id],
    { col: 4, row: 4 },
    "opponent view should expose last-known position only"
  );

  console.log("stealth_entry_clears_opponent_exact_knowledge passed");
}

export function testPathPassingAdjacentAfterStealthEntryDoesNotReveal() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, hidden.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, rider.id, { position: { col: 2, row: 4 } });
  state = toBattleState(state, "P1", hidden.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P2: { ...state.knowledge.P2, [hidden.id]: true },
    },
  };

  const enterInitial = applyAction(
    state,
    { type: "enterStealth", unitId: hidden.id } as any,
    rng
  );
  const entered = resolveAllPendingRolls(enterInitial.state, rng);
  state = toBattleState(entered.state, "P2", rider.id);

  const moved = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 6, row: 4 } } as any,
    rng
  );

  assert(
    moved.state.units[rider.id].position?.col === 6 &&
      moved.state.units[rider.id].position?.row === 4,
    "rider should move along a path passing within radius 1"
  );
  assert(moved.state.units[hidden.id].isStealthed === true, "hidden unit should stay hidden");
  assert(
    !moved.events.some((event) => event.type === "stealthRevealed"),
    "passing nearby should not emit reveal events"
  );
  assert(
    moved.state.knowledge.P2[hidden.id] !== true,
    "passing nearby should not restore exact hidden knowledge"
  );

  console.log("path_passing_adjacent_after_stealth_entry_does_not_reveal passed");
}

export function testEnemyCanStepOnRealStealthEntryCellWithoutReveal() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, hidden.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = toBattleState(state, "P1", hidden.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P2: { ...state.knowledge.P2, [hidden.id]: true },
    },
  };

  const enterInitial = applyAction(
    state,
    { type: "enterStealth", unitId: hidden.id } as any,
    rng
  );
  const entered = resolveAllPendingRolls(enterInitial.state, rng);
  state = toBattleState(entered.state, "P2", mover.id);

  const moved = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );

  assert(
    moved.state.units[mover.id].position?.col === 3 &&
      moved.state.units[mover.id].position?.row === 4,
    "move onto unknown hidden enemy cell should be accepted"
  );
  assert(moved.state.units[hidden.id].isStealthed === true, "hidden unit should remain hidden");
  assert(
    !moved.events.some((event) => event.type === "stealthRevealed"),
    "co-location move should not reveal hidden unit"
  );
  assert(
    moved.state.knowledge.P2[hidden.id] !== true,
    "co-location move should not leak exact hidden position"
  );

  console.log("enemy_can_step_on_real_stealth_entry_cell_without_reveal passed");
}

export function testRevealDisplacesCoLocatedHiddenUnitDeterministically() {
  const rng = makeRngSequence([0]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const visible = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const caster = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "trickster"
  )!;

  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, visible.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, caster.id, { position: { col: 6, row: 6 } });
  state = toBattleState(state, "P2", caster.id);
  state = initKnowledgeForOwners(state);

  const aoe = resolveAoE(
    state,
    caster.id,
    { col: 3, row: 4 },
    {
      radius: 1,
      revealHidden: true,
      abilityId: "testRevealAoe",
    },
    rng
  );

  assert(aoe.nextState.units[hidden.id].isStealthed === false, "hidden unit should reveal");
  assert.deepStrictEqual(
    aoe.nextState.units[hidden.id].position,
    { col: 3, row: 3 },
    "co-located hidden unit should move to deterministic first free neighbor"
  );
  assert.deepStrictEqual(
    aoe.nextState.units[visible.id].position,
    { col: 3, row: 4 },
    "visible unit should remain on the shared cell"
  );
  assert(
    aoe.events.some(
      (event) =>
        event.type === "unitMoved" &&
        event.unitId === hidden.id &&
        event.to.col === 3 &&
        event.to.row === 3
    ),
    "reveal displacement should emit unitMoved for the hidden unit"
  );
  assert(
    aoe.events.some(
      (event) => event.type === "stealthRevealed" && event.unitId === hidden.id
    ),
    "reveal should emit stealthRevealed for the co-located hidden unit"
  );

  console.log("reveal_displaces_co_located_hidden_unit_deterministically passed");
}

export function testRealStealthEntryDoesNotBlockArcherLine() {
  const rng = makeRngSequence([0.99, 0.9, 0.9, 0.1, 0.1]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const visible = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const archer = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, archer.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, hidden.id, { position: { col: 2, row: 3 } });
  state = setUnit(state, visible.id, { position: { col: 2, row: 4 } });
  state = toBattleState(state, "P1", hidden.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P2: { ...state.knowledge.P2, [hidden.id]: true },
    },
  };

  const enterInitial = applyAction(
    state,
    { type: "enterStealth", unitId: hidden.id } as any,
    rng
  );
  const entered = resolveAllPendingRolls(enterInitial.state, rng);
  state = toBattleState(entered.state, "P2", archer.id);

  const initial = applyAction(
    state,
    { type: "attack", attackerId: archer.id, defenderId: visible.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(initial.state, rng);
  const attackEvent = resolved.events.find(
    (event) => event.type === "attackResolved" && event.defenderId === visible.id
  );

  assert(attackEvent, "archer should attack visible target through unknown hidden cell");
  assert(resolved.state.units[hidden.id].isStealthed === true, "line blocker should stay hidden");
  assert(
    !resolved.events.some(
      (event) => event.type === "stealthRevealed" && event.unitId === hidden.id
    ),
    "line validation should not reveal hidden blocker"
  );
  assert(
    resolved.state.knowledge.P2[hidden.id] !== true,
    "line validation should not leak hidden blocker position"
  );

  console.log("real_stealth_entry_does_not_block_archer_line passed");
}

export function testKnownHiddenEnemyBlocksMovementAndArcherLine() {
  const rng = new SeededRNG(2314);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_ODIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const odin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_ODIN_ID
  )!;
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const archer = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;
  const visible = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, odin.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, mover.id, { position: { col: 3, row: 2 } });
  state = setUnit(state, archer.id, { position: { col: 4, row: 1 } });
  state = setUnit(state, visible.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  const moveState = toBattleState(state, "P1", mover.id);
  const blockedMove = applyAction(
    moveState,
    { type: "move", unitId: mover.id, to: { col: 4, row: 3 } } as any,
    rng
  );
  assert(blockedMove.events.length === 0, "known hidden enemy should block movement");
  assert.deepStrictEqual(
    blockedMove.state.units[mover.id].position,
    { col: 3, row: 2 },
    "mover should stay in place when known hidden cell is occupied"
  );

  const attackState = toBattleState(state, "P1", archer.id);
  const attackRng = makeRngSequence([0.9, 0.9, 0.1, 0.1]);
  const blockedAttack = applyAction(
    attackState,
    { type: "attack", attackerId: archer.id, defenderId: visible.id } as any,
    attackRng
  );
  const resolvedBlockedAttack = resolveAllPendingRolls(
    blockedAttack.state,
    attackRng
  );
  assert(
    !resolvedBlockedAttack.events.some((event) => event.type === "attackResolved"),
    "known hidden enemy should block resolved archer attack to a farther target"
  );
  assert(
    !resolvedBlockedAttack.state.pendingRoll,
    "known hidden line blocker should clear pending attack without resolving"
  );

  console.log("known_hidden_enemy_blocks_movement_and_archer_line passed");
}

export function testNonRevealingAoEProjectionRedactsHiddenTargets() {
  const rng = new SeededRNG(2315);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const caster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, caster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, hidden.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", caster.id);
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    knowledge: {
      ...state.knowledge,
      P1: { ...state.knowledge.P1, [hidden.id]: false },
    },
  };

  const aoe = resolveAoE(
    state,
    caster.id,
    { col: 5, row: 5 },
    {
      radius: 1,
      revealHidden: false,
      abilityId: "testNonRevealAoe",
    },
    rng
  );
  const aoeEvent = aoe.events.find((event) => event.type === "aoeResolved");

  assert(aoeEvent && aoeEvent.type === "aoeResolved", "aoeResolved should be emitted");
  assert(aoe.affectedUnitIds.includes(hidden.id), "hidden target should be affected");
  assert(aoe.nextState.units[hidden.id].isStealthed === true, "hidden target should not be revealed");

  const opponentEvents = projectEventsForRecipient(aoe.nextState, [aoeEvent], "P1");
  const ownerEvents = projectEventsForRecipient(aoe.nextState, [aoeEvent], "P2");
  const spectatorEvents = projectEventsForRecipient(aoe.nextState, [aoeEvent], "spectator");

  const opponentAoe = opponentEvents[0];
  const ownerAoe = ownerEvents[0];
  const spectatorAoe = spectatorEvents[0];
  assert(opponentAoe.type === "aoeResolved", "opponent should still see public aoe event");
  assert(ownerAoe.type === "aoeResolved", "owner should see public aoe event");
  assert(spectatorAoe.type === "aoeResolved", "spectator should see public aoe event");
  if (opponentAoe.type === "aoeResolved") {
    assert(
      !opponentAoe.affectedUnitIds.includes(hidden.id),
      "opponent projection should redact hidden affected unit id"
    );
  }
  if (ownerAoe.type === "aoeResolved") {
    assert(
      ownerAoe.affectedUnitIds.includes(hidden.id),
      "owner projection should retain hidden affected unit id"
    );
  }
  if (spectatorAoe.type === "aoeResolved") {
    assert(
      !spectatorAoe.affectedUnitIds.includes(hidden.id),
      "spectator projection should redact hidden affected unit id"
    );
  }

  console.log("non_revealing_aoe_projection_redacts_hidden_targets passed");
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
