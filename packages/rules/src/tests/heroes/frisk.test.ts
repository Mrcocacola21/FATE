import {
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  applyAction,
  assert,
  GameEvent,
  GameState,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  setUnit,
  setupFriskState,
  toBattleState,
} from "../helpers/testUtils";
export function testFriskPacifismIncrementsOnMissIncludingCleanSoul() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskCleanSoulShield: true,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.99, 0.99])
  );
  const events = [...started.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack against Frisk should resolve");
  assert(!attackEvent.hit, "Clean Soul shield should force the attack to miss");

  const friskAfter = resolved.state.units[frisk.id];
  assert(
    friskAfter.charges[ABILITY_FRISK_PACIFISM] === 1,
    "Frisk should gain +1 Pacifism on miss"
  );
  assert(
    friskAfter.friskCleanSoulShield === false,
    "Clean Soul shield should be consumed after forcing a miss"
  );

  console.log("frisk_pacifism_increments_on_miss_including_clean_soul passed");
}


export function testFriskGenocideIncrementsOnHit() {
  let { state, frisk } = setupFriskState();
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, target.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: target.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const events = [...started.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === frisk.id &&
      event.defenderId === target.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Frisk attack should resolve");
  assert(attackEvent.hit, "test setup should produce a successful Frisk hit");
  assert(
    resolved.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 1,
    "Frisk should gain +1 Genocide on hit"
  );

  console.log("frisk_genocide_increments_on_hit passed");
}


export function testFriskCleanSoulShieldFlow() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const enterStealth = applyAction(
    state,
    { type: "enterStealth", unitId: frisk.id } as any,
    makeRngSequence([])
  );
  assert(
    enterStealth.state.pendingRoll?.kind === "enterStealth",
    "Frisk stealth attempt should request enterStealth roll"
  );
  const entered = resolvePendingRollOnce(enterStealth.state, makeRngSequence([0.99]));
  assert(entered.state.units[frisk.id].isStealthed, "Frisk should enter stealth");

  let revealState = setUnit(entered.state, frisk.id, {
    stealthTurnsLeft: 0,
    friskDidAttackWhileStealthedSinceLastEnter: false,
  });
  revealState = {
    ...revealState,
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [frisk.id],
    turnQueueIndex: 0,
    turnOrder: [frisk.id],
    turnOrderIndex: 0,
  };

  const startTurn = applyAction(
    revealState,
    { type: "unitStartTurn", unitId: frisk.id } as any,
    makeRngSequence([])
  );
  const afterReveal = startTurn.state.units[frisk.id];
  assert(!afterReveal.isStealthed, "Frisk should exit stealth on timer reveal");
  assert(
    afterReveal.friskCleanSoulShield === true,
    "Frisk should gain Clean Soul shield after leaving stealth without attacking"
  );

  const enemyTurnState = initKnowledgeForOwners(
    toBattleState(startTurn.state, "P2", attacker.id)
  );
  const attacked = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    attacked.state,
    makeRngSequence([0.99, 0.99])
  );
  const events = [...attacked.events, ...resolved.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack after Clean Soul setup should resolve");
  assert(!attackEvent.hit, "Clean Soul shield should force the next attack to miss");
  assert(
    resolved.state.units[frisk.id].friskCleanSoulShield === false,
    "Clean Soul shield should be consumed after one use"
  );

  console.log("frisk_clean_soul_shield_flow passed");
}


export function testFriskChildsCryNegatesDamageAndSpendsPoints() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    friskCleanSoulShield: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 5,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    rng
  );
  const afterAttacker = resolvePendingRollOnce(started.state, rng);
  const afterDefender = resolvePendingRollOnce(afterAttacker.state, rng);

  assert(
    afterDefender.state.pendingRoll?.kind === "friskChildsCryChoice",
    "Child's Cry should be offered after a hit is determined"
  );

  const activated = applyAction(
    afterDefender.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterDefender.state.pendingRoll!.id,
      player: afterDefender.state.pendingRoll!.player,
      choice: "activate",
    } as any,
    rng
  );
  const events = [
    ...started.events,
    ...afterAttacker.events,
    ...afterDefender.events,
    ...activated.events,
  ];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "attack should resolve after Child's Cry choice");
  assert(attackEvent.hit, "Child's Cry keeps hit result but nullifies damage");
  assert(attackEvent.damage === 0, "Child's Cry should reduce damage to 0");
  assert(
    activated.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 0,
    "Child's Cry should spend exactly 5 Pacifism points"
  );

  console.log("frisk_childs_cry_negates_damage_and_spends_points passed");
}


export function testFriskSubstitutionTakesOneDamageBeforeDefenseRoll() {
  let { state, frisk } = setupFriskState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_GENOCIDE]: 3,
      [ABILITY_FRISK_PACIFISM]: 0,
    },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const hpBefore = state.units[frisk.id].hp;
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01]);
  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    rng
  );
  const afterAttacker = resolvePendingRollOnce(started.state, rng);
  assert(
    afterAttacker.state.pendingRoll?.kind === "friskSubstitutionChoice",
    "Substitution should be offered before defender roll"
  );

  const activated = applyAction(
    afterAttacker.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttacker.state.pendingRoll!.id,
      player: afterAttacker.state.pendingRoll!.player,
      choice: "activate",
    } as any,
    rng
  );
  const events = [...started.events, ...afterAttacker.events, ...activated.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === frisk.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "attack should resolve after Substitution choice");
  assert(attackEvent.hit, "Substitution should still resolve as a hit");
  assert(attackEvent.damage === 1, "Substitution should force exactly 1 damage");
  assert(
    activated.state.units[frisk.id].hp === hpBefore - 1,
    "Frisk should lose exactly 1 HP from Substitution"
  );
  assert(
    activated.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 0,
    "Substitution should spend exactly 3 Genocide points"
  );

  console.log("frisk_substitution_takes_one_damage_before_defense_roll passed");
}


export function testFriskOnePathConvertsAndDisablesPacifism() {
  let { state, frisk } = setupFriskState();
  const victim = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 4,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, victim.id, { position: { col: 4, row: 5 }, hp: 1 });
  state = setUnit(state, attacker.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const killed = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: victim.id } as any,
    makeRngSequence([])
  );
  const resolvedKill = resolveAllPendingRollsWithEvents(
    killed.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const friskAfterKill = resolvedKill.state.units[frisk.id];

  assert(
    friskAfterKill.friskPacifismDisabled === true,
    "One Path should permanently disable Pacifism after first Frisk kill"
  );
  assert(
    friskAfterKill.charges[ABILITY_FRISK_PACIFISM] === 0,
    "One Path should convert all Pacifism points to 0"
  );
  assert(
    friskAfterKill.charges[ABILITY_FRISK_GENOCIDE] === 5,
    "One Path should convert Pacifism to Genocide while preserving hit gain"
  );

  const enemyTurnState: GameState = {
    ...resolvedKill.state,
    currentPlayer: "P2",
    activeUnitId: attacker.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const missedAttack = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: attacker.id, defenderId: frisk.id } as any,
    makeRngSequence([])
  );
  const missedResolved = resolveAllPendingRollsWithEvents(
    missedAttack.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  assert(
    missedResolved.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 0,
    "Pacifism should no longer gain points after One Path"
  );

  const pacifismAttemptState: GameState = {
    ...missedResolved.state,
    currentPlayer: "P1",
    activeUnitId: frisk.id,
    pendingRoll: null,
    pendingMove: null,
    units: {
      ...missedResolved.state.units,
      [frisk.id]: {
        ...missedResolved.state.units[frisk.id],
        turn: makeEmptyTurnEconomy(),
      },
    },
  };
  const usePacifism = applyAction(
    pacifismAttemptState,
    { type: "useAbility", unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM } as any,
    makeRngSequence([])
  );
  assert(
    !usePacifism.state.pendingRoll,
    "Pacifism menu should not open after One Path disables Pacifism"
  );

  console.log("frisk_one_path_converts_and_disables_pacifism passed");
}


export function testFriskKillBonusesFirstAndSecondKill() {
  let { state, frisk } = setupFriskState();
  const firstTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const secondTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  const baseAttack = state.units[frisk.id].attack;
  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, firstTarget.id, { position: { col: 4, row: 5 }, hp: 1 });
  state = setUnit(state, secondTarget.id, { position: { col: 5, row: 4 }, hp: 1 });
  state = toBattleState(state, "P1", frisk.id);
  state = initKnowledgeForOwners(state);

  const firstAttack = applyAction(
    state,
    { type: "attack", attackerId: frisk.id, defenderId: firstTarget.id } as any,
    makeRngSequence([])
  );
  const firstResolved = resolveAllPendingRollsWithEvents(
    firstAttack.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const afterFirstKill = firstResolved.state.units[frisk.id];
  assert(
    afterFirstKill.attack === baseAttack + 1,
    "first Frisk kill should increase base damage by +1 exactly once"
  );

  const genocideAfterFirst = afterFirstKill.charges[ABILITY_FRISK_GENOCIDE];
  let secondState = setUnit(firstResolved.state, frisk.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondState = {
    ...secondState,
    currentPlayer: "P1",
    activeUnitId: frisk.id,
    pendingRoll: null,
    pendingMove: null,
  };

  const secondAttack = applyAction(
    secondState,
    { type: "attack", attackerId: frisk.id, defenderId: secondTarget.id } as any,
    makeRngSequence([])
  );
  assert(
    secondAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "second Frisk kill setup should start a normal attack roll sequence"
  );
  const secondResolved = resolveAllPendingRollsWithEvents(
    secondAttack.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const secondEvents = [...secondAttack.events, ...secondResolved.events];
  const afterSecondKill = secondResolved.state.units[frisk.id];
  const secondTargetAfter = secondResolved.state.units[secondTarget.id];
  const secondAttackEvent = secondEvents.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === frisk.id &&
      event.defenderId === secondTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  const genocideDelta =
    afterSecondKill.charges[ABILITY_FRISK_GENOCIDE] - genocideAfterFirst;

  assert(
    afterSecondKill.attack === baseAttack + 1,
    "Frisk damage bonus from kills should not stack beyond +1"
  );
  assert(secondAttackEvent, "second Frisk attack should resolve");
  assert(secondAttackEvent.hit, "second Frisk attack should hit in this setup");
  assert(
    !secondTargetAfter.isAlive,
    "second Frisk kill test setup should actually kill the second target"
  );
  assert(
    genocideDelta >= 3,
    "second Frisk kill should grant the +3 Genocide kill bonus"
  );

  console.log("frisk_kill_bonuses_first_and_second_kill passed");
}


export function testFriskPowerOfFriendshipWinCondition() {
  let { state, frisk } = setupFriskState();
  const lastEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    friskPacifismDisabled: false,
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 1,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
  });
  state = setUnit(state, lastEnemy.id, { position: { col: 4, row: 5 } });

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== "P2" || unit.id === lastEnemy.id) continue;
    state = setUnit(state, unit.id, {
      isAlive: false,
      hp: 0,
      position: null,
    });
  }

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [frisk.id],
    turnQueueIndex: 0,
    turnOrder: [frisk.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: frisk.id } as any,
    makeRngSequence([])
  );

  assert(
    started.state.phase === "ended",
    "Power of Friendship should end the game when one enemy remains and Genocide is 0"
  );
  const gameEnded = started.events.find(
    (event) => event.type === "gameEnded"
  ) as Extract<GameEvent, { type: "gameEnded" }> | undefined;
  assert(gameEnded, "Power of Friendship should emit gameEnded event");
  assert(gameEnded.winner === "P1", "Power of Friendship should win for Frisk owner");

  console.log("frisk_power_of_friendship_win_condition passed");
}
