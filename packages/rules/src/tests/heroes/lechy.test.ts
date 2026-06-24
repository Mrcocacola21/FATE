import {
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  applyAction,
  assert,
  attachArmy,
  Coord,
  createDefaultArmy,
  createEmptyGame,
  GameState,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_LECHY_ID,
  initKnowledgeForOwners,
  linePath,
  makeEmptyTurnEconomy,
  makeRngSequence,
  PlayerId,
  resolvePendingRollOnce,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
export function testLechyHpBonus() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const baseHp = getUnitDefinition("trickster").maxHp;

  assert(
    lechy.hp === baseHp + 3,
    "Lechy HP should be base trickster HP + 3"
  );

  console.log("lechy_hp_bonus passed");
}


export function testLechyNaturalStealthThreshold() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;

  state = setUnit(state, lechy.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.8]); // roll 5
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: lechy.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterStealth",
    "enterStealth should request a roll for Lechy"
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[lechy.id].isStealthed === true,
    "Lechy stealth should succeed on roll 5"
  );

  state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const lechyFail = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  state = setUnit(state, lechyFail.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", lechyFail.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.5]); // roll 4
  res = applyAction(
    state,
    { type: "enterStealth", unitId: lechyFail.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[lechyFail.id].isStealthed === false,
    "Lechy stealth should fail on roll 4"
  );

  console.log("lechy_natural_stealth_threshold passed");
}


export function testLechyGuideTravelerGatingAndBehavior() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.id !== lechy.id
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== lechy.id
  )!;

  state = setUnit(state, lechy.id, {
    position: { col: 4, row: 4 },
    charges: { ...lechy.charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 1 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 6, row: 4 } });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );

  assert(!res.state.pendingRoll, "guide traveler should not trigger without charges");
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 1,
    "guide traveler charges should remain if not enough"
  );

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 2 },
    turn: makeEmptyTurnEconomy(),
  });
  state = setUnit(state, ally.id, { position: { col: 8, row: 8 } });

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );
  assert(
    !res.state.pendingRoll,
    "guide traveler should reject ally outside of range"
  );
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 2,
    "charges should remain when ally out of range"
  );

  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    !res.state.pendingRoll,
    "guide traveler should reject enemy target"
  );

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_GUIDE_TRAVELER]: 2 },
    turn: makeEmptyTurnEconomy(),
  });

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: lechy.id,
      abilityId: ABILITY_LECHY_GUIDE_TRAVELER,
      payload: { targetId: ally.id },
    } as any,
    rng
  );

  assert(
    res.state.pendingRoll?.kind === "moveTrickster",
    "guide traveler should request trickster move roll"
  );

  const afterRoll = resolvePendingRollOnce(res.state, rng);
  const pendingMove = afterRoll.state.pendingMove;
  assert(pendingMove && pendingMove.legalTo.length > 0, "pending move should exist");

  const moveTarget =
    pendingMove.legalTo.find((pos) => pos.col === 6 && pos.row === 4) ??
    pendingMove.legalTo[0];

  const moved = applyAction(
    afterRoll.state,
    { type: "move", unitId: lechy.id, to: moveTarget } as any,
    rng
  );

  const pending = moved.state.pendingRoll;
  assert(
    pending?.kind === "lechyGuideTravelerPlacement",
    "guide traveler should request placement after move"
  );

  const legalPositions = (pending?.context as any)?.legalPositions as Coord[] | undefined;
  assert(
    Array.isArray(legalPositions) && legalPositions.length > 0,
    "guide traveler should expose legal placement positions"
  );

  const lechyPos = moved.state.units[lechy.id].position!;
  const allInRange = (legalPositions ?? []).every(
    (pos) =>
      Math.max(Math.abs(pos.col - lechyPos.col), Math.abs(pos.row - lechyPos.row)) <= 2
  );
  assert(allInRange, "guide traveler positions should be within trickster range");

  const invalid = { col: lechyPos.col + 4, row: lechyPos.row + 4 };
  const invalidAttempt = applyAction(
    moved.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "lechyGuideTravelerPlace", position: invalid },
    } as any,
    rng
  );
  assert(
    invalidAttempt.state.pendingRoll?.kind === "lechyGuideTravelerPlacement",
    "invalid placement should keep pending roll"
  );

  const dest = (legalPositions ?? [])[0];
  const placed = applyAction(
    moved.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "lechyGuideTravelerPlace", position: dest },
    } as any,
    rng
  );

  const allyAfter = placed.state.units[ally.id];
  assert(
    allyAfter.position?.col === dest.col &&
      allyAfter.position?.row === dest.row,
    "guided ally should move to chosen cell"
  );
  assert(
    placed.state.units[lechy.id].turn.moveUsed === true,
    "guide traveler should consume move slot"
  );
  assert(
    placed.state.units[lechy.id].charges[ABILITY_LECHY_GUIDE_TRAVELER] === 0,
    "guide traveler should spend charges"
  );
  assert(!placed.state.pendingRoll, "guide traveler pending roll should clear");

  console.log("lechy_guide_traveler_gating_and_behavior passed");
}


export function testForestExitRestrictionOnFail() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 4, row: 8 } } as any,
    rngFail
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "leaving forest aura should request forest move check"
  );
  assert(
    requested.state.units[rider.id].position?.col === 4 &&
      requested.state.units[rider.id].position?.row === 4,
    "unit should not move before forest check is resolved"
  );

  const failedRoll = resolvePendingRollOnce(requested.state, rngFail);
  const pending = failedRoll.state.pendingRoll;
  assert(
    pending?.kind === "forestMoveDestination",
    "failed forest check should request fallback destination selection"
  );

  const options = ((pending?.context as any)?.options ?? []) as Coord[];
  assert(options.length > 0, "failed forest check should provide fallback options");
  const allInside = options.every(
    (coord) =>
      Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) <= 2
  );
  assert(allInside, "exit fallback options must remain inside forest aura");

  const chosen = options[0];
  const moved = applyAction(
    failedRoll.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "forestMoveDestination", position: chosen },
    } as any,
    rngFail
  );

  const riderAfter = moved.state.units[rider.id];
  assert(
    riderAfter.position?.col === chosen.col &&
      riderAfter.position?.row === chosen.row,
    "failed exit roll should force chosen in-aura destination"
  );

  console.log("forest_exit_restriction_on_fail passed");
}


export function testForestExitRestrictionOnSuccess() {
  const rngSuccess = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 4, row: 8 } } as any,
    rngSuccess
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "leaving forest aura should request forest check before moving"
  );

  const resolved = resolvePendingRollOnce(requested.state, rngSuccess);
  assert(!resolved.state.pendingRoll, "successful forest check should not require fallback choice");

  const riderAfter = resolved.state.units[rider.id];
  assert(
    riderAfter.position?.col === 4 && riderAfter.position?.row === 8,
    "successful forest check should allow intended destination"
  );

  console.log("forest_exit_restriction_on_success passed");
}


export function testForestCrossRestrictionOnFail() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;

  state = setUnit(state, rider.id, { position: { col: 0, row: 4 } });
  state = {
    ...state,
    forestMarkers: [{ owner: "P1", position: { col: 4, row: 4 } }],
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  state = toBattleState(state, "P1", rider.id);
  state = initKnowledgeForOwners(state);

  const requested = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 8, row: 4 } } as any,
    rngFail
  );
  assert(
    requested.state.pendingRoll?.kind === "forestMoveCheck",
    "crossing forest aura should request forest move check"
  );

  const failedRoll = resolvePendingRollOnce(requested.state, rngFail);
  const pending = failedRoll.state.pendingRoll;
  assert(
    pending?.kind === "forestMoveDestination",
    "failed crossing check should request in-path fallback selection"
  );

  const options = ((pending?.context as any)?.options ?? []) as Coord[];
  assert(options.length > 0, "crossing failure should offer path stop options");

  const line = linePath({ col: 0, row: 4 }, { col: 8, row: 4 }) ?? [];
  const lineSet = new Set(line.map((coord) => `${coord.col},${coord.row}`));
  const allOnPathInside = options.every((coord) => {
    const inside = Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) <= 2;
    return inside && lineSet.has(`${coord.col},${coord.row}`);
  });
  assert(
    allOnPathInside,
    "crossing fallback options must be inside aura and on movement path"
  );

  const chosen = options[0];
  const moved = applyAction(
    failedRoll.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "forestMoveDestination", position: chosen },
    } as any,
    rngFail
  );

  const riderAfter = moved.state.units[rider.id];
  assert(
    riderAfter.position?.col === chosen.col &&
      riderAfter.position?.row === chosen.row,
    "failed crossing roll should stop on chosen aura cell from path"
  );

  console.log("forest_cross_restriction_on_fail passed");
}


export function testLechyConfuseTerrainPerSideMarkersAndReplacement() {
  const rng = makeRngSequence([0.5, 0.5, 0.5]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { trickster: HERO_LECHY_ID }));

  const p1Lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const p2Lechy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.heroId === HERO_LECHY_ID
  )!;

  const markersOf = (s: GameState) =>
    s.forestMarkers.length > 0 ? s.forestMarkers : s.forestMarker ? [s.forestMarker] : [];
  const markerByOwner = (s: GameState, owner: PlayerId) =>
    markersOf(s).find((marker) => marker.owner === owner);

  state = setUnit(state, p1Lechy.id, {
    position: { col: 2, row: 2 },
    charges: { ...p1Lechy.charges, [ABILITY_LECHY_CONFUSE_TERRAIN]: 3 },
  });
  state = setUnit(state, p2Lechy.id, {
    position: { col: 6, row: 6 },
    charges: { ...p2Lechy.charges, [ABILITY_LECHY_CONFUSE_TERRAIN]: 3 },
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [p1Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p1Lechy.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: p1Lechy.id } as any,
    rng
  );
  let p1Marker = markerByOwner(res.state, "P1");
  assert(
    p1Marker?.position.col === 2 && p1Marker?.position.row === 2,
    "P1 Lechy should place own forest marker via impulse at start turn"
  );
  assert(markersOf(res.state).length === 1, "only P1 marker should exist after first trigger");

  let next = {
    ...setUnit(res.state, p2Lechy.id, {
      position: { col: 6, row: 6 },
      charges: {
        ...res.state.units[p2Lechy.id].charges,
        [ABILITY_LECHY_CONFUSE_TERRAIN]: 3,
      },
    }),
    currentPlayer: "P2" as PlayerId,
    activeUnitId: null,
    turnQueue: [p2Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p2Lechy.id],
    turnOrderIndex: 0,
  };

  res = applyAction(next, { type: "unitStartTurn", unitId: p2Lechy.id } as any, rng);
  const p2Marker = markerByOwner(res.state, "P2");
  p1Marker = markerByOwner(res.state, "P1");
  assert(
    p2Marker?.position.col === 6 && p2Marker?.position.row === 6,
    "P2 Lechy should place own forest marker without removing P1 marker"
  );
  assert(
    p1Marker?.position.col === 2 && p1Marker?.position.row === 2,
    "P1 marker should persist when P2 places marker"
  );
  assert(markersOf(res.state).length === 2, "both owners should have forest markers simultaneously");

  next = {
    ...setUnit(res.state, p1Lechy.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...res.state.units[p1Lechy.id].charges,
        [ABILITY_LECHY_CONFUSE_TERRAIN]: 3,
      },
      turn: makeEmptyTurnEconomy(),
    }),
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [p1Lechy.id],
    turnQueueIndex: 0,
    turnOrder: [p1Lechy.id],
    turnOrderIndex: 0,
  };

  res = applyAction(next, { type: "unitStartTurn", unitId: p1Lechy.id } as any, rng);
  const replacedP1 = markerByOwner(res.state, "P1");
  const stillP2 = markerByOwner(res.state, "P2");
  assert(
    replacedP1?.position.col === 4 && replacedP1?.position.row === 4,
    "P1 marker should be replaced by new P1 placement"
  );
  assert(
    stillP2?.position.col === 6 && stillP2?.position.row === 6,
    "P2 marker should remain unchanged when P1 replaces marker"
  );
  assert(markersOf(res.state).length === 2, "replacement should keep one marker per owner");

  console.log("lechy_confuse_terrain_per_side_markers_and_replacement passed");
}


export function testLechyStormGatingEffectsAndExemptions() {
  const rngFail = makeRngSequence([0.01]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LECHY_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const lechy = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LECHY_ID
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyInside = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id
  )!;

  state = setUnit(state, lechy.id, {
    position: { col: 4, row: 4 },
    charges: { ...lechy.charges, [ABILITY_LECHY_STORM]: 4 },
  });
  state = toBattleState(state, "P1", lechy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "useAbility", unitId: lechy.id, abilityId: ABILITY_LECHY_STORM } as any,
    rngFail
  );
  assert(res.state.arenaId !== "storm", "storm should not activate without charges");

  state = setUnit(state, lechy.id, {
    charges: { ...state.units[lechy.id].charges, [ABILITY_LECHY_STORM]: 5 },
    turn: makeEmptyTurnEconomy(),
  });

  res = applyAction(
    state,
    { type: "useAbility", unitId: lechy.id, abilityId: ABILITY_LECHY_STORM } as any,
    rngFail
  );
  assert(res.state.arenaId === "storm", "storm should activate at full charges");
  assert(
    res.state.units[lechy.id].charges[ABILITY_LECHY_STORM] === 0,
    "storm should spend charges"
  );
  assert(
    res.state.units[lechy.id].turn.actionUsed === true,
    "storm should consume action slot"
  );

  let stormState: GameState = {
    ...res.state,
    forestMarker: { owner: "P1", position: { col: 4, row: 4 } },
  };
  stormState = setUnit(stormState, enemy.id, { position: { col: 8, row: 8 }, hp: 5 });
  stormState = {
    ...stormState,
    phase: "battle",
    currentPlayer: enemy.owner,
    activeUnitId: null,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };

  const damaged = applyAction(
    stormState,
    { type: "unitStartTurn", unitId: enemy.id } as any,
    rngFail
  );
  assert(
    damaged.state.units[enemy.id].hp === 4,
    "storm should damage non-exempt unit on failed roll"
  );

  let insideState: GameState = {
    ...stormState,
    currentPlayer: enemyInside.owner,
    activeUnitId: null,
    turnQueue: [enemyInside.id],
    turnQueueIndex: 0,
    turnOrder: [enemyInside.id],
    turnOrderIndex: 0,
  };
  insideState = setUnit(insideState, enemyInside.id, {
    position: { col: 5, row: 4 },
    hp: 5,
  });

  const insideRes = applyAction(
    insideState,
    { type: "unitStartTurn", unitId: enemyInside.id } as any,
    rngFail
  );
  assert(
    insideRes.state.units[enemyInside.id].hp === 5,
    "storm should not damage units inside forest aura"
  );

  let lechyStartState: GameState = {
    ...insideState,
    currentPlayer: lechy.owner,
    activeUnitId: null,
    turnQueue: [lechy.id],
    turnQueueIndex: 0,
    turnOrder: [lechy.id],
    turnOrderIndex: 0,
  };
  lechyStartState = setUnit(lechyStartState, lechy.id, {
    position: { col: 4, row: 4 },
    hp: 7,
  });

  const lechyStart = applyAction(
    lechyStartState,
    { type: "unitStartTurn", unitId: lechy.id } as any,
    rngFail
  );
  assert(
    lechyStart.state.units[lechy.id].hp === 7,
    "Lechy should be storm-exempt"
  );

  let attackState: GameState = createEmptyGame();
  attackState = attachArmy(
    attackState,
    createDefaultArmy("P1", { trickster: HERO_LECHY_ID })
  );
  attackState = attachArmy(attackState, createDefaultArmy("P2"));
  const attacker = Object.values(attackState.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const target = Object.values(attackState.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;

  attackState = setUnit(attackState, attacker.id, { position: { col: 0, row: 0 } });
  attackState = setUnit(attackState, target.id, { position: { col: 0, row: 4 } });
  attackState = {
    ...attackState,
    phase: "battle",
    arenaId: "storm",
  };
  attackState = initKnowledgeForOwners(attackState);

  const blockedTargets = getLegalAttackTargets(attackState, attacker.id);
  assert(
    blockedTargets.length === 0,
    "storm should block ranged attacks for non-exempt units"
  );

  attackState = {
    ...attackState,
    forestMarker: { owner: "P2", position: { col: 0, row: 0 } },
  };
  const allowedTargets = getLegalAttackTargets(attackState, attacker.id);
  assert(
    allowedTargets.includes(target.id),
    "units inside forest aura should ignore storm attack restriction"
  );

  console.log("lechy_storm_gating_effects_exemptions passed");
}
