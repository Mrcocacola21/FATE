import {
  ABILITY_GROZNY_INVADE_TIME,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  getHeroMeta,
  HERO_GROZNY_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupGroznyTyrantState,
  toBattleState,
} from "../helpers/testUtils";
export function testGroznyTyrantDoesNotTriggerIfOnlyBuffWouldMakeKillPossible() {
  const rng = new SeededRNG(740);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 5,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 3 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startNoTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    !startNoTrigger.state.pendingRoll,
    "tyrant should not trigger with base damage 2 vs hp 3"
  );
  assert(
    startNoTrigger.state.units[grozny.id].position?.col === 4 &&
      startNoTrigger.state.units[grozny.id].position?.row === 4,
    "grozny should not move when tyrant is ineligible"
  );
  assert(
    startNoTrigger.state.units[ally.id].isAlive,
    "ally should remain alive when tyrant is ineligible"
  );
  assert(
    startNoTrigger.state.units[grozny.id].attack === state.units[grozny.id].attack,
    "grozny base damage should stay the same when tyrant does not trigger"
  );

  console.log(
    "grozny_tyrant_does_not_trigger_if_only_buff_would_make_kill_possible passed"
  );
}


export function testGroznyTyrantTriggersAndKillsWhenBaseDamageIsEnough() {
  const rng = makeAttackWinRng(1);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  assert(
    startTrigger.state.pendingRoll,
    "tyrant should request an attack roll when eligible"
  );

  const resolved = resolveAllPendingRollsWithEvents(startTrigger.state, rng);
  const groznyAfter = resolved.state.units[grozny.id];
  const allyAfter = resolved.state.units[ally.id];
  const attackEvent = resolved.events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === grozny.id &&
      e.defenderId === ally.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;

  assert(attackEvent, "tyrant should resolve an attack");
  assert(allyAfter && !allyAfter.isAlive, "ally should die after tyrant attack");
  assert(
    groznyAfter.attack === state.units[grozny.id].attack + 1,
    "grozny should gain +1 base damage after tyrant kill"
  );
  const maxHp = getHeroMeta(HERO_GROZNY_ID)?.baseStats.hp ?? groznyAfter.hp;
  const expectedHp = Math.min(
    maxHp,
    state.units[grozny.id].hp + (attackEvent?.damage ?? 0)
  );
  assert(
    groznyAfter.hp === expectedHp,
    "grozny should heal by damage dealt on tyrant kill"
  );
  assert(
    groznyAfter.turn.moveUsed === false,
    "tyrant should not consume move action"
  );

  console.log("grozny_tyrant_triggers_and_kills_when_base_damage_is_enough passed");
}


export function testGroznyTyrantRequiresReachableAttackPositionWithinRoll6() {
  const rng = new SeededRNG(741);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
  });
  state = setUnit(state, commander.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, ally.id, { position: { col: 8, row: 8 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const startNoTrigger = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    !startNoTrigger.state.pendingRoll,
    "tyrant should not trigger if no reachable attack position exists"
  );
  assert(
    startNoTrigger.state.units[grozny.id].position?.col === 4 &&
      startNoTrigger.state.units[grozny.id].position?.row === 4,
    "grozny should not move when no attack position is reachable"
  );
  assert(
    startNoTrigger.state.units[ally.id].isAlive,
    "ally should remain alive when no attack position is reachable"
  );

  console.log(
    "grozny_tyrant_requires_reachable_attack_position_within_roll_6 passed"
  );
}


export function testGroznyTyrantChainGrantsExtraMovesFromSecondKill() {
  const rng = makeAttackWinRng(3);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_GROZNY_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;
  const ally1 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const ally2 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const ally3 = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 3,
  });
  state = setUnit(state, ally1.id, { position: { col: 6, row: 4 }, hp: 2 });
  state = setUnit(state, ally2.id, { position: { col: 7, row: 4 }, hp: 2 });
  state = setUnit(state, ally3.id, { position: { col: 8, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  assert(started.state.pendingRoll, "tyrant should start an attack chain");

  const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
  const groznyAfter = resolved.state.units[grozny.id];
  const ally1After = resolved.state.units[ally1.id];
  const ally2After = resolved.state.units[ally2.id];
  const ally3After = resolved.state.units[ally3.id];
  const attackEvents = resolved.events.filter(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === grozny.id &&
      [ally1.id, ally2.id, ally3.id].includes(e.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(attackEvents.length >= 3, "tyrant should attempt multiple kills in a chain");
  assert(ally1After && !ally1After.isAlive, "first ally should die in chain");
  assert(ally2After && !ally2After.isAlive, "second ally should die in chain");
  assert(ally3After && !ally3After.isAlive, "third ally should die in chain");
  assert(
    groznyAfter.attack === state.units[grozny.id].attack + 3,
    "grozny should gain +1 base damage per tyrant kill"
  );
  const maxHp = getHeroMeta(HERO_GROZNY_ID)?.baseStats.hp ?? groznyAfter.hp;
  const damageSum = attackEvents.reduce((sum, e) => sum + e.damage, 0);
  const expectedHp = Math.min(
    maxHp,
    state.units[grozny.id].hp + damageSum
  );
  assert(
    groznyAfter.hp === expectedHp,
    "grozny should heal by total damage dealt during tyrant chain"
  );
  assert(
    groznyAfter.turn.moveUsed === false,
    "tyrant chain should not consume move action"
  );

  console.log(
    "grozny_tyrant_chain_grants_extra_moves_from_second_kill passed"
  );
}


export function testGroznyInvadeTimeRequiresFullChargesAndConsumesMove() {
  const rng = new SeededRNG(812);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_GROZNY_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;

  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    charges: { ...grozny.charges, [ABILITY_GROZNY_INVADE_TIME]: 2 },
  });
  state = toBattleState(state, "P1", grozny.id);
  state = initKnowledgeForOwners(state);

  const attempt = applyAction(
    state,
    {
      type: "useAbility",
      unitId: grozny.id,
      abilityId: ABILITY_GROZNY_INVADE_TIME,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    rng
  );
  assert(
    attempt.state.units[grozny.id].position?.col === 4 &&
      attempt.state.units[grozny.id].position?.row === 4,
    "invade time should not move when charges are below 3"
  );
  assert(
    attempt.state.units[grozny.id].turn.moveUsed === false,
    "invade time should not consume move when blocked"
  );
  assert(
    attempt.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 2,
    "invade time should not spend charges when blocked"
  );
  assert(
    !attempt.events.some((e) => e.type === "unitMoved"),
    "invade time should not emit move when blocked"
  );

  const charged = setUnit(attempt.state, grozny.id, {
    charges: { ...attempt.state.units[grozny.id].charges, [ABILITY_GROZNY_INVADE_TIME]: 3 },
  });
  const used = applyAction(
    charged,
    {
      type: "useAbility",
      unitId: grozny.id,
      abilityId: ABILITY_GROZNY_INVADE_TIME,
      payload: { to: { col: 8, row: 8 } },
    } as any,
    rng
  );

  assert(
    used.state.units[grozny.id].position?.col === 8 &&
      used.state.units[grozny.id].position?.row === 8,
    "invade time should move to target cell when fully charged"
  );
  assert(
    used.state.units[grozny.id].turn.moveUsed === true,
    "invade time should consume move slot"
  );
  assert(
    used.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 0,
    "invade time should spend all 3 charges"
  );
  assert(
    used.events.some(
      (e) =>
        e.type === "unitMoved" &&
        e.unitId === grozny.id &&
        e.to.col === 8 &&
        e.to.row === 8
    ),
    "invade time should emit unitMoved event"
  );

  console.log("grozny_invade_time_requires_full_charges_and_consumes_move passed");
}
