import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  HERO_GRIFFITH_ID,
  HERO_PAPYRUS_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
export function testPapyrusLongLiverAdds2Hp() {
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const baseSpearman = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;

  assert(
    papyrus.hp === baseSpearman.hp + 2,
    "Papyrus should have +2 max HP compared to base spearman"
  );

  console.log("papyrus_longliver_adds_2hp passed");
}


export function testPapyrusBlueBoneApplyPunishRefreshAndExpiry() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.01,
  ]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, papyrus.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 }, hp: 6 });
  state = toBattleState(state, "P1", papyrus.id);
  state = initKnowledgeForOwners(state);

  const firstAttack = applyAction(
    state,
    { type: "attack", attackerId: papyrus.id, defenderId: enemy.id } as any,
    rng
  );
  const firstResolved = resolveAllPendingRollsWithEvents(firstAttack.state, rng);
  state = firstResolved.state;

  const firstStatus = state.units[enemy.id].papyrusBoneStatus;
  assert(firstStatus, "blue bone status should be applied on hit");
  assert(
    firstStatus?.kind === "blue",
    "default Papyrus hit should apply Blue Bone"
  );
  assert(
    firstStatus?.expiresOnSourceOwnTurn === 1,
    "blue bone should expire on Papyrus next own turn start"
  );

  state = {
    ...state,
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    units: {
      ...state.units,
      [enemy.id]: {
        ...state.units[enemy.id],
        turn: makeEmptyTurnEconomy(),
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
        hasActedThisTurn: false,
        stealthAttemptedThisTurn: false,
      },
    },
  };

  const hpBeforeMove = state.units[enemy.id].hp;
  const moved = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 6 } } as any,
    rng
  );
  assert(
    moved.state.units[enemy.id].hp === hpBeforeMove - 1,
    "spending move slot under Blue Bone should deal 1 damage"
  );
  assert(
    moved.events.some(
      (event) =>
        event.type === "papyrusBonePunished" &&
        event.targetId === enemy.id &&
        event.reason === "moveSpent"
    ),
    "blue bone movement punishment event should be emitted"
  );

  const movedAgain = applyAction(
    moved.state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 7 } } as any,
    rng
  );
  assert(
    movedAgain.state.units[enemy.id].hp === moved.state.units[enemy.id].hp,
    "blue bone punishment should trigger at most once per turn"
  );

  state = setUnit(movedAgain.state, papyrus.id, {
    ownTurnsStarted: 1,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    position: { col: 4, row: 4 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 5 },
    hp: 6,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    papyrusBoneStatus: {
      sourceUnitId: papyrus.id,
      kind: "blue",
      expiresOnSourceOwnTurn: 1,
    },
  });
  state = {
    ...state,
    currentPlayer: "P1",
    activeUnitId: papyrus.id,
  };
  const refreshRng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);

  const secondAttack = applyAction(
    state,
    { type: "attack", attackerId: papyrus.id, defenderId: enemy.id } as any,
    refreshRng
  );
  const secondResolved = resolveAllPendingRollsWithEvents(
    secondAttack.state,
    refreshRng
  );
  state = secondResolved.state;

  const refreshedStatus = state.units[enemy.id].papyrusBoneStatus;
  assert(
    refreshedStatus?.expiresOnSourceOwnTurn === 2,
    "reapplying Blue Bone should refresh expiry"
  );

  state = {
    ...state,
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [papyrus.id],
    turnQueueIndex: 0,
    turnOrder: [papyrus.id],
    turnOrderIndex: 0,
  };
  const startTurn = applyAction(
    state,
    { type: "unitStartTurn", unitId: papyrus.id } as any,
    rng
  );
  assert(
    startTurn.state.units[enemy.id].papyrusBoneStatus === undefined,
    "Blue Bone should expire at start of Papyrus turn"
  );

  console.log("papyrus_bluebone_apply_punish_refresh_and_expiry passed");
}


export function testPapyrusSpaghettiGatingHealingClampAndChargeSpend() {
  const rng = makeRngSequence([]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;

  state = setUnit(state, papyrus.id, {
    position: { col: 4, row: 4 },
    hp: 5,
    charges: {
      ...papyrus.charges,
      [ABILITY_PAPYRUS_SPAGHETTI]: 2,
    },
  });
  state = toBattleState(state, "P1", papyrus.id);
  state = initKnowledgeForOwners(state);

  const fail = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_SPAGHETTI,
    } as any,
    rng
  );
  assert(
    fail.state.units[papyrus.id].hp === 5,
    "spaghetti should not heal when below required charges"
  );
  assert(
    fail.state.units[papyrus.id].charges[ABILITY_PAPYRUS_SPAGHETTI] === 2,
    "spaghetti should not spend charges when unavailable"
  );

  state = setUnit(fail.state, papyrus.id, {
    hp: 5,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...fail.state.units[papyrus.id].charges,
      [ABILITY_PAPYRUS_SPAGHETTI]: 3,
    },
  });
  const healed = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_SPAGHETTI,
    } as any,
    rng
  );
  assert(
    healed.state.units[papyrus.id].hp === 7,
    "spaghetti should heal Papyrus by 2 HP"
  );
  assert(
    healed.state.units[papyrus.id].charges[ABILITY_PAPYRUS_SPAGHETTI] === 0,
    "spaghetti should spend 3 charges on use"
  );

  state = setUnit(healed.state, papyrus.id, {
    hp: 6,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...healed.state.units[papyrus.id].charges,
      [ABILITY_PAPYRUS_SPAGHETTI]: 3,
    },
  });
  const clamped = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_SPAGHETTI,
    } as any,
    rng
  );
  assert(
    clamped.state.units[papyrus.id].hp === 7,
    "spaghetti healing should clamp at max HP"
  );
  const healedEvent = clamped.events.find(
    (event) => event.type === "unitHealed"
  );
  assert(
    healedEvent && healedEvent.type === "unitHealed" && healedEvent.amount === 1,
    "clamped spaghetti should report only effective healing"
  );

  console.log("papyrus_spaghetti_gating_healing_clamp_and_charges passed");
}


export function testPapyrusCoolGuyGatingLineHitsAndBlueBone() {
  const rng = makeRngSequence([
    0.99, 0.99,
    0.01, 0.01,
    0.01, 0.01,
    0.01, 0.01,
  ]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const enemyA = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const enemyB = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const farEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;

  state = setUnit(state, papyrus.id, {
    position: { col: 0, row: 0 },
    charges: {
      ...papyrus.charges,
      [ABILITY_PAPYRUS_COOL_GUY]: 4,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 2, row: 4 } });
  state = setUnit(state, enemyA.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyB.id, { position: { col: 8, row: 4 } });
  state = setUnit(state, farEnemy.id, { position: { col: 1, row: 1 } });
  state = toBattleState(state, "P1", papyrus.id);
  state = initKnowledgeForOwners(state);

  const fail = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_COOL_GUY,
      payload: { target: { col: 4, row: 4 }, axis: "row" },
    } as any,
    rng
  );
  assert(
    !fail.state.pendingRoll,
    "Cool Guy should be gated when Papyrus has fewer than 5 charges"
  );
  assert(
    fail.state.units[papyrus.id].charges[ABILITY_PAPYRUS_COOL_GUY] === 4,
    "failed Cool Guy cast should not spend charges"
  );

  state = setUnit(fail.state, papyrus.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...fail.state.units[papyrus.id].charges,
      [ABILITY_PAPYRUS_COOL_GUY]: 5,
    },
  });
  const cast = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_COOL_GUY,
      payload: { target: { col: 4, row: 4 }, axis: "row" },
    } as any,
    rng
  );
  assert(
    cast.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Cool Guy should start line-resolution pending rolls"
  );
  assert(
    cast.state.units[papyrus.id].charges[ABILITY_PAPYRUS_COOL_GUY] === 0,
    "Cool Guy should spend 5 charges in base mode"
  );

  const resolved = resolveAllPendingRollsWithEvents(cast.state, rng);
  const events = [...cast.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" && event.attackerId === papyrus.id
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  const attackedIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    attackedIds,
    [ally.id, enemyA.id, enemyB.id].sort(),
    "Cool Guy should hit all units on selected line"
  );
  assert(
    !attackedIds.includes(farEnemy.id),
    "Cool Guy should not hit units outside selected line"
  );

  for (const unitId of [ally.id, enemyA.id, enemyB.id]) {
    const status = resolved.state.units[unitId].papyrusBoneStatus;
    assert(status?.kind === "blue", "Cool Guy hits should apply Blue Bone");
  }

  console.log("papyrus_cool_guy_gating_line_hits_and_bluebone passed");
}


export function testPapyrusUnbelieverTriggersOnAlliedHeroDeathAndPersists() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", {
    spearman: HERO_PAPYRUS_ID,
    knight: HERO_GRIFFITH_ID,
  });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const fallenAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GRIFFITH_ID
  )!;
  const killer = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "berserker"
  )!;

  state = setUnit(state, papyrus.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, fallenAlly.id, { position: { col: 4, row: 5 }, hp: 1 });
  state = setUnit(state, killer.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P2", killer.id);
  state = initKnowledgeForOwners(state);

  const attack = applyAction(
    state,
    { type: "attack", attackerId: killer.id, defenderId: fallenAlly.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(attack.state, rng);
  const events = [...attack.events, ...resolved.events];

  const papyrusAfter = resolved.state.units[papyrus.id];
  assert(
    papyrusAfter.papyrusUnbelieverActive === true,
    "Papyrus should transform after allied hero death"
  );
  const transformEvents = events.filter(
    (event) => event.type === "papyrusUnbelieverActivated"
  );
  assert(
    transformEvents.length === 1,
    "Unbeliever activation should happen only once"
  );
  assert(
    transformEvents[0] &&
      transformEvents[0].type === "papyrusUnbelieverActivated" &&
      transformEvents[0].fallenAllyId === fallenAlly.id,
    "Unbeliever activation should reference fallen allied hero"
  );

  state = {
    ...resolved.state,
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [papyrus.id],
    turnQueueIndex: 0,
    turnOrder: [papyrus.id],
    turnOrderIndex: 0,
  };
  const startTurn = applyAction(
    state,
    { type: "unitStartTurn", unitId: papyrus.id } as any,
    rng
  );
  assert(
    startTurn.state.units[papyrus.id].papyrusUnbelieverActive === true,
    "Unbeliever mode should persist permanently"
  );

  console.log("papyrus_unbeliever_triggers_on_allied_hero_death_and_persists passed");
}


export function testPapyrusOrangeBoneToggleAndEndTurnPunish() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, papyrus.id, {
    position: { col: 4, row: 4 },
    papyrusUnbelieverActive: true,
    papyrusBoneMode: "blue",
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", papyrus.id);
  state = initKnowledgeForOwners(state);

  const toggle = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_ORANGE_BONE,
      payload: { boneType: "orange" },
    } as any,
    rng
  );
  assert(
    toggle.state.units[papyrus.id].papyrusBoneMode === "orange",
    "Orange Bone toggle should switch Papyrus to orange mode"
  );

  const attack = applyAction(
    toggle.state,
    { type: "attack", attackerId: papyrus.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(attack.state, rng);
  state = resolved.state;
  const orangeStatus = state.units[enemy.id].papyrusBoneStatus;
  assert(
    orangeStatus?.kind === "orange",
    "Orange Bone mode should apply orange status on hit"
  );

  state = {
    ...state,
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    units: {
      ...state.units,
      [enemy.id]: {
        ...state.units[enemy.id],
        turn: makeEmptyTurnEconomy(),
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
        hasActedThisTurn: false,
        stealthAttemptedThisTurn: false,
      },
    },
  };
  const hpBeforeEnd = state.units[enemy.id].hp;
  const endTurn = applyAction(state, { type: "endTurn" } as any, rng);
  assert(
    endTurn.state.units[enemy.id].hp === hpBeforeEnd - 1,
    "Orange Bone should punish ending turn without spending move slot"
  );
  assert(
    endTurn.events.some(
      (event) =>
        event.type === "papyrusBonePunished" &&
        event.targetId === enemy.id &&
        event.reason === "moveNotSpent"
    ),
    "Orange Bone end-turn punishment event should be emitted"
  );

  console.log("papyrus_orange_bone_toggle_and_end_turn_punish passed");
}


export function testPapyrusLongBoneAttackAndCoolGuyCostReduction() {
  const rng = makeRngSequence([
    0.99, 0.99,
    0.01, 0.01,
    0.01, 0.01,
    0.99, 0.99,
    0.01, 0.01,
    0.01, 0.01,
  ]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const far = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, papyrus.id, {
    position: { col: 0, row: 0 },
    papyrusUnbelieverActive: true,
    papyrusLongBoneMode: true,
    papyrusLineAxis: "row",
    charges: {
      ...papyrus.charges,
      [ABILITY_PAPYRUS_COOL_GUY]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 2, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 0 } });
  state = setUnit(state, far.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", papyrus.id);
  state = initKnowledgeForOwners(state);

  const lineAttack = applyAction(
    state,
    { type: "attack", attackerId: papyrus.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    lineAttack.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Long Bone mode should convert basic attack to line attack resolution"
  );
  const lineResolved = resolveAllPendingRollsWithEvents(lineAttack.state, rng);
  const lineEvents = [...lineAttack.events, ...lineResolved.events];
  const lineTargets = lineEvents
    .filter(
      (event) =>
        event.type === "attackResolved" && event.attackerId === papyrus.id
    )
    .map((event) =>
      event.type === "attackResolved" ? event.defenderId : ""
    )
    .filter((id) => id.length > 0)
    .sort();
  assert.deepStrictEqual(
    lineTargets,
    [ally.id, enemy.id].sort(),
    "Long Bone basic attack should hit all units on selected line"
  );
  assert(
    !lineTargets.includes(far.id),
    "Long Bone basic attack should not hit units outside selected line"
  );

  state = setUnit(lineResolved.state, papyrus.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...lineResolved.state.units[papyrus.id].charges,
      [ABILITY_PAPYRUS_COOL_GUY]: 2,
    },
  });
  state = {
    ...state,
    currentPlayer: "P1",
    activeUnitId: papyrus.id,
  };
  const fail = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_COOL_GUY,
      payload: { target: { col: 4, row: 0 }, axis: "row" },
    } as any,
    rng
  );
  assert(
    fail.state.units[papyrus.id].charges[ABILITY_PAPYRUS_COOL_GUY] === 2,
    "Cool Guy should still require enough charges in Unbeliever mode"
  );
  assert(!fail.state.pendingRoll, "Cool Guy should fail at 2 charges in Unbeliever mode");

  state = setUnit(fail.state, papyrus.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...fail.state.units[papyrus.id].charges,
      [ABILITY_PAPYRUS_COOL_GUY]: 3,
    },
  });
  const cast = applyAction(
    state,
    {
      type: "useAbility",
      unitId: papyrus.id,
      abilityId: ABILITY_PAPYRUS_COOL_GUY,
      payload: { target: { col: 4, row: 0 }, axis: "row" },
    } as any,
    rng
  );
  assert(
    cast.state.units[papyrus.id].charges[ABILITY_PAPYRUS_COOL_GUY] === 0,
    "Cool Guy should cost 3 charges in Unbeliever mode"
  );

  console.log("papyrus_long_bone_attack_and_cool_guy_cost_reduction passed");
}


export function testPapyrusOssifiedBerserkerFeatureAfterTransformationOnly() {
  const rng = makeRngSequence([
    0.99, 0.99,
    0.01, 0.01,
    0.99, 0.99,
    0.01, 0.01,
  ]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, papyrus.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const preTransformState = setUnit(state, papyrus.id, {
    papyrusUnbelieverActive: false,
    charges: {
      ...state.units[papyrus.id].charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
  const preAttack = applyAction(
    preTransformState,
    { type: "attack", attackerId: attacker.id, defenderId: papyrus.id } as any,
    rng
  );
  const preAfterAttacker = resolvePendingRollOnce(preAttack.state, rng);
  assert(
    preAfterAttacker.state.pendingRoll?.kind === "attack_defenderRoll",
    "Papyrus should not get berserker defense choice before Unbeliever mode"
  );

  const postTransformState = setUnit(state, papyrus.id, {
    papyrusUnbelieverActive: true,
    charges: {
      ...state.units[papyrus.id].charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
  const postAttack = applyAction(
    postTransformState,
    { type: "attack", attackerId: attacker.id, defenderId: papyrus.id } as any,
    rng
  );
  const postAfterAttacker = resolvePendingRollOnce(postAttack.state, rng);
  assert(
    postAfterAttacker.state.pendingRoll?.kind === "berserkerDefenseChoice",
    "Papyrus should get berserker defense choice after Unbeliever mode"
  );

  console.log("papyrus_ossified_berserker_feature_after_transformation_only passed");
}
