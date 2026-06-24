import {
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_BONE_FIELD,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_SANS_SLEEP,
  applyAction,
  assert,
  GameState,
  getLegalMovesForUnit,
  getUnitDefinition,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  makeRngSequence,
  makeSharedAttackerWinRng,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupSansState,
  toBattleState,
} from "../helpers/testUtils";
export function testSansLongLiverAndSpearmanFeature() {
  let { state, sans, enemy } = setupSansState();

  assert(
    sans.hp === getUnitDefinition("trickster").maxHp + 2,
    "Sans should have +2 HP from Long-liver"
  );

  state = setUnit(state, sans.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const attack = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id } as any,
    makeRngSequence([0.99, 0.5, 0.5, 0.5])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    attack.state,
    makeRngSequence([0.99, 0.5, 0.5, 0.5])
  );
  const attackEvent = resolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemy.id &&
      event.defenderId === sans.id
  );
  assert(
    attackEvent && attackEvent.type === "attackResolved" && !attackEvent.hit,
    "Sans should auto-dodge on defense double via Spearman feature"
  );
  assert(
    resolved.state.units[sans.id].hp === state.units[sans.id].hp,
    "Sans should not take damage when defense-double auto-dodge triggers"
  );

  console.log("sans_long_liver_and_spearman_feature passed");
}


export function testSansGasterBlasterGatingLineAndSpend() {
  let { state, sans, ally, enemy, enemy2 } = setupSansState();
  state = setUnit(state, sans.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", sans.id);
  state = initKnowledgeForOwners(state);

  const lowChargesState = setUnit(state, sans.id, {
    charges: {
      ...state.units[sans.id].charges,
      [ABILITY_SANS_GASTER_BLASTER]: 1,
    },
  });
  const failCost = applyAction(
    lowChargesState,
    {
      type: "useAbility",
      unitId: sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target: { col: 4, row: 6 } },
    } as any,
    new SeededRNG(1)
  );
  assert(
    failCost.events.length === 0 && !failCost.state.pendingRoll,
    "Gaster Blaster should require 2 charges"
  );

  const readyState = setUnit(state, sans.id, {
    charges: {
      ...state.units[sans.id].charges,
      [ABILITY_SANS_GASTER_BLASTER]: 2,
    },
  });
  const failLine = applyAction(
    readyState,
    {
      type: "useAbility",
      unitId: sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target: { col: 5, row: 6 } },
    } as any,
    new SeededRNG(2)
  );
  assert(
    failLine.events.length === 0 && !failLine.state.pendingRoll,
    "Gaster Blaster target must be on shooter line"
  );

  const cast = applyAction(
    readyState,
    {
      type: "useAbility",
      unitId: sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target: { col: 4, row: 6 } },
    } as any,
    makeSharedAttackerWinRng(2)
  );
  assert(
    cast.state.units[sans.id].charges[ABILITY_SANS_GASTER_BLASTER] === 0,
    "Gaster Blaster should spend 2 charges"
  );
  assert(
    cast.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Gaster Blaster should start line-attack pending rolls"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    cast.state,
    makeSharedAttackerWinRng(2)
  );
  const hitTargetIds = resolved.events
    .filter(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === sans.id &&
        event.hit
    )
    .map((event) => (event.type === "attackResolved" ? event.defenderId : ""));
  assert(
    hitTargetIds.includes(ally.id) && hitTargetIds.includes(enemy.id),
    "Gaster Blaster should hit all units on the selected shooter line"
  );
  assert(
    !hitTargetIds.includes(enemy2.id),
    "Gaster Blaster should not hit off-line units"
  );

  console.log("sans_gaster_blaster_gating_line_and_spend passed");
}


export function testSansBadassJokeDebuffAndMovementLock() {
  let { state, sans, enemy, enemy2 } = setupSansState();
  state = setUnit(state, sans.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 }, hp: 10 });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 6 }, hp: 10 });
  state = toBattleState(state, "P1", sans.id);
  state = initKnowledgeForOwners(state);

  const lowChargesState = setUnit(state, sans.id, {
    charges: {
      ...state.units[sans.id].charges,
      [ABILITY_SANS_BADASS_JOKE]: 2,
    },
  });
  const failCost = applyAction(
    lowChargesState,
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_BADASS_JOKE } as any,
    makeRngSequence([0.5, 0.5])
  );
  assert(
    failCost.events.length === 0 && !failCost.state.pendingRoll,
    "Badass Joke should require 3 charges"
  );

  const castState = setUnit(state, sans.id, {
    charges: {
      ...state.units[sans.id].charges,
      [ABILITY_SANS_BADASS_JOKE]: 3,
    },
    turn: makeEmptyTurnEconomy(),
  });
  const cast = applyAction(
    castState,
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_BADASS_JOKE } as any,
    makeRngSequence([0.5, 0.5, 0.01, 0.01, 0.99, 0.99])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    cast.state,
    makeRngSequence([0.5, 0.5, 0.01, 0.01, 0.99, 0.99])
  );

  assert(
    resolved.state.units[sans.id].charges[ABILITY_SANS_BADASS_JOKE] === 0,
    "Badass Joke should spend 3 charges"
  );
  assert(
    !!resolved.state.units[enemy.id].movementDisabledNextTurn &&
      !!resolved.state.units[enemy.id].sansMoveLockArmed,
    "Badass Joke should lock movement for targets that fail defense"
  );
  assert(
    !resolved.state.units[enemy2.id].movementDisabledNextTurn,
    "Badass Joke should not lock movement for targets that defend successfully"
  );

  let nextTurnState: GameState = {
    ...resolved.state,
    currentPlayer: "P2",
    activeUnitId: null,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };
  const start = applyAction(
    nextTurnState,
    { type: "unitStartTurn", unitId: enemy.id } as any,
    new SeededRNG(3)
  );
  assert(
    start.state.units[enemy.id].turn.moveUsed === true &&
      !start.state.units[enemy.id].movementDisabledNextTurn,
    "Movement lock should consume move action on the next turn only"
  );
  assert(
    start.events.some((event) => event.type === "sansMoveDenied"),
    "Movement lock should emit sansMoveDenied notice on turn start"
  );

  const beforeMovePos = start.state.units[enemy.id].position;
  const blockedMove = applyAction(
    start.state,
    { type: "move", unitId: enemy.id, to: { col: 5, row: 4 } } as any,
    new SeededRNG(4)
  );
  assert(
    blockedMove.events.length === 0 &&
      blockedMove.state.units[enemy.id].position?.col === beforeMovePos?.col &&
      blockedMove.state.units[enemy.id].position?.row === beforeMovePos?.row,
    "Movement lock should block move action on that turn"
  );

  const attack = applyAction(
    blockedMove.state,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id } as any,
    new SeededRNG(5)
  );
  assert(
    !!attack.state.pendingRoll,
    "Movement lock should not block non-move actions (attack remains available)"
  );

  console.log("sans_badass_joke_debuff_and_movement_lock passed");
}


export function testSansUnbelieverBoneFieldAndSleep() {
  let { state, sans, papyrus, enemy, enemy2 } = setupSansState();

  state = setUnit(state, sans.id, { position: { col: 1, row: 1 } });
  state = toBattleState(state, "P1", sans.id);
  const sleepBeforeUnlock = applyAction(
    setUnit(state, sans.id, {
      hp: 5,
      charges: {
        ...state.units[sans.id].charges,
        [ABILITY_SANS_SLEEP]: 3,
      },
    }),
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_SLEEP } as any,
    new SeededRNG(6)
  );
  assert(
    sleepBeforeUnlock.events.length === 0,
    "Sleep should be unavailable before Unbeliever unlock"
  );

  const boneBeforeUnlock = applyAction(
    state,
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_BONE_FIELD } as any,
    new SeededRNG(7)
  );
  assert(
    boneBeforeUnlock.events.length === 0 &&
      boneBeforeUnlock.state.arenaId !== "boneField",
    "Bone Field should be unavailable before Unbeliever unlock"
  );

  state = setUnit(state, papyrus.id, {
    position: { col: 4, row: 4 },
    hp: 1,
    isAlive: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const killAlly = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: papyrus.id } as any,
    makeRngSequence([0.99, 0.5, 0.01, 0.2])
  );
  const killAllyResolved = resolveAllPendingRollsWithEvents(
    killAlly.state,
    makeRngSequence([0.99, 0.5, 0.01, 0.2])
  );
  assert(
    killAllyResolved.state.units[sans.id].sansUnbelieverUnlocked === true,
    "Ally death should unlock Unbeliever for Sans"
  );
  assert(
    killAllyResolved.events.some(
      (event) => event.type === "sansUnbelieverActivated" && event.sansId === sans.id
    ),
    "Unbeliever activation should emit event once"
  );

  let secondKillState = setUnit(killAllyResolved.state, papyrus.id, {
    isAlive: true,
    position: { col: 5, row: 4 },
    hp: 1,
  });
  secondKillState = setUnit(secondKillState, enemy.id, {
    position: { col: 5, row: 5 },
  });
  secondKillState = toBattleState(secondKillState, "P2", enemy.id);
  const killSecond = applyAction(
    secondKillState,
    { type: "attack", attackerId: enemy.id, defenderId: papyrus.id } as any,
    makeRngSequence([0.99, 0.5, 0.01, 0.2])
  );
  const killSecondResolved = resolveAllPendingRollsWithEvents(
    killSecond.state,
    makeRngSequence([0.99, 0.5, 0.01, 0.2])
  );
  assert(
    !killSecondResolved.events.some(
      (event) => event.type === "sansUnbelieverActivated" && event.sansId === sans.id
    ),
    "Unbeliever should not trigger twice"
  );

  let boneReady = setUnit(killSecondResolved.state, sans.id, {
    position: { col: 1, row: 1 },
    turn: makeEmptyTurnEconomy(),
  });
  boneReady = toBattleState(boneReady, "P1", sans.id);
  const bone = applyAction(
    boneReady,
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_BONE_FIELD } as any,
    makeRngSequence([0.99])
  );
  assert(
    bone.state.arenaId === "boneField" && bone.state.boneFieldTurnsLeft === 7,
    "Bone Field should set arena and deterministic duration (1d6+1)"
  );

  const sansStart = applyAction(
    {
      ...bone.state,
      currentPlayer: "P1",
      activeUnitId: null,
      turnQueue: [sans.id],
      turnQueueIndex: 0,
      turnOrder: [sans.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: sans.id } as any,
    makeRngSequence([0.01])
  );
  assert(
    sansStart.state.units[sans.id].sansBoneFieldStatus === undefined,
    "Bone Field should not apply hazards to Sans"
  );

  const boneWithPapyrusAlive = setUnit(bone.state, papyrus.id, {
    isAlive: true,
    position: { col: 2, row: 1 },
    hp: 1,
  });
  const papyrusStart = applyAction(
    {
      ...boneWithPapyrusAlive,
      currentPlayer: "P1",
      activeUnitId: null,
      turnQueue: [papyrus.id],
      turnQueueIndex: 0,
      turnOrder: [papyrus.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: papyrus.id } as any,
    makeRngSequence([0.01])
  );
  assert(
    papyrusStart.state.units[papyrus.id].sansBoneFieldStatus === undefined,
    "Bone Field should not apply hazards to Papyrus"
  );

  const enemyStart = applyAction(
    {
      ...bone.state,
      currentPlayer: "P2",
      activeUnitId: null,
      turnQueue: [enemy.id],
      turnQueueIndex: 0,
      turnOrder: [enemy.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: enemy.id } as any,
    makeRngSequence([0.01])
  );
  assert(
    enemyStart.state.units[enemy.id].sansBoneFieldStatus?.kind === "blue",
    "Bone Field should apply Blue/Orange hazard to non-Sans/non-Papyrus units"
  );

  const enemyMoves = getLegalMovesForUnit(enemyStart.state, enemy.id);
  assert(enemyMoves.length > 0, "Enemy should have legal move for Blue hazard test");
  const beforeBlueHp = enemyStart.state.units[enemy.id].hp;
  const moved = applyAction(
    enemyStart.state,
    { type: "move", unitId: enemy.id, to: enemyMoves[0] } as any,
    new SeededRNG(8)
  );
  assert(
    moved.state.units[enemy.id].hp === beforeBlueHp - 1 &&
      moved.events.some(
        (event) =>
          event.type === "sansBoneFieldPunished" && event.reason === "moveSpent"
      ),
    "Blue hazard should deal 1 damage when movement action is spent"
  );

  const orangeBase = setUnit(bone.state, enemy2.id, {
    position: { col: 6, row: 5 },
    hp: 10,
  });
  const orangeStart = applyAction(
    {
      ...orangeBase,
      currentPlayer: "P2",
      activeUnitId: null,
      turnQueue: [enemy2.id],
      turnQueueIndex: 0,
      turnOrder: [enemy2.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: enemy2.id } as any,
    makeRngSequence([0.99])
  );
  assert(
    orangeStart.state.units[enemy2.id].sansBoneFieldStatus?.kind === "orange",
    "Bone Field should also roll Orange hazard deterministically"
  );
  const beforeOrangeHp = orangeStart.state.units[enemy2.id].hp;
  const ended = applyAction(orangeStart.state, { type: "endTurn" } as any, new SeededRNG(9));
  assert(
    ended.state.units[enemy2.id].hp === beforeOrangeHp - 1 &&
      ended.events.some(
        (event) =>
          event.type === "sansBoneFieldPunished" && event.reason === "moveNotSpent"
      ),
    "Orange hazard should deal 1 damage when turn ends without movement"
  );

  let sleepReady = setUnit(killSecondResolved.state, sans.id, {
    hp: 5,
    turn: makeEmptyTurnEconomy(),
    charges: {
      ...killSecondResolved.state.units[sans.id].charges,
      [ABILITY_SANS_SLEEP]: 3,
    },
  });
  sleepReady = toBattleState(sleepReady, "P1", sans.id);
  const sleep = applyAction(
    sleepReady,
    { type: "useAbility", unitId: sans.id, abilityId: ABILITY_SANS_SLEEP } as any,
    new SeededRNG(10)
  );
  assert(
    sleep.state.units[sans.id].hp === 6 &&
      sleep.state.units[sans.id].charges[ABILITY_SANS_SLEEP] === 0,
    "Sleep should heal 2 with clamp and spend 3 charges"
  );

  console.log("sans_unbeliever_bone_field_and_sleep passed");
}


export function testSansLastAttackCurse() {
  let { state, sans, enemy, enemy2 } = setupSansState();
  state = setUnit(state, sans.id, {
    position: { col: 4, row: 4 },
    hp: 1,
    sansUnbelieverUnlocked: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 }, hp: 4 });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 6 }, hp: 2 });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const attack = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id } as any,
    makeAttackWinRng(1)
  );
  const resolved = resolveAllPendingRollsWithEvents(
    attack.state,
    makeAttackWinRng(1)
  );
  assert(
    resolved.events.some(
      (event) =>
        event.type === "sansLastAttackApplied" &&
        event.sansId === sans.id &&
        event.targetId === enemy2.id
    ),
    "Last Attack should apply curse to deterministic fallback target on Sans death"
  );
  assert(
    resolved.state.units[enemy2.id].sansLastAttackCurseSourceId === sans.id,
    "Curse should be stored on chosen target"
  );

  const tickState: GameState = {
    ...resolved.state,
    currentPlayer: "P2",
    activeUnitId: null,
    turnQueue: [enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [enemy2.id],
    turnOrderIndex: 0,
  };
  const tick = applyAction(
    tickState,
    { type: "unitStartTurn", unitId: enemy2.id } as any,
    new SeededRNG(11)
  );
  assert(
    tick.state.units[enemy2.id].hp === 1 &&
      tick.state.units[enemy2.id].isAlive &&
      !tick.state.units[enemy2.id].sansLastAttackCurseSourceId,
    "Curse should deal 1 at turn start, never kill below 1, and clear at HP 1"
  );
  assert(
    tick.events.some((event) => event.type === "sansLastAttackTick") &&
      tick.events.some((event) => event.type === "sansLastAttackRemoved"),
    "Curse tick and removal events should be emitted"
  );

  console.log("sans_last_attack_curse passed");
}
