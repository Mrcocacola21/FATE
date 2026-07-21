import {
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  getHeroMeta,
  HERO_GENGHIS_KHAN_ID,
  HERO_VLAD_TEPES_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupVladState,
  toBattleState,
} from "../helpers/testUtils";
export function testPolkovodetsAppliesToAdjacentAlliesNotSelf() {
  let { state, vlad, enemy } = setupVladState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", ally.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: ally.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === ally.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "attack should hit");
  assert(
    attackEvent.damage === ally.attack + 1,
    "adjacent ally should get +1 damage"
  );

  let state2 = setupVladState().state;
  const vlad2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_VLAD_TEPES_ID
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  state2 = setUnit(state2, vlad2.id, { position: { col: 4, row: 4 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 6 } });
  state2 = toBattleState(state2, "P1", vlad2.id);
  state2 = initKnowledgeForOwners(state2);

  const rng2 = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res2 = applyAction(
    state2,
    { type: "attack", attackerId: vlad2.id, defenderId: enemy2.id } as any,
    rng2
  );
  res2 = resolveAllPendingRolls(res2.state, rng2);
  const attackEvent2 = res2.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === vlad2.id &&
      e.defenderId === enemy2.id
  );
  assert(attackEvent2 && attackEvent2.type === "attackResolved", "attack should resolve");
  assert(attackEvent2.hit, "attack should hit");
  assert(
    attackEvent2.damage === vlad2.attack,
    "Vlad should not receive his own aura bonus"
  );

  console.log("polkovodets_applies_to_adjacent_allies_not_self passed");
}


export function testPolkovodetsDoesNotStack() {
  let { state, vlad, enemy } = setupVladState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const secondVlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== vlad.id && u.id !== ally.id
  )!;

  state = setUnit(state, vlad.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, secondVlad.id, {
    position: { col: 5, row: 4 },
    heroId: HERO_VLAD_TEPES_ID,
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", ally.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: ally.id, defenderId: enemy.id } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === ally.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "attack should hit");
  assert(
    attackEvent.damage === ally.attack + 1,
    "polkovodets bonus should not stack"
  );

  console.log("polkovodets_does_not_stack passed");
}


export function testPolkovodetsRiderOnlyIfStartOrEndInAura() {
  let { state, vlad } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 3 } } as any,
    rng
  );
  res = resolveAllPendingRolls(res.state, rng);
  const attackEvent = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === rider.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "rider attack should resolve");
  assert(attackEvent.hit, "rider attack should hit");
  assert(
    attackEvent.damage === rider.attack + 1,
    "rider should gain aura bonus when starting in aura"
  );

  let state2 = setupVladState().state;
  const vlad2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_VLAD_TEPES_ID
  )!;
  const rider2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state2 = setUnit(state2, vlad2.id, { position: { col: 3, row: 3 } });
  state2 = setUnit(state2, rider2.id, { position: { col: 0, row: 0 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 0, row: 2 } });
  state2 = toBattleState(state2, "P1", rider2.id);
  state2 = initKnowledgeForOwners(state2);

  const rng2 = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let res2 = applyAction(
    state2,
    { type: "move", unitId: rider2.id, to: { col: 0, row: 3 } } as any,
    rng2
  );
  res2 = resolveAllPendingRolls(res2.state, rng2);
  const attackEvent2 = res2.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === rider2.id &&
      e.defenderId === enemy2.id
  );
  assert(attackEvent2 && attackEvent2.type === "attackResolved", "rider attack should resolve");
  assert(attackEvent2.hit, "rider attack should hit");
  assert(
    attackEvent2.damage === rider2.attack,
    "rider should not gain aura bonus when outside aura"
  );

  console.log("polkovodets_rider_only_if_start_or_end_in_aura passed");
}


export function testGenghisHpIs7() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const meta = getHeroMeta(HERO_GENGHIS_KHAN_ID);
  assert(genghis.hp === 7, "Genghis HP should be exactly 7");
  assert(meta?.baseStats.hp === 7, "Genghis hero meta HP should be exactly 7");
  console.log("genghis_hp_is_7 passed");
}


export function testKhansDecreeDoesNotConsumeMoveSlot() {
  const rng = new SeededRNG(101);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2 },
  });
  state = toBattleState(state, "P1", genghis.id);

  const res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const updated = res.state.units[genghis.id];
  assert(
    updated.charges[ABILITY_GENGHIS_KHAN_KHANS_DECREE] === 0,
    "decree should spend 2 charges"
  );
  assert(
    updated.turn.moveUsed === false,
    "decree should not consume move slot"
  );
  assert(
    res.state.pendingMove && res.state.pendingMove.unitId === genghis.id,
    "decree should create pending move options"
  );

  console.log("khans_decree_does_not_consume_move_slot passed");
}


export function testKhansDecreeAllowsDiagonalMoveThenConsumesMove() {
  const rng = new SeededRNG(102);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const pending = res.state.pendingMove;
  assert(
    pending &&
      pending.unitId === genghis.id &&
      pending.legalTo.some((c) => c.col === 2 && c.row === 2),
    "decree should allow diagonal line moves"
  );

  const moveRes = applyAction(
    res.state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );
  const moved = moveRes.state.units[genghis.id];
  assert(
    moved.position?.col === 2 && moved.position?.row === 2,
    "diagonal move should succeed after decree"
  );
  assert(moved.turn.moveUsed === true, "move should consume move slot");

  const endRes = applyAction(moveRes.state, { type: "endTurn" } as any, rng);
  const afterEnd = endRes.state.units[genghis.id];
  assert(
    afterEnd.genghisKhanDiagonalMoveActive === false,
    "diagonal move flag should clear on end turn"
  );

  console.log("khans_decree_allows_diagonal_move_then_consumes_move passed");
}

export function testKhansDecreeRejectsDiagonalMoveWithoutStatus() {
  const rng = new SeededRNG(104);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2 },
  });
  state = toBattleState(state, "P1", genghis.id);

  const rejected = applyAction(
    state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );

  assert.deepStrictEqual(
    rejected.state,
    state,
    "diagonal move without Decree status should not mutate state"
  );
  assert.strictEqual(rejected.events.length, 0);

  console.log("khans_decree_rejects_diagonal_move_without_status passed");
}

export function testKhansDecreeDiagonalMoveTriggersRiderAttacksForTouchedEnemies() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.01,
    0.99, 0.99, 0.01, 0.01,
  ]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: {
      ...genghis.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2,
    },
  });
  state = setUnit(state, enemy1.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, enemy2.id, { position: { col: 0, row: 1 } });
  state = toBattleState(state, "P1", genghis.id);
  state = initKnowledgeForOwners(state);

  const hpBefore = {
    [enemy1.id]: state.units[enemy1.id].hp,
    [enemy2.id]: state.units[enemy2.id].hp,
  };
  const decree = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const moved = applyAction(
    decree.state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );

  assert(
    moved.state.pendingRoll?.kind === "riderPathAttack_attackerRoll",
    "diagonal Decree movement should enter the normal Rider attack pipeline"
  );
  const resolved = resolveAllPendingRollsWithEvents(moved.state, rng);
  const events = [...decree.events, ...moved.events, ...resolved.events];

  for (const enemy of [enemy1, enemy2]) {
    const attacks = events.filter(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === genghis.id &&
        event.defenderId === enemy.id
    );
    assert(attacks.length === 1, `Rider should attack ${enemy.id} at most once`);
    assert(
      resolved.state.units[enemy.id].hp < hpBefore[enemy.id],
      `Rider should damage touched enemy ${enemy.id}`
    );
  }
  const updated = resolved.state.units[genghis.id];
  assert(updated.turn.moveUsed, "Decree movement should spend the move slot");
  assert(
    updated.charges[ABILITY_GENGHIS_KHAN_KHANS_DECREE] === 0,
    "Decree should spend exactly 2 charges"
  );
  assert(
    updated.genghisKhanDecreeMovePending !== true,
    "Decree movement pending flag should clear after the move"
  );

  console.log("khans_decree_diagonal_move_triggers_rider_attacks_for_touched_enemies passed");
}

export function testKhansDecreeIgnoresHiddenTouchedEnemies() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
  )!;
  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: {
      ...genghis.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2,
    },
  });
  state = setUnit(state, hidden.id, {
    position: { col: 1, row: 0 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", genghis.id);
  state = initKnowledgeForOwners(state);
  const hpBefore = state.units[hidden.id].hp;

  const decree = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const moved = applyAction(
    decree.state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );

  assert(!moved.state.pendingRoll, "Decree should not queue attacks for hidden touched enemies");
  assert(moved.state.units[hidden.id].hp === hpBefore, "hidden touched enemy should take no damage");
  assert(
    moved.state.units[hidden.id].isStealthed === true,
    "hidden touched enemy should remain stealthed"
  );
  assert(
    !moved.events.some(
      (event) =>
        (event.type === "attackResolved" && event.defenderId === hidden.id) ||
        (event.type === "stealthRevealed" && event.unitId === hidden.id)
    ),
    "Decree movement should emit no attack or reveal event for hidden enemies"
  );

  console.log("khans_decree_ignores_hidden_touched_enemies passed");
}

export function testKhansDecreeDiagonalMoveTriggersDestinationHazardOnce() {
  const rng = new SeededRNG(105);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: {
      ...genghis.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2,
    },
  });
  state = {
    ...toBattleState(state, "P1", genghis.id),
    stakeMarkers: [
      {
        id: "decree-stake",
        owner: "P2",
        position: { col: 1, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };
  state = initKnowledgeForOwners(state);

  const decree = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const moved = applyAction(
    decree.state,
    { type: "move", unitId: genghis.id, to: { col: 2, row: 2 } } as any,
    rng
  );
  const events = [...decree.events, ...moved.events];
  const updated = moved.state.units[genghis.id];

  assert(
    updated.position?.col === 1 && updated.position?.row === 1,
    "Decree diagonal movement should stop on the path stake"
  );
  assert.strictEqual(updated.hp, genghis.hp - 1);
  assert(
    events.some(
      (event) =>
        event.type === "unitMoved" &&
        event.unitId === genghis.id &&
        event.to.col === 1 &&
        event.to.row === 1
    ),
    "Decree diagonal movement should emit the normal unitMoved event"
  );
  assert.strictEqual(
    events.filter((event) => event.type === "stakeTriggered").length,
    1,
    "Decree diagonal movement should trigger the destination hazard exactly once"
  );
  assert(
    moved.state.stakeMarkers[0].isRevealed,
    "Decree diagonal movement should reveal the triggered stake"
  );

  console.log("khans_decree_diagonal_move_triggers_destination_hazard_once passed");
}


export function testKhansDecreeCannotBeUsedAfterMove() {
  const rng = new SeededRNG(103);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 0 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 1 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    { type: "move", unitId: genghis.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const moved = res.state.units[genghis.id];
  assert(moved.turn.moveUsed === true, "move should consume move slot");

  const attempt = applyAction(
    res.state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    rng
  );
  const afterAttempt = attempt.state.units[genghis.id];
  assert(
    afterAttempt.charges[ABILITY_GENGHIS_KHAN_KHANS_DECREE] === 1,
    "decree should not spend charges after move"
  );
  assert(
    !attempt.state.pendingMove,
    "decree should not create pending move after move"
  );
  assert(
    afterAttempt.genghisKhanDiagonalMoveActive !== true,
    "decree should not enable diagonal movement after move"
  );
  assert(attempt.events.length === 0, "blocked decree should emit no events");

  console.log("khans_decree_cannot_be_used_after_move passed");
}


export function testGenghisMongolChargeRequires4SpendsAll4() {
  const rng = new SeededRNG(202);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 1, row: 1 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 3 },
  });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  const notEnough = res.state.units[genghis.id];
  assert(
    notEnough.charges[ABILITY_GENGHIS_KHAN_MONGOL_CHARGE] === 3,
    "mongol charge should not spend charges when below 4"
  );
  assert(
    !res.state.pendingMove,
    "mongol charge should not create pending move without charges"
  );

  res = applyAction(
    setUnit(res.state, genghis.id, {
      charges: { ...notEnough.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 4 },
    }),
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  const updated = res.state.units[genghis.id];
  assert(
    updated.charges[ABILITY_GENGHIS_KHAN_MONGOL_CHARGE] === 0,
    "mongol charge should spend all 4 charges"
  );
  assert(updated.turn.actionUsed === true, "mongol charge should consume action slot");
  assert(
    res.state.pendingMove && res.state.pendingMove.unitId === genghis.id,
    "mongol charge should create pending move"
  );

  console.log("genghis_mongol_charge_requires_4_spends_all_4 passed");
}


export function testGenghisLegendOfSteppesBonusOnlyVsLastTurnTarget() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.2, // turn N vs A
    0.99, 0.99, 0.01, 0.2, // turn N+1 vs A
    0.99, 0.99, 0.01, 0.2, // turn N+2 vs B
  ]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const enemyA = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemyB = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, genghis.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemyA.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemyB.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", genghis.id);

  let res = applyAction(
    state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyA.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);

  let endRes = applyAction(res.state, { type: "endTurn" } as any, rng);
  let startRes = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: genghis.id } as any,
    rng
  );

  res = applyAction(
    startRes.state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyA.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackA = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === genghis.id &&
      e.defenderId === enemyA.id
  );
  assert(attackA && attackA.type === "attackResolved", "attack on A should resolve");
  assert(
    attackA.damage === genghis.attack + 1,
    "legend of the steppes should add +1 vs last turn target"
  );

  endRes = applyAction(res.state, { type: "endTurn" } as any, rng);
  startRes = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: genghis.id } as any,
    rng
  );
  res = applyAction(
    startRes.state,
    { type: "attack", attackerId: genghis.id, defenderId: enemyB.id } as any,
    rng
  );
  res = resolveAllPendingRollsWithEvents(res.state, rng);
  const attackB = res.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === genghis.id &&
      e.defenderId === enemyB.id
  );
  assert(attackB && attackB.type === "attackResolved", "attack on B should resolve");
  assert(
    attackB.damage === genghis.attack,
    "legend of the steppes should not apply to new targets"
  );

  console.log("genghis_legend_of_steppes_bonus_only_vs_last_turn_target passed");
}


export function testGenghisMongolChargeSweepTriggersAlliedAttacksInCorridor() {
  const rng = makeRngSequence([
    0.99, 0.99, 0.01, 0.2,
    0.99, 0.99, 0.01, 0.2,
  ]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { rider: HERO_GENGHIS_KHAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const genghis = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const allyArcher = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const allySpearman = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const allyAssassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;
  const allyOutside = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  const enemyA = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemyB = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;

  state = setUnit(state, genghis.id, {
    position: { col: 1, row: 1 },
    charges: { ...genghis.charges, [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: 4 },
  });
  state = setUnit(state, allyArcher.id, { position: { col: 4, row: 2 } });
  state = setUnit(state, allySpearman.id, { position: { col: 2, row: 0 } });
  state = setUnit(state, allyAssassin.id, {
    position: { col: 3, row: 0 },
    turn: { moveUsed: false, attackUsed: true, actionUsed: true, stealthUsed: false },
  });
  state = setUnit(state, allyOutside.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, enemyA.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, enemyB.id, { position: { col: 5, row: 2 } });
  state = toBattleState(state, "P1", genghis.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: genghis.id,
      abilityId: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    } as any,
    rng
  );
  res = applyAction(
    res.state,
    { type: "move", unitId: genghis.id, to: { col: 5, row: 1 } } as any,
    rng
  );
  const resolved = resolveAllPendingRollsWithEvents(res.state, rng);

  const attackEvents = resolved.events.filter(
    (e) => e.type === "attackResolved"
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  const attackers = attackEvents.map((e) => e.attackerId);

  assert.deepStrictEqual(
    attackers,
    [allyArcher.id, allySpearman.id].sort(),
    "allied attacks should resolve in unitId order"
  );
  assert(
    !attackers.includes(allyAssassin.id),
    "allies who cannot attack should do nothing"
  );
  assert(
    !attackers.includes(allyOutside.id),
    "allies outside corridor should not attack"
  );

  const archerAttack = attackEvents.find((e) => e.attackerId === allyArcher.id)!;
  const spearmanAttack = attackEvents.find((e) => e.attackerId === allySpearman.id)!;
  assert(
    archerAttack.damage === allyArcher.attack + 1,
    "commander bonus should apply to corridor attacks"
  );
  assert(
    spearmanAttack.damage === allySpearman.attack + 1,
    "commander bonus should apply to corridor attacks"
  );

  console.log(
    "genghis_mongol_charge_sweep_triggers_allied_attacks_in_3wide_corridor passed"
  );
}
