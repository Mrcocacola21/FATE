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

function resolvePendingChoice(
  state: GameState,
  choice: unknown,
  rng = makeRngSequence([])
) {
  assert(state.pendingRoll, "expected a pending roll to resolve");
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll.id,
      player: state.pendingRoll.player,
      choice,
    } as any,
    rng
  );
}

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
      [ABILITY_FRISK_PACIFISM]: 30,
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
    friskAfter.charges[ABILITY_FRISK_PACIFISM] === 31,
    "Frisk should gain Pacifism beyond the old 30-point cap"
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
      [ABILITY_FRISK_GENOCIDE]: 30,
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
    resolved.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 31,
    "Frisk should gain Genocide beyond the old 30-point cap"
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


export function testFriskPacifismActiveOptionsSpendOnResolutionOnly() {
  let { state, frisk } = setupFriskState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.id !== frisk.id
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 13,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
    turn: makeEmptyTurnEconomy(),
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 }, hp: 1 });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", frisk.id));

  const opened = applyAction(
    state,
    { type: "useAbility", unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM } as any,
    makeRngSequence([])
  );
  assert(
    opened.state.pendingRoll?.kind === "friskPacifismChoice",
    "Pacifism should open an option menu"
  );
  assert(
    opened.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 13,
    "opening Pacifism should not spend points"
  );
  assert(
    opened.state.units[frisk.id].hasActedThisTurn === false,
    "opening Pacifism should not spend the main action"
  );

  const hugsChosen = resolvePendingChoice(opened.state, {
    type: "friskPacifismOption",
    option: "hugs",
  });
  assert(
    hugsChosen.state.pendingRoll?.kind === "friskPacifismHugsTargetChoice",
    "Hugs should ask for a board target"
  );
  assert(
    hugsChosen.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 13,
    "entering Hugs target selection should not spend points"
  );
  assert(
    hugsChosen.state.units[frisk.id].hasActedThisTurn === false,
    "entering Hugs target selection should not spend the main action"
  );

  const canceled = resolvePendingChoice(hugsChosen.state, "skip");
  assert(!canceled.state.pendingRoll, "cancelling Hugs target selection should clear it");
  assert(
    canceled.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 13,
    "cancelling Hugs target selection should not spend points"
  );
  assert(
    canceled.state.units[frisk.id].hasActedThisTurn === false,
    "cancelling Hugs target selection should not spend the main action"
  );

  const reopened = applyAction(
    canceled.state,
    { type: "useAbility", unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM } as any,
    makeRngSequence([])
  );
  const hugsAgain = resolvePendingChoice(reopened.state, {
    type: "friskPacifismOption",
    option: "hugs",
  });
  const hugged = resolvePendingChoice(hugsAgain.state, {
    type: "friskPacifismHugsTarget",
    targetId: enemy.id,
  });
  assert(!hugged.state.pendingRoll, "Hugs should resolve after picking a target");
  assert(
    hugged.state.units[frisk.id].charges[ABILITY_FRISK_PACIFISM] === 10,
    "Hugs should spend exactly 3 Pacifism points on target resolution"
  );
  assert(
    hugged.state.units[frisk.id].hasActedThisTurn === true,
    "Hugs should spend the main action on target resolution"
  );
  assert(
    hugged.state.units[enemy.id].movementDisabledNextTurn === true,
    "Hugs should disable the picked target's next movement"
  );
  const blockedAttack = applyAction(
    hugged.state,
    { type: "attack", attackerId: frisk.id, defenderId: enemy.id } as any,
    makeRngSequence([])
  );
  assert(
    !blockedAttack.state.pendingRoll,
    "Frisk should not be able to attack after Hugs spends the main action"
  );

  let { state: warmState, frisk: warmFrisk } = setupFriskState();
  const warmAlly = Object.values(warmState.units).find(
    (unit) => unit.owner === "P1" && unit.id !== warmFrisk.id
  )!;
  const warmEnemy = Object.values(warmState.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  warmState = setUnit(warmState, warmFrisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...warmState.units[warmFrisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 10,
      [ABILITY_FRISK_GENOCIDE]: 0,
    },
    turn: makeEmptyTurnEconomy(),
  });
  warmState = setUnit(warmState, warmAlly.id, {
    position: { col: 5, row: 4 },
    hp: 1,
  });
  warmState = setUnit(warmState, warmEnemy.id, { position: { col: 4, row: 5 } });
  warmState = initKnowledgeForOwners(toBattleState(warmState, "P1", warmFrisk.id));

  const warmOpened = applyAction(
    warmState,
    {
      type: "useAbility",
      unitId: warmFrisk.id,
      abilityId: ABILITY_FRISK_PACIFISM,
    } as any,
    makeRngSequence([])
  );
  const warmWordsOptions = (warmOpened.state.pendingRoll?.context
    ?.warmWordsOptions ?? []) as string[];
  assert(
    warmWordsOptions.includes(warmFrisk.id),
    "Warm Words should allow Frisk to target self"
  );
  assert(
    warmWordsOptions.includes(warmAlly.id),
    "Warm Words should allow allied targets within 2"
  );
  assert(
    !warmWordsOptions.includes(warmEnemy.id),
    "Warm Words should not allow enemy targets"
  );

  const warmChosen = resolvePendingChoice(warmOpened.state, {
    type: "friskPacifismOption",
    option: "warmWords",
  });
  assert(
    warmChosen.state.pendingRoll?.kind === "friskWarmWordsTargetChoice",
    "Warm Words should ask for an allied target"
  );
  assert(
    warmChosen.state.units[warmFrisk.id].charges[ABILITY_FRISK_PACIFISM] === 10,
    "entering Warm Words target selection should not spend points"
  );
  assert(
    warmChosen.state.units[warmFrisk.id].hasActedThisTurn === false,
    "entering Warm Words target selection should not spend the main action"
  );

  const warmTargetPicked = resolvePendingChoice(warmChosen.state, {
    type: "friskWarmWordsTarget",
    targetId: warmAlly.id,
  });
  assert(
    warmTargetPicked.state.pendingRoll?.kind === "friskWarmWordsHealRoll",
    "Warm Words should roll healing after target selection"
  );
  assert(
    warmTargetPicked.state.units[warmFrisk.id].charges[ABILITY_FRISK_PACIFISM] === 10,
    "picking a Warm Words target should not spend before the heal resolves"
  );
  assert(
    warmTargetPicked.state.units[warmFrisk.id].hasActedThisTurn === false,
    "picking a Warm Words target should not spend the main action before the heal resolves"
  );

  const healed = resolvePendingChoice(
    warmTargetPicked.state,
    undefined,
    makeRngSequence([0.99])
  );
  assert(
    healed.state.units[warmFrisk.id].charges[ABILITY_FRISK_PACIFISM] === 0,
    "Warm Words should spend exactly 10 Pacifism points when the heal resolves"
  );
  assert(
    healed.state.units[warmFrisk.id].hasActedThisTurn === true,
    "Warm Words should spend the main action when the heal resolves"
  );
  assert(
    healed.state.units[warmAlly.id].hp > 1,
    "Warm Words should heal the picked allied target"
  );

  console.log("frisk_pacifism_active_options_spend_on_resolution_only passed");
}


export function testFriskGenocideActiveOptionsSpendOnResolutionOnly() {
  let { state, frisk } = setupFriskState();
  const hiddenEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, frisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...state.units[frisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 15,
    },
    turn: makeEmptyTurnEconomy(),
  });
  state = setUnit(state, hiddenEnemy.id, {
    position: { col: 4, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 2,
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", frisk.id));

  const opened = applyAction(
    state,
    { type: "useAbility", unitId: frisk.id, abilityId: ABILITY_FRISK_GENOCIDE } as any,
    makeRngSequence([])
  );
  assert(
    opened.state.pendingRoll?.kind === "friskGenocideChoice",
    "Genocide should open an option menu"
  );
  assert(
    opened.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 15,
    "opening Genocide should not spend points"
  );

  const keenEyeChosen = resolvePendingChoice(opened.state, {
    type: "friskGenocideOption",
    option: "keenEye",
  });
  assert(
    keenEyeChosen.state.pendingRoll?.kind === "friskKeenEyeChoice",
    "Keen Eye should ask for an enemy target"
  );
  assert(
    keenEyeChosen.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 15,
    "entering Keen Eye target selection should not spend points"
  );
  assert(
    keenEyeChosen.state.units[frisk.id].hasActedThisTurn === false,
    "entering Keen Eye target selection should not spend the main action"
  );

  const revealed = resolvePendingChoice(
    keenEyeChosen.state,
    { type: "friskKeenEyeTarget", targetId: hiddenEnemy.id },
    makeRngSequence([0.99])
  );
  assert(!revealed.state.pendingRoll, "Keen Eye should resolve after picking a target");
  assert(
    revealed.state.units[frisk.id].charges[ABILITY_FRISK_GENOCIDE] === 10,
    "Keen Eye should spend exactly 5 Genocide points on target resolution"
  );
  assert(
    revealed.state.units[frisk.id].hasActedThisTurn === true,
    "Keen Eye should spend the main action on target resolution"
  );
  assert(
    revealed.state.units[hiddenEnemy.id].isStealthed === false,
    "Keen Eye should reveal the picked hidden enemy"
  );
  const blockedAttack = applyAction(
    revealed.state,
    { type: "attack", attackerId: frisk.id, defenderId: hiddenEnemy.id } as any,
    makeRngSequence([])
  );
  assert(
    !blockedAttack.state.pendingRoll,
    "Frisk should not be able to attack after Keen Eye spends the main action"
  );

  let { state: precisionState, frisk: precisionFrisk } = setupFriskState();
  const precisionTarget = Object.values(precisionState.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  precisionState = setUnit(precisionState, precisionFrisk.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...precisionState.units[precisionFrisk.id].charges,
      [ABILITY_FRISK_PACIFISM]: 0,
      [ABILITY_FRISK_GENOCIDE]: 10,
    },
    turn: makeEmptyTurnEconomy(),
  });
  precisionState = setUnit(precisionState, precisionTarget.id, {
    position: { col: 4, row: 5 },
    hp: 20,
  });
  precisionState = initKnowledgeForOwners(
    toBattleState(precisionState, "P1", precisionFrisk.id)
  );
  const precisionDamage = precisionState.units[precisionFrisk.id].attack * 2;

  const precisionOpened = applyAction(
    precisionState,
    {
      type: "useAbility",
      unitId: precisionFrisk.id,
      abilityId: ABILITY_FRISK_GENOCIDE,
    } as any,
    makeRngSequence([])
  );
  const precisionChosen = resolvePendingChoice(precisionOpened.state, {
    type: "friskGenocideOption",
    option: "precisionStrike",
  });
  assert(
    precisionChosen.state.pendingRoll?.kind === "friskPrecisionStrikeTargetChoice",
    "Precision Strike should ask for an attack target"
  );
  assert(
    precisionChosen.state.units[precisionFrisk.id].charges[ABILITY_FRISK_GENOCIDE] ===
      10,
    "entering Precision Strike target selection should not spend points"
  );
  assert(
    precisionChosen.state.units[precisionFrisk.id].hasActedThisTurn === false &&
      precisionChosen.state.units[precisionFrisk.id].hasAttackedThisTurn === false,
    "entering Precision Strike target selection should not spend attack/action slots"
  );

  const precisionCanceled = resolvePendingChoice(precisionChosen.state, "skip");
  assert(
    !precisionCanceled.state.pendingRoll,
    "cancelling Precision Strike target selection should clear it"
  );
  assert(
    precisionCanceled.state.units[precisionFrisk.id].charges[ABILITY_FRISK_GENOCIDE] ===
      10,
    "cancelling Precision Strike target selection should not spend points"
  );
  assert(
    precisionCanceled.state.units[precisionFrisk.id].hasActedThisTurn === false &&
      precisionCanceled.state.units[precisionFrisk.id].hasAttackedThisTurn === false,
    "cancelling Precision Strike target selection should not spend attack/action slots"
  );

  const precisionReopened = applyAction(
    precisionCanceled.state,
    {
      type: "useAbility",
      unitId: precisionFrisk.id,
      abilityId: ABILITY_FRISK_GENOCIDE,
    } as any,
    makeRngSequence([])
  );
  const precisionChosenAgain = resolvePendingChoice(precisionReopened.state, {
    type: "friskGenocideOption",
    option: "precisionStrike",
  });
  const precisionTargetPicked = resolvePendingChoice(precisionChosenAgain.state, {
    type: "friskPrecisionStrikeTarget",
    targetId: precisionTarget.id,
  });
  assert(
    precisionTargetPicked.state.pendingRoll?.kind === "attack_attackerRoll",
    "Precision Strike target resolution should start the attack"
  );
  assert(
    precisionTargetPicked.state.units[precisionFrisk.id].charges[
      ABILITY_FRISK_GENOCIDE
    ] === 0,
    "Precision Strike should spend exactly 10 Genocide points on target resolution"
  );
  assert(
    precisionTargetPicked.state.units[precisionFrisk.id].hasActedThisTurn === false &&
      precisionTargetPicked.state.units[precisionFrisk.id].hasAttackedThisTurn === false,
    "Precision Strike should wait for attack resolution before spending attack/action slots"
  );

  const precisionResolved = resolveAllPendingRollsWithEvents(
    precisionTargetPicked.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const precisionEvents = [
    ...precisionTargetPicked.events,
    ...precisionResolved.events,
  ];
  const precisionAttack = precisionEvents.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === precisionFrisk.id &&
      event.defenderId === precisionTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(precisionAttack, "Precision Strike attack should resolve");
  assert(precisionAttack.hit, "Precision Strike should auto-hit");
  assert(
    precisionAttack.damage === precisionDamage,
    "Precision Strike should deal double Frisk's attack damage"
  );
  assert(
    precisionResolved.state.units[precisionFrisk.id].hasActedThisTurn === true &&
      precisionResolved.state.units[precisionFrisk.id].hasAttackedThisTurn === true,
    "Precision Strike should spend attack/action slots after the attack resolves"
  );
  assert(
    precisionResolved.state.units[precisionFrisk.id].friskPrecisionStrikeReady === false,
    "Precision Strike readiness should clear after the attack resolves"
  );

  console.log("frisk_genocide_active_options_spend_on_resolution_only passed");
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
