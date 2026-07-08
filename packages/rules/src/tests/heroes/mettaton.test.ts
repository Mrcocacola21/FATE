import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_METTATON_BERSERKER_MULTICLASS,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_GRACE,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  ABILITY_METTATON_RIDER_FEATURE,
  ABILITY_METTATON_STAGE_PHENOMENON,
  applyAction,
  assert,
  coordKeys,
  GameState,
  getLegalMovesForUnit,
  getStealthSuccessMinRoll,
  getUnitDefinition,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  makePlayerView,
  makeRngSequence,
  makeSharedAttackerWinRng,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  SeededRNG,
  setUnit,
  setupMettatonState,
  toBattleState,
} from "../helpers/testUtils";

function prepareMettatonStartTurn(state: GameState, unitId: string): GameState {
  return {
    ...state,
    phase: "battle",
    currentPlayer: state.units[unitId].owner,
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [unitId],
    turnQueueIndex: 0,
    turnOrder: [unitId],
    turnOrderIndex: 0,
  };
}

export function testMettatonLongLiverCannotHideAndRiderMovement() {
  let { state, mettaton } = setupMettatonState();
  const enemyArcher = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  assert(
    mettaton.hp === getUnitDefinition("archer").maxHp + 2,
    "Mettaton should have +2 HP from Long-liver"
  );
  assert(
    getStealthSuccessMinRoll(mettaton) === null,
    "Mettaton should not have stealth roll threshold"
  );

  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemyArcher.id, { position: { col: 1, row: 1 } });

  const mettatonMoves = coordKeys(getLegalMovesForUnit(state, mettaton.id));
  const archerMoves = coordKeys(getLegalMovesForUnit(state, enemyArcher.id));
  assert(
    mettatonMoves.includes("4,8"),
    "Mettaton should have rider-style long orthogonal movement"
  );
  assert(
    !archerMoves.includes("1,5"),
    "Regular archer should not have rider-style long movement"
  );

  const battle = toBattleState(state, "P1", mettaton.id);
  const stealthTry = applyAction(
    battle,
    { type: "enterStealth", unitId: mettaton.id } as any,
    new SeededRNG(1)
  );
  assert(
    stealthTry.events.length === 0 &&
      stealthTry.state.units[mettaton.id].isStealthed !== true,
    "Mettaton should not be able to enter stealth"
  );

  console.log("mettaton_long_liver_hide_and_rider_movement passed");
}


export function testMettatonRatingPassiveAndThresholdUnlock() {
  let { state, mettaton, enemy } = setupMettatonState();
  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", mettaton.id);
  state = initKnowledgeForOwners(state);

  const hitRng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const attack = applyAction(
    state,
    { type: "attack", attackerId: mettaton.id, defenderId: enemy.id } as any,
    hitRng
  );
  const attacked = resolveAllPendingRollsWithEvents(attack.state, hitRng);
  assert(
    attacked.state.units[mettaton.id].mettatonRating === 2,
    "Successful attack should grant +2 Rating"
  );

  let defenseState = attacked.state;
  defenseState = {
    ...defenseState,
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };

  const missRng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  const defended = applyAction(
    defenseState,
    { type: "attack", attackerId: enemy.id, defenderId: mettaton.id } as any,
    missRng
  );
  const defendedResolved = resolveAllPendingRollsWithEvents(defended.state, missRng);
  assert(
    defendedResolved.state.units[mettaton.id].mettatonRating === 3,
    "Successful defense should grant +1 Rating"
  );

  let manualState = setUnit(defendedResolved.state, mettaton.id, {
    mettatonRating: 2,
    turn: makeEmptyTurnEconomy(),
  });
  manualState = toBattleState(manualState, "P1", mettaton.id);

  const exFail = applyAction(
    manualState,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_EX } as any,
    new SeededRNG(1)
  );
  assert(
    exFail.state.units[mettaton.id].mettatonRating === 2,
    "Blocked EX attempt should not change Rating"
  );
  assert(
    exFail.state.units[mettaton.id].turn.actionUsed === false,
    "Blocked manual EX attempt should not spend action"
  );

  const belowStartState = setUnit(manualState, mettaton.id, {
    mettatonRating: 4,
    turn: makeEmptyTurnEconomy(),
  });
  const belowStarted = applyAction(
    prepareMettatonStartTurn(belowStartState, mettaton.id),
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(2)
  );
  assert(
    belowStarted.state.units[mettaton.id].mettatonExUnlocked !== true &&
      belowStarted.state.units[mettaton.id].mettatonRating === 4,
    "Mettaton should not transform below threshold at turn start"
  );
  assert(
    belowStarted.state.units[mettaton.id].turn.actionUsed === false &&
      belowStarted.state.units[mettaton.id].turn.moveUsed === false,
    "below-threshold turn start should keep action and movement available"
  );

  const manualReadyState = setUnit(manualState, mettaton.id, {
    mettatonRating: 5,
    turn: makeEmptyTurnEconomy(),
  });
  const manualEx = applyAction(
    manualReadyState,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_EX } as any,
    new SeededRNG(2)
  );
  assert(
    manualEx.state.units[mettaton.id].mettatonExUnlocked !== true &&
      manualEx.state.units[mettaton.id].mettatonRating === 5,
    "EX should not be manually activated even at threshold"
  );
  assert(
    manualEx.state.units[mettaton.id].turn.actionUsed === false,
    "manual EX command should not spend action at threshold"
  );

  const startReadyState = prepareMettatonStartTurn(manualReadyState, mettaton.id);
  const started = applyAction(
    startReadyState,
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(3)
  );
  assert(
    started.state.units[mettaton.id].mettatonExUnlocked === true &&
      started.state.units[mettaton.id].mettatonRating === 5,
    "EX should unlock at turn start without spending Rating"
  );
  assert(
    started.state.units[mettaton.id].turn.actionUsed === false &&
      started.state.units[mettaton.id].turn.moveUsed === false,
    "automatic EX transform should leave action and movement available"
  );
  assert(
    started.events.filter(
      (event) =>
        event.type === "unitTransformed" &&
        event.unitId === mettaton.id &&
        event.abilityId === ABILITY_METTATON_EX &&
        event.reason === "mettatonThreshold" &&
        event.ratingSpent === false
    ).length === 1,
    "automatic EX transform should create exactly one transformation event"
  );
  assert(
    !started.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === mettaton.id &&
        event.abilityId === ABILITY_METTATON_EX
    ),
    "automatic EX transform should not be logged as a manual ability use"
  );

  console.log("mettaton_rating_passive_and_threshold_unlock passed");
}


export function testMettatonPoppinsGatingAreaAndRating() {
  let { state, mettaton, enemy } = setupMettatonState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== mettaton.id && u.class === "knight"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.class === "knight"
  )!;

  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 6 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 7 } });
  state = toBattleState(state, "P1", mettaton.id);
  state = initKnowledgeForOwners(state);

  const lowRatingState = setUnit(state, mettaton.id, {
    mettatonRating: 2,
    turn: makeEmptyTurnEconomy(),
  });
  const failCost = applyAction(
    lowRatingState,
    {
      type: "useAbility",
      unitId: mettaton.id,
      abilityId: ABILITY_METTATON_POPPINS,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    makeAttackWinRng(3)
  );
  assert(
    failCost.events.length === 0 && !failCost.state.pendingRoll,
    "Poppins should require Rating 3"
  );

  const readyState = setUnit(state, mettaton.id, {
    mettatonRating: 3,
    turn: makeEmptyTurnEconomy(),
  });
  const failCenter = applyAction(
    readyState,
    {
      type: "useAbility",
      unitId: mettaton.id,
      abilityId: ABILITY_METTATON_POPPINS,
      payload: { center: { col: 5, row: 6 } },
    } as any,
    makeAttackWinRng(3)
  );
  assert(
    failCenter.events.length === 0 && !failCenter.state.pendingRoll,
    "Poppins center must be on Mettaton attack line"
  );

  const beforeAllyHp = readyState.units[ally.id].hp;
  const beforeEnemyHp = readyState.units[enemy.id].hp;
  const beforeEnemy2Hp = readyState.units[enemy2.id].hp;
  const poppins = applyAction(
    readyState,
    {
      type: "useAbility",
      unitId: mettaton.id,
      abilityId: ABILITY_METTATON_POPPINS,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    makeAttackWinRng(3)
  );
  assert(
    poppins.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === mettaton.id &&
        event.abilityId === ABILITY_METTATON_POPPINS
    ),
    "Poppins should emit abilityUsed"
  );
  assert(
    poppins.events.some(
      (event) =>
        event.type === "mettatonRatingChanged" &&
        event.reason === "abilitySpend" &&
        event.delta === -3
    ),
    "Poppins should spend 3 Rating"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    poppins.state,
    makeSharedAttackerWinRng(3)
  );
  assert(
    resolved.state.units[ally.id].hp === beforeAllyHp - 1 &&
      resolved.state.units[enemy.id].hp === beforeEnemyHp - 1 &&
      resolved.state.units[enemy2.id].hp === beforeEnemy2Hp - 1,
    "Poppins should attack all units in the selected 3x3 area"
  );
  assert(
    resolved.state.units[mettaton.id].mettatonRating === 6 &&
      resolved.state.units[mettaton.id].mettatonExUnlocked !== true,
    "Poppins rating gain should not unlock EX before Mettaton's next turn start"
  );

  const nextTurn = applyAction(
    prepareMettatonStartTurn(resolved.state, mettaton.id),
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(2)
  );
  assert(
    nextTurn.state.units[mettaton.id].mettatonRating === 6 &&
      nextTurn.state.units[mettaton.id].mettatonExUnlocked === true,
    "next Mettaton turn start should unlock EX without spending Poppins Rating"
  );

  console.log("mettaton_poppins_gating_area_and_rating passed");
}


export function testMettatonExStageAndLaser() {
  let { state, mettaton, enemy } = setupMettatonState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== mettaton.id && u.class === "knight"
  )!;

  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", mettaton.id);
  state = initKnowledgeForOwners(state);

  const laserBeforeEx = applyAction(
    setUnit(state, mettaton.id, { mettatonRating: 10, turn: makeEmptyTurnEconomy() }),
    {
      type: "useAbility",
      unitId: mettaton.id,
      abilityId: ABILITY_METTATON_LASER,
      payload: { target: { col: 4, row: 6 } },
    } as any,
    makeAttackWinRng(2)
  );
  assert(
    laserBeforeEx.events.length === 0 && !laserBeforeEx.state.pendingRoll,
    "Laser should require EX unlock"
  );

  const exFail = applyAction(
    setUnit(state, mettaton.id, { mettatonRating: 4, turn: makeEmptyTurnEconomy() }),
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_EX } as any,
    new SeededRNG(3)
  );
  assert(
    exFail.state.units[mettaton.id].mettatonExUnlocked !== true,
    "EX should require Rating 5"
  );

  const exReadyState = setUnit(state, mettaton.id, {
    mettatonRating: 5,
    turn: makeEmptyTurnEconomy(),
  });
  const manualEx = applyAction(
    exReadyState,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_EX } as any,
    new SeededRNG(4)
  );
  assert(
    manualEx.state.units[mettaton.id].mettatonExUnlocked !== true &&
      manualEx.state.units[mettaton.id].mettatonRating === 5,
    "EX should not be manually activated at threshold"
  );

  const exOk = applyAction(
    prepareMettatonStartTurn(exReadyState, mettaton.id),
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(4)
  );
  assert(
    exOk.state.units[mettaton.id].mettatonExUnlocked === true &&
      exOk.state.units[mettaton.id].mettatonRating === 5,
    "EX should unlock at turn start without spending Rating"
  );
  assert(
    exOk.state.units[mettaton.id].turn.actionUsed === false &&
      exOk.state.units[mettaton.id].turn.moveUsed === false,
    "EX turn-start transform should leave action and movement available"
  );

  const exView = makePlayerView(exOk.state, "P1");
  const exAbilities =
    exView.abilitiesByUnitId?.[mettaton.id]?.map((ability) => ability.id) ?? [];
  assert(
    exAbilities.includes(ABILITY_METTATON_STAGE_PHENOMENON) &&
      exAbilities.includes(ABILITY_METTATON_LASER),
    "EX should unlock Stage Phenomenon and Laser abilities"
  );

  const exTwiceState = setUnit(exOk.state, mettaton.id, {
    mettatonRating: 10,
    turn: makeEmptyTurnEconomy(),
  });
  const exTwice = applyAction(
    toBattleState(exTwiceState, "P1", mettaton.id),
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_EX } as any,
    new SeededRNG(5)
  );
  assert(
    exTwice.state.units[mettaton.id].mettatonRating === 10,
    "EX should not apply twice"
  );

  const laserState = setUnit(exOk.state, mettaton.id, {
    mettatonRating: 6,
    turn: makeEmptyTurnEconomy(),
  });
  const laser = applyAction(
    toBattleState(laserState, "P1", mettaton.id),
    {
      type: "useAbility",
      unitId: mettaton.id,
      abilityId: ABILITY_METTATON_LASER,
      payload: { target: { col: 4, row: 6 } },
    } as any,
    makeSharedAttackerWinRng(2)
  );

  const beforeAllyHp = laserState.units[ally.id].hp;
  const beforeEnemyHp = laserState.units[enemy.id].hp;
  const resolved = resolveAllPendingRollsWithEvents(
    laser.state,
    makeSharedAttackerWinRng(2)
  );
  assert(
    resolved.state.units[ally.id].hp === beforeAllyHp - 1 &&
      resolved.state.units[enemy.id].hp === beforeEnemyHp - 1,
    "Laser should attack line targets"
  );
  assert(
    resolved.state.units[mettaton.id].mettatonRating === 8,
    "Laser should spend 3, then gain +1 Stage and +2 per successful hit"
  );

  console.log("mettaton_ex_stage_and_laser passed");
}


export function testMettatonNeoGraceAndRiderPathUnlocks() {
  let { state, mettaton, enemy } = setupMettatonState();
  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", mettaton.id);
  state = initKnowledgeForOwners(state);

  const beforeMoveOptions = applyAction(
    state,
    { type: "requestMoveOptions", unitId: mettaton.id } as any,
    new SeededRNG(6)
  );
  const beforeMove = applyAction(
    beforeMoveOptions.state,
    { type: "move", unitId: mettaton.id, to: { col: 4, row: 8 } } as any,
    new SeededRNG(7)
  );
  assert(
    beforeMove.state.pendingRoll?.kind !== "riderPathAttack_attackerRoll",
    "Rider path offense should be inactive before NEO"
  );

  const neoFail = applyAction(
    setUnit(state, mettaton.id, { mettatonRating: 9, turn: makeEmptyTurnEconomy() }),
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_NEO } as any,
    new SeededRNG(8)
  );
  assert(
    neoFail.state.units[mettaton.id].mettatonNeoUnlocked !== true,
    "NEO should require Rating 10"
  );

  const neoReadyState = setUnit(state, mettaton.id, {
    mettatonRating: 10,
    turn: makeEmptyTurnEconomy(),
  });
  const manualNeo = applyAction(
    neoReadyState,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_NEO } as any,
    new SeededRNG(9)
  );
  assert(
    manualNeo.state.units[mettaton.id].mettatonNeoUnlocked !== true &&
      manualNeo.state.units[mettaton.id].mettatonRating === 10,
    "NEO should not be manually activated at threshold"
  );
  assert(
    manualNeo.state.units[mettaton.id].turn.actionUsed === false,
    "manual NEO command should not spend action at threshold"
  );

  const neoOk = applyAction(
    prepareMettatonStartTurn(neoReadyState, mettaton.id),
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(9)
  );
  assert(
    neoOk.state.units[mettaton.id].mettatonExUnlocked === true &&
      neoOk.state.units[mettaton.id].mettatonNeoUnlocked === true &&
      neoOk.state.units[mettaton.id].mettatonRating === 10,
    "NEO should unlock passives at turn start without spending Rating"
  );
  assert(
    neoOk.state.units[mettaton.id].turn.actionUsed === false &&
      neoOk.state.units[mettaton.id].turn.moveUsed === false,
    "NEO turn-start transform should leave action and movement available"
  );
  assert(
    neoOk.events.filter(
      (event) =>
        event.type === "unitTransformed" &&
        event.unitId === mettaton.id &&
        event.abilityId === ABILITY_METTATON_NEO &&
        event.reason === "mettatonThreshold" &&
        event.ratingSpent === false
    ).length === 1,
    "automatic NEO transform should create exactly one transformation event"
  );
  assert(
    !neoOk.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === mettaton.id &&
        event.abilityId === ABILITY_METTATON_NEO
    ),
    "automatic NEO transform should not be logged as a manual ability use"
  );

  const neoAboveState = setUnit(state, mettaton.id, {
    mettatonRating: 12,
    turn: makeEmptyTurnEconomy(),
  });
  const neoAbove = applyAction(
    prepareMettatonStartTurn(neoAboveState, mettaton.id),
    { type: "unitStartTurn", unitId: mettaton.id } as any,
    new SeededRNG(10)
  );
  assert(
    neoAbove.state.units[mettaton.id].mettatonExUnlocked === true &&
      neoAbove.state.units[mettaton.id].mettatonNeoUnlocked === true &&
      neoAbove.state.units[mettaton.id].mettatonRating === 12,
    "above-threshold Mettaton should transform at turn start without spending Rating"
  );
  assert(
    neoAbove.state.units[mettaton.id].turn.actionUsed === false &&
      neoAbove.state.units[mettaton.id].turn.moveUsed === false,
    "above-threshold automatic transform should leave action and movement available"
  );

  const neoView = makePlayerView(neoOk.state, "P1");
  const neoAbilities =
    neoView.abilitiesByUnitId?.[mettaton.id]?.map((ability) => ability.id) ?? [];
  assert(
    neoAbilities.includes(ABILITY_METTATON_RIDER_FEATURE) &&
      neoAbilities.includes(ABILITY_METTATON_BERSERKER_MULTICLASS) &&
      neoAbilities.includes(ABILITY_METTATON_GRACE) &&
      neoAbilities.includes(ABILITY_BERSERK_AUTO_DEFENSE),
    "NEO should unlock Rider Feature, Berserker Multiclass, Grace, and berserker ability bundle"
  );

  const neoTwiceState = setUnit(neoOk.state, mettaton.id, {
    mettatonRating: 10,
    turn: makeEmptyTurnEconomy(),
  });
  const neoTwice = applyAction(
    toBattleState(neoTwiceState, "P1", mettaton.id),
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_NEO } as any,
    new SeededRNG(10)
  );
  assert(
    neoTwice.state.units[mettaton.id].mettatonRating === 10,
    "NEO should not apply twice"
  );

  let riderState = setUnit(neoOk.state, mettaton.id, {
    position: { col: 4, row: 4 },
    turn: makeEmptyTurnEconomy(),
  });
  riderState = setUnit(riderState, enemy.id, { position: { col: 4, row: 6 } });
  riderState = toBattleState(riderState, "P1", mettaton.id);
  const afterMoveOptions = applyAction(
    riderState,
    { type: "requestMoveOptions", unitId: mettaton.id, mode: "rider" } as any,
    new SeededRNG(11)
  );
  const afterMove = applyAction(
    afterMoveOptions.state,
    { type: "move", unitId: mettaton.id, to: { col: 4, row: 8 } } as any,
    new SeededRNG(12)
  );
  assert(
    afterMove.state.pendingRoll?.kind === "riderPathAttack_attackerRoll" &&
      afterMove.state.pendingCombatQueue.length > 0,
    "Rider path offense should be active after NEO"
  );

  const graceFailStart = setUnit(neoOk.state, mettaton.id, {
    position: { col: 4, row: 4 },
    mettatonRating: 0,
    turn: makeEmptyTurnEconomy(),
  });
  const graceFailEnemy = setUnit(graceFailStart, enemy.id, {
    position: { col: 4, row: 5 },
    turn: makeEmptyTurnEconomy(),
  });
  const graceFailState = toBattleState(graceFailEnemy, "P2", enemy.id);
  const graceFailAttack = applyAction(
    graceFailState,
    { type: "attack", attackerId: enemy.id, defenderId: mettaton.id } as any,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const graceFailResolved = resolveAllPendingRollsWithEvents(
    graceFailAttack.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    graceFailResolved.state.units[mettaton.id].mettatonRating === 1,
    "Grace should grant +1 on defense roll attempt even when defense fails"
  );

  const graceSuccessStart = setUnit(neoOk.state, mettaton.id, {
    position: { col: 4, row: 4 },
    mettatonRating: 0,
    turn: makeEmptyTurnEconomy(),
  });
  const graceSuccessEnemy = setUnit(graceSuccessStart, enemy.id, {
    position: { col: 4, row: 5 },
    turn: makeEmptyTurnEconomy(),
  });
  const graceSuccessState = toBattleState(graceSuccessEnemy, "P2", enemy.id);
  const graceSuccessAttack = applyAction(
    graceSuccessState,
    { type: "attack", attackerId: enemy.id, defenderId: mettaton.id } as any,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  const graceSuccessResolved = resolveAllPendingRollsWithEvents(
    graceSuccessAttack.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  assert(
    graceSuccessResolved.state.units[mettaton.id].mettatonRating === 2,
    "Successful defense in NEO should grant +2 total (Grace + base Rating)"
  );

  console.log("mettaton_neo_grace_and_rider_path_unlocks passed");
}


export function testMettatonBerserkerFeatureOnlyAfterNeo() {
  let { state, mettaton, enemy } = setupMettatonState();
  state = setUnit(state, mettaton.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  const beforeNeoState = setUnit(state, mettaton.id, {
    charges: {
      ...(state.units[mettaton.id].charges ?? {}),
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
  const before = resolveAttack(beforeNeoState, {
    attackerId: enemy.id,
    defenderId: mettaton.id,
    defenderUseBerserkAutoDefense: true,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  assert(
    before.nextState.units[mettaton.id].hp < beforeNeoState.units[mettaton.id].hp,
    "Mettaton should not auto-dodge as berserker before NEO"
  );

  const afterNeoState = setUnit(beforeNeoState, mettaton.id, {
    hp: beforeNeoState.units[mettaton.id].hp,
    mettatonNeoUnlocked: true,
    charges: {
      ...(beforeNeoState.units[mettaton.id].charges ?? {}),
      [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
    },
  });
  const after = resolveAttack(afterNeoState, {
    attackerId: enemy.id,
    defenderId: mettaton.id,
    defenderUseBerserkAutoDefense: true,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  assert(
    after.nextState.units[mettaton.id].hp === afterNeoState.units[mettaton.id].hp &&
      (after.nextState.units[mettaton.id].charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0) ===
        0,
    "Mettaton should gain berserker auto-defense only after NEO"
  );

  console.log("mettaton_berserker_feature_only_after_neo passed");
}


export function testMettatonFinalChordGatingTargetsDamageAndSpend() {
  let { state, mettaton, enemy } = setupMettatonState();
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.class === "knight"
  )!;
  const enemy3 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== enemy2.id && u.class === "archer"
  )!;
  const offLine = Object.values(state.units).find(
    (u) =>
      u.owner === "P2" &&
      ![enemy.id, enemy2.id, enemy3.id].includes(u.id) &&
      u.class === "assassin"
  )!;

  state = setUnit(state, mettaton.id, {
    position: { col: 4, row: 4 },
    mettatonExUnlocked: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, enemy3.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, offLine.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", mettaton.id);
  state = initKnowledgeForOwners(state);

  const fail = applyAction(
    setUnit(state, mettaton.id, { mettatonRating: 11, turn: makeEmptyTurnEconomy() }),
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_FINAL_CHORD } as any,
    makeAttackWinRng(3)
  );
  assert(
    fail.events.length === 0 && fail.state.units[mettaton.id].mettatonRating === 11,
    "Final Chord should require Rating 12"
  );

  const ready = setUnit(state, mettaton.id, {
    mettatonRating: 12,
    turn: makeEmptyTurnEconomy(),
  });
  const beforeEnemyHp = ready.units[enemy.id].hp;
  const beforeEnemy2Hp = ready.units[enemy2.id].hp;
  const beforeEnemy3Hp = ready.units[enemy3.id].hp;
  const beforeOffLineHp = ready.units[offLine.id].hp;

  const chord = applyAction(
    ready,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_FINAL_CHORD } as any,
    makeSharedAttackerWinRng(3)
  );
  assert(
    chord.events.some(
      (event) =>
        event.type === "mettatonRatingChanged" &&
        event.reason === "abilitySpend" &&
        event.delta === -12
    ),
    "Final Chord should spend 12 Rating"
  );

  const affected = chord.state.pendingAoE?.affectedUnitIds ?? [];
  assert(
    affected.includes(enemy.id) &&
      affected.includes(enemy2.id) &&
      affected.includes(enemy3.id) &&
      !affected.includes(offLine.id),
    "Final Chord should target all enemies on attack lines and exclude off-line targets"
  );
  assert(
    affected.length === new Set(affected).size,
    "Final Chord targets should be deduped"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    chord.state,
    makeSharedAttackerWinRng(3)
  );
  assert(
    resolved.state.units[enemy.id].hp === beforeEnemyHp - 3 &&
      resolved.state.units[enemy2.id].hp === beforeEnemy2Hp - 3 &&
      resolved.state.units[enemy3.id].hp === beforeEnemy3Hp - 3,
    "Final Chord should deal 3 damage on successful hits"
  );
  assert(
    resolved.state.units[offLine.id].hp === beforeOffLineHp,
    "Final Chord should not hit units outside available attack lines"
  );
  assert(
    resolved.state.units[mettaton.id].mettatonRating === 7,
    "Final Chord should count as attack action for Stage and successful hits"
  );

  const secondUse = applyAction(
    resolved.state,
    { type: "useAbility", unitId: mettaton.id, abilityId: ABILITY_METTATON_FINAL_CHORD } as any,
    makeAttackWinRng(3)
  );
  assert(
    secondUse.events.length === 0,
    "Final Chord should respect existing one-action-per-turn/phantasm usage constraints"
  );

  console.log("mettaton_final_chord_gating_targets_damage_and_spend passed");
}
