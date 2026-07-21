import {
  ABILITY_HASSAN_TRUE_ENEMY,
  applyAction,
  assert,
  attachArmy,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  getHeroMeta,
  getStealthSuccessMinRoll,
  getUnitDefinition,
  HERO_HASSAN_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeAttackWinRng,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupHassanState,
  toBattleState,
  toPlacementState,
} from "../helpers/testUtils";
export function testHassanHpBonus() {
  const { state, hassan } = setupHassanState();
  const baseHp = getUnitDefinition("assassin").maxHp;
  const meta = getHeroMeta(HERO_HASSAN_ID);

  assert(hassan.hp === baseHp + 1, "Hassan HP should be base assassin HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Hassan hero meta HP should be base assassin HP + 1"
  );

  console.log("hassan_hp_bonus passed");
}


export function testHassanStealthThresholdIs4() {
  let { state, hassan } = setupHassanState();

  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.34]); // roll 3
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterStealth",
    "stealth should request roll"
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === false,
    "Hassan stealth should fail on roll 3"
  );

  ({ state, hassan } = setupHassanState());
  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.5]); // roll 4
  res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === true,
    "Hassan stealth should succeed on roll 4"
  );

  console.log("hassan_stealth_threshold_is_4 passed");
}


export function testHassanTrueEnemyGatingConsumesAndForcesOneAttack() {
  const rng = makeAttackWinRng(1);
  let { state, hassan } = setupHassanState();

  const enemyForcedAttacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemyForcedTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const controllerAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const hiddenEnemyTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
  )!;

  state = setUnit(state, hassan.id, {
    position: { col: 4, row: 4 },
    charges: { ...hassan.charges, [ABILITY_HASSAN_TRUE_ENEMY]: 2 },
  });
  state = setUnit(state, enemyForcedAttacker.id, {
    position: { col: 5, row: 4 },
  });
  state = setUnit(state, enemyForcedTarget.id, {
    position: { col: 6, row: 4 },
  });
  state = setUnit(state, controllerAlly.id, {
    position: { col: 5, row: 5 },
  });
  state = setUnit(state, hiddenEnemyTarget.id, {
    position: { col: 6, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );
  assert(
    !used.state.pendingRoll,
    "True Enemy should be blocked below 3 charges"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 2,
    "True Enemy should not spend charges when blocked"
  );

  state = setUnit(state, hassan.id, {
    charges: { ...state.units[hassan.id].charges, [ABILITY_HASSAN_TRUE_ENEMY]: 3 },
  });

  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );

  assert(
    used.state.pendingRoll?.kind === "hassanTrueEnemyTargetChoice",
    "True Enemy should request forced target selection"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 3,
    "True Enemy should not spend charges before target resolution"
  );
  assert(
    !used.state.units[hassan.id].turn.actionUsed,
    "True Enemy should not consume Hassan's action slot before target resolution"
  );
  const options = (used.state.pendingRoll?.context?.options ?? []) as string[];
  assert(
    options.includes(enemyForcedTarget.id),
    "True Enemy should let controlled enemy target its own normal ally"
  );
  assert(
    !options.includes(controllerAlly.id),
    "True Enemy should treat Hassan-side units as allies during forced attack"
  );
  assert(
    !options.includes(hiddenEnemyTarget.id),
    "True Enemy should not leak an unknown hidden attack target"
  );

  const canceled = applyAction(
    used.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: used.state.pendingRoll!.id,
      player: used.state.pendingRoll!.player,
      choice: "skip",
    } as any,
    rng
  );
  assert(!canceled.state.pendingRoll, "True Enemy skip should clear target selection");
  assert(
    canceled.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 3,
    "True Enemy skip should not spend charges"
  );
  assert(
    !canceled.state.units[hassan.id].turn.actionUsed,
    "True Enemy skip should not consume Hassan's action slot"
  );

  const reopened = applyAction(
    canceled.state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );
  assert(
    reopened.state.pendingRoll?.kind === "hassanTrueEnemyTargetChoice",
    "True Enemy should reopen target selection after cancel"
  );

  const targetChoice = applyAction(
    reopened.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: reopened.state.pendingRoll!.id,
      player: reopened.state.pendingRoll!.player,
      choice: { type: "hassanTrueEnemyTarget", targetId: enemyForcedTarget.id },
    } as any,
    rng
  );
  assert(
    targetChoice.state.pendingRoll?.kind === "attack_attackerRoll",
    "True Enemy should continue into normal attack flow"
  );
  assert(
    targetChoice.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 0,
    "True Enemy should spend exactly 3 charges on target resolution"
  );
  assert(
    targetChoice.state.units[hassan.id].turn.actionUsed,
    "True Enemy should consume Hassan's action slot on target resolution"
  );
  assert(
    targetChoice.state.units[enemyForcedAttacker.id].turn.attackUsed &&
      targetChoice.state.units[enemyForcedAttacker.id].turn.actionUsed,
    "True Enemy should spend the controlled unit's forced attack slots"
  );
  const controlledAttackEvent = targetChoice.events.find(
    (event) =>
      event.type === "controlledAttackDeclared" &&
      event.controllerUnitId === hassan.id &&
      event.controlledUnitId === enemyForcedAttacker.id &&
      event.targetId === enemyForcedTarget.id
  );
  assert(controlledAttackEvent, "True Enemy should log controlled attack details");

  const duplicateTargetChoice = applyAction(
    targetChoice.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: reopened.state.pendingRoll!.id,
      player: reopened.state.pendingRoll!.player,
      choice: { type: "hassanTrueEnemyTarget", targetId: enemyForcedTarget.id },
    } as any,
    rng
  );
  assert(
    duplicateTargetChoice.events.length === 0,
    "duplicate True Enemy target resolution should be rejected without events"
  );
  assert(
    duplicateTargetChoice.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 0,
    "duplicate True Enemy target resolution should not double-spend charges"
  );

  const resolved = resolveAllPendingRollsWithEvents(targetChoice.state, rng);
  const events = [...reopened.events, ...targetChoice.events, ...resolved.events];
  const forcedAttackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemyForcedAttacker.id &&
      event.defenderId === enemyForcedTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    forcedAttackEvents.length === 1,
    "True Enemy should force exactly one normal attack"
  );
  assert(
    forcedAttackEvents[0].attackerRoll.dice.length >= 2 &&
      forcedAttackEvents[0].defenderRoll.dice.length >= 2,
    "forced attack should use normal attack/defense roll resolution"
  );

  const restoredTurnState = setUnit(
    {
      ...resolved.state,
      currentPlayer: "P2",
      activeUnitId: enemyForcedAttacker.id,
      pendingRoll: null,
      pendingMove: null,
    },
    enemyForcedAttacker.id,
    {
      turn: makeEmptyTurnEconomy(),
      hasAttackedThisTurn: false,
      hasActedThisTurn: false,
    }
  );
  const normalEnemyAttack = applyAction(
    restoredTurnState,
    {
      type: "attack",
      attackerId: enemyForcedAttacker.id,
      defenderId: controllerAlly.id,
    } as any,
    makeRngSequence([])
  );
  assert(
    normalEnemyAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "True Enemy should not permanently alter controlled unit allegiance"
  );

  console.log("hassan_true_enemy_gating_consumes_and_forces_one_attack passed");
}


export function testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence() {
  const rng = new SeededRNG(870);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { assassin: HERO_HASSAN_ID }));
  state = toPlacementState(state, "P1");

  const p1Coords = ["b0", "c0", "d0", "e0", "f0", "g0", "h0"].map(coordFromNotation);
  const p2Coords = ["b8", "c8", "d8", "e8", "f8", "g8", "h8"].map(coordFromNotation);

  let p1i = 0;
  let p2i = 0;
  while (state.phase === "placement") {
    const current = state.currentPlayer;
    const nextUnit = Object.values(state.units).find(
      (u) => u.owner === current && !u.position && u.isAlive
    );
    if (!nextUnit) {
      state = applyAction(state, { type: "endTurn" } as any, rng).state;
      continue;
    }
    const pos = current === "P1" ? p1Coords[p1i++] : p2Coords[p2i++];
    state = applyAction(
      state,
      { type: "placeUnit", unitId: nextUnit.id, position: pos } as any,
      rng
    ).state;
  }

  assert(
    state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "Assassin Order should trigger at battle start"
  );
  assert(
    state.pendingRoll?.player === "P1",
    "P1 Assassin Order selection should resolve first"
  );

  const p1Hassan = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_HASSAN_ID
  )!;
  const p2Hassan = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.heroId === HERO_HASSAN_ID
  )!;
  const p1Archer = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const p1Rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const p2Archer = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const p2Rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  assert(
    getStealthSuccessMinRoll(state.units[p1Archer.id]) === 6,
    "base archer should start with stealth threshold 6"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Rider.id]) === null,
    "base rider should start without stealth"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Hassan.id]) === 4,
    "Hassan should keep stealth threshold 4"
  );

  const firstSelection = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll!.id,
      player: state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p1Archer.id, p1Rider.id],
      },
    } as any,
    rng
  );

  assert(
    firstSelection.state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "P2 should receive independent Assassin Order selection"
  );
  assert(
    firstSelection.state.pendingRoll?.player === "P2",
    "second Assassin Order selection should be owned by P2"
  );
  assert(
    getStealthSuccessMinRoll(firstSelection.state.units[p2Archer.id]) === 6,
    "P2 archer threshold should remain unchanged before P2 selection"
  );

  const secondSelection = applyAction(
    firstSelection.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: firstSelection.state.pendingRoll!.id,
      player: firstSelection.state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p2Archer.id, p2Rider.id],
      },
    } as any,
    rng
  );

  assert(
    !secondSelection.state.pendingRoll,
    "Assassin Order selections should complete for both sides"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Archer.id]) === 5,
    "Assassin Order should upgrade archer stealth threshold from 6 to 5"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Rider.id]) === 5,
    "Assassin Order should grant stealth to non-stealth unit"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Archer.id]) === 5,
    "P2 selection should upgrade P2 archer independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Rider.id]) === 5,
    "P2 selection should grant stealth independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Hassan.id]) === 4,
    "Hassan should remain at stealth threshold 4"
  );

  console.log(
    "hassan_assassin_order_battle_start_selection_and_per_side_independence passed"
  );
}
