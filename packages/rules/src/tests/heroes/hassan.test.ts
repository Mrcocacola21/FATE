import {
  ABILITY_HASSAN_ASSASIN_ORDER,
} from "../../abilities";
import {
  ABILITY_HASSAN_TRUE_ENEMY,
  applyAction,
  assert,
  attachArmy,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  GameEvent,
  getHeroMeta,
  getStealthSuccessMinRoll,
  getUnitDefinition,
  HERO_HASSAN_ID,
  HERO_CHIKATILO_ID,
  initKnowledgeForOwners,
  makePlayerView,
  makeEmptyTurnEconomy,
  makeAttackWinRng,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupHassanState,
  toBattleState,
  toPlacementState,
} from "../helpers/testUtils";
export function testHassanHpBonus() {
  const { state, hassan } = setupHassanState();
  const baseHp = getUnitDefinition("assassin").maxHp;
  const meta = getHeroMeta(HERO_HASSAN_ID);

  assert(hassan.hp === baseHp + 1, "Hassan HP should be base assassin HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "Hassan hero meta HP should be base assassin HP + 1"
  );

  console.log("hassan_hp_bonus passed");
}


export function testHassanStealthThresholdIs4() {
  let { state, hassan } = setupHassanState();

  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let rng = makeRngSequence([0.34]); // roll 3
  let res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "enterStealth",
    "stealth should request roll"
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === false,
    "Hassan stealth should fail on roll 3"
  );

  ({ state, hassan } = setupHassanState());
  state = setUnit(state, hassan.id, { position: { col: 4, row: 4 } });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  rng = makeRngSequence([0.5]); // roll 4
  res = applyAction(
    state,
    { type: "enterStealth", unitId: hassan.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.units[hassan.id].isStealthed === true,
    "Hassan stealth should succeed on roll 4"
  );

  console.log("hassan_stealth_threshold_is_4 passed");
}


export function testHassanTrueEnemyGatingConsumesAndForcesOneAttack() {
  const rng = makeAttackWinRng(1);
  let { state, hassan } = setupHassanState();

  const enemyForcedAttacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider"
  )!;
  const enemyForcedTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const controllerAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const hiddenEnemyTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
  )!;

  state = setUnit(state, hassan.id, {
    position: { col: 4, row: 4 },
    charges: { ...hassan.charges, [ABILITY_HASSAN_TRUE_ENEMY]: 2 },
  });
  state = setUnit(state, enemyForcedAttacker.id, {
    position: { col: 5, row: 4 },
  });
  state = setUnit(state, enemyForcedTarget.id, {
    position: { col: 6, row: 4 },
  });
  state = setUnit(state, controllerAlly.id, {
    position: { col: 5, row: 5 },
  });
  state = setUnit(state, hiddenEnemyTarget.id, {
    position: { col: 6, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", hassan.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );
  assert(
    !used.state.pendingRoll,
    "True Enemy should be blocked below 3 charges"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 2,
    "True Enemy should not spend charges when blocked"
  );

  state = setUnit(state, hassan.id, {
    charges: { ...state.units[hassan.id].charges, [ABILITY_HASSAN_TRUE_ENEMY]: 3 },
  });

  used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );

  assert(
    used.state.pendingRoll?.kind === "hassanTrueEnemyTargetChoice",
    "True Enemy should request forced target selection"
  );
  assert(
    used.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 3,
    "True Enemy should not spend charges before target resolution"
  );
  assert(
    !used.state.units[hassan.id].turn.actionUsed,
    "True Enemy should not consume Hassan's action slot before target resolution"
  );
  const options = (used.state.pendingRoll?.context?.options ?? []) as string[];
  assert(
    options.includes(enemyForcedTarget.id),
    "True Enemy should let controlled enemy target its own normal ally"
  );
  assert(
    !options.includes(controllerAlly.id),
    "True Enemy should treat Hassan-side units as allies during forced attack"
  );
  assert(
    !options.includes(hiddenEnemyTarget.id),
    "True Enemy should not leak an unknown hidden attack target"
  );

  const canceled = applyAction(
    used.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: used.state.pendingRoll!.id,
      player: used.state.pendingRoll!.player,
      choice: "skip",
    } as any,
    rng
  );
  assert(!canceled.state.pendingRoll, "True Enemy skip should clear target selection");
  assert(
    canceled.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 3,
    "True Enemy skip should not spend charges"
  );
  assert(
    !canceled.state.units[hassan.id].turn.actionUsed,
    "True Enemy skip should not consume Hassan's action slot"
  );

  const reopened = applyAction(
    canceled.state,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      payload: { forcedAttackerId: enemyForcedAttacker.id },
    } as any,
    rng
  );
  assert(
    reopened.state.pendingRoll?.kind === "hassanTrueEnemyTargetChoice",
    "True Enemy should reopen target selection after cancel"
  );

  const targetChoice = applyAction(
    reopened.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: reopened.state.pendingRoll!.id,
      player: reopened.state.pendingRoll!.player,
      choice: { type: "hassanTrueEnemyTarget", targetId: enemyForcedTarget.id },
    } as any,
    rng
  );
  assert(
    targetChoice.state.pendingRoll?.kind === "attack_attackerRoll",
    "True Enemy should continue into normal attack flow"
  );
  assert(
    targetChoice.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 0,
    "True Enemy should spend exactly 3 charges on target resolution"
  );
  assert(
    targetChoice.state.units[hassan.id].turn.actionUsed,
    "True Enemy should consume Hassan's action slot on target resolution"
  );
  assert(
    targetChoice.state.units[enemyForcedAttacker.id].turn.attackUsed &&
      targetChoice.state.units[enemyForcedAttacker.id].turn.actionUsed,
    "True Enemy should spend the controlled unit's forced attack slots"
  );
  const controlledAttackEvent = targetChoice.events.find(
    (event) =>
      event.type === "controlledAttackDeclared" &&
      event.controllerUnitId === hassan.id &&
      event.controlledUnitId === enemyForcedAttacker.id &&
      event.targetId === enemyForcedTarget.id
  );
  assert(controlledAttackEvent, "True Enemy should log controlled attack details");

  const duplicateTargetChoice = applyAction(
    targetChoice.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: reopened.state.pendingRoll!.id,
      player: reopened.state.pendingRoll!.player,
      choice: { type: "hassanTrueEnemyTarget", targetId: enemyForcedTarget.id },
    } as any,
    rng
  );
  assert(
    duplicateTargetChoice.events.length === 0,
    "duplicate True Enemy target resolution should be rejected without events"
  );
  assert(
    duplicateTargetChoice.state.units[hassan.id].charges[ABILITY_HASSAN_TRUE_ENEMY] === 0,
    "duplicate True Enemy target resolution should not double-spend charges"
  );

  const resolved = resolveAllPendingRollsWithEvents(targetChoice.state, rng);
  const events = [...reopened.events, ...targetChoice.events, ...resolved.events];
  const forcedAttackEvents = events.filter(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === enemyForcedAttacker.id &&
      event.defenderId === enemyForcedTarget.id
  ) as Extract<GameEvent, { type: "attackResolved" }>[];

  assert(
    forcedAttackEvents.length === 1,
    "True Enemy should force exactly one normal attack"
  );
  assert(
    forcedAttackEvents[0].attackerRoll.dice.length >= 2 &&
      forcedAttackEvents[0].defenderRoll.dice.length >= 2,
    "forced attack should use normal attack/defense roll resolution"
  );

  const restoredTurnState = setUnit(
    {
      ...resolved.state,
      currentPlayer: "P2",
      activeUnitId: enemyForcedAttacker.id,
      pendingRoll: null,
      pendingMove: null,
    },
    enemyForcedAttacker.id,
    {
      turn: makeEmptyTurnEconomy(),
      hasAttackedThisTurn: false,
      hasActedThisTurn: false,
    }
  );
  const normalEnemyAttack = applyAction(
    restoredTurnState,
    {
      type: "attack",
      attackerId: enemyForcedAttacker.id,
      defenderId: controllerAlly.id,
    } as any,
    makeRngSequence([])
  );
  assert(
    normalEnemyAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "True Enemy should not permanently alter controlled unit allegiance"
  );

  console.log("hassan_true_enemy_gating_consumes_and_forces_one_attack passed");
}


export function testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence() {
  const rng = new SeededRNG(870);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { assassin: HERO_HASSAN_ID }));
  state = toPlacementState(state, "P1");

  const p1Coords = ["b0", "c0", "d0", "e0", "f0", "g0", "h0"].map(coordFromNotation);
  const p2Coords = ["b8", "c8", "d8", "e8", "f8", "g8", "h8"].map(coordFromNotation);

  let p1i = 0;
  let p2i = 0;
  while (state.phase === "placement") {
    const current = state.currentPlayer;
    const nextUnit = Object.values(state.units).find(
      (u) => u.owner === current && !u.position && u.isAlive
    );
    if (!nextUnit) {
      state = applyAction(state, { type: "endTurn" } as any, rng).state;
      continue;
    }
    const pos = current === "P1" ? p1Coords[p1i++] : p2Coords[p2i++];
    state = applyAction(
      state,
      { type: "placeUnit", unitId: nextUnit.id, position: pos } as any,
      rng
    ).state;
  }

  assert(
    state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "Assassin Order should trigger at battle start"
  );
  assert(
    state.pendingRoll?.player === "P1",
    "P1 Assassin Order selection should resolve first"
  );

  const p1Hassan = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_HASSAN_ID
  )!;
  const p2Hassan = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.heroId === HERO_HASSAN_ID
  )!;
  const p1Archer = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const p1Rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const p2Archer = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "archer"
  )!;
  const p2Rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  assert(
    getStealthSuccessMinRoll(state.units[p1Archer.id]) === 6,
    "base archer should start with stealth threshold 6"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Rider.id]) === null,
    "base rider should start without stealth"
  );
  assert(
    getStealthSuccessMinRoll(state.units[p1Hassan.id]) === 4,
    "Hassan should keep stealth threshold 4"
  );

  const firstSelection = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll!.id,
      player: state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p1Archer.id, p1Rider.id],
      },
    } as any,
    rng
  );

  assert(
    firstSelection.state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "P2 should receive independent Assassin Order selection"
  );
  assert(
    firstSelection.state.pendingRoll?.player === "P2",
    "second Assassin Order selection should be owned by P2"
  );
  assert(
    getStealthSuccessMinRoll(firstSelection.state.units[p2Archer.id]) === 6,
    "P2 archer threshold should remain unchanged before P2 selection"
  );

  const secondSelection = applyAction(
    firstSelection.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: firstSelection.state.pendingRoll!.id,
      player: firstSelection.state.pendingRoll!.player,
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [p2Archer.id, p2Rider.id],
      },
    } as any,
    rng
  );

  assert(
    !secondSelection.state.pendingRoll,
    "Assassin Order selections should complete for both sides"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Archer.id]) === 5,
    "Assassin Order should upgrade archer stealth threshold from 6 to 5"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p1Rider.id]) === 5,
    "Assassin Order should grant stealth to non-stealth unit"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Archer.id]) === 5,
    "P2 selection should upgrade P2 archer independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Rider.id]) === 5,
    "P2 selection should grant stealth independently"
  );
  assert(
    getStealthSuccessMinRoll(secondSelection.state.units[p2Hassan.id]) === 4,
    "Hassan should remain at stealth threshold 4"
  );

  console.log(
    "hassan_assassin_order_battle_start_selection_and_per_side_independence passed"
  );
}

export function testHassanAssassinOrderResumesAfterChikatiloAndRejectsSafely() {
  const rng = new SeededRNG(871);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_HASSAN_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { assassin: HERO_CHIKATILO_ID }));

  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID
  )!;
  const chikatilo = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_CHIKATILO_ID
  )!;

  const p1Units = Object.values(state.units)
    .filter((unit) => unit.owner === "P1")
    .sort((a, b) => a.id.localeCompare(b.id));
  const p2Units = Object.values(state.units)
    .filter((unit) => unit.owner === "P2" && unit.id !== chikatilo.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  p1Units.forEach((unit, index) => {
    state = setUnit(state, unit.id, { position: { col: index + 1, row: 0 } });
  });
  p2Units.forEach((unit, index) => {
    state = setUnit(state, unit.id, { position: { col: index + 1, row: 8 } });
  });
  state = setUnit(state, chikatilo.id, { position: null });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: {
      id: "chikatilo-battle-start-placement",
      kind: "chikatiloFalseTrailPlacement",
      player: "P2",
      context: {
        chikatiloId: chikatilo.id,
        legalPositions: [{ col: 4, row: 4 }],
        queue: [],
      },
    },
  };
  state = initKnowledgeForOwners(state);

  const chikatiloPlaced = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll!.id,
      player: "P2",
      choice: { type: "chikatiloPlace", position: { col: 4, row: 4 } },
    } as any,
    rng
  );
  assert(
    chikatiloPlaced.state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "Assassin Order should resume after Chikatilo's battle-start placement"
  );
  assert(
    chikatiloPlaced.state.pendingRoll?.player === "P1",
    "the Hassan owner should receive the resumed Assassin Order task"
  );

  const ownerView = makePlayerView(chikatiloPlaced.state, "P1");
  const opponentView = makePlayerView(chikatiloPlaced.state, "P2");
  const eligibleIds = (ownerView.pendingRoll?.context?.eligibleUnitIds ?? []) as string[];
  assert(
    eligibleIds.length >= 2 && eligibleIds.every((id) => ownerView.units[id]?.owner === "P1"),
    "the owner projection should contain only allied eligible targets"
  );
  assert(
    opponentView.pendingRoll === null,
    "Assassin Order target options must remain private from the opponent"
  );

  const beforeInvalid = chikatiloPlaced.state;
  const invalid = applyAction(
    beforeInvalid,
    {
      type: "resolvePendingRoll",
      pendingRollId: beforeInvalid.pendingRoll!.id,
      player: "P1",
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [eligibleIds[0], chikatilo.id],
      },
    } as any,
    rng
  );
  assert(invalid.state === beforeInvalid, "invalid Assassin Order targets must not mutate state");
  assert(invalid.events.length === 0, "invalid Assassin Order targets must not emit events");

  const selectedIds = eligibleIds.slice(0, 2);
  const resolved = applyAction(
    beforeInvalid,
    {
      type: "resolvePendingRoll",
      pendingRollId: beforeInvalid.pendingRoll!.id,
      player: "P1",
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: selectedIds,
      },
    } as any,
    rng
  );
  assert(!resolved.state.pendingRoll, "Assassin Order should clear after a valid selection");
  assert(
    selectedIds.every(
      (unitId) => getStealthSuccessMinRoll(resolved.state.units[unitId]) === 5
    ),
    "the resumed Assassin Order should grant Stealth on 5-6"
  );
  assert(
    resolved.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === hassan.id &&
        event.abilityId === ABILITY_HASSAN_ASSASIN_ORDER
    ),
    "Assassin Order resolution should emit the existing ability-used event"
  );

  const battleState = {
    ...resolved.state,
    currentPlayer: "P1" as const,
    activeUnitId: hassan.id,
  };
  const manual = applyAction(
    battleState,
    {
      type: "useAbility",
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_ASSASIN_ORDER,
    } as any,
    rng
  );
  assert(
    manual.rejectionReason === "ability_triggers_automatically_at_battle_start",
    "manual Assassin Order use should be rejected with a useful reason"
  );
  assert(manual.state === battleState, "manual Assassin Order rejection must not mutate state");
  assert(!manual.state.units[hassan.id].turn.actionUsed, "manual rejection must not spend Action");

  console.log(
    "hassan_assassin_order_resumes_after_chikatilo_and_rejects_safely passed"
  );
}
