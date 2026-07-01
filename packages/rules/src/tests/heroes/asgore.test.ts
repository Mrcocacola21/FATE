import {
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_SOUL_PARADE,
  applyAction,
  assert,
  GameEvent,
  getHeroMeta,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_ASGORE_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  resolvePendingRollOnce,
  resolvePendingWithChoice,
  setUnit,
  setupAsgoreState,
  startAsgoreSoulParadeTurn,
  toBattleState,
} from "../helpers/testUtils";
export function testAsgoreHpBonus() {
  const { asgore } = setupAsgoreState();
  const baseHp = getUnitDefinition("knight").maxHp;
  const meta = getHeroMeta(HERO_ASGORE_ID);

  assert(asgore.hp === baseHp + 3, "Asgore HP should be base knight HP + 3");
  assert(
    meta?.baseStats.hp === baseHp + 3,
    "Asgore hero meta HP should be base knight HP + 3"
  );

  console.log("asgore_hp_bonus passed");
}


export function testAsgoreSpearmanReachAndDefenseDouble() {
  let { state, asgore } = setupAsgoreState();
  const rangeTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, rangeTarget.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, asgore.id);
  assert(
    legalTargets.includes(rangeTarget.id),
    "Asgore should use spearman reach and attack distance-2 targets"
  );

  const defended = resolveAttack(state, {
    attackerId: attacker.id,
    defenderId: asgore.id,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  const defendEvent = defended.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(defendEvent, "incoming attack on Asgore should resolve");
  assert(
    !defendEvent.hit,
    "Asgore should auto-dodge on defense double via spearman multiclass"
  );

  console.log("asgore_spearman_reach_and_defense_double passed");
}


export function testAsgoreFireballTargetingChargesAndDamage() {
  let { state, asgore } = setupAsgoreState();
  const lineTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const illegalTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIREBALL]: 0 },
  });
  state = setUnit(state, lineTarget.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, illegalTarget.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blockedByCharges = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    !blockedByCharges.state.pendingRoll,
    "Fireball should be blocked when charge is 0"
  );
  assert(
    blockedByCharges.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "blocked Fireball should not change charges"
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIREBALL]: 1 },
  });
  const illegalTargetUse = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: illegalTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    !illegalTargetUse.state.pendingRoll,
    "Fireball should reject illegal non-archer-line target"
  );
  assert(
    illegalTargetUse.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 1,
    "illegal Fireball target should not spend charge"
  );

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "legal Fireball should start normal attack roll flow"
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "Fireball should spend exactly 1 charge"
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fireball should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const attackEvent = [...used.events, ...resolved.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === lineTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Fireball attack should resolve");
  assert(attackEvent.hit, "Fireball should hit with deterministic winning roll");

  console.log("asgore_fireball_targeting_charges_and_damage passed");
}


export function testAsgoreFireParadeAreaResolutionAndChargeSpend() {
  let { state, asgore } = setupAsgoreState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const enemyNear = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const enemyFar = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIRE_PARADE]: 0 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyNear.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, enemyFar.id, { position: { col: 8, row: 8 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blocked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    } as any,
    makeRngSequence([])
  );
  assert(!blocked.state.pendingRoll, "Fire Parade should be blocked with 0 charges");
  assert(
    blocked.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "blocked Fire Parade should keep charges"
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIRE_PARADE]: 1 },
  });
  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Fire Parade should start shared-roll AoE flow"
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "Fire Parade should spend exactly 1 charge"
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fire Parade should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01, 0.01, 0.01])
  );
  const attackEvents = [...used.events, ...resolved.events].filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      [ally.id, enemyNear.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(
    attackEvents.length === 2,
    "Fire Parade should hit all units in trickster area around Asgore (including ally)"
  );
  const hitIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    hitIds,
    [ally.id, enemyNear.id].sort(),
    "Fire Parade should include nearby ally and enemy and skip far targets"
  );
  const rollSignatures = new Set(
    attackEvents.map((event) => event.attackerRoll.dice.join(","))
  );
  assert(
    rollSignatures.size === 1,
    "Fire Parade should use one shared attacker roll for AoE"
  );
  assert(
    !attackEvents.some((event) => event.defenderId === enemyFar.id),
    "Fire Parade should not affect units outside trickster area"
  );

  console.log("asgore_fire_parade_area_resolution_and_charge_spend passed");
}


export function testAsgoreSoulParadePatienceAttackAndTempStealth() {
  let { state, asgore } = setupAsgoreState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  assert(
    started.state.pendingRoll?.kind === "asgoreSoulParadeRoll",
    "Soul Parade should trigger at start turn when charges become full"
  );
  assert(
    started.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Soul Parade trigger should not spend charges before its result resolves"
  );

  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.1]));
  assert(
    rolled.state.pendingRoll?.kind === "asgoreSoulParadePatienceTargetChoice",
    "Soul Parade roll=1 should request Patience target"
  );
  assert(
    rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Patience target selection should not spend Soul Parade charges"
  );
  assert(
    !rolled.state.units[asgore.id].asgorePatienceStealthActive,
    "Patience branch should wait to enable temporary stealth until target resolution"
  );

  const targetPicked = resolvePendingWithChoice(
    rolled.state,
    { type: "asgoreSoulParadePatienceTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  assert(
    targetPicked.state.pendingRoll?.kind === "attack_attackerRoll",
    "Patience branch should trigger immediate attack flow"
  );
  assert(
    targetPicked.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
    "Patience target resolution should spend Soul Parade charges"
  );
  assert(
    !!targetPicked.state.units[asgore.id].asgorePatienceStealthActive,
    "Patience target resolution should enable temporary stealth threshold 5-6"
  );
  const resolvedAttack = resolveAllPendingRollsWithEvents(
    targetPicked.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const patienceAttack = [...targetPicked.events, ...resolvedAttack.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(patienceAttack, "Patience branch attack should resolve");

  let stealthState = setUnit(resolvedAttack.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  stealthState = { ...stealthState, currentPlayer: "P1", activeUnitId: asgore.id };
  const attemptFail = applyAction(
    stealthState,
    { type: "enterStealth", unitId: asgore.id } as any,
    makeRngSequence([])
  );
  assert(
    attemptFail.state.pendingRoll?.kind === "enterStealth",
    "Patience should allow Asgore to attempt stealth during this turn"
  );
  const failedStealth = resolvePendingRollOnce(
    attemptFail.state,
    makeRngSequence([0.5])
  ); // roll 4
  assert(
    !failedStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should fail on roll 4 (threshold 5-6)"
  );

  let secondAttemptState = setUnit(failedStealth.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondAttemptState = {
    ...secondAttemptState,
    currentPlayer: "P1",
    activeUnitId: asgore.id,
  };
  const attemptSuccess = applyAction(
    secondAttemptState,
    { type: "enterStealth", unitId: asgore.id } as any,
    makeRngSequence([])
  );
  const succeededStealth = resolvePendingRollOnce(
    attemptSuccess.state,
    makeRngSequence([0.8])
  ); // roll 5
  assert(
    succeededStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should succeed on roll 5"
  );

  console.log("asgore_soul_parade_patience_attack_and_temp_stealth passed");
}


export function testAsgoreSoulParadeBraveryAutoDefenseOneTime() {
  let { state, asgore } = setupAsgoreState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  assert(
    started.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Soul Parade trigger should not spend charges before Bravery resolves"
  );
  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.2])); // roll 2
  assert(!rolled.state.pendingRoll, "Bravery branch should resolve immediately");
  assert(
    rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
    "Bravery branch should spend Soul Parade charges when it resolves"
  );
  assert(
    !!rolled.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery branch should arm one-time auto defense"
  );

  let defendState = toBattleState(rolled.state, "P2", attacker.id);
  defendState = initKnowledgeForOwners(defendState);
  const attackStarted = applyAction(
    defendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id } as any,
    makeRngSequence([])
  );
  const afterAttacker = resolvePendingRollOnce(
    attackStarted.state,
    makeRngSequence([0.99, 0.99])
  );
  assert(
    afterAttacker.state.pendingRoll?.kind === "asgoreBraveryDefenseChoice",
    "Bravery choice should appear after attacker roll"
  );

  const autoChosen = applyAction(
    afterAttacker.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttacker.state.pendingRoll!.id,
      player: afterAttacker.state.pendingRoll!.player,
      choice: "auto",
    } as any,
    makeRngSequence([])
  );
  const autoEvent = autoChosen.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(autoEvent, "attack should resolve after Bravery auto-defense");
  assert(!autoEvent.hit && autoEvent.damage === 0, "Bravery auto-defense should negate hit");
  assert(
    !autoChosen.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery auto-defense should be consumed after one use"
  );

  let secondDefendState = toBattleState(autoChosen.state, "P2", attacker.id);
  secondDefendState = initKnowledgeForOwners(secondDefendState);
  secondDefendState = setUnit(secondDefendState, attacker.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  const secondStart = applyAction(
    secondDefendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id } as any,
    makeRngSequence([])
  );
  const secondAfterAttacker = resolvePendingRollOnce(
    secondStart.state,
    makeRngSequence([0.99, 0.99])
  );
  assert(
    secondAfterAttacker.state.pendingRoll?.kind === "attack_defenderRoll",
    "After Bravery is spent, defense should proceed with normal defender roll"
  );

  console.log("asgore_soul_parade_bravery_auto_defense_one_time passed");
}


export function testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice() {
  {
    let { state, asgore } = setupAsgoreState();
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.4])); // roll 3
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeIntegrityDestination",
      "Soul Parade roll=3 should request Integrity destination"
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Integrity destination selection should not spend Soul Parade charges"
    );
    const moved = resolvePendingWithChoice(
      rolled.state,
      {
        type: "asgoreSoulParadeIntegrityDestination",
        position: { col: 8, row: 8 },
      },
      makeRngSequence([])
    );
    assert(
      moved.state.units[asgore.id].position?.col === 8 &&
        moved.state.units[asgore.id].position?.row === 8,
      "Integrity should reposition Asgore to selected empty cell"
    );
    assert(
      !moved.state.units[asgore.id].turn.moveUsed,
      "Integrity reposition should not consume move action"
    );
    assert(
      moved.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Integrity destination resolution should spend Soul Parade charges"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 5, row: 4 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.55])); // roll 4
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadePerseveranceTargetChoice",
      "Soul Parade roll=4 should request Perseverance target"
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Perseverance target selection should not spend Soul Parade charges"
    );
    const applied = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadePerseveranceTarget", targetId: target.id },
      makeRngSequence([0.1]) // fail check
    );
    assert(
      !!applied.state.units[target.id].movementDisabledNextTurn,
      "Perseverance failed check should disable target movement next turn"
    );
    assert(
      applied.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Perseverance target resolution should spend Soul Parade charges"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      hp: 5,
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.7])); // roll 5
    assert(!rolled.state.pendingRoll, "Kindness branch should resolve immediately");
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Kindness branch should spend Soul Parade charges when it resolves"
    );
    assert(
      rolled.state.units[asgore.id].hp === 7,
      "Kindness should heal Asgore by 2 HP"
    );
  }

  {
    let { state, asgore } = setupAsgoreState();
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 4, row: 6 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.95])); // roll 6
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice",
      "Soul Parade roll=6 should request Justice target"
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Justice target selection should not spend Soul Parade charges"
    );
    const justiceOptions =
      (rolled.state.pendingRoll?.context as { options?: string[] } | undefined)
        ?.options ?? [];
    assert(
      justiceOptions.includes(target.id),
      "Justice target options should include archer-legal target"
    );
    const picked = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadeJusticeTarget", targetId: target.id },
      makeRngSequence([])
    );
    assert(
      picked.state.pendingRoll?.kind === "attack_attackerRoll",
      "Justice branch should trigger immediate ranged attack flow"
    );
    assert(
      picked.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Justice target resolution should spend Soul Parade charges"
    );
    const resolved = resolveAllPendingRollsWithEvents(
      picked.state,
      makeRngSequence([0.99, 0.99, 0.01, 0.01])
    );
    const justiceAttack = [...picked.events, ...resolved.events].find(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === asgore.id &&
        event.defenderId === target.id
    ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
    assert(justiceAttack, "Justice branch attack should resolve");
    assert(justiceAttack.hit, "Justice branch should hit with winning deterministic roll");
  }

  console.log("asgore_soul_parade_integrity_perseverance_kindness_justice passed");
}
