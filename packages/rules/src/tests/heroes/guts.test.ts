import {
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  applyAction,
  assert,
  GameEvent,
  getHeroMeta,
  getUnitDefinition,
  HERO_GUTS_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  setUnit,
  setupGutsState,
  toBattleState,
} from "../helpers/testUtils";
export function testGutsHpBonus() {
  const { state, guts } = setupGutsState();
  const baseHp = getUnitDefinition("berserker").maxHp;
  const meta = getHeroMeta(HERO_GUTS_ID);

  assert(guts.hp === baseHp + 2, "Guts HP should be base berserker HP + 2");
  assert(
    meta?.baseStats.hp === baseHp + 2,
    "Guts hero meta HP should be base berserker HP + 2"
  );

  console.log("guts_hp_bonus passed");
}


export function testGutsKnightMulticlassMovementAndDoubleAutoHit() {
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("knight"),
    "Guts should have Knight movement mode available"
  );

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]); // attacker double, strong defender
  const initial = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "attack_attackerRoll",
    "Guts attack should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "double attack roll should auto-hit for Guts");
  assert(
    attackEvent.defenderRoll.sum > attackEvent.attackerRoll.sum,
    "test setup should have stronger defender roll to prove knight double override"
  );

  console.log("guts_knight_multiclass_movement_and_double_auto_hit passed");
}


export function testGutsArbaletRangedFixedDamage() {
  const rng = makeAttackWinRng(1);
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const opened = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_ARBALET,
    } as any,
    rng
  );
  assert(!opened.state.pendingRoll, "Arbalet without a target should not resolve");
  assert(
    !opened.state.units[guts.id].turn.actionUsed,
    "Arbalet without target confirmation should not spend action"
  );

  const beforeHp = state.units[enemy.id].hp;
  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_ARBALET,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "Arbalet should use ranged legal target flow and request attack roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(used.state, rng);
  const events = [...used.events, ...resolved.events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "Arbalet attack should resolve");
  assert(attackEvent.damage === 1, "Arbalet should always deal exactly 1 damage");
  assert(
    resolved.state.units[enemy.id].hp === beforeHp - 1,
    "Arbalet should reduce HP by exactly 1"
  );

  console.log("guts_arbalet_ranged_fixed_damage passed");
}


export function testGutsCannonGatingAndChargeSpend() {
  const rng = makeAttackWinRng(1);
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 0, row: 0 },
    charges: { ...guts.charges, [ABILITY_GUTS_CANNON]: 1 },
  });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 2 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_CANNON,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(!used.state.pendingRoll, "Cannon should be blocked below 2 charges");
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_CANNON] === 1,
    "Cannon should not spend charges when blocked"
  );

  state = setUnit(state, guts.id, {
    charges: { ...state.units[guts.id].charges, [ABILITY_GUTS_CANNON]: 2 },
  });
  const opened = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_CANNON,
    } as any,
    rng
  );
  assert(!opened.state.pendingRoll, "Cannon without a target should not resolve");
  assert(
    opened.state.units[guts.id].charges[ABILITY_GUTS_CANNON] === 2,
    "Cannon without target confirmation should not spend charges"
  );
  assert(
    !opened.state.units[guts.id].turn.actionUsed,
    "Cannon without target confirmation should not spend action"
  );
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_CANNON,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "Cannon should request attack roll when charges are enough"
  );
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_CANNON] === 0,
    "Cannon should spend exactly 2 charges on target resolution"
  );
  assert(
    used.state.units[guts.id].turn.actionUsed,
    "Cannon should spend action on target resolution"
  );

  console.log("guts_cannon_gating_and_charge_spend passed");
}


export function testGutsBerserkModeGatingAndActivation() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    charges: { ...guts.charges, [ABILITY_GUTS_BERSERK_MODE]: 2 },
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(!used.state.units[guts.id].gutsBerserkModeActive, "Berserk should be blocked below 3 charges");
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 2,
    "Berserk should not spend charges when blocked"
  );

  state = setUnit(state, guts.id, {
    charges: { ...state.units[guts.id].charges, [ABILITY_GUTS_BERSERK_MODE]: 3 },
  });
  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.units[guts.id].gutsBerserkModeActive === true,
    "Berserk should activate at 3+ charges"
  );
  assert(
    used.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 0,
    "Berserk should spend all 3 charges on activation"
  );
  assert(
    used.state.units[guts.id].turn.actionUsed === false &&
      used.state.units[guts.id].hasActedThisTurn === false,
    "Berserk activation should not consume the action slot"
  );

  console.log("guts_berserk_mode_gating_and_activation passed");
}


export function testGutsBerserkEndTurnSelfDamage() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    hp: 6,
    gutsBerserkModeActive: true,
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const ended = applyAction(state, { type: "endTurn" } as any, makeRngSequence([]));
  assert(
    ended.state.units[guts.id].hp === 5,
    "Berserk should deal 1 direct self-damage at end of Guts turn"
  );

  console.log("guts_berserk_end_turn_self_damage passed");
}


export function testGutsBerserkMeleeBonusAndRangedNoBonus() {
  let { state, guts } = setupGutsState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(state);

  const melee = resolveAttack(state, {
    attackerId: guts.id,
    defenderId: enemy.id,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const meleeEvent = melee.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(meleeEvent, "melee attack should resolve");
  assert(
    meleeEvent.damage === state.units[guts.id].attack + 1,
    "Berserk melee attacks should gain +1 damage"
  );

  const ranged = resolveAttack(state, {
    attackerId: guts.id,
    defenderId: enemy.id,
    ignoreRange: true,
    rangedAttack: true,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const rangedEvent = ranged.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(rangedEvent, "ranged attack should resolve");
  assert(
    rangedEvent.damage === state.units[guts.id].attack,
    "Berserk bonus should not apply to ranged attacks"
  );

  console.log("guts_berserk_melee_bonus_and_ranged_no_bonus passed");
}


export function testGutsBerserkMovementAndAoEAndIncomingCap() {
  const rng = makeRngSequence([
    0.99,
    0.99, // shared attacker roll for AoE
    0.01,
    0.01, // defender 1
    0.01,
    0.01, // defender 2
    0.01,
    0.01, // defender 3
  ]);

  let { state, guts } = setupGutsState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const enemy1 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemy2 = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const moveModes = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id } as any,
    makeRngSequence([])
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent &&
      modeEvent.type === "moveOptionsGenerated" &&
      (modeEvent.modes ?? []).includes("assassin"),
    "Berserk Guts should have Assassin movement mode available"
  );

  const assassinMove = applyAction(
    state,
    { type: "requestMoveOptions", unitId: guts.id, mode: "assassin" } as any,
    makeRngSequence([])
  );
  const assassinMoveEvent = assassinMove.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    assassinMoveEvent &&
      assassinMoveEvent.type === "moveOptionsGenerated" &&
      assassinMoveEvent.legalTo.some(
        (coord) => Math.max(Math.abs(coord.col - 4), Math.abs(coord.row - 4)) === 2
      ),
    "Assassin mode should provide distance-2 movement options"
  );

  const attacked = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy1.id } as any,
    rng
  );
  assert(
    attacked.state.pendingRoll?.kind === "gutsBerserkAttackChoice",
    "Berserk attack should prompt for single-target or adjacent AoE mode"
  );
  assert(
    attacked.state.units[guts.id].turn.actionUsed === false &&
      attacked.state.units[guts.id].turn.attackUsed === false,
    "opening Berserk attack mode choice should not consume action or attack"
  );

  const canceled = applyAction(
    attacked.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: attacked.state.pendingRoll!.id,
      player: "P1",
      choice: "skip",
    } as any,
    makeRngSequence([])
  );
  assert(!canceled.state.pendingRoll, "canceling Berserk attack choice should clear pending");
  assert(
    canceled.state.units[guts.id].turn.actionUsed === false &&
      canceled.state.units[guts.id].turn.attackUsed === false,
    "canceling Berserk attack choice should not consume action or attack"
  );

  const restarted = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy1.id } as any,
    rng
  );
  assert(
    restarted.state.pendingRoll?.kind === "gutsBerserkAttackChoice",
    "Berserk attack should prompt again after cancel"
  );
  const choseAoe = applyAction(
    restarted.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: restarted.state.pendingRoll!.id,
      player: "P1",
      choice: {
        type: "gutsBerserkAttackMode",
        mode: "aoe",
        targetId: enemy1.id,
      },
    } as any,
    rng
  );
  assert(
    choseAoe.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "choosing Berserk AoE should request the shared AoE attacker roll"
  );
  assert(
    choseAoe.state.units[guts.id].turn.actionUsed === true &&
      choseAoe.state.units[guts.id].turn.attackUsed === true,
    "Berserk AoE choice should consume action and attack only after mode commit"
  );

  const resolved = resolveAllPendingRollsWithEvents(choseAoe.state, rng);
  const events = [...restarted.events, ...choseAoe.events, ...resolved.events];
  const attackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === guts.id &&
      [ally.id, enemy1.id, enemy2.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    attackEvents.length === 3,
    "Berserk AoE should hit all adjacent allies and enemies"
  );
  const attackedIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    attackedIds,
    [ally.id, enemy1.id, enemy2.id].sort(),
    "Berserk AoE should include ally and enemy targets"
  );

  const attackerRollSignatures = new Set(
    attackEvents.map((event) => event.attackerRoll.dice.join(","))
  );
  assert(
    attackerRollSignatures.size === 1,
    "Berserk AoE should use one shared attacker roll for all targets"
  );

  const incoming = resolveAttack(state, {
    attackerId: enemy1.id,
    defenderId: guts.id,
    damageBonus: 5,
    rolls: {
      attackerDice: [6, 5],
      defenderDice: [1, 1],
    },
  });
  const incomingEvent = incoming.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemy1.id &&
      event.defenderId === guts.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(incomingEvent, "incoming attack should resolve");
  assert(
    incomingEvent.damage === 1,
    "Incoming damage against berserk Guts should be capped to 1"
  );

  console.log("guts_berserk_movement_aoe_and_incoming_cap passed");
}


export function testGutsBerserkAttackChoiceSingleTargetSpearmanRange() {
  const rng = makeRngSequence([
    0.99,
    0.99, // attacker roll
    0.01,
    0.01, // defender roll
  ]);

  let { state, guts } = setupGutsState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const beforeAllyHp = state.units[ally.id].hp;
  const beforeEnemyHp = state.units[enemy.id].hp;
  const attacked = applyAction(
    state,
    { type: "attack", attackerId: guts.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    attacked.state.pendingRoll?.kind === "gutsBerserkAttackChoice",
    "Berserk attack at Spearman reach should prompt for attack mode"
  );

  const context = attacked.state.pendingRoll!.context as {
    singleTargetOptions?: string[];
    aoeTargetIds?: string[];
  };
  assert(
    context.singleTargetOptions?.includes(enemy.id),
    "single-target option should include Spearman-reach target"
  );
  assert(
    !context.aoeTargetIds?.includes(enemy.id),
    "AoE option should not treat a reach-2 target as adjacent"
  );

  const choseSingle = applyAction(
    attacked.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: attacked.state.pendingRoll!.id,
      player: "P1",
      choice: {
        type: "gutsBerserkAttackMode",
        mode: "single",
        targetId: enemy.id,
      },
    } as any,
    rng
  );
  assert(
    choseSingle.state.pendingRoll?.kind === "attack_attackerRoll",
    "single-target Berserk attack should use normal attack roll flow"
  );
  assert(
    choseSingle.state.units[guts.id].turn.actionUsed === false &&
      choseSingle.state.units[guts.id].turn.attackUsed === false,
    "single-target Berserk attack should not spend slots until attack resolves"
  );

  const resolved = resolveAllPendingRollsWithEvents(choseSingle.state, rng);
  const attackEvents = [...choseSingle.events, ...resolved.events].filter(
    (event) => event.type === "attackResolved" && event.attackerId === guts.id
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(attackEvents.length === 1, "single-target Berserk attack should hit one unit");
  assert(
    attackEvents[0].defenderId === enemy.id,
    "single-target Berserk attack should hit the chosen target"
  );
  assert(
    resolved.state.units[ally.id].hp === beforeAllyHp,
    "single-target Berserk attack should not damage adjacent allies"
  );
  assert(
    resolved.state.units[enemy.id].hp < beforeEnemyHp,
    "single-target Berserk attack should damage the chosen enemy"
  );
  assert(
    resolved.state.units[guts.id].turn.actionUsed === true &&
      resolved.state.units[guts.id].turn.attackUsed === true,
    "single-target Berserk attack should spend action and attack after resolution"
  );

  console.log("guts_berserk_attack_choice_single_target_spearman_range passed");
}


export function testGutsExitBerserkOnceAndNoReentry() {
  let { state, guts } = setupGutsState();
  state = setUnit(state, guts.id, {
    position: { col: 4, row: 4 },
    gutsBerserkModeActive: true,
    gutsBerserkExitUsed: false,
    charges: { ...guts.charges, [ABILITY_GUTS_BERSERK_MODE]: 3 },
  });
  state = toBattleState(state, "P1", guts.id);
  state = initKnowledgeForOwners(state);

  const exited = applyAction(
    state,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_EXIT_BERSERK,
    } as any,
    makeRngSequence([])
  );
  assert(
    exited.state.units[guts.id].gutsBerserkModeActive === false,
    "Exit Berserk should disable berserk mode"
  );
  assert(
    exited.state.units[guts.id].gutsBerserkExitUsed === true,
    "Exit Berserk should mark one-time exit as used"
  );
  assert(
    exited.state.units[guts.id].turn.actionUsed === false &&
      exited.state.units[guts.id].hasActedThisTurn === false,
    "Exit Berserk should not consume the action slot"
  );

  let nextState = setUnit(exited.state, guts.id, {
    turn: makeEmptyTurnEconomy(),
    charges: {
      ...exited.state.units[guts.id].charges,
      [ABILITY_GUTS_BERSERK_MODE]: 3,
    },
  });
  nextState = { ...nextState, activeUnitId: guts.id, currentPlayer: "P1" };

  const reenter = applyAction(
    nextState,
    {
      type: "useAbility",
      unitId: guts.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
    } as any,
    makeRngSequence([])
  );
  assert(
    reenter.state.units[guts.id].gutsBerserkModeActive === false,
    "Guts should not be able to re-enter berserk after exiting once"
  );
  assert(
    reenter.state.units[guts.id].charges[ABILITY_GUTS_BERSERK_MODE] === 3,
    "Blocked re-entry should not spend berserk charges"
  );

  console.log("guts_exit_berserk_once_and_no_reentry passed");
}
