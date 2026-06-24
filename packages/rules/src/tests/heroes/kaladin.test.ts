import {
  ABILITY_KALADIN_FIFTH,
  ABILITY_KALADIN_FIRST,
  ABILITY_TRICKSTER_AOE,
  applyAction,
  assert,
  GameEvent,
  GameState,
  getHeroMeta,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_KALADIN_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  setUnit,
  setupKaladinState,
  toBattleState,
} from "../helpers/testUtils";
export function testKaladinHpBonus() {
  const { state, kaladin } = setupKaladinState();
  const baseHp = getUnitDefinition("spearman").maxHp;
  const meta = getHeroMeta(HERO_KALADIN_ID);

  assert(kaladin.hp === baseHp + 1, "Kaladin HP should be base spearman HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Kaladin hero meta HP should be base spearman HP + 1"
  );

  console.log("kaladin_hp_bonus passed");
}


export function testKaladinFirstOathGatingHealingAndCosts() {
  let { state, kaladin } = setupKaladinState();
  state = setUnit(state, kaladin.id, {
    position: { col: 4, row: 4 },
    hp: 3,
    charges: { ...kaladin.charges, [ABILITY_KALADIN_FIRST]: 2 },
  });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[kaladin.id].hp === 3,
    "First Oath should be blocked below 3 charges"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIRST] === 2,
    "First Oath should not spend charges when blocked"
  );

  state = setUnit(state, kaladin.id, {
    hp: 3,
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[kaladin.id].charges, [ABILITY_KALADIN_FIRST]: 3 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[kaladin.id].hp === 5,
    "First Oath should heal exactly 2 HP"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIRST] === 0,
    "First Oath should spend exactly 3 charges"
  );
  assert(
    used.state.units[kaladin.id].turn.actionUsed,
    "First Oath should consume action slot"
  );
  const healEvent = used.events.find(
    (event) => event.type === "unitHealed" && event.unitId === kaladin.id
  ) as Extract<GameEvent, { type: "unitHealed" }> | undefined;
  assert(healEvent, "First Oath should emit heal event");
  assert(
    healEvent?.amount === 2 && healEvent.hpAfter === 5,
    "heal event should include healed amount and resulting HP"
  );

  state = setUnit(used.state, kaladin.id, {
    hp: 5,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
    charges: { ...used.state.units[kaladin.id].charges, [ABILITY_KALADIN_FIRST]: 3 },
  });
  const clamped = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIRST,
    } as any,
    makeRngSequence([])
  );
  assert(
    clamped.state.units[kaladin.id].hp === 6,
    "First Oath healing should clamp to max HP"
  );

  console.log("kaladin_first_oath_gating_healing_and_costs passed");
}


export function testKaladinSecondOathTricksterMoveAndAoeTrait() {
  let { state, kaladin } = setupKaladinState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("trickster"),
    "Kaladin should have Trickster move mode from Second Oath"
  );

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_TRICKSTER_AOE,
    } as any,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Kaladin should be able to use Trickster AoE trait"
  );

  console.log("kaladin_second_oath_trickster_move_and_aoe_trait passed");
}


export function testKaladinThirdOathSpearmanBonusOnlyOnSpearmanAttack() {
  let { state, kaladin } = setupKaladinState();
  const enemySpearmanMode = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemyTricksterMode = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemySpearmanMode.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemyTricksterMode.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, kaladin.id);
  assert(
    legalTargets.includes(enemyTricksterMode.id),
    "Kaladin should reach trickster-pattern targets from Second Oath"
  );

  const spearmanAttack = resolveAttack(state, {
    attackerId: kaladin.id,
    defenderId: enemySpearmanMode.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const spearmanEvent = spearmanAttack.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      event.defenderId === enemySpearmanMode.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(spearmanEvent, "spearman-mode attack should resolve");
  assert(
    spearmanEvent.damage === state.units[kaladin.id].attack + 1,
    "Third Oath should add +1 damage on Spearman-mode attacks"
  );

  const tricksterAttack = resolveAttack(state, {
    attackerId: kaladin.id,
    defenderId: enemyTricksterMode.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const tricksterEvent = tricksterAttack.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      event.defenderId === enemyTricksterMode.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(tricksterEvent, "trickster-mode attack should resolve");
  assert(
    tricksterEvent.damage === state.units[kaladin.id].attack,
    "Third Oath bonus should not apply to Trickster-mode attacks"
  );

  console.log("kaladin_third_oath_spearman_bonus_only_on_spearman_attack passed");
}


export function testKaladinFourthOathBerserkerTraitMovementMode() {
  let { state, kaladin } = setupKaladinState();
  state = setUnit(state, kaladin.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("berserker"),
    "Kaladin should have Berserker movement mode from Fourth Oath"
  );

  const berserkerRequest = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaladin.id, mode: "berserker" } as any,
    makeRngSequence([])
  );
  assert(
    berserkerRequest.state.pendingRoll?.kind === "moveBerserker",
    "Kaladin should reuse Berserker movement roll flow"
  );

  console.log("kaladin_fourth_oath_berserker_trait_movement_mode passed");
}


export function testKaladinFifthOathGatingDamageAndImmobilizeDuration() {
  const rng = makeRngSequence([
    0.99,
    0.99, // shared attacker roll
    0.01,
    0.01, // defender 1
    0.01,
    0.01, // defender 2
  ]);

  let { state, kaladin } = setupKaladinState();
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, kaladin.id, {
    position: { col: 0, row: 0 },
    charges: { ...kaladin.charges, [ABILITY_KALADIN_FIFTH]: 5 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", kaladin.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIFTH,
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Fifth Oath should be blocked below 6 charges");
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIFTH] === 5,
    "Fifth Oath should not spend charges when blocked"
  );

  state = setUnit(state, kaladin.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[kaladin.id].charges, [ABILITY_KALADIN_FIFTH]: 6 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaladin.id,
      abilityId: ABILITY_KALADIN_FIFTH,
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Fifth Oath should start shared-roll AoE resolution"
  );
  assert(
    used.state.units[kaladin.id].charges[ABILITY_KALADIN_FIFTH] === 0,
    "Fifth Oath should spend all 6 charges immediately"
  );
  assert(
    used.state.units[kaladin.id].turn.actionUsed,
    "Fifth Oath should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(used.state, rng);
  const events = [...used.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === kaladin.id &&
      [enemy1.id, enemy2.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(attackEvents.length === 2, "Fifth Oath should attack all units in 5x5 area");
  for (const event of attackEvents) {
    assert(event.damage === 2, "Fifth Oath should deal fixed 2 damage on failed defense");
  }

  assert(
    resolved.state.units[enemy1.id].kaladinMoveLockSources?.includes(kaladin.id),
    "failed Fifth Oath target should become immobilized"
  );
  assert(
    resolved.state.units[enemy2.id].kaladinMoveLockSources?.includes(kaladin.id),
    "every failed target should become immobilized"
  );

  let enemyTurnState = toBattleState(resolved.state, "P2", enemy1.id);
  enemyTurnState = setUnit(enemyTurnState, enemy1.id, {
    turn: makeEmptyTurnEconomy(),
  });
  const blockedMove = applyAction(
    enemyTurnState,
    { type: "requestMoveOptions", unitId: enemy1.id } as any,
    makeRngSequence([])
  );
  assert(
    blockedMove.events.length === 0 && !blockedMove.state.pendingMove,
    "immobilized target should not receive move options"
  );

  const kaladinStartState: GameState = {
    ...resolved.state,
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaladin.id],
    turnQueueIndex: 0,
    turnOrder: [kaladin.id],
    turnOrderIndex: 0,
    phase: "battle",
  };
  const started = applyAction(
    kaladinStartState,
    { type: "unitStartTurn", unitId: kaladin.id } as any,
    makeRngSequence([])
  );
  assert(
    (started.state.units[enemy1.id].kaladinMoveLockSources?.length ?? 0) === 0,
    "immobilize should clear at the start of Kaladin's next turn"
  );
  assert(
    (started.state.units[enemy2.id].kaladinMoveLockSources?.length ?? 0) === 0,
    "all Fifth Oath immobilize locks from Kaladin should clear together"
  );

  let restoredMoveState = toBattleState(started.state, "P2", enemy1.id);
  restoredMoveState = setUnit(restoredMoveState, enemy1.id, {
    turn: makeEmptyTurnEconomy(),
  });
  const restoredMove = applyAction(
    restoredMoveState,
    { type: "requestMoveOptions", unitId: enemy1.id } as any,
    makeRngSequence([])
  );
  const moveEvent = restoredMove.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(moveEvent, "movement should be restored after Kaladin starts next turn");

  console.log("kaladin_fifth_oath_gating_damage_and_immobilize_duration passed");
}
