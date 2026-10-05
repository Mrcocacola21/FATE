import {
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_SOUL_PARADE,
  applyAction,
  assert,
  GameEvent,
  getHeroMeta,
  getLegalAttackTargets,
  getUnitDefinition,
  HERO_ASGORE_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolveAttack,
  resolvePendingRollOnce,
  resolvePendingWithChoice,
  setUnit,
  setupAsgoreState,
  startAsgoreSoulParadeTurn,
  toBattleState,
} from "../helpers/testUtils";
import {
  getAbilityAvailability,
  getAbilityChargeCost,
  getAbilitySpec,
  makePlayerView,
  type GameState,
} from "../../index";

function requiredCharges(abilityId: string): number {
  const spec = getAbilitySpec(abilityId);
  assert(spec, "ability definition must exist");
  return getAbilityChargeCost(spec);
}
export function testAsgoreHpBonus() {
  const { asgore } = setupAsgoreState();
  const baseHp = getUnitDefinition("knight").maxHp;
  const meta = getHeroMeta(HERO_ASGORE_ID);

  assert(asgore.hp === baseHp + 3, "Asgore HP should be base knight HP + 3");
  assert(
    meta?.baseStats.hp === baseHp + 3,
    "Asgore hero meta HP should be base knight HP + 3"
  );

  console.log("asgore_hp_bonus passed");
}


export function testAsgoreSpearmanReachAndDefenseDouble() {
  const { state: initialState7, asgore } = setupAsgoreState();
  let state = initialState7;
  const rangeTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman",
  )!;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, rangeTarget.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const legalTargets = getLegalAttackTargets(state, asgore.id);
  assert(
    legalTargets.includes(rangeTarget.id),
    "Asgore should use spearman reach and attack distance-2 targets"
  );

  const defended = resolveAttack(state, {
    attackerId: attacker.id,
    defenderId: asgore.id,
    rolls: {
      attackerDice: [6, 6],
      defenderDice: [1, 1],
    },
  });
  const defendEvent = defended.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(defendEvent, "incoming attack on Asgore should resolve");
  assert(
    !defendEvent.hit,
    "Asgore should auto-dodge on defense double via spearman multiclass"
  );

  console.log("asgore_spearman_reach_and_defense_double passed");
}


export function testAsgoreFireballTargetingChargesAndDamage() {
  const required = requiredCharges(ABILITY_ASGORE_FIREBALL);
  const { state: initialState8, asgore } = setupAsgoreState();
let state = initialState8;
const lineTarget = Object.values(state.units).find(
  (unit) => unit.owner === "P2" && unit.class === "knight",
)!;
  const illegalTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIREBALL]: 0 },
  });
  state = setUnit(state, lineTarget.id, { position: { col: 4, row: 7 } });
  state = setUnit(state, illegalTarget.id, { position: { col: 5, row: 6 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blockedByCharges = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    },
    makeRngSequence([])
  );
  assert(!blockedByCharges.state.pendingRoll, "Fireball should be blocked when charge is 0");
  assert(
    blockedByCharges.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "blocked Fireball should not change charges"
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIREBALL]: required },
  });
  const illegalTargetUse = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: illegalTarget.id },
    },
    makeRngSequence([])
  );
  assert(
    !illegalTargetUse.state.pendingRoll,
    "Fireball should reject illegal non-archer-line target",
  );
  assert(
    illegalTargetUse.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === required,
    "illegal Fireball target should not spend charge"
  );

  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: lineTarget.id },
    },
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "attack_attackerRoll",
    "legal Fireball should start normal attack roll flow",
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIREBALL] === 0,
    "Fireball should spend its configured charge requirement"
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fireball should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const attackEvent = [...used.events, ...resolved.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === lineTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "Fireball attack should resolve");
  assert(attackEvent.hit, "Fireball should hit with deterministic winning roll");

  console.log("asgore_fireball_targeting_charges_and_damage passed");
}


export function testAsgoreFireParadeAreaResolutionAndChargeSpend() {
  const required = requiredCharges(ABILITY_ASGORE_FIRE_PARADE);
  const { state: initialState9, asgore } = setupAsgoreState();
let state = initialState9;
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider",
  )!;
  const enemyNear = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  const enemyFar = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_FIRE_PARADE]: 0 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyNear.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, enemyFar.id, { position: { col: 8, row: 8 } });
  state = toBattleState(state, "P1", asgore.id);
  state = initKnowledgeForOwners(state);

  const blocked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    },
    makeRngSequence([])
  );
  assert(!blocked.state.pendingRoll, "Fire Parade should be blocked with 0 charges");
  assert(
    blocked.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "blocked Fire Parade should keep charges",
  );

  state = setUnit(state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_FIRE_PARADE]: required },
  });
  const used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: asgore.id,
      abilityId: ABILITY_ASGORE_FIRE_PARADE,
    },
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Fire Parade should start shared-roll AoE flow"
  );
  assert(
    used.state.units[asgore.id].charges[ABILITY_ASGORE_FIRE_PARADE] === 0,
    "Fire Parade should spend its configured charge requirement",
  );
  assert(
    used.state.units[asgore.id].turn.actionUsed,
    "Fire Parade should consume action slot"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    used.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01, 0.01, 0.01])
  );
  const attackEvents = [...used.events, ...resolved.events].filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      [ally.id, enemyNear.id].includes(event.defenderId)
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert(
    attackEvents.length === 2,
    "Fire Parade should hit all units in trickster area around Asgore (including ally)"
  );
  const hitIds = attackEvents.map((event) => event.defenderId).sort();
  assert.deepStrictEqual(
    hitIds,
    [ally.id, enemyNear.id].sort(),
    "Fire Parade should include nearby ally and enemy and skip far targets"
  );
  const rollSignatures = new Set(
    attackEvents.map((event) => event.attackerRoll.dice.join(","))
  );
  assert(
    rollSignatures.size === 1,
    "Fire Parade should use one shared attacker roll for AoE"
  );
  assert(
    !attackEvents.some((event) => event.defenderId === enemyFar.id),
    "Fire Parade should not affect units outside trickster area"
  );

  console.log("asgore_fire_parade_area_resolution_and_charge_spend passed");
}

function setupChargeActivation(abilityId: string, current: number) {
  const { state: initial, asgore } = setupAsgoreState();
  const target = Object.values(initial.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  let state = setUnit(initial, asgore.id, {
    position: { col: 4, row: 4 },
    turn: makeEmptyTurnEconomy(),
    charges: { ...asgore.charges, [abilityId]: current },
  });
  state = setUnit(state, target.id, { position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", asgore.id));
  return {
    state,
    asgore,
    action: {
      type: "useAbility" as const,
      unitId: asgore.id,
      abilityId,
      payload: { targetId: target.id },
    },
  };
}

function assertRejectedChargeActivation(abilityId: string, current: number) {
  const { state, asgore, action } = setupChargeActivation(abilityId, current);
  const availability = getAbilityAvailability(state, asgore.id, abilityId);
  assert.equal(availability.canUse, false);
  assert.equal(availability.disabledReason, "notEnoughCharges");
  const projected = makePlayerView(state, "P1").abilitiesByUnitId[asgore.id]
    .find((ability) => ability.id === abilityId)!;
  assert.equal(projected.isAvailable, false);
  assert.equal(projected.disabledReasonCode, "notEnoughCharges");
  assert.equal(projected.currentCharges, current);
  assert.equal(projected.chargeRequired, requiredCharges(abilityId));
  const rejected = applyAction(state, action, makeRngSequence([]));
  assert.equal(rejected.rejectionReason, "notEnoughCharges");
  assert.strictEqual(rejected.state, state, "rejection must preserve the entire state");
  assert.deepStrictEqual(rejected.events, [], "rejection must produce no effects");
  assert.equal(rejected.state.units[asgore.id].charges[abilityId], current);
  assert.equal(rejected.state.units[asgore.id].turn.actionUsed, false);
  assert.equal(rejected.state.units[asgore.id].turn.moveUsed, false);
  assert.equal(rejected.state.pendingRoll, null);
}

function assertAcceptedChargeActivation(abilityId: string, pendingKind: string) {
  const required = requiredCharges(abilityId);
  assert.equal(required, getAbilitySpec(abilityId)!.maxCharges,
    "Asgore's active abilities must require and spend their full configured counter");
  const { state, asgore, action } = setupChargeActivation(abilityId, required);
  assert.equal(getAbilityAvailability(state, asgore.id, abilityId).canUse, true);
  assert.equal(makePlayerView(state, "P1").abilitiesByUnitId[asgore.id]
    .find((ability) => ability.id === abilityId)!.isAvailable, true);
  const accepted = applyAction(state, action, makeRngSequence([]));
  assert.equal(accepted.rejectionReason, undefined);
  assert.equal(accepted.state.pendingRoll?.kind, pendingKind);
  assert.equal(accepted.state.units[asgore.id].charges[abilityId], 0);
  assert.equal(accepted.state.units[asgore.id].turn.actionUsed, true);
  assert.equal(accepted.state.units[asgore.id].turn.moveUsed, false);
  assert(accepted.events.some((event) => event.type === "abilityUsed"));
}

export function testAsgoreFireballDisabledBelowRequiredCharges() {
  assertRejectedChargeActivation(ABILITY_ASGORE_FIREBALL, 1);
  console.log("asgore_fireball_disabled_below_required_charges passed");
}

export function testAsgoreFireballEnabledAtRequiredCharges() {
  assertAcceptedChargeActivation(ABILITY_ASGORE_FIREBALL, "attack_attackerRoll");
  console.log("asgore_fireball_enabled_at_required_charges passed");
}

export function testAsgoreFireParadeDisabledBelowRequiredCharges() {
  assertRejectedChargeActivation(ABILITY_ASGORE_FIRE_PARADE, 1);
  console.log("asgore_fire_parade_disabled_below_required_charges passed");
}

export function testAsgoreFireParadeEnabledAtRequiredCharges() {
  assertAcceptedChargeActivation(ABILITY_ASGORE_FIRE_PARADE, "tricksterAoE_attackerRoll");
  console.log("asgore_fire_parade_enabled_at_required_charges passed");
}

export function testChargeBasedAbilityNeverAllowsNegativeCharges() {
  for (const abilityId of [ABILITY_ASGORE_FIREBALL, ABILITY_ASGORE_FIRE_PARADE]) {
    for (let current = 0; current < requiredCharges(abilityId); current++) {
      assertRejectedChargeActivation(abilityId, current);
    }
  }
  console.log("charge_based_ability_never_allows_negative_charges passed");
}

export function testAbilityAvailabilityGuardsAndFlexibleAction() {
  const abilityId = ABILITY_ASGORE_FIREBALL;
  const { state, asgore, action } = setupChargeActivation(abilityId, requiredCharges(abilityId));
  assert.equal(getAbilityAvailability(state, "missing", abilityId).disabledReason, "unitNotFound");
  assert.equal(getAbilityAvailability(state, asgore.id, "missing").disabledReason, "abilityNotOwned");
  const cases: [GameState, string][] = [
    [setUnit(state, asgore.id, { isAlive: false }), "unitNotAlive"],
    [{ ...state, phase: "placement" }, "wrongPhase"],
    [{ ...state, currentPlayer: "P2" }, "notYourTurn"],
    [{ ...state, activeUnitId: null }, "notActiveUnit"],
    [setUnit(state, asgore.id, { turn: { ...asgore.turn, actionUsed: true } }), "actionSlotUsed"],
    [applyAction(state, action, makeRngSequence([])).state, "pendingResolution"],
  ];
  for (const [blocked, reason] of cases) {
    const availability = getAbilityAvailability(blocked, asgore.id, abilityId);
    assert.equal(availability.canUse, false);
    assert.equal(availability.disabledReason, reason);
    const rejected = applyAction(blocked, action, makeRngSequence([]));
    assert.strictEqual(rejected.state, blocked);
    assert.deepStrictEqual(rejected.events, []);
  }
  const extraAction = setUnit(state, asgore.id, {
    turn: { ...asgore.turn, actionUsed: true },
    courtExtraFlexibleAction: { used: false, expiresAtRoundEnd: 100 },
  });
  assert.equal(getAbilityAvailability(extraAction, asgore.id, abilityId).canUse, true,
    "availability must honor existing flexible actions through canSpendSlots");
  const accepted = applyAction(extraAction, action, makeRngSequence([]));
  assert.equal(accepted.state.pendingRoll?.kind, "attack_attackerRoll");
  assert.equal(accepted.state.units[asgore.id].courtExtraFlexibleAction?.used, true);
  console.log("ability_availability_guards_and_flexible_action passed");
}

function startScheduledTurn(state: GameState, unitId: string): GameState {
  const prepared: GameState = {
    ...state,
    currentPlayer: state.units[unitId].owner,
    activeUnitId: null,
    pendingRoll: null,
    turnNumber: state.turnNumber + 1,
    turnQueue: [unitId],
    turnQueueIndex: 0,
    turnOrder: [unitId],
    turnOrderIndex: 0,
  };
  return applyAction(prepared, { type: "unitStartTurn", unitId }, makeRngSequence([])).state;
}

export function testAsgoreChargesAccumulateOnlyOnOwnTurnAndRestartAfterUse() {
  for (const abilityId of [ABILITY_ASGORE_FIREBALL, ABILITY_ASGORE_FIRE_PARADE]) {
    const { state: initial, asgore, action } = setupChargeActivation(abilityId, 0);
    let state = initial;
    const other = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.position,
    )!;
    const cap = requiredCharges(abilityId);
    for (let turn = 1; turn <= cap + 1; turn++) {
      const before = state.units[asgore.id].charges[abilityId];
      state = startScheduledTurn(state, other.id);
      assert.equal(state.units[asgore.id].charges[abilityId], before,
        "another unit's start must not regenerate Asgore's charges");
      // Keep the separate automatic Soul Parade trigger out of this charge lifecycle test.
      state = setUnit(state, asgore.id, {
        charges: { ...state.units[asgore.id].charges, [ABILITY_ASGORE_SOUL_PARADE]: 0 },
      });
      state = startScheduledTurn(state, asgore.id);
      assert.equal(state.units[asgore.id].charges[abilityId], Math.min(cap, turn));
    }
    state = applyAction(state, action, makeRngSequence([])).state;
    assert.equal(state.units[asgore.id].charges[abilityId], 0);
    state = resolveAllPendingRollsWithEvents(state, makeRngSequence([0.99, 0.99, 0.01, 0.01])).state;
    state = startScheduledTurn(state, asgore.id);
    assert.equal(state.units[asgore.id].charges[abilityId], 1);
  }
  console.log("asgore_charges_accumulate_only_on_own_turn_and_restart_after_use passed");
}


export function testAsgoreSoulParadePatienceAttackAndTempStealth() {
  const { state: initialState10, asgore } = setupAsgoreState();
let state = initialState10;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  assert(
    started.state.pendingRoll?.kind === "asgoreSoulParadeRoll",
    "Soul Parade should trigger at start turn when charges become full"
  );
  assert(
    started.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Soul Parade trigger should not spend charges before its result resolves"
  );

  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.1]));
  assert(
    rolled.state.pendingRoll?.kind === "asgoreSoulParadePatienceTargetChoice",
    "Soul Parade roll=1 should request Patience target"
  );
  const soulEvent = rolled.events.find(
    (event) => event.type === "asgoreSoulParadeResolved"
  ) as Extract<GameEvent, { type: "asgoreSoulParadeResolved" }> | undefined;
  assert(soulEvent, "Soul Parade roll should emit readable result event");
  assert(
    soulEvent.roll === 1 &&
      soulEvent.soulId === "patience" &&
      soulEvent.effectDescription.length > 0,
    "Soul Parade event should include roll, soul, and effect description"
  );
  const patienceContext = rolled.state.pendingRoll?.context as
    | { soulResult?: { roll?: number; soulId?: string; effectDescription?: string } }
    | undefined;
  assert(
    patienceContext?.soulResult?.roll === 1 &&
      patienceContext.soulResult.soulId === "patience" &&
      !!patienceContext.soulResult.effectDescription,
    "Patience pending choice should preserve the resolved Soul Parade result"
  );
  assert(
    rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Patience target selection should not spend Soul Parade charges"
  );
  assert(
    !rolled.state.units[asgore.id].asgorePatienceStealthActive,
    "Patience branch should wait to enable temporary stealth until target resolution"
  );

  const targetPicked = resolvePendingWithChoice(
    rolled.state,
    { type: "asgoreSoulParadePatienceTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  assert(
    targetPicked.state.pendingRoll?.kind === "attack_attackerRoll",
    "Patience branch should trigger immediate attack flow"
  );
  assert(
    targetPicked.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
    "Patience target resolution should spend Soul Parade charges"
  );
  assert(
    !!targetPicked.state.units[asgore.id].asgorePatienceStealthActive,
    "Patience target resolution should enable temporary stealth threshold 5-6"
  );
  const resolvedAttack = resolveAllPendingRollsWithEvents(
    targetPicked.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const patienceAttack = [...targetPicked.events, ...resolvedAttack.events].find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === asgore.id &&
      event.defenderId === enemy.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(patienceAttack, "Patience branch attack should resolve");

  let stealthState = setUnit(resolvedAttack.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  stealthState = { ...stealthState, currentPlayer: "P1", activeUnitId: asgore.id };
  const attemptFail = applyAction(
    stealthState,
    { type: "enterStealth", unitId: asgore.id },
    makeRngSequence([])
  );
  assert(
    attemptFail.state.pendingRoll?.kind === "enterStealth",
    "Patience should allow Asgore to attempt stealth during this turn"
  );
  const failedStealth = resolvePendingRollOnce(
    attemptFail.state,
    makeRngSequence([0.5])
  ); // roll 4
  assert(
    !failedStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should fail on roll 4 (threshold 5-6)",
  );

  let secondAttemptState = setUnit(failedStealth.state, asgore.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  secondAttemptState = {
    ...secondAttemptState,
    currentPlayer: "P1",
    activeUnitId: asgore.id,
  };
  const attemptSuccess = applyAction(
    secondAttemptState,
    { type: "enterStealth", unitId: asgore.id },
    makeRngSequence([])
  );
  const succeededStealth = resolvePendingRollOnce(
    attemptSuccess.state,
    makeRngSequence([0.8])
  ); // roll 5
  assert(
    succeededStealth.state.units[asgore.id].isStealthed,
    "Patience stealth should succeed on roll 5"
  );

  console.log("asgore_soul_parade_patience_attack_and_temp_stealth passed");
}


export function testAsgoreSoulParadeBraveryAutoDefenseOneTime() {
  const { state: initialState11, asgore } = setupAsgoreState();
  let state = initialState11;
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;

  state = setUnit(state, asgore.id, {
    position: { col: 4, row: 4 },
    charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 5 } });

  const started = startAsgoreSoulParadeTurn(state, asgore.id);
  assert(
    started.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
    "Soul Parade trigger should not spend charges before Bravery resolves",
  );
  const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.2])); // roll 2
  assert(!rolled.state.pendingRoll, "Bravery branch should resolve immediately");
  assert(
    rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
    "Bravery branch should spend Soul Parade charges when it resolves",
  );
  assert(
    !!rolled.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery branch should arm one-time auto defense",
  );

  let defendState = toBattleState(rolled.state, "P2", attacker.id);
  defendState = initKnowledgeForOwners(defendState);
  const attackStarted = applyAction(
    defendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id },
    makeRngSequence([]),
  );
  const afterAttacker = resolvePendingRollOnce(attackStarted.state, makeRngSequence([0.99, 0.99]));
  assert(
    afterAttacker.state.pendingRoll?.kind === "asgoreBraveryDefenseChoice",
    "Bravery choice should appear after attacker roll",
  );

  const autoChosen = applyAction(
    afterAttacker.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: afterAttacker.state.pendingRoll!.id,
      player: afterAttacker.state.pendingRoll!.player,
      choice: "auto",
    },
    makeRngSequence([]),
  );
  const autoEvent = autoChosen.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === attacker.id &&
      event.defenderId === asgore.id,
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(autoEvent, "attack should resolve after Bravery auto-defense");
  assert(!autoEvent.hit && autoEvent.damage === 0, "Bravery auto-defense should negate hit");
  assert(
    !autoChosen.state.units[asgore.id].asgoreBraveryAutoDefenseReady,
    "Bravery auto-defense should be consumed after one use",
  );

  let secondDefendState = toBattleState(autoChosen.state, "P2", attacker.id);
  secondDefendState = initKnowledgeForOwners(secondDefendState);
  secondDefendState = setUnit(secondDefendState, attacker.id, {
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    stealthAttemptedThisTurn: false,
  });
  const secondStart = applyAction(
    secondDefendState,
    { type: "attack", attackerId: attacker.id, defenderId: asgore.id },
    makeRngSequence([]),
  );
  const secondAfterAttacker = resolvePendingRollOnce(
    secondStart.state,
    makeRngSequence([0.99, 0.99]),
  );
  assert(
    secondAfterAttacker.state.pendingRoll?.kind === "attack_defenderRoll",
    "After Bravery is spent, defense should proceed with normal defender roll",
  );

  console.log("asgore_soul_parade_bravery_auto_defense_one_time passed");
}


export function testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice() {
  {
    const { state: initialState12, asgore } = setupAsgoreState();
    let state = initialState12;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.4])); // roll 3
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeIntegrityDestination",
      "Soul Parade roll=3 should request Integrity destination",
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Integrity destination selection should not spend Soul Parade charges",
    );
    const moved = resolvePendingWithChoice(
      rolled.state,
      {
        type: "asgoreSoulParadeIntegrityDestination",
        position: { col: 8, row: 8 },
      },
      makeRngSequence([]),
    );
    assert(
      moved.state.units[asgore.id].position?.col === 8 &&
        moved.state.units[asgore.id].position?.row === 8,
      "Integrity should reposition Asgore to selected empty cell",
    );
    assert(
      !moved.state.units[asgore.id].turn.moveUsed,
      "Integrity reposition should not consume move action",
    );
    assert(
      moved.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Integrity destination resolution should spend Soul Parade charges",
    );
  }

  {
    const { state: initialState13, asgore } = setupAsgoreState();
    let state = initialState13;
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight",
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 5, row: 4 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.55])); // roll 4
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadePerseveranceTargetChoice",
      "Soul Parade roll=4 should request Perseverance target",
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Perseverance target selection should not spend Soul Parade charges",
    );
    const applied = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadePerseveranceTarget", targetId: target.id },
      makeRngSequence([0.1]), // fail check
    );
    assert(
      !!applied.state.units[target.id].movementDisabledNextTurn,
      "Perseverance failed check should disable target movement next turn",
    );
    assert(
      applied.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Perseverance target resolution should spend Soul Parade charges",
    );
  }

  {
    const { state: initialState14, asgore } = setupAsgoreState();
    let state = initialState14;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      hp: 5,
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.7])); // roll 5
    assert(!rolled.state.pendingRoll, "Kindness branch should resolve immediately");
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Kindness branch should spend Soul Parade charges when it resolves",
    );
    assert(rolled.state.units[asgore.id].hp === 7, "Kindness should heal Asgore by 2 HP");
  }

  {
    const { state: initialState15, asgore } = setupAsgoreState();
    let state = initialState15;
    const target = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight",
    )!;
    const illegalTarget = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "rider",
    )!;
    state = setUnit(state, asgore.id, {
      position: { col: 4, row: 4 },
      charges: { ...asgore.charges, [ABILITY_ASGORE_SOUL_PARADE]: 2 },
    });
    state = setUnit(state, target.id, { position: { col: 4, row: 6 } });
    state = setUnit(state, illegalTarget.id, { position: { col: 5, row: 6 } });
    const started = startAsgoreSoulParadeTurn(state, asgore.id);
    const rolled = resolvePendingRollOnce(started.state, makeRngSequence([0.95])); // roll 6
    assert(
      rolled.state.pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice",
      "Soul Parade roll=6 should request Justice target",
    );
    assert(
      rolled.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "Justice target selection should not spend Soul Parade charges",
    );
    const justiceOptions =
      (rolled.state.pendingRoll?.context as { options?: string[] } | undefined)?.options ?? [];
    assert(
      justiceOptions.includes(target.id),
      "Justice target options should include archer-legal target",
    );
    const justiceContext = rolled.state.pendingRoll?.context as
      | { soulResult?: { roll?: number; soulId?: string } }
      | undefined;
    assert(
      justiceContext?.soulResult?.roll === 6 && justiceContext.soulResult.soulId === "justice",
      "Justice pending choice should preserve the resolved Soul Parade result",
    );
    const illegalPicked = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadeJusticeTarget", targetId: illegalTarget.id },
      makeRngSequence([]),
    );
    assert(
      illegalPicked.state.pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice",
      "invalid Justice target should keep pending choice active",
    );
    assert(
      illegalPicked.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 3,
      "invalid Justice target should not spend Soul Parade charges",
    );
    const picked = resolvePendingWithChoice(
      rolled.state,
      { type: "asgoreSoulParadeJusticeTarget", targetId: target.id },
      makeRngSequence([]),
    );
    assert(
      picked.state.pendingRoll?.kind === "attack_attackerRoll",
      "Justice branch should trigger immediate ranged attack flow",
    );
    assert(
      picked.state.units[asgore.id].charges[ABILITY_ASGORE_SOUL_PARADE] === 0,
      "Justice target resolution should spend Soul Parade charges",
    );
    const resolved = resolveAllPendingRollsWithEvents(
      picked.state,
      makeRngSequence([0.99, 0.99, 0.01, 0.01]),
    );
    const justiceAttack = [...picked.events, ...resolved.events].find(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === asgore.id &&
        event.defenderId === target.id,
    ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
    assert(justiceAttack, "Justice branch attack should resolve");
    assert(justiceAttack.hit, "Justice branch should hit with winning deterministic roll");
  }

  console.log("asgore_soul_parade_integrity_perseverance_kindness_justice passed");
}
