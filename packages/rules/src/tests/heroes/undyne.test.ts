import {
  ABILITY_UNDYNE_ENERGY_SPEAR,
  ABILITY_UNDYNE_SPEAR_THROW,
  ABILITY_UNDYNE_UNDYING,
  applyAction,
  assert,
  getHeroMeta,
  getUnitDefinition,
  HERO_UNDYNE_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  makeRngSequence,
  makeSharedAttackerWinRng,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupUndyneState,
  toBattleState,
} from "../helpers/testUtils";
export function testUndyneToughSpearmanFeatureAndReach() {
  let { state, undyne, enemy } = setupUndyneState();

  assert(
    undyne.hp === getUnitDefinition("berserker").maxHp + 1,
    "Undyne should have +1 HP from Tough"
  );
  const undyneMeta = getHeroMeta(HERO_UNDYNE_ID);
  assert(
    undyneMeta?.baseStats.hp === getUnitDefinition("berserker").maxHp + 1,
    "Undyne hero meta HP should match Tough passive bonus"
  );

  let moveState = setUnit(state, undyne.id, { position: { col: 4, row: 4 } });
  moveState = toBattleState(moveState, "P1", undyne.id);
  const moveModes = applyAction(
    moveState,
    { type: "requestMoveOptions", unitId: undyne.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("spearman"),
    "Undyne should expose Spearman movement mode from multiclass"
  );

  state = setUnit(state, undyne.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const defended = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeRngSequence([0.99, 0.5, 0.5, 0.5])
  );
  const defendedResolved = resolveAllPendingRollsWithEvents(
    defended.state,
    makeRngSequence([0.99, 0.5, 0.5, 0.5])
  );
  const defenseEvent = defendedResolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemy.id &&
      event.defenderId === undyne.id
  );
  assert(
    defenseEvent &&
      defenseEvent.type === "attackResolved" &&
      defenseEvent.hit === false,
    "Undyne should auto-dodge on defense double from Spearman multiclass"
  );

  let reachState = setUnit(defendedResolved.state, undyne.id, {
    position: { col: 4, row: 4 },
    turn: makeEmptyTurnEconomy(),
  });
  reachState = setUnit(reachState, enemy.id, { position: { col: 4, row: 6 } });
  reachState = toBattleState(reachState, "P1", undyne.id);
  const reachAttack = applyAction(
    reachState,
    { type: "attack", attackerId: undyne.id, defenderId: enemy.id } as any,
    new SeededRNG(12)
  );
  assert(
    reachAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "Undyne should be able to use Spearman reach for base attacks"
  );

  console.log("undyne_tough_spearman_feature_and_reach passed");
}


export function testUndyneThrowSpearFixedDamageAndSpearRain() {
  let { state, undyne, enemy } = setupUndyneState();
  state = setUnit(state, undyne.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 }, hp: 12 });
  state = toBattleState(state, "P1", undyne.id);
  state = initKnowledgeForOwners(state);

  const baseCast = applyAction(
    state,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_SPEAR_THROW,
      payload: { targetId: enemy.id },
    } as any,
    makeAttackWinRng(1)
  );
  const baseResolved = resolveAllPendingRollsWithEvents(
    baseCast.state,
    makeAttackWinRng(1)
  );
  const baseHit = baseResolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === undyne.id &&
      event.defenderId === enemy.id
  );
  assert(
    baseHit && baseHit.type === "attackResolved" && baseHit.damage === 1,
    "Throw Spear should always deal fixed 1 damage"
  );

  let rainState = setUnit(baseResolved.state, undyne.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    undyneImmortalUsed: true,
    undyneImmortalActive: true,
  });
  rainState = setUnit(rainState, enemy.id, { hp: 12, isAlive: true, position: { col: 4, row: 7 } });
  rainState = toBattleState(rainState, "P1", undyne.id);
  const rainCast = applyAction(
    rainState,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_SPEAR_THROW,
      payload: { targetId: enemy.id },
    } as any,
    makeAttackWinRng(3)
  );
  assert(
    rainCast.state.pendingRoll?.kind === "attack_attackerRoll",
    "Immortal Throw Spear should start the Spear Rain attack chain"
  );
  const rainResolved = resolveAllPendingRollsWithEvents(
    rainCast.state,
    makeAttackWinRng(3)
  );
  const rainHits = rainResolved.events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === undyne.id &&
      event.defenderId === enemy.id
  );
  assert(
    rainHits.length === 3 &&
      rainHits.every(
        (event) => event.type === "attackResolved" && event.damage === 1
      ),
    "Spear Rain should perform exactly 3 fixed-damage attacks"
  );

  console.log("undyne_throw_spear_fixed_damage_and_spear_rain passed");
}


export function testUndyneEnergySpearGatingLineAndFreeImmortalCost() {
  let { state, undyne, ally, enemy, enemy2 } = setupUndyneState();
  state = setUnit(state, undyne.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 2, row: 6 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 }, hp: 12 });
  state = setUnit(state, enemy2.id, { position: { col: 6, row: 5 }, hp: 12 });
  state = toBattleState(state, "P1", undyne.id);
  state = initKnowledgeForOwners(state);

  const lowCharges = setUnit(state, undyne.id, {
    charges: {
      ...state.units[undyne.id].charges,
      [ABILITY_UNDYNE_ENERGY_SPEAR]: 1,
    },
  });
  const failCost = applyAction(
    lowCharges,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      payload: { target: { col: 0, row: 6 }, axis: "row" },
    } as any,
    makeSharedAttackerWinRng(2)
  );
  assert(
    failCost.events.length === 0 && !failCost.state.pendingRoll,
    "Energy Spear should require 2 charges in base form"
  );

  const readyCharges = setUnit(state, undyne.id, {
    charges: {
      ...state.units[undyne.id].charges,
      [ABILITY_UNDYNE_ENERGY_SPEAR]: 2,
    },
  });
  const fallbackAxis = applyAction(
    readyCharges,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      payload: { target: { col: 0, row: 6 }, axis: "diagMain" },
    } as any,
    makeSharedAttackerWinRng(2)
  );
  assert(
    fallbackAxis.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.abilityId === ABILITY_UNDYNE_ENERGY_SPEAR
    ) && fallbackAxis.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Energy Spear should default non-cardinal line selection to row"
  );

  const cast = applyAction(
    readyCharges,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      payload: { target: { col: 0, row: 6 }, axis: "row" },
    } as any,
    makeSharedAttackerWinRng(2)
  );
  assert(
    cast.state.units[undyne.id].charges[ABILITY_UNDYNE_ENERGY_SPEAR] === 0,
    "Energy Spear should spend 2 charges in base form"
  );
  const castResolved = resolveAllPendingRollsWithEvents(
    cast.state,
    makeSharedAttackerWinRng(2)
  );
  const hitIds = castResolved.events
    .filter(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === undyne.id &&
        event.hit
    )
    .map((event) => (event.type === "attackResolved" ? event.defenderId : ""));
  assert(
    hitIds.includes(ally.id) && hitIds.includes(enemy.id),
    "Energy Spear should hit all units on the selected row/column"
  );
  assert(
    !hitIds.includes(enemy2.id),
    "Energy Spear should not hit units outside the selected line"
  );
  assert(
    castResolved.events
      .filter(
        (event) =>
          event.type === "attackResolved" && event.attackerId === undyne.id
      )
      .every(
        (event) => event.type === "attackResolved" && event.damage === 1
      ),
    "Energy Spear should always deal fixed 1 damage"
  );

  let immortalFree = setUnit(castResolved.state, undyne.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    undyneImmortalUsed: true,
    undyneImmortalActive: true,
    charges: {
      ...castResolved.state.units[undyne.id].charges,
      [ABILITY_UNDYNE_ENERGY_SPEAR]: 0,
    },
  });
  immortalFree = toBattleState(immortalFree, "P1", undyne.id);
  const freeCast = applyAction(
    immortalFree,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      payload: { target: { col: 0, row: 6 }, axis: "row" },
    } as any,
    makeSharedAttackerWinRng(2)
  );
  assert(
    freeCast.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.abilityId === ABILITY_UNDYNE_ENERGY_SPEAR
    ) &&
      freeCast.state.units[undyne.id].charges[ABILITY_UNDYNE_ENERGY_SPEAR] === 0,
    "Immortal Undyne should cast Energy Spear without charge cost"
  );

  console.log("undyne_energy_spear_gating_line_and_free_immortal_cost passed");
}


export function testUndyneDirectionShiftDefenseRedirect() {
  let { state, undyne, ally, enemy, enemy2 } = setupUndyneState();
  state = setUnit(state, undyne.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const attack = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    attack.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  assert(
    !resolved.state.pendingRoll &&
      !resolved.events.some((event) => event.type === "intimidateTriggered") &&
      resolved.state.units[enemy.id].position?.col === 4 &&
      resolved.state.units[enemy.id].position?.row === 5,
    "Direction Shift metadata should not create Vlad-style push choices"
  );

  let blockedState = setUnit(state, undyne.id, { position: { col: 0, row: 1 } });
  blockedState = setUnit(blockedState, enemy.id, { position: { col: 0, row: 0 } });
  blockedState = setUnit(blockedState, ally.id, { position: { col: 1, row: 0 } });
  blockedState = setUnit(blockedState, enemy2.id, { position: { col: 1, row: 1 } });
  blockedState = toBattleState(blockedState, "P2", enemy.id);
  blockedState = initKnowledgeForOwners(blockedState);
  const blockedAttack = applyAction(
    blockedState,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  const blockedResolved = resolveAllPendingRollsWithEvents(
    blockedAttack.state,
    makeRngSequence([0.01, 0.01, 0.99, 0.99])
  );
  assert(
    !blockedResolved.events.some((event) => event.type === "intimidateTriggered") &&
      blockedResolved.state.units[enemy.id].position?.col === 0 &&
      blockedResolved.state.units[enemy.id].position?.row === 0,
    "Direction Shift should no-op cleanly when attacker has no legal adjacent empty cells"
  );

  console.log("undyne_direction_shift_current_behavior passed");
}


export function testUndyneImmortalTriggerCapDrainBonusAndOnce() {
  let { state, undyne, enemy } = setupUndyneState();
  state = setUnit(state, undyne.id, {
    position: { col: 4, row: 4 },
    hp: 1,
    undyneImmortalUsed: false,
    undyneImmortalActive: false,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 }, hp: 12 });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const lethal = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeAttackWinRng(1)
  );
  const revived = resolveAllPendingRollsWithEvents(lethal.state, makeAttackWinRng(1));
  assert(
    revived.state.units[undyne.id].isAlive &&
      revived.state.units[undyne.id].hp === 3 &&
      revived.state.units[undyne.id].undyneImmortalUsed === true &&
      revived.state.units[undyne.id].undyneImmortalActive === true,
    "Immortal Undyne should trigger once on lethal death and restore 3 HP"
  );
  assert(
    revived.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === undyne.id &&
        event.abilityId === ABILITY_UNDYNE_UNDYING
    ),
    "Immortal trigger should emit ability activation event"
  );

  let capState = setUnit(revived.state, undyne.id, {
    position: { col: 4, row: 4 },
    hp: 3,
    turn: makeEmptyTurnEconomy(),
  });
  capState = setUnit(capState, enemy.id, {
    position: { col: 4, row: 5 },
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  capState = toBattleState(capState, "P2", enemy.id);
  const capAttack = applyAction(
    capState,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeAttackWinRng(1)
  );
  const capResolved = resolveAllPendingRollsWithEvents(
    capAttack.state,
    makeAttackWinRng(1)
  );
  assert(
    capResolved.state.units[undyne.id].hp === 2,
    "Incoming damage against Immortal Undyne should be capped to 1"
  );

  let bonusState = setUnit(capResolved.state, undyne.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    position: { col: 4, row: 4 },
  });
  bonusState = setUnit(bonusState, enemy.id, {
    hp: 12,
    position: { col: 4, row: 5 },
  });
  bonusState = toBattleState(bonusState, "P1", undyne.id);
  const bonusAttack = applyAction(
    bonusState,
    { type: "attack", attackerId: undyne.id, defenderId: enemy.id } as any,
    makeAttackWinRng(1)
  );
  const bonusResolved = resolveAllPendingRollsWithEvents(
    bonusAttack.state,
    makeAttackWinRng(1)
  );
  const bonusEvent = bonusResolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === undyne.id &&
      event.defenderId === enemy.id
  );
  assert(
    bonusEvent &&
      bonusEvent.type === "attackResolved" &&
      bonusEvent.damage === (bonusResolved.state.units[undyne.id].attack + 1),
    "Immortal close-range attacks should gain +1 damage"
  );

  let drainState = setUnit(bonusResolved.state, undyne.id, {
    turn: makeEmptyTurnEconomy(),
  });
  drainState = toBattleState(drainState, "P1", undyne.id);
  const drained = applyAction(drainState, { type: "endTurn" } as any, new SeededRNG(14));
  assert(
    drained.state.units[undyne.id].hp === drainState.units[undyne.id].hp - 1,
    "Immortal Undyne should take 1 self-damage at end of own turn"
  );

  let freeSpear = setUnit(drained.state, undyne.id, {
    position: { col: 4, row: 4 },
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: {
      ...drained.state.units[undyne.id].charges,
      [ABILITY_UNDYNE_ENERGY_SPEAR]: 0,
    },
  });
  freeSpear = toBattleState(freeSpear, "P1", undyne.id);
  const freeCast = applyAction(
    freeSpear,
    {
      type: "useAbility",
      unitId: undyne.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      payload: { target: { col: 0, row: 4 }, axis: "row" },
    } as any,
    makeAttackWinRng(1)
  );
  assert(
    freeCast.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.abilityId === ABILITY_UNDYNE_ENERGY_SPEAR
    ) &&
      freeCast.state.units[undyne.id].charges[ABILITY_UNDYNE_ENERGY_SPEAR] === 0,
    "Immortal Undyne should cast Energy Spear for 0 charges"
  );

  let secondDeathState = setUnit(revived.state, undyne.id, {
    hp: 1,
    position: { col: 4, row: 4 },
    undyneImmortalUsed: true,
    undyneImmortalActive: true,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondDeathState = setUnit(secondDeathState, enemy.id, {
    position: { col: 4, row: 5 },
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondDeathState = toBattleState(secondDeathState, "P2", enemy.id);
  const secondDeath = applyAction(
    secondDeathState,
    { type: "attack", attackerId: enemy.id, defenderId: undyne.id } as any,
    makeAttackWinRng(1)
  );
  const secondDeathResolved = resolveAllPendingRollsWithEvents(
    secondDeath.state,
    makeAttackWinRng(1)
  );
  assert(
    !secondDeathResolved.state.units[undyne.id].isAlive,
    "Immortal Undyne transformation should not trigger a second time"
  );

  console.log("undyne_immortal_trigger_cap_drain_bonus_and_once passed");
}
