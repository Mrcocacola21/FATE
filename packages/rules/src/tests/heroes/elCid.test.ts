import {
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  applyAction,
  assert,
  getHeroMeta,
  HERO_EL_CID_COMPEADOR_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupElCidState,
  toBattleState,
} from "../helpers/testUtils";
export function testElCidLongLiverAdds2Hp() {
  const { elCid, enemy } = setupElCidState();
  assert(
    elCid.hp === enemy.hp + 2,
    "El Cid should start with +2 HP compared to base knight"
  );
  const meta = getHeroMeta(HERO_EL_CID_COMPEADOR_ID);
  assert(meta, "El Cid meta should exist");
  assert(meta?.baseStats.hp === elCid.hp, "El Cid meta HP should match unit HP");

  console.log("elcid_longliver_adds_2hp passed");
}


export function testElCidWarriorDoubleIsAutoHitNoDefenderRoll() {
  const rng = makeRngSequence([0.99, 0.99]);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const startHp = state.units[enemy.id].hp;
  const initial = applyAction(
    state,
    { type: "attack", attackerId: elCid.id, defenderId: enemy.id } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "attack_attackerRoll",
    "auto-hit test should request attacker roll first"
  );

  const resolved = resolvePendingRollOnce(initial.state, rng);
  const events = [...initial.events, ...resolved.events];
  const defenderRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_defenderRoll"
  );
  assert(
    defenderRequests.length === 0,
    "auto-hit should not request defender roll"
  );

  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === elCid.id &&
      e.defenderId === enemy.id
  );
  assert(attackEvent && attackEvent.type === "attackResolved", "attack should resolve");
  assert(attackEvent.hit, "auto-hit should resolve as hit");
  assert(
    resolved.state.units[enemy.id].hp === startHp - elCid.attack,
    "enemy HP should drop by attacker damage"
  );
  assert(!resolved.state.pendingRoll, "auto-hit should finish without pending roll");

  console.log("elcid_warrior_double_is_auto_hit_no_defender_roll passed");
}


export function testElCidTisonaIsRayOnlyRightDirection() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.2, 0.2]);
  let { state, elCid } = setupElCidState();
  const allyRight = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemyRight = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyLeft = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "trickster"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, allyRight.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, enemyRight.id, { position: { col: 7, row: 4 } });
  state = setUnit(state, enemyLeft.id, { position: { col: 1, row: 4 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const leftHpBefore = state.units[enemyLeft.id].hp;
  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 8, row: 4 } },
    } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "elCidTisona_attackerRoll",
    "tisona should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const expectedTargets = [allyRight.id, enemyRight.id].sort();
  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_TISONA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "tisona should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert.deepStrictEqual(
      [...aoeEvent.affectedUnitIds].sort(),
      expectedTargets,
      "tisona should affect only the selected ray (right)"
    );
  }

  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidTisona_defenderRoll"
  );
  assert(defenderRolls.length === expectedTargets.length, "ray should target right units only");

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId).sort();
  assert.deepStrictEqual(
    attackTargets,
    expectedTargets,
    "tisona ray should only attack right-side targets"
  );
  assert(
    resolved.state.units[enemyLeft.id].hp === leftHpBefore,
    "left-side target should not be damaged by right ray"
  );

  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "tisona should reuse the same attacker roll for all targets");

  console.log("el_cid_tisona_is_ray_only_right_direction passed");
}


export function testElCidTisonaIsRayOnlyUpDirection() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.2, 0.2]);
  let { state, elCid } = setupElCidState();
  const allyUp = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemyUp = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const enemyDown = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, allyUp.id, { position: { col: 4, row: 2 } });
  state = setUnit(state, enemyUp.id, { position: { col: 4, row: 1 } });
  state = setUnit(state, enemyDown.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const downHpBefore = state.units[enemyDown.id].hp;
  const initial = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 4, row: 0 } },
    } as any,
    rng
  );
  assert(
    initial.state.pendingRoll?.kind === "elCidTisona_attackerRoll",
    "tisona should request attacker roll"
  );

  const resolved = resolveAllPendingRollsWithEvents(initial.state, rng);
  const events = [...initial.events, ...resolved.events];

  const expectedTargets = [allyUp.id, enemyUp.id].sort();
  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_TISONA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "tisona should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert.deepStrictEqual(
      [...aoeEvent.affectedUnitIds].sort(),
      expectedTargets,
      "tisona should affect only the selected ray (up)"
    );
  }

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId).sort();
  assert.deepStrictEqual(
    attackTargets,
    expectedTargets,
    "tisona ray should only attack upward targets"
  );
  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "tisona should reuse the same attacker roll for all targets");
  assert(
    resolved.state.units[enemyDown.id].hp === downHpBefore,
    "downward target should not be damaged by up ray"
  );

  console.log("el_cid_tisona_is_ray_only_up_direction passed");
}


export function testElCidKoladaImpulseTriggersAtStartTurnSpends3SharedAttackerRollHitsAllies() {
  const rng = makeRngSequence([0.2, 0.55, 0.01, 0.01, 0.2, 0.4]);
  let { state, elCid } = setupElCidState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const far = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_KOLADA]: 2,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, far.id, { position: { col: 8, row: 8 } });
  state = initKnowledgeForOwners(state);
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [elCid.id, enemy.id],
    turnOrderIndex: 0,
  };

  const start = applyAction(
    state,
    { type: "unitStartTurn", unitId: elCid.id } as any,
    rng
  );
  assert(
    start.state.pendingRoll?.kind === "elCidKolada_attackerRoll",
    "kolada should trigger at start turn when charges reach 3"
  );
  assert(
    start.state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_KOLADA] === 0,
    "kolada should spend 3 charges"
  );
  const chargeEvent = start.events.find(
    (e) => e.type === "chargesUpdated" && e.unitId === elCid.id
  );
  if (chargeEvent && chargeEvent.type === "chargesUpdated") {
    assert(
      chargeEvent.deltas?.[ABILITY_EL_SID_COMPEADOR_KOLADA] === 1,
      "kolada charges should increment before triggering"
    );
  }
  const abilityIndex = start.events.findIndex(
    (e) => e.type === "abilityUsed" && e.abilityId === ABILITY_EL_SID_COMPEADOR_KOLADA
  );
  const rollIndex = start.events.findIndex(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_attackerRoll"
  );
  assert(
    abilityIndex > -1 && rollIndex > -1 && abilityIndex < rollIndex,
    "kolada abilityUsed should be logged before attacker roll request"
  );

  const resolved = resolveAllPendingRollsWithEvents(start.state, rng);
  const events = [...start.events, ...resolved.events];

  const attackerRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_attackerRoll"
  );
  const defenderRolls = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "elCidKolada_defenderRoll"
  );
  assert(attackerRolls.length === 1, "kolada should request attacker roll once");
  assert(defenderRolls.length === 2, "kolada should request defender roll per target");

  const attackEvents = events.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  const attackTargets = attackEvents.map((e) => e.defenderId);
  assert(
    attackTargets.includes(ally.id),
    "kolada should attack allies in radius"
  );
  assert(
    attackTargets.includes(enemy.id),
    "kolada should attack enemies in radius"
  );
  assert(
    !attackTargets.includes(far.id),
    "kolada should not attack units outside radius"
  );

  const sharedDice = JSON.stringify(attackEvents[0]?.attackerRoll?.dice ?? []);
  const allShared = attackEvents.every(
    (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
  );
  assert(allShared, "kolada should reuse the same attacker roll for all targets");

  const aoeEvent = events.find(
    (e) => e.type === "aoeResolved" && e.abilityId === ABILITY_EL_SID_COMPEADOR_KOLADA
  );
  assert(aoeEvent && aoeEvent.type === "aoeResolved", "kolada should emit aoeResolved");
  if (aoeEvent && aoeEvent.type === "aoeResolved") {
    assert(
      aoeEvent.affectedUnitIds.includes(ally.id) &&
        aoeEvent.affectedUnitIds.includes(enemy.id),
      "kolada aoeResolved should include allied and enemy targets"
    );
  }

  console.log("elcid_kolada_impulse_triggers_at_start_turn_spends_3_shared_attacker_roll_hits_allies passed");
}


export function testElCidDemonDuelistChainHitsUntilMissThenChoicePayHpOrStop() {
  const duelRng = makeRngSequence([0.55, 0.4, 0.01, 0.01, 0.01, 0.2, 0.75, 0.55]);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 }, hp: 6 });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy.id },
    } as any,
    duelRng
  );
  const events: any[] = [...res.events];
  const abilityIndex = events.findIndex(
    (e) =>
      e.type === "abilityUsed" &&
      e.abilityId === ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
  );
  const rollIndex = events.findIndex(
    (e) => e.type === "rollRequested" && e.kind === "attack_attackerRoll"
  );
  assert(
    abilityIndex > -1 && rollIndex > -1 && abilityIndex < rollIndex,
    "demon duelist abilityUsed should be logged before attacker roll request"
  );
  assert(
    res.state.pendingRoll?.kind === "attack_attackerRoll",
    "demon duelist should start with attacker roll"
  );

  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  assert(
    res.state.pendingRoll?.kind === "attack_attackerRoll",
    "demon duelist should continue after hit"
  );

  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  res = resolvePendingRollOnce(res.state, duelRng);
  events.push(...res.events);
  assert(
    res.state.pendingRoll?.kind === "elCidDuelistChoice",
    "demon duelist should prompt choice after miss"
  );

  const attackerRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_attackerRoll"
  );
  const defenderRequests = events.filter(
    (e) => e.type === "rollRequested" && e.kind === "attack_defenderRoll"
  );
  assert(attackerRequests.length === 2, "duelist should request attacker roll per attack");
  assert(defenderRequests.length === 2, "duelist should request defender roll per attack");

  const pendingStop = res.state.pendingRoll!;
  const stopped = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingStop.id,
      choice: "elCidDuelistStop",
      player: pendingStop.player,
    } as any,
    duelRng
  );
  assert(!stopped.state.pendingRoll, "duelist should end when player stops");

  const continueRng = makeRngSequence([0.55, 0.4, 0.01, 0.01, 0.01, 0.2, 0.75, 0.55]);
  let state2 = setupElCidState().state;
  const elCid2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  state2 = setUnit(state2, elCid2.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid2.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 5 }, hp: 6 });
  state2 = toBattleState(state2, "P1", elCid2.id);
  state2 = initKnowledgeForOwners(state2);

  let res2 = applyAction(
    state2,
    {
      type: "useAbility",
      unitId: elCid2.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy2.id },
    } as any,
    continueRng
  );
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  res2 = resolvePendingRollOnce(res2.state, continueRng);
  assert(
    res2.state.pendingRoll?.kind === "elCidDuelistChoice",
    "duelist should prompt choice on miss"
  );

  const pendingContinue = res2.state.pendingRoll!;
  const hpBefore = res2.state.units[elCid2.id].hp;
  const continued = applyAction(
    res2.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingContinue.id,
      choice: "elCidDuelistContinue",
      player: pendingContinue.player,
    } as any,
    continueRng
  );
  assert(
    continued.state.units[elCid2.id].hp === hpBefore - 1,
    "continuing duel should cost 1 HP"
  );
  assert(
    continued.state.pendingRoll?.kind === "attack_attackerRoll",
    "continuing duel should request next attack"
  );

  const cantPayRng = makeRngSequence([0.55, 0.4]);
  let state3 = setupElCidState().state;
  const elCid3 = Object.values(state3.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;
  const enemy3 = Object.values(state3.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  )!;
  state3 = setUnit(state3, elCid3.id, {
    position: { col: 4, row: 4 },
    hp: 1,
    charges: {
      ...elCid3.charges,
      [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: 5,
    },
  });
  state3 = setUnit(state3, enemy3.id, { position: { col: 4, row: 5 }, hp: 6 });
  state3 = toBattleState(state3, "P1", elCid3.id);
  state3 = initKnowledgeForOwners(state3);

  state3 = {
    ...state3,
    pendingRoll: {
      id: "roll-1",
      kind: "elCidDuelistChoice",
      player: "P1",
      context: { attackerId: elCid3.id, targetId: enemy3.id },
    },
    rollCounter: 1,
  };

  const cantPay = applyAction(
    state3,
    {
      type: "resolvePendingRoll",
      pendingRollId: "roll-1",
      choice: "elCidDuelistContinue",
      player: "P1",
    } as any,
    cantPayRng
  );
  assert(
    cantPay.state.units[elCid3.id].hp === 1,
    "duelist should not pay HP when at 1"
  );
  assert(
    !cantPay.state.pendingRoll,
    "duelist should end when unable to pay"
  );

  console.log("elcid_demon_duelist_chain_hits_until_miss_then_choice_pay_hp_or_stop passed");
}


export function testElCidDemonDuelistRequires5AndSpends5() {
  const rng = new SeededRNG(2026);
  let { state, elCid, enemy } = setupElCidState();

  state = setUnit(state, elCid.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const chargesBefore =
    state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ?? 0;
  const attempt = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy.id },
    } as any,
    rng
  );
  assert(attempt.events.length === 0, "duelist should not start without charges");
  assert(!attempt.state.pendingRoll, "duelist should not request a roll");
  assert(
    attempt.state.units[elCid.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ===
      chargesBefore,
    "duelist charges should remain unchanged"
  );
  assert(
    attempt.state.units[enemy.id].hp === state.units[enemy.id].hp,
    "enemy HP should remain unchanged"
  );

  const rng2 = new SeededRNG(2027);
  let { state: state2, elCid: elCid2, enemy: enemy2 } = setupElCidState();
  state2 = setUnit(state2, elCid2.id, { position: { col: 4, row: 4 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 7 } });
  state2 = initKnowledgeForOwners(state2);
  state2 = {
    ...state2,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid2.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [elCid2.id, enemy2.id],
    turnOrderIndex: 0,
  };

  for (let turn = 1; turn <= 5; turn += 1) {
    const start = applyAction(
      state2,
      { type: "unitStartTurn", unitId: elCid2.id } as any,
      rng2
    );
    const resolved = resolveAllPendingRolls(start.state, rng2);
    state2 = resolved.state;
    if (turn < 5) {
      state2 = applyAction(state2, { type: "endTurn" } as any, rng2).state;
      const enemyStart = applyAction(
        state2,
        { type: "unitStartTurn", unitId: enemy2.id } as any,
        rng2
      );
      state2 = resolveAllPendingRolls(enemyStart.state, rng2).state;
      state2 = applyAction(state2, { type: "endTurn" } as any, rng2).state;
    }
  }

  assert(
    state2.units[elCid2.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] === 5,
    "duelist should reach 5 charges after five own turns"
  );

  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 5 } });
  const started = applyAction(
    state2,
    {
      type: "useAbility",
      unitId: elCid2.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
      payload: { targetId: enemy2.id },
    } as any,
    rng2
  );
  assert(
    started.state.pendingRoll?.kind === "attack_attackerRoll",
    "duelist should start when charged"
  );
  assert(
    (started.state.units[elCid2.id].charges?.[ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST] ?? 0) === 0,
    "duelist should spend 5 charges on activation"
  );
  assert(
    started.events.some(
      (e) =>
        e.type === "abilityUsed" &&
        e.abilityId === ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
    ),
    "duelist should emit abilityUsed when charged"
  );

  console.log("el_cid_demon_duelist_requires_5_and_spends_5 passed");
}


export function testElCidTisonaAndKoladaHitAllies() {
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.01, 0.01]);
  let { state, elCid } = setupElCidState();
  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state = setUnit(state, elCid.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid.charges,
      [ABILITY_EL_SID_COMPEADOR_TISONA]: 2,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 7, row: 4 } });
  state = toBattleState(state, "P1", elCid.id);
  state = initKnowledgeForOwners(state);

  const allyHpBefore = state.units[ally.id].hp;
  const tisonaStart = applyAction(
    state,
    {
      type: "useAbility",
      unitId: elCid.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_TISONA,
      payload: { target: { col: 8, row: 4 } },
    } as any,
    rng
  );
  const tisonaResolved = resolveAllPendingRollsWithEvents(tisonaStart.state, rng);
  const tisonaEvents = [...tisonaStart.events, ...tisonaResolved.events];
  const allyAttack = tisonaEvents.find(
    (e) => e.type === "attackResolved" && e.defenderId === ally.id
  );
  assert(allyAttack && allyAttack.type === "attackResolved", "tisona should attack ally");
  assert(allyAttack.hit, "tisona should be able to hit ally");
  assert(
    tisonaResolved.state.units[ally.id].hp === allyHpBefore - elCid.attack,
    "ally HP should decrease from tisona hit"
  );

  const tisonaAttacks = tisonaEvents.filter(
    (e) => e.type === "attackResolved" && e.attackerId === elCid.id
  ) as any[];
  assert(
    tisonaAttacks.some((e) => e.defenderId === enemy.id),
    "tisona should attack enemy on the line"
  );
  const sharedDice = JSON.stringify(tisonaAttacks[0]?.attackerRoll?.dice ?? []);
  assert(
    tisonaAttacks.every(
      (e) => JSON.stringify(e.attackerRoll?.dice ?? []) === sharedDice
    ),
    "tisona should use a single shared attacker roll"
  );

  const rng2 = makeRngSequence([0.99, 0.8, 0.01, 0.01, 0.01, 0.01]);
  let { state: state2, elCid: elCid2 } = setupElCidState();
  const ally2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;

  state2 = setUnit(state2, elCid2.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...elCid2.charges,
      [ABILITY_EL_SID_COMPEADOR_KOLADA]: 2,
    },
  });
  state2 = setUnit(state2, ally2.id, { position: { col: 4, row: 5 } });
  state2 = setUnit(state2, enemy2.id, { position: { col: 5, row: 4 } });
  state2 = initKnowledgeForOwners(state2);
  state2 = {
    ...state2,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [elCid2.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [elCid2.id, enemy2.id],
    turnOrderIndex: 0,
  };

  const ally2HpBefore = state2.units[ally2.id].hp;
  const koladaStart = applyAction(
    state2,
    { type: "unitStartTurn", unitId: elCid2.id } as any,
    rng2
  );
  const koladaResolved = resolveAllPendingRollsWithEvents(koladaStart.state, rng2);
  const koladaEvents = [...koladaStart.events, ...koladaResolved.events];
  const koladaAllyAttack = koladaEvents.find(
    (e) => e.type === "attackResolved" && e.defenderId === ally2.id
  );
  assert(
    koladaAllyAttack && koladaAllyAttack.type === "attackResolved",
    "kolada should attack ally"
  );
  assert(koladaAllyAttack.hit, "kolada should be able to hit ally");
  assert(
    koladaResolved.state.units[ally2.id].hp === ally2HpBefore - elCid2.attack,
    "ally HP should decrease from kolada hit"
  );
  assert(
    koladaEvents.some(
      (e) => e.type === "attackResolved" && e.defenderId === enemy2.id
    ),
    "kolada should attack enemy in radius"
  );

  console.log("el_cid_tisona_and_kolada_hit_allies passed");
}
