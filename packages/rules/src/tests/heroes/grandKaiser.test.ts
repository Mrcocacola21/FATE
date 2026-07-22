import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  GameState,
  HERO_GRAND_KAISER_ID,
  HERO_VLAD_TEPES_ID,
  initKnowledgeForOwners,
  makePlayerView,
  makeRngSequence,
  resolveAllPendingRolls,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupKaiserState,
  toBattleState,
} from "../helpers/testUtils";
import {
  ABILITY_DON_KIHOTE_MADNESS,
  HERO_DON_KIHOTE_ID,
} from "../..";
import { applyNewBatchPostAction } from "../../actions/heroes/newBatchPost";
export function testKaiserBunkerVisibleAndDamageClampedTo1() {
  const rng = makeRngSequence([0.8]);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "enterStealth", unitId: kaiser.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterBunker",
    "enterBunker roll should be pending"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const afterBunker = res.state.units[kaiser.id];
  assert(afterBunker.bunker?.active === true, "bunker should be active");
  assert(afterBunker.isStealthed === false, "bunker should not stealth");

  const attack = resolveAttack(res.state, {
    attackerId: enemy.id,
    defenderId: kaiser.id,
    ignoreRange: true,
    ignoreStealth: true,
    rolls: { attackerDice: [6, 6], defenderDice: [1, 2] },
  });
  const finalKaiser = attack.nextState.units[kaiser.id];
  assert(
    finalKaiser.hp === afterBunker.hp - 1,
    "bunker damage should be clamped to 1"
  );

  console.log("kaiser_bunker_visible_and_damage_clamped_to_1 passed");
}


export function testKaiserBunkerExpiresOnFourthOwnTurn() {
  const rng = new SeededRNG(12);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 1st turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 2nd turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  res = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  assert(res.state.units[kaiser.id].bunker?.active === true, "bunker stays on 3rd turn");
  if (res.state.pendingRoll) {
    res = resolveAllPendingRolls(res.state, rng);
  }

  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;

  state = applyAction(state, { type: "endTurn" } as any, rng).state;
  const exitRes = applyAction(state, { type: "unitStartTurn", unitId: kaiser.id } as any, rng);
  const exitEvent = exitRes.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "bunker should exit on 4th own turn start");
  if (exitEvent && exitEvent.type === "bunkerExited") {
    assert(exitEvent.reason === "timerExpired", "bunker exit reason should be timerExpired");
  }
  assert(
    exitRes.state.units[kaiser.id].bunker?.active !== true,
    "bunker should be off on 4th own turn start"
  );

  console.log("kaiser_bunker_exits_on_start_of_4th_own_turn passed");
}


export function testKaiserBunkerExitOnAttackButNotDoraOrImpulse() {
  const rng = new SeededRNG(902);

  // Base attack exits bunker.
  let setup = setupKaiserState();
  let state = setup.state;
  const kaiser = setup.kaiser;
  const enemy = setup.enemy;
  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", kaiser.id);

  const attackRes = applyAction(
    state,
    { type: "attack", attackerId: kaiser.id, defenderId: enemy.id } as any,
    rng
  );
  const exitEvent = attackRes.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "bunker should exit on base attack");
  assert(
    attackRes.state.units[kaiser.id].bunker?.active !== true,
    "bunker should be off after base attack"
  );

  // Dora does not exit bunker.
  setup = setupKaiserState();
  state = setup.state;
  const kaiser2 = setup.kaiser;
  state = setUnit(state, kaiser2.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser2.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, setup.enemy.id, { position: { col: 0, row: 0 } });
  state = toBattleState(state, "P1", kaiser2.id);

  const doraRes = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser2.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(
    doraRes.state.units[kaiser2.id].bunker?.active === true,
    "bunker should stay on for Dora"
  );

  // Carpet Strike impulse does not exit bunker.
  setup = setupKaiserState();
  state = setup.state;
  const kaiser3 = setup.kaiser;
  state = setUnit(state, kaiser3.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser3.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser3.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser3.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser3.id } as any,
    rng
  );
  assert(
    turnRes.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should trigger at turn start"
  );
  assert(
    turnRes.state.units[kaiser3.id].bunker?.active === true,
    "bunker should remain during impulse"
  );

  console.log("kaiser_bunker_exits_on_base_attack_but_not_on_dora_or_impulse passed");
}


export function testCarpetStrikeRollsCenterThenAttackThenDefenders() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should request center roll first"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeAttack",
    "carpet strike should request attack roll after center"
  );
  assert(
    res.events.some((e) => e.type === "carpetStrikeCenter"),
    "carpet strike center event should be emitted"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "carpetStrike_defenderRoll" ||
      res.state.pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice",
    "carpet strike should request defender roll after attack roll"
  );
  assert(
    res.events.some((e) => e.type === "carpetStrikeAttackRolled"),
    "carpet strike attack event should be emitted"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const finished = resolveAllPendingRolls(res.state, rng);
  assert(
    !finished.state.pendingRoll,
    "carpet strike should finish after defenders"
  );

  console.log("carpet_strike_rolls_center_then_attack_then_defenders passed");
}


export function testCarpetStrikeUsesSingleSharedAttackRollForAllTargets() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy1.id, enemy2.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy1.id, enemy2.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "carpetStrike_defenderRoll",
    "carpet strike should start defender rolls"
  );
  const firstCtx = res.state.pendingRoll?.context as { attackerDice?: number[] };
  const firstDice = Array.isArray(firstCtx.attackerDice) ? firstCtx.attackerDice : [];

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll,
    "carpet strike should keep defender rolls for remaining targets"
  );
  const secondCtx = res.state.pendingRoll?.context as { attackerDice?: number[] };
  const secondDice = Array.isArray(secondCtx.attackerDice) ? secondCtx.attackerDice : [];
  assert.deepStrictEqual(
    firstDice,
    secondDice,
    "carpet strike should reuse the same attacker roll for all targets"
  );

  console.log("carpet_strike_uses_single_shared_attack_roll_for_all_targets passed");
}


export function testCarpetStrikeDamageIsFixed1IgnoresBuffs() {
  const rng = makeRngSequence([0.5, 0.5, 0.99, 0.99, 0.01, 0.2]);
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", {
      archer: HERO_GRAND_KAISER_ID,
      spearman: HERO_VLAD_TEPES_ID,
    })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 0, row: 0 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, vlad.id, { position: { col: 0, row: 1 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  const finished = resolveAllPendingRollsWithEvents(res.state, rng);

  const updatedEnemy = finished.state.units[enemy.id];
  assert(
    updatedEnemy.hp === enemy.hp - 1,
    "carpet strike damage should be fixed to 1"
  );
  assert(
    !finished.events.some((e) => e.type === "damageBonusApplied"),
    "carpet strike should ignore damage bonuses"
  );

  console.log("carpet_strike_damage_is_fixed_1_ignores_buffs passed");
}


export function testCarpetStrikeHighlightsAreaMetadataInEvents() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  const centerEvent = res.events.find((e) => e.type === "carpetStrikeCenter");
  assert(
    centerEvent && centerEvent.type === "carpetStrikeCenter",
    "carpet strike center event should be emitted"
  );
  if (centerEvent && centerEvent.type === "carpetStrikeCenter") {
    assert(
      centerEvent.area.radius === 2 && centerEvent.area.shape === "square",
      "carpet strike center should include area metadata"
    );
    assert(
      centerEvent.center.col === 4 && centerEvent.center.row === 6,
      "carpet strike center should follow 2d9 mapping"
    );
  }

  console.log("carpet_strike_highlights_area_metadata_in_events passed");
}


export function testCarpetStrikeRevealsStealthedUnitsInArea() {
  const rng = new SeededRNG(777);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 2, row: 2 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 6 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  assert(
    turnRes.state.pendingRoll?.kind === "kaiserCarpetStrikeCenter",
    "carpet strike should trigger"
  );

  const resolved = resolvePendingRollOnce(turnRes.state, rng);
  const updatedEnemy = resolved.state.units[enemy.id];
  assert(updatedEnemy.isStealthed === false, "stealthed unit should be revealed");

  console.log("carpet_strike_reveals_stealthed_units_in_area passed");
}


export function testKaiserCarpetStrikeDoesNotHitSelfInBunker() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 6 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const resolved = resolveAllPendingRolls(turnRes.state, rng);
  const updatedKaiser = resolved.state.units[kaiser.id];
  assert(updatedKaiser.hp === kaiser.hp, "caster should be immune while in bunker");

  console.log("kaiser_carpet_strike_does_not_hit_self_when_in_bunker passed");
}


export function testKaiserCarpetStrikeHitsAlliesAndEnemies() {
  const rng = new SeededRNG(777);
  let { state, kaiser } = setupKaiserState();

  const ally = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const foe = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 2, row: 2 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_CARPET_STRIKE]: 3 },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, foe.id, { position: { col: 5, row: 6 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, foe.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, foe.id],
    turnOrderIndex: 0,
  };

  const turnRes = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  let res = resolvePendingRollOnce(turnRes.state, rng);
  assert(
    res.state.pendingRoll?.kind === "kaiserCarpetStrikeAttack",
    "carpet strike should request attack roll"
  );
  res = resolvePendingRollOnce(res.state, rng);
  const attackEvent = res.events.find(
    (e) => e.type === "carpetStrikeAttackRolled"
  );
  assert(
    attackEvent && attackEvent.type === "carpetStrikeAttackRolled",
    "carpet strike attack event should be emitted"
  );
  if (attackEvent && attackEvent.type === "carpetStrikeAttackRolled") {
    assert(
      attackEvent.affectedUnitIds.includes(ally.id),
      "carpet strike should include allies"
    );
    assert(
      attackEvent.affectedUnitIds.includes(foe.id),
      "carpet strike should include enemies"
    );
  }

  console.log("kaiser_carpet_strike_hits_allies_and_enemies passed");
}


export function testKaiserDoraDoesNotRequireBunker() {
  const rng = new SeededRNG(1000);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "Dora should be blocked without 2 charges");

  state = setUnit(res.state, kaiser.id, {
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "Dora should create attacker roll when ready"
  );
  assert(
    res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 0,
    "Dora should consume 2 charges"
  );
  assert(
    res.state.units[kaiser.id].turn.actionUsed === true,
    "Dora should consume action slot"
  );

  console.log("kaiser_dora_does_not_require_bunker passed");
}


export function testKaiserDoraOneAttackerRollManyDefenders() {
  const rng = new SeededRNG(3333);
  let { state, kaiser } = setupKaiserState();

  const enemy1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const enemy2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy1.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "Dora should request attacker roll first"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "dora_defenderRoll",
    "Dora should request defender roll after attacker roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "dora_defenderRoll",
    "Dora should roll defenders sequentially"
  );

  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "Dora should finish after all defenders");

  console.log("kaiser_dora_one_attacker_roll_many_defenders_roll_separately passed");
}

export function testKaiserDoraTriggersDonMadnessDirectionBeforeFinalAttack() {
  const rng = makeRngSequence([
    0.99, 0.8, 0, 0.2,
    0.99, 0.8, 0, 0.2,
    0.99, 0.8, 0, 0.2,
  ]);
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID }),
  );
  state = attachArmy(
    state,
    createDefaultArmy("P2", { rider: HERO_DON_KIHOTE_ID }),
  );

  const kaiser = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_GRAND_KAISER_ID,
  )!;
  const don = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_DON_KIHOTE_ID,
  )!;
  const lineEnemies = Object.values(state.units)
    .filter((unit) => unit.owner === "P1" && unit.id !== kaiser.id)
    .slice(0, 2);
  const offLineEnemy = Object.values(state.units).find(
    (unit) =>
      unit.owner === "P1" &&
      unit.id !== kaiser.id &&
      !lineEnemies.some((candidate) => candidate.id === unit.id),
  )!;
  const lineAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.id !== don.id,
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 1 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, don.id, { position: { col: 4, row: 4 }, hp: 1 });
  state = setUnit(state, lineAlly.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, lineEnemies[0].id, { position: { col: 7, row: 4 } });
  state = setUnit(state, lineEnemies[1].id, { position: { col: 8, row: 4 } });
  state = setUnit(state, offLineEnemy.id, { position: { col: 5, row: 6 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", kaiser.id));

  let result = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 4 } },
    } as any,
    rng,
  );
  assert(result.state.pendingRoll?.kind === "dora_attackerRoll", "Dora should start normally");
  result = resolvePendingRollOnce(result.state, rng);
  assert(result.state.pendingRoll?.kind === "dora_defenderRoll", "Don should defend against Dora");
  result = resolvePendingRollOnce(result.state, rng);

  const triggered = result;
  const pending = triggered.state.pendingRoll;
  assert(
    pending?.kind === "donMadDelusionDirection",
    `lethal Dora damage must request Madness of the Knight direction, got ${pending?.kind ?? "none"}`,
  );
  assert(pending.player === "P2", "Don's owner must control the direction choice");
  assert(triggered.state.pendingAoE === null, "Dora AoE state must finish before Don's choice");
  assert(
    triggered.state.units[don.id].isAlive &&
      triggered.state.units[don.id].hp === 0 &&
      triggered.state.units[don.id].position?.col === 4,
    "Don must remain on his death cell as the final attack source",
  );
  assert(
    triggered.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === don.id &&
        event.abilityId === ABILITY_DON_KIHOTE_MADNESS,
    ),
    "the death trigger should log Madness of the Knight immediately",
  );

  const invalid = applyAction(
    triggered.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P2",
      choice: { type: "donMadDelusionDirection", direction: { col: 2, row: 0 } },
    } as any,
    rng,
  );
  assert(invalid.state === triggered.state, "an invalid direction must preserve the pending state");

  const wrongOwner = applyAction(
    triggered.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P1",
      choice: { type: "donMadDelusionDirection", direction: { col: 1, row: 0 } },
    } as any,
    rng,
  );
  assert(wrongOwner.state === triggered.state, "the opponent must not resolve Don's direction choice");

  const duplicateDeathCheck = applyNewBatchPostAction(
    triggered.state,
    triggered.state,
    [{ type: "unitDied", unitId: don.id, killerId: kaiser.id }],
    rng,
  );
  assert(duplicateDeathCheck.state === triggered.state, "repeat death checks must not replace the choice");
  assert(
    !duplicateDeathCheck.events.some((event) => event.type === "abilityUsed"),
    "repeat death checks must not trigger Madness twice",
  );

  const hpBefore = Object.fromEntries(
    [lineAlly, ...lineEnemies, offLineEnemy].map((unit) => [
      unit.id,
      triggered.state.units[unit.id].hp,
    ]),
  );
  result = applyAction(
    triggered.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P2",
      choice: { type: "donMadDelusionDirection", direction: { col: 1, row: 0 } },
    } as any,
    rng,
  );
  assert(result.state.pendingRoll?.kind === "attack_attackerRoll", "combat rolls start only after direction selection");
  assert(result.state.pendingRoll?.context.defenderId === lineEnemies[0].id, "nearest enemy must be attacked first");
  assert(result.state.pendingRoll?.context.damageBonus === 1, "the final attacks must carry +1 damage");
  assert(
    result.state.pendingRoll?.context.sourceAbilityId === ABILITY_DON_KIHOTE_MADNESS,
    "the final attacks must retain their phantasm source",
  );

  result = resolvePendingRollOnce(result.state, rng);
  result = resolvePendingRollOnce(result.state, rng);
  const firstDamage = result.events.find(
    (event) => event.type === "attackResolved" && event.defenderId === lineEnemies[0].id,
  );
  assert(firstDamage?.type === "attackResolved" && firstDamage.damage === don.attack + 1, "the first line target should take Don's attack plus one damage");
  assert(result.state.pendingRoll?.context.defenderId === lineEnemies[1].id, "farther enemy must be attacked second");

  result = resolvePendingRollOnce(result.state, rng);
  result = resolvePendingRollOnce(result.state, rng);
  const firstAfter = result.state.units[lineEnemies[0].id];
  const secondAfter = result.state.units[lineEnemies[1].id];
  assert(firstAfter.hp === Math.max(0, hpBefore[lineEnemies[0].id] - (don.attack + 1)), "nearest line enemy should be damaged");
  assert(secondAfter.hp === Math.max(0, hpBefore[lineEnemies[1].id] - (don.attack + 1)), "farther line enemy should be damaged");
  assert(result.state.units[lineAlly.id].hp === hpBefore[lineAlly.id], "allies on the line must not be attacked");
  assert(result.state.units[offLineEnemy.id].hp === hpBefore[offLineEnemy.id], "off-line enemies must not be attacked");
  assert(!result.state.units[don.id].isAlive && result.state.units[don.id].position === null, "Don must die after the final line attack resolves");
  assert(!result.state.units[don.id].donMadDelusionPending, "the death phantasm flag must be cleared");
  assert(!result.state.pendingRoll, "the completed phantasm must leave no stale pending roll");

  console.log("kaiser_dora_triggers_don_madness_direction_before_final_attack passed");
}


export function testKaiserDoraDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { archer: HERO_GRAND_KAISER_ID });
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const kaiser = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class !== "spearman"
  )!;

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, vlad.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 7 } });

  state = toBattleState(state, "P1", kaiser.id);
  state = initKnowledgeForOwners(state);

  // Use Dora centered to include both targets
  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng as any
  );
  assert(res.state.pendingRoll?.kind === "dora_attackerRoll", "Dora should request attacker roll first");

  // Resolve attacker roll once
  res = resolvePendingRollOnce(res.state, rng as any);

  // Now step through all pending rolls and collect rollRequested events
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Dora AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    const ctx = (current.state.pendingRoll && (current.state.pendingRoll.context as any)) || {};
    const aoe = current.state.pendingAoE;
    // debug trace for loop
    console.log(`DEBUG: iter=${iter} pendingRoll=${pk} ctxIdx=${ctx.currentTargetIndex ?? "-"} aoeIdx=${aoe?.affectedUnitIds?.join(",") ?? "-"} damaged=${aoe?.damagedUnitIds?.join(",") ?? "-"}`);
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }
  collected.push(...current.events);

  // Count dora_defenderRoll requests per actor
  const defenderRequests = collected.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "dora_defenderRoll"
  ) as any[];
  const actorIds = defenderRequests.map((r) => r.actorUnitId).filter(Boolean) as string[];
  const unique = new Set(actorIds);
  assert(
    unique.size === actorIds.length,
    "Dora should request at most one defender roll per target"
  );

  // Ensure Vlad specifically was requested exactly once
  const vladCount = actorIds.filter((id) => id === vlad.id).length;
  assert(vladCount === 1, "Vlad should receive exactly one dora_defenderRoll request");

  // Ensure intimidate choice was requested at most once for Vlad
  const intimidateRequests = collected.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "vladIntimidateChoice" && (e as any).actorUnitId === vlad.id
  ).length;
  assert(intimidateRequests <= 1, "Intimidate choice should be requested at most once per defense");

  console.log("dora_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}



export function testKaiserDoraCenterMustBeOnArcherLine() {
  const rng = new SeededRNG(5555);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: { ...kaiser.charges, [ABILITY_KAISER_DORA]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 5, row: 6 } },
    } as any,
    rng
  );
  assert(!res.state.pendingRoll, "invalid Dora center should be rejected");

  res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: kaiser.id,
      abilityId: ABILITY_KAISER_DORA,
      payload: { center: { col: 4, row: 7 } },
    } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "dora_attackerRoll",
    "valid Dora center should be accepted"
  );

  console.log("kaiser_dora_center_must_be_on_archer_line passed");
}


export function testKaiserEngineeringMiracleTransformsStats() {
  const rng = new SeededRNG(4444);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    bunker: { active: true, ownTurnsInBunker: 0 },
    hp: 3,
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 0,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );

  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "unit should be transformed");
  assert(updated.attack === 2, "attack should be boosted to 2");
  assert(updated.hp === 6, "hp should preserve missing amount on transform");
  assert(updated.bunker?.active !== true, "bunker should be disabled");
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 5,
    "engineering miracle should not spend charges"
  );
  assert(!res.state.pendingRoll, "engineering miracle should not create pending roll");
  const exitEvent = res.events.find(
    (e) => e.type === "bunkerExited" && e.unitId === kaiser.id
  );
  assert(exitEvent, "transform should exit bunker if active");

  console.log("kaiser_phantasm_transforms_stats_and_rules passed");
}


export function testKaiserEngineeringMiracleImpulseNoActionNoSpend() {
  const rng = new SeededRNG(12345);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 1,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );

  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "impulse should transform on turn start");
  assert(!res.state.pendingRoll, "impulse should not create pending roll");
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 5,
    "impulse should not spend charges"
  );

  console.log("kaiser_engineering_miracle_is_impulse_no_action_no_spend passed");
}

export function testKaiserEngineeringMiracleTriggersAtFourAndPersistsNextTurn() {
  const rng = new SeededRNG(54321);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 0,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 3,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
  };

  let started = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  let updated = started.state.units[kaiser.id];
  assert(updated.transformed === true, "Kaiser should transform when charge reaches 4");
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 4,
    "Engineering Miracle should retain the triggering charge total"
  );
  assert(!started.state.pendingRoll, "transformation should not leave a pending lock");
  assert(
    started.state.activeUnitId === kaiser.id,
    "the transformed Kaiser should remain the active unit"
  );

  const view = makePlayerView(started.state, "P1");
  const abilities = view.abilitiesByUnitId?.[kaiser.id] ?? [];
  assert(
    abilities.some((ability) => ability.id === ABILITY_BERSERK_AUTO_DEFENSE),
    "post-transform ability view should include Berserker feature"
  );
  const dora = abilities.find((ability) => ability.id === ABILITY_KAISER_DORA);
  assert(dora?.isAvailable, "transformed Dora should be usable without charges");

  const moveModes = applyAction(
    started.state,
    { type: "requestMoveOptions", unitId: kaiser.id } as any,
    rng
  );
  const modeEvent = moveModes.events.find(
    (event) => event.type === "moveOptionsGenerated"
  );
  assert(
    modeEvent?.type === "moveOptionsGenerated" &&
      modeEvent.modes?.includes("rider") &&
      modeEvent.modes?.includes("berserker"),
    "transformed Kaiser should expose Rider and Berserker movement modes"
  );

  started = applyAction(started.state, { type: "endTurn" } as any, rng);
  started = applyAction(
    started.state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  updated = started.state.units[kaiser.id];
  assert(updated.transformed === true, "Kaiser transformation should persist next turn");
  assert(!started.state.pendingRoll, "next turn should not be stuck on a pending roll");
  assert(
    started.state.activeUnitId === kaiser.id,
    "Kaiser should start the next turn normally after transforming"
  );

  console.log("kaiser_engineering_miracle_triggers_at_four_and_persists_next_turn passed");
}


export function testTransformedKaiserHasDoraAbility() {
  const rng = new SeededRNG(8877);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
      [ABILITY_KAISER_DORA]: 0,
      [ABILITY_KAISER_CARPET_STRIKE]: 0,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "kaiser should transform");

  const view = makePlayerView(res.state, "P1");
  const abilities = view.abilitiesByUnitId?.[kaiser.id] ?? [];
  const dora = abilities.find((ability) => ability.id === ABILITY_KAISER_DORA);
  assert(dora, "Dora should be present after transform");
  assert(dora?.isAvailable, "Dora should be available when action slot is free");

  console.log("transformed_kaiser_has_dora_ability passed");
}


export function testTransformedKaiserHasBerserkerFeatureAndCharges() {
  const rng = new SeededRNG(6677);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(updated.transformed === true, "kaiser should transform");

  const view = makePlayerView(res.state, "P1");
  const abilities = view.abilitiesByUnitId?.[kaiser.id] ?? [];
  const berserk = abilities.find(
    (ability) => ability.id === ABILITY_BERSERK_AUTO_DEFENSE
  );
  assert(berserk, "berserker feature should be present after transform");

  const initialCharges =
    updated.charges[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  const loopState: GameState = {
    ...res.state,
    turnQueue: [kaiser.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id],
    turnOrderIndex: 0,
    currentPlayer: "P1",
  };
  const endRes = applyAction(loopState, { type: "endTurn" } as any, rng);
  res = applyAction(
    endRes.state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const nextCharges =
    res.state.units[kaiser.id].charges[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  assert(
    nextCharges === Math.min(6, initialCharges + 1),
    "berserker charges should increment on own turn start"
  );

  console.log("transformed_kaiser_has_berserker_feature_and_charges passed");
}


export function testKaiserInitialChargesStartAtZeroThenIncrementToOneOnFirstTurn() {
  const rng = new SeededRNG(2468);
  let { state, kaiser, enemy } = setupKaiserState();

  assert(
    (kaiser.charges[ABILITY_KAISER_DORA] ?? 0) === 0,
    "Dora should start at 0 charges"
  );
  assert(
    (kaiser.charges[ABILITY_KAISER_CARPET_STRIKE] ?? 0) === 0,
    "Carpet Strike should start at 0 charges"
  );
  assert(
    (kaiser.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] ?? 0) === 0,
    "Engineering Miracle should start at 0 charges"
  );

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  const updated = res.state.units[kaiser.id];
  assert(
    updated.charges[ABILITY_KAISER_DORA] === 1,
    "Dora should increment to 1 on first turn"
  );
  assert(
    updated.charges[ABILITY_KAISER_CARPET_STRIKE] === 1,
    "Carpet Strike should increment to 1 on first turn"
  );
  assert(
    updated.charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 1,
    "Engineering Miracle should increment to 1 on first turn"
  );

  console.log("kaiser_initial_charges_start_at_zero_then_increment_to_one_on_first_turn passed");
}


export function testKaiserChargesIncrementEachOwnTurn() {
  const rng = new SeededRNG(13579);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 7 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [kaiser.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [kaiser.id, enemy.id],
    turnOrderIndex: 0,
  };

  const expectCharges = (
    res: { state: GameState; events: any[] },
    expected: { dora?: number; carpet?: number; miracle?: number }
  ) => {
    const chargeEvent = res.events.find(
      (e) => e.type === "chargesUpdated" && e.unitId === kaiser.id
    );
    assert(chargeEvent, "chargesUpdated should fire for Kaiser");
    if (chargeEvent?.type === "chargesUpdated") {
      if (expected.dora !== undefined) {
        if (chargeEvent.now?.[ABILITY_KAISER_DORA] !== undefined) {
          assert(
            chargeEvent.now[ABILITY_KAISER_DORA] === expected.dora,
            "Dora charge should increment"
          );
        } else {
          assert(
            res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === expected.dora,
            "Dora charge should remain capped"
          );
        }
      }
      if (expected.carpet !== undefined) {
        assert(
          chargeEvent.now?.[ABILITY_KAISER_CARPET_STRIKE] === expected.carpet,
          "Carpet Strike charge should increment"
        );
      }
      if (expected.miracle !== undefined) {
        assert(
          chargeEvent.now?.[ABILITY_KAISER_ENGINEERING_MIRACLE] === expected.miracle,
          "Engineering Miracle charge should increment"
        );
      }
    }
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { dora: 1, carpet: 1, miracle: 1 });
  res = resolveAllPendingRolls(res.state, rng);
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { dora: 2, carpet: 2, miracle: 2 });
  res = resolveAllPendingRolls(res.state, rng);
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;
  state = applyAction(state, { type: "unitStartTurn", unitId: enemy.id } as any, rng).state;
  state = applyAction(state, { type: "endTurn" } as any, rng).state;

  res = applyAction(
    state,
    { type: "unitStartTurn", unitId: kaiser.id } as any,
    rng
  );
  expectCharges(res, { carpet: 3, miracle: 3 });
  assert(
    res.state.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 2,
    "Dora should stay capped at 2"
  );

  console.log("kaiser_charges_increment_each_own_turn passed");
}


export function testChargesAreNotResetByViewOrStartTurn() {
  let { state, kaiser } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    charges: {
      ...kaiser.charges,
      [ABILITY_KAISER_DORA]: 2,
      [ABILITY_KAISER_CARPET_STRIKE]: 1,
      [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4,
    },
  });

  const view1 = makePlayerView(state, "P1");
  const view2 = makePlayerView(state, "P1");

  assert(
    view1.units[kaiser.id].charges[ABILITY_KAISER_DORA] === 2,
    "view should not reset Dora charges"
  );
  assert(
    view2.units[kaiser.id].charges[ABILITY_KAISER_ENGINEERING_MIRACLE] === 4,
    "view should not reset Engineering Miracle charges"
  );
  assert(
    state.units[kaiser.id].charges[ABILITY_KAISER_CARPET_STRIKE] === 1,
    "state should preserve Carpet Strike charges"
  );

  console.log("charges_are_not_reset_by_view_or_startTurn passed");
}


export function testKaiserMulticlassMovementAndRiderPath() {
  const rng = new SeededRNG(24680);
  let { state, kaiser, enemy } = setupKaiserState();

  state = setUnit(state, kaiser.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state = toBattleState(state, "P1", kaiser.id);

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: kaiser.id } as any,
    rng
  );
  const modeEvent = res.events.find((e) => e.type === "moveOptionsGenerated");
  assert(
    modeEvent && modeEvent.type === "moveOptionsGenerated",
    "move modes should be reported for transformed Kaiser"
  );
  if (modeEvent && modeEvent.type === "moveOptionsGenerated") {
    assert(
      modeEvent.modes?.includes("berserker"),
      "move modes should include berserker"
    );
  }

  res = applyAction(
    res.state,
    { type: "requestMoveOptions", unitId: kaiser.id, mode: "berserker" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveBerserker",
    "transformed Kaiser should request berserker move roll when mode chosen"
  );

  // Rider path attack should trigger on orthogonal move through enemy.
  let state2 = setupKaiserState().state;
  const kaiser2 = Object.values(state2.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const enemy2 = Object.values(state2.units).find(
    (u) => u.owner === "P2" && u.class === "berserker"
  )!;
  state2 = setUnit(state2, kaiser2.id, {
    position: { col: 4, row: 4 },
    transformed: true,
  });
  state2 = setUnit(state2, enemy2.id, { position: { col: 4, row: 6 } });
  state2 = toBattleState(state2, "P1", kaiser2.id);

  const optionsRes = applyAction(
    state2,
    { type: "requestMoveOptions", unitId: kaiser2.id, mode: "rider" } as any,
    rng
  );
  const moveRes = applyAction(
    optionsRes.state,
    { type: "move", unitId: kaiser2.id, to: { col: 4, row: 8 } } as any,
    rng
  );
  assert(
    moveRes.state.pendingRoll?.kind === "riderPathAttack_attackerRoll",
    "rider path attack should trigger during move"
  );
  assert(
    moveRes.state.pendingCombatQueue.length > 0,
    "rider path should enqueue combat targets"
  );

  console.log("kaiser_multiclass_movement_modes_work_and_rider_through_enemy_attack_possible passed");
}
