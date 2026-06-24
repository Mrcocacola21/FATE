import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_TEST_MULTI_SLOT,
  applyAction,
  applyActionRaw,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getLegalAttackTargets,
  initKnowledgeForOwners,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupSpearmanAttackState,
  toBattleState,
} from "../helpers/testUtils";
export function testBerserkerAutoDefenseEnabled() {
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


export function testBerserkerAutoDefenseDeclined() {
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


export function testBerserkerAutoDefenseNoCharges() {
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


export function testBerserkerDefenseChoiceAutoDodgeSpends6() {
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


export function testBerserkerDefenseChoiceRollUsesNormalCombat() {
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
    {
      type: "resolvePendingRoll",
      pendingRollId: pending1!.id,
      player: pending1!.player,
    } as any,
    rng
  );

  const pending2 = step2.state.pendingRoll;
  assert(
    pending2 && pending2.kind === "berserkerDefenseChoice",
    "berserkerDefenseChoice roll should be requested after attacker roll"
  );

  const step3 = applyActionRaw(
    step2.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending2!.id,
      choice: "roll",
      player: pending2!.player,
    } as any,
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


export function testCannotAutoDodgeIfChargesNot6() {
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


export function testCannotAttackTwicePerTurn() {
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


export function testAttackConsumesActionSlot() {
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


export function testTricksterAoEIs5x5Radius2() {
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


export function testTricksterAoEHitsAllies() {
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


export function testTricksterAoEDoesNotDamageSelf() {
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


export function testTricksterAoEAttackerRollOnce() {
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


export function testTricksterAoEMultipleDefendersRollSeparately() {
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


export function testTricksterAoEConsumesAttack() {
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


export function testSpearmanAttackIncludesAdjacentRing() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const adjacents = [
    { col: 3, row: 3 },
    { col: 3, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 3 },
    { col: 4, row: 5 },
    { col: 5, row: 3 },
    { col: 5, row: 4 },
    { col: 5, row: 5 },
  ];

  for (const coord of adjacents) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack adjacent cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_includes_adjacent_ring passed");
}


export function testSpearmanAttackKeepsDistance2Directions() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const reach2 = [
    { col: 2, row: 4 },
    { col: 6, row: 4 },
    { col: 4, row: 2 },
    { col: 4, row: 6 },
    { col: 2, row: 2 },
    { col: 2, row: 6 },
    { col: 6, row: 2 },
    { col: 6, row: 6 },
  ];

  for (const coord of reach2) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack reach-2 cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_keeps_distance2_directions passed");
}


export function testSpearmanAttackExcludesSelf() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 4,
    row: 4,
  });
  const state = setUnit(baseState, enemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: false,
    stealthTurnsLeft: 0,
  });
  const targets = getLegalAttackTargets(state, spearman.id);
  assert(!targets.includes(spearman.id), "spearman should not be able to target self");
  assert(targets.includes(enemy.id), "spearman should still have a valid enemy target");

  console.log("spearman_attack_excludes_self passed");
}


export function testSpearmanAttackRespectsBounds() {
  const { state: baseState, spearman, enemy } = setupSpearmanAttackState({
    col: 0,
    row: 0,
  });
  const inBoundsTargets = [
    { col: 0, row: 1 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 0, row: 2 },
    { col: 2, row: 0 },
    { col: 2, row: 2 },
  ];
  const outOfRangeTargets = [
    { col: 1, row: 2 },
    { col: 2, row: 1 },
    { col: 0, row: 3 },
    { col: 3, row: 0 },
    { col: 3, row: 3 },
  ];

  for (const coord of inBoundsTargets) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      targets.includes(enemy.id),
      `spearman should attack in-bounds cell ${coord.col},${coord.row}`
    );
  }

  for (const coord of outOfRangeTargets) {
    const state = setUnit(baseState, enemy.id, {
      position: coord,
      isStealthed: false,
      stealthTurnsLeft: 0,
    });
    const targets = getLegalAttackTargets(state, spearman.id);
    assert(
      !targets.includes(enemy.id),
      `spearman should not attack out-of-range cell ${coord.col},${coord.row}`
    );
  }

  console.log("spearman_attack_respects_bounds passed");
}


export function testArcherCanShootThroughAllies() {
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


export function testArcherCannotShootThroughEnemies() {
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


export function testArcherAttacksFirstOnLine() {
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


export function testArcherCanAttackDiagonalFirstTargetOnly() {
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


export function testArcherCanShootThroughAlliesDiagonal() {
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


export function testArcherCannotShootThroughEnemiesDiagonal() {
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


export function testAbilityConsumesMultipleSlots() {
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
