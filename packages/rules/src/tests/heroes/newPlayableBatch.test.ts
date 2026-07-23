import {
  ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
  ABILITY_ARTEMIDA_SILVER_CRESCENT,
  ABILITY_DON_KIHOTE_WINDMILLS,
  ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  ABILITY_DUOLINGO_SKIP_CLASSES,
  ABILITY_JACK_RIPPER_SNARES,
  ABILITY_KANEKI_RC_CELLS,
  ABILITY_KANEKI_REGENERATION,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_LUCHE_SHINE,
  ABILITY_LUCHE_SUN_GLORY,
  ABILITY_ZORO_DETERMINATION,
  ABILITY_ZORO_ONI_GIRI,
  HERO_ARTEMIDA_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
  getHeroMeta,
  getAbilitySpec,
  getLegalMovesForUnit,
  getMovementActionsRemaining,
  getUnitDefinition,
  getUnitMovementClasses,
  makePlayerView,
} from "../..";
import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  setUnit,
  toBattleState,
  type GameState,
  type UnitState,
} from "../helpers/testUtils";
import { applyNewBatchPostAction } from "../../actions/heroes/newBatchPost";

const HEROES_BY_CLASS = {
  trickster: HERO_DUOLINGO_ID,
  spearman: HERO_LUCHE_ID,
  berserker: HERO_KANEKI_ID,
  knight: HERO_ZORO_ID,
  rider: HERO_DON_KIHOTE_ID,
  assassin: HERO_JACK_RIPPER_ID,
  archer: HERO_ARTEMIDA_ID,
} as const;

function setupBatch(): { state: GameState; heroes: Record<string, UnitState>; enemies: UnitState[] } {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", HEROES_BY_CLASS));
  state = attachArmy(state, createDefaultArmy("P2", HEROES_BY_CLASS));
  const heroes = Object.fromEntries(
    Object.values(state.units)
      .filter((unit) => unit.owner === "P1" && unit.heroId)
      .map((unit) => [unit.heroId!, unit]),
  );
  return {
    state,
    heroes,
    enemies: Object.values(state.units).filter((unit) => unit.owner === "P2"),
  };
}

function battleFor(state: GameState, unit: UnitState): GameState {
  return initKnowledgeForOwners(toBattleState(state, "P1", unit.id));
}

function startTurnFor(state: GameState, unit: UnitState): GameState {
  return initKnowledgeForOwners({
    ...state,
    phase: "battle",
    currentPlayer: unit.owner,
    activeUnitId: null,
    pendingRoll: null,
    turnQueue: [unit.id],
    turnQueueIndex: 0,
    turnOrder: [unit.id],
    turnOrderIndex: 0,
  });
}

export function testNewPlayableBatchStatsResourcesAndMovement() {
  const { state, heroes } = setupBatch();
  const expectations = [
    [HERO_DUOLINGO_ID, "trickster", 6],
    [HERO_LUCHE_ID, "spearman", 7],
    [HERO_KANEKI_ID, "berserker", 10],
    [HERO_ZORO_ID, "knight", 8],
    [HERO_DON_KIHOTE_ID, "rider", 7],
    [HERO_JACK_RIPPER_ID, "assassin", 5],
    [HERO_ARTEMIDA_ID, "archer", 10],
  ] as const;
  for (const [heroId, unitClass, hp] of expectations) {
    const unit = heroes[heroId];
    const meta = getHeroMeta(heroId);
    assert(unit?.class === unitClass, `${heroId} should use ${unitClass}`);
    assert(unit.hp === hp, `${heroId} should start at ${hp} HP`);
    assert(meta?.baseStats.hp === hp, `${heroId} metadata max HP should match its spawn HP`);
    assert(meta?.abilities.length, `${heroId} should expose readable ability metadata`);
  }
  assert(heroes[HERO_DUOLINGO_ID].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 0, "Missed Lessons should initialize separately");
  assert(heroes[HERO_DUOLINGO_ID].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 0, "Push Notification own counter should initialize separately");
  assert(heroes[HERO_LUCHE_ID].charges[ABILITY_LUCHE_SUN_GLORY] === 0, "Sun should initialize");
  assert(heroes[HERO_KANEKI_ID].charges[ABILITY_KANEKI_RC_CELLS] === 0, "RC Cells should initialize");
  assert(heroes[HERO_ZORO_ID].charges[ABILITY_ZORO_DETERMINATION] === 0, "Determination should initialize");

  let movementState = setUnit(state, heroes[HERO_KANEKI_ID].id, { position: { col: 4, row: 4 } });
  movementState = battleFor(movementState, movementState.units[heroes[HERO_KANEKI_ID].id]);
  const moves = getLegalMovesForUnit(movementState, heroes[HERO_KANEKI_ID].id);
  assert(moves.length > 0, "Kaneki should expose Assassin movement through Rinkaku");
  assert(getUnitDefinition("archer").maxHp + 5 === heroes[HERO_ARTEMIDA_ID].hp, "Artemis God should add 5 HP");
  console.log("new_playable_batch_stats_resources_and_movement passed");
}

export function testArtemidaAndKanekiMovementModes() {
  {
    let { state, heroes } = setupBatch();
    const artemida = heroes[HERO_ARTEMIDA_ID];
    state = setUnit(state, artemida.id, { position: { col: 4, row: 4 } });
    state = battleFor(state, state.units[artemida.id]);

    assert(
      JSON.stringify(getUnitMovementClasses(state.units[artemida.id])) ===
        JSON.stringify(["archer", "trickster"]),
      "Artemida should expose Archer and Trickster movement exactly once",
    );
    const chooser = applyAction(
      state,
      { type: "requestMoveOptions", unitId: artemida.id } as any,
      makeRngSequence([]),
    );
    const chooserEvent = chooser.events.find((event) => event.type === "moveOptionsGenerated");
    assert(
      chooserEvent?.type === "moveOptionsGenerated" &&
        JSON.stringify(chooserEvent.modes) === JSON.stringify(["normal", "trickster"]),
      "Artemida should receive explicit Archer/Trickster mode choices",
    );

    const archerOptions = applyAction(
      state,
      { type: "requestMoveOptions", unitId: artemida.id, mode: "normal" } as any,
      makeRngSequence([]),
    );
    const archerDestination = archerOptions.state.pendingMove?.legalTo[0];
    assert(!!archerDestination, "Artemida Archer mode should provide a legal destination");
    const archerMove = applyAction(
      archerOptions.state,
      { type: "move", unitId: artemida.id, to: archerDestination! } as any,
      makeRngSequence([]),
    );
    assert(
      archerMove.state.units[artemida.id].turn.moveUsed,
      "a successful Artemida Archer move should spend Movement",
    );

    const invalidMode = applyAction(
      state,
      { type: "requestMoveOptions", unitId: artemida.id, mode: "rider" } as any,
      makeRngSequence([]),
    );
    assert(invalidMode.state === state, "an invalid Artemida movement mode must not mutate state");
    assert(
      !invalidMode.state.units[artemida.id].turn.moveUsed,
      "an invalid Artemida movement mode must not spend Movement",
    );

    const tricksterRequested = applyAction(
      state,
      { type: "requestMoveOptions", unitId: artemida.id, mode: "trickster" } as any,
      makeRngSequence([0.5]),
    );
    const tricksterOptions = resolveAllPendingRollsWithEvents(
      tricksterRequested.state,
      makeRngSequence([0.5]),
    );
    const tricksterDestination = tricksterOptions.state.pendingMove?.legalTo[0];
    assert(!!tricksterDestination, "Artemida Trickster mode should provide a rolled destination");
    const tricksterMove = applyAction(
      tricksterOptions.state,
      { type: "move", unitId: artemida.id, to: tricksterDestination! } as any,
      makeRngSequence([]),
    );
    assert(
      tricksterMove.state.units[artemida.id].turn.moveUsed,
      "a successful Artemida Trickster move should spend Movement",
    );
  }

  {
    let { state, heroes } = setupBatch();
    const kaneki = heroes[HERO_KANEKI_ID];
    state = setUnit(state, kaneki.id, { position: { col: 4, row: 4 } });
    state = battleFor(state, state.units[kaneki.id]);
    assert(
      JSON.stringify(getUnitMovementClasses(state.units[kaneki.id])) ===
        JSON.stringify(["berserker", "assassin"]),
      "Kaneki should expose Berserker and Assassin movement before Centipede",
    );

    state = setUnit(state, kaneki.id, {
      kanekiCentipedeUnlocked: true,
      turn: { ...state.units[kaneki.id].turn, moveUsed: true, actionUsed: false },
      hasMovedThisTurn: true,
      hasActedThisTurn: false,
    });
    assert(
      JSON.stringify(getUnitMovementClasses(state.units[kaneki.id])) ===
        JSON.stringify(["berserker", "assassin", "rider"]),
      "Centipede should add Rider without removing or duplicating Kaneki movement modes",
    );
    assert(
      getMovementActionsRemaining(state.units[kaneki.id]) === 1,
      "Centipede should expose one action-funded movement after Movement is spent",
    );
    const assassinOptions = applyAction(
      state,
      { type: "requestMoveOptions", unitId: kaneki.id, mode: "assassin" } as any,
      makeRngSequence([]),
    );
    const destination = assassinOptions.state.pendingMove?.legalTo[0];
    assert(!!destination, "Centipede Kaneki should retain legal Assassin movement");
    const moved = applyAction(
      assassinOptions.state,
      { type: "move", unitId: kaneki.id, to: destination! } as any,
      makeRngSequence([]),
    );
    assert(
      moved.state.units[kaneki.id].turn.actionUsed,
      "Kaneki's extra Centipede movement should spend Action after Movement is used",
    );
    assert(
      getMovementActionsRemaining(moved.state.units[kaneki.id]) === 0,
      "Kaneki should not retain another action-funded movement after it resolves",
    );
  }

  console.log("artemida_and_kaneki_movement_modes passed");
}

export function testArtemidaSilverSickleStopsAtSelectedEndpoint() {
  {
    let { state, heroes, enemies } = setupBatch();
    const artemida = heroes[HERO_ARTEMIDA_ID];
    const insideCorridor = enemies[0];
    const immediatelyBeyondEndpoint = enemies[1];
    state = setUnit(state, artemida.id, {
      position: { col: 1, row: 1 },
      charges: { ...artemida.charges, [ABILITY_ARTEMIDA_SILVER_CRESCENT]: 5 },
    });
    state = setUnit(state, insideCorridor.id, { position: { col: 3, row: 2 } });
    state = setUnit(state, immediatelyBeyondEndpoint.id, { position: { col: 5, row: 1 } });
    state = battleFor(state, state.units[artemida.id]);

    const used = applyAction(state, {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 4, row: 1 } },
    } as any, makeRngSequence([]));

    const affectedIds = used.state.pendingAoE?.affectedUnitIds ?? [];
    assert(used.state !== state, "Silver Moon Sickle should accept a middle endpoint on a legal attack line");
    assert(used.state.units[artemida.id].charges[ABILITY_ARTEMIDA_SILVER_CRESCENT] === 0, "a resolved Sickle should spend five charges");
    assert(used.state.units[artemida.id].turn.actionUsed, "a resolved Sickle should spend Action");
    assert(affectedIds.includes(insideCorridor.id), "Sickle should affect the selected line corridor up to its endpoint");
    assert(!affectedIds.includes(immediatelyBeyondEndpoint.id), "Sickle must not affect the next line cell beyond its selected endpoint");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const artemida = heroes[HERO_ARTEMIDA_ID];
    const insideCorridor = enemies[0];
    const boardEdgeEnemy = enemies[1];
    state = setUnit(state, artemida.id, {
      position: { col: 1, row: 1 },
      charges: { ...artemida.charges, [ABILITY_ARTEMIDA_SILVER_CRESCENT]: 5 },
    });
    state = setUnit(state, insideCorridor.id, { position: { col: 6, row: 2 } });
    state = setUnit(state, boardEdgeEnemy.id, { position: { col: 8, row: 1 } });
    state = battleFor(state, state.units[artemida.id]);

    const used = applyAction(state, {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 7, row: 1 } },
    } as any, makeRngSequence([]));

    const affectedIds = used.state.pendingAoE?.affectedUnitIds ?? [];
    assert(affectedIds.includes(insideCorridor.id), "Sickle should affect cells before an endpoint one cell short of the edge");
    assert(!affectedIds.includes(boardEdgeEnemy.id), "an endpoint one cell before the board edge must not extend to the edge");
  }

  {
    let { state, heroes } = setupBatch();
    const artemida = heroes[HERO_ARTEMIDA_ID];
    state = setUnit(state, artemida.id, {
      position: { col: 1, row: 1 },
      charges: { ...artemida.charges, [ABILITY_ARTEMIDA_SILVER_CRESCENT]: 5 },
    });
    state = battleFor(state, state.units[artemida.id]);

    const rejected = applyAction(state, {
      type: "useAbility",
      unitId: artemida.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 4, row: 2 } },
    } as any, makeRngSequence([]));

    assert(rejected.state === state, "an off-line Sickle endpoint must be rejected without mutation");
    assert(rejected.state.units[artemida.id].charges[ABILITY_ARTEMIDA_SILVER_CRESCENT] === 5, "an invalid endpoint must not spend charges");
    assert(!rejected.state.units[artemida.id].turn.actionUsed, "an invalid endpoint must not spend Action");
  }

  console.log("artemida_silver_sickle_stops_at_selected_endpoint passed");
}

export function testNewPlayableBatchTransactionalActives() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.01, 0.99, 0.99, 0.01, 0.01]);

  {
    let { state, heroes, enemies } = setupBatch();
    const duo = heroes[HERO_DUOLINGO_ID];
    const target = enemies[0];
    state = setUnit(state, duo.id, { position: { col: 0, row: 0 }, isStealthed: true, stealthTurnsLeft: 2, charges: { ...duo.charges, [ABILITY_DUOLINGO_PUSH_NOTIFICATION]: 0, [ABILITY_DUOLINGO_SKIP_CLASSES]: 3 } });
    state = setUnit(state, target.id, { position: { col: 5, row: 5 } });
    state = battleFor(state, state.units[duo.id]);
    const rejected = applyAction(state, { type: "useAbility", unitId: duo.id, abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION, payload: { targetId: target.id, destination: { col: 8, row: 8 } } } as any, rng);
    assert(rejected.state.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 3, "rejected Push must not spend Missed Lessons");
    assert(!rejected.state.units[duo.id].turn.moveUsed, "rejected Push must not spend movement");
    const accepted = applyAction(state, { type: "useAbility", unitId: duo.id, abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION, payload: { targetId: target.id, destination: { col: 4, row: 4 } } } as any, rng);
    assert(accepted.state.units[duo.id].position?.col === 4, "Push should reposition Duolingo");
    assert(accepted.state.units[duo.id].turn.moveUsed, "Push should spend movement");
    assert(accepted.state.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 0, "Push should spend three Missed Lessons");
    assert(accepted.state.units[duo.id].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 0, "Missed Lessons Push must not spend its own counter");
    assert(!accepted.state.units[duo.id].isStealthed, "successful Push should reveal Duolingo");
    const invalidSource = applyAction(state, {
      type: "useAbility",
      unitId: duo.id,
      abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      payload: {
        targetId: target.id,
        destination: { col: 4, row: 4 },
        source: { type: "abilityCounter", counterId: ABILITY_DUOLINGO_SKIP_CLASSES },
      },
    } as any, rng);
    assert(invalidSource.state === state, "Push Notification must reject a mismatched counter source without mutation");

    const counterState = setUnit(state, duo.id, {
      charges: {
        ...state.units[duo.id].charges,
        [ABILITY_DUOLINGO_PUSH_NOTIFICATION]: 3,
        [ABILITY_DUOLINGO_SKIP_CLASSES]: 3,
      },
      turn: { ...state.units[duo.id].turn, moveUsed: false },
    });
    const rejectedCounterUse = applyAction(counterState, {
      type: "useAbility",
      unitId: duo.id,
      abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      payload: {
        targetId: target.id,
        destination: { col: 8, row: 8 },
        source: { type: "abilityCounter", counterId: ABILITY_DUOLINGO_PUSH_NOTIFICATION },
      },
    } as any, rng);
    assert(rejectedCounterUse.state === counterState, "invalid counter Push must reject without spending or moving");
    const counterUse = applyAction(counterState, {
      type: "useAbility",
      unitId: duo.id,
      abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      payload: {
        targetId: target.id,
        destination: { col: 4, row: 4 },
        source: { type: "abilityCounter", counterId: ABILITY_DUOLINGO_PUSH_NOTIFICATION },
      },
    } as any, rng);
    assert(counterUse.state.units[duo.id].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 0, "counter Push should spend its own three charges");
    assert(counterUse.state.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 3, "counter Push must not spend Missed Lessons");
    assert(counterUse.state.units[duo.id].turn.moveUsed, "counter Push must consume Movement");
    const counterWithoutMove = setUnit(counterState, duo.id, {
      turn: { ...counterState.units[duo.id].turn, moveUsed: true },
    });
    const rejectedWithoutMove = applyAction(counterWithoutMove, {
      type: "useAbility",
      unitId: duo.id,
      abilityId: ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      payload: {
        targetId: target.id,
        destination: { col: 4, row: 4 },
        source: { type: "abilityCounter", counterId: ABILITY_DUOLINGO_PUSH_NOTIFICATION },
      },
    } as any, rng);
    assert(rejectedWithoutMove.state === counterWithoutMove, "counter Push without Movement must reject without spending");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const artemis = heroes[HERO_ARTEMIDA_ID];
    state = setUnit(state, artemis.id, {
      position: { col: 1, row: 1 },
      charges: { ...artemis.charges, [ABILITY_ARTEMIDA_SILVER_CRESCENT]: 5 },
    });
    state = battleFor(state, state.units[artemis.id]);
    const rejected = applyAction(state, {
      type: "useAbility",
      unitId: artemis.id,
      abilityId: ABILITY_ARTEMIDA_SILVER_CRESCENT,
      payload: { target: { col: 3, row: 2 } },
    } as any, rng);
    assert(rejected.state === state, "off-line Silver Moon Sickle direction must reject without spending charges or Action");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const kaneki = heroes[HERO_KANEKI_ID];
    const maxHp = getHeroMeta(HERO_KANEKI_ID)!.baseStats.hp;
    state = setUnit(state, kaneki.id, { hp: maxHp - 3, position: { col: 2, row: 2 }, charges: { ...kaneki.charges, [ABILITY_KANEKI_RC_CELLS]: 4 } });
    state = battleFor(state, state.units[kaneki.id]);
    const healed = applyAction(state, { type: "useAbility", unitId: kaneki.id, abilityId: ABILITY_KANEKI_REGENERATION, payload: { amount: 2 } } as any, rng);
    assert(healed.state.units[kaneki.id].hp === maxHp - 1, "Regeneration should heal one HP per RC Cell");
    assert(healed.state.units[kaneki.id].charges[ABILITY_KANEKI_RC_CELLS] === 2, "Regeneration should spend selected RC Cells");
    assert(healed.state.units[kaneki.id].turn.actionUsed, "Regeneration should spend the action");
    const overHeal = applyAction(state, { type: "useAbility", unitId: kaneki.id, abilityId: ABILITY_KANEKI_REGENERATION, payload: { amount: 4 } } as any, rng);
    assert(overHeal.state === state, "Regeneration must reject an amount above missing HP without mutation");
    const omittedAmount = applyAction(state, { type: "useAbility", unitId: kaneki.id, abilityId: ABILITY_KANEKI_REGENERATION } as any, rng);
    assert(omittedAmount.state === state, "Regeneration must require a confirmed amount instead of spending all RC Cells");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const zoro = heroes[HERO_ZORO_ID];
    const target = enemies[0];
    state = setUnit(state, zoro.id, { position: { col: 1, row: 1 }, charges: { ...zoro.charges, [ABILITY_ZORO_DETERMINATION]: 2 }, turn: makeEmptyTurnEconomy() });
    state = setUnit(state, target.id, { position: { col: 3, row: 1 } });
    state = battleFor(state, state.units[zoro.id]);
    const used = applyAction(state, { type: "useAbility", unitId: zoro.id, abilityId: ABILITY_ZORO_ONI_GIRI, payload: { targetId: target.id, destination: { col: 2, row: 1 } } } as any, rng);
    assert(used.state.units[zoro.id].turn.actionUsed && used.state.units[zoro.id].turn.moveUsed, "Oni Giri should spend action and movement together");
    assert(used.state.units[zoro.id].charges[ABILITY_ZORO_DETERMINATION] === 0, "Oni Giri should spend two Determination");
    assert(used.state.pendingRoll?.kind === "attack_attackerRoll", "Oni Giri should queue its attack");
    const withoutMove = setUnit(state, zoro.id, {
      turn: { ...state.units[zoro.id].turn, moveUsed: true },
      hasMovedThisTurn: true,
    });
    const rejected = applyAction(withoutMove, { type: "useAbility", unitId: zoro.id, abilityId: ABILITY_ZORO_ONI_GIRI, payload: { targetId: target.id, destination: { col: 2, row: 1 } } } as any, rng);
    assert(rejected.state === withoutMove, "manual Oni Giri without Movement must reject without spending Determination or Action");
    const invalidSource = applyAction(state, {
      type: "useAbility",
      unitId: zoro.id,
      abilityId: ABILITY_ZORO_ONI_GIRI,
      payload: {
        targetId: target.id,
        destination: { col: 2, row: 1 },
        source: { type: "abilityCounter", counterId: ABILITY_LUCHE_DIVINE_RAY },
      },
    } as any, rng);
    assert(invalidSource.state === state, "Oni Giri must reject a mismatched source without mutation");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const zoro = heroes[HERO_ZORO_ID];
    const targets = enemies.slice(0, 2);
    state = setUnit(state, zoro.id, { position: { col: 3, row: 3 }, turn: makeEmptyTurnEconomy() });
    state = setUnit(state, targets[0].id, { position: { col: 4, row: 3 } });
    state = setUnit(state, targets[1].id, { position: { col: 3, row: 4 } });
    state = battleFor(state, state.units[zoro.id]);
    const used = applyAction(state, {
      type: "attack",
      attackerId: zoro.id,
      defenderId: targets[0].id,
      defenderIds: targets.map((target) => target.id),
    }, rng);
    assert(used.state.pendingRoll?.kind === "attack_attackerRoll", "Santoryu should begin one shared two-target attack sequence");
    assert(used.state.pendingCombatQueue?.length === 2, "Santoryu should queue both unique legal targets");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const jack = heroes[HERO_JACK_RIPPER_ID];
    state = setUnit(state, jack.id, { position: { col: 1, row: 1 } });
    state = initKnowledgeForOwners({
      ...state,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: null,
      turnQueue: [jack.id],
      turnQueueIndex: 0,
      turnOrder: [jack.id],
      turnOrderIndex: 0,
    });
    const started = applyAction(state, { type: "unitStartTurn", unitId: jack.id } as any, rng);
    assert(started.state.pendingRoll?.kind === "chargedImpulseTargetChoice", "Jack turn start should request trap placement");
    const pending = started.state.pendingRoll!;
    const trapped = applyAction(started.state, {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "chargedImpulseTarget", position: { col: 6, row: 6 } },
    } as any, rng);
    assert(trapped.state.jackTraps?.some((trap) => trap.position.col === 6 && trap.position.row === 6 && !trap.isRevealed), "Jack should place a hidden trap token");
    assert(!trapped.state.units[jack.id].turn.actionUsed && !trapped.state.units[jack.id].turn.moveUsed, "trap impulse should consume no normal slot");
    const victim = enemies[0];
    const onTrap = setUnit(trapped.state, victim.id, { position: { col: 6, row: 6 } });
    const triggered = applyNewBatchPostAction(
      onTrap,
      onTrap,
      [{ type: "unitMoved", unitId: victim.id, from: { col: 5, row: 6 }, to: { col: 6, row: 6 } }] as any,
      rng,
    );
    assert(triggered.state.units[victim.id].immobilizedUntilOwnTurnStart, "stepping on Jack's trap should immobilize the unit");
    assert(triggered.state.jackTraps?.some((trap) => trap.trappedUnitId === victim.id && trap.isRevealed), "triggered trap should remain revealed until the victim's turn");
    assert((makePlayerView(triggered.state, "P1").jackTraps ?? []).length === 1, "trap owner should see the trap");
    assert((makePlayerView(trapped.state, "P2").jackTraps ?? []).length === 0, "opponent must not receive hidden trap coordinates");
    assert((makePlayerView(triggered.state, "P2").jackTraps ?? []).length === 1, "triggered trap may be projected after reveal");
    const victimTurn = initKnowledgeForOwners({
      ...triggered.state,
      currentPlayer: victim.owner,
      activeUnitId: null,
      pendingRoll: null,
      turnQueue: [victim.id],
      turnQueueIndex: 0,
      turnOrder: [victim.id],
      turnOrderIndex: 0,
    });
    const victimStarted = applyAction(victimTurn, { type: "unitStartTurn", unitId: victim.id } as any, rng);
    assert(!victimStarted.state.units[victim.id].immobilizedUntilOwnTurnStart, "trap immobilize should expire at the victim's turn start");
    assert(!(victimStarted.state.jackTraps ?? []).some((trap) => trap.trappedUnitId === victim.id), "trap should disappear when its immobilize expires");
  }

  {
    let { state, heroes, enemies } = setupBatch();
    const don = heroes[HERO_DON_KIHOTE_ID];
    const target = enemies[0];
    const crossed = enemies[1];
    const crossedSecond = enemies[2];
    state = setUnit(state, don.id, { position: { col: 1, row: 1 }, charges: { ...don.charges, [ABILITY_DON_KIHOTE_WINDMILLS]: 3 } });
    state = setUnit(state, target.id, { position: { col: 5, row: 1 } });
    state = setUnit(state, crossed.id, { position: { col: 2, row: 1 } });
    state = setUnit(state, crossedSecond.id, { position: { col: 3, row: 1 } });
    state = battleFor(state, state.units[don.id]);
    const used = applyAction(state, { type: "useAbility", unitId: don.id, abilityId: ABILITY_DON_KIHOTE_WINDMILLS, payload: { targetId: target.id } } as any, rng);
    assert(used.state.pendingRoll?.kind === "donWindmillsRepositionChoice", "Windmills should give the opponent a reposition choice before attacks");
    assert(used.state.pendingRoll?.player === "P2", "the affected opponent should control repositioning");
    assert(used.state.units[don.id].turn.moveUsed, "Windmills should spend movement only after validation");
    assert(used.state.units[don.id].charges[ABILITY_DON_KIHOTE_WINDMILLS] === 0, "Windmills should spend three charges");
    const pending = used.state.pendingRoll!;
    const rejected = applyAction(used.state, {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "donWindmillsReposition", destination: { col: 8, row: 8 } },
    } as any, rng);
    assert(rejected.state === used.state, "invalid forced reposition should preserve the pending sequence");
    const destination = (pending.context.options as any[])[0];
    const repositionedFirst = applyAction(used.state, {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "donWindmillsReposition", destination },
    } as any, rng);
    assert(repositionedFirst.state.pendingRoll?.kind === "donWindmillsRepositionChoice", "each crossed enemy should receive its own board reposition choice");
    const secondPending = repositionedFirst.state.pendingRoll!;
    const secondDestination = (secondPending.context.options as any[])[0];
    const repositioned = applyAction(repositionedFirst.state, {
      type: "resolvePendingRoll",
      pendingRollId: secondPending.id,
      player: secondPending.player,
      choice: { type: "donWindmillsReposition", destination: secondDestination },
    } as any, rng);
    assert(repositioned.state.pendingRoll?.kind === "attack_attackerRoll", "Windmills should attack after forced reposition");
    assert(repositioned.state.pendingRoll?.context.defenderId === target.id, "Windmills must attack only the declared Giant");
    assert(repositioned.state.pendingRoll?.context.defenderId !== crossed.id, "crossed enemy must not be attacked");
    assert(repositioned.state.pendingRoll?.context.defenderId !== crossedSecond.id, "second crossed enemy must not be attacked");
  }

  console.log("new_playable_batch_transactional_actives passed");
}

export function testNewPlayableBatchLineAndRevealEffects() {
  let { state, heroes, enemies } = setupBatch();
  const luche = heroes[HERO_LUCHE_ID];
  const enemy = enemies.find((unit) => unit.heroId !== HERO_DON_KIHOTE_ID)!;
  state = setUnit(state, luche.id, { position: { col: 2, row: 2 }, charges: { ...luche.charges, [ABILITY_LUCHE_SUN_GLORY]: 2 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 2 } });
  state = battleFor(state, state.units[luche.id]);
  const fired = applyAction(state, { type: "useAbility", unitId: luche.id, abilityId: ABILITY_LUCHE_DIVINE_RAY, payload: { mode: "line", target: { col: 8, row: 2 } } } as any, makeRngSequence([]));
  assert(fired.state.units[luche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 0, "Light Ray should spend two Sun");
  assert(fired.state.units[luche.id].turn.actionUsed, "manual Sun-paid Light Ray should consume Action");
  const invalidLightSource = applyAction(state, {
    type: "useAbility",
    unitId: luche.id,
    abilityId: ABILITY_LUCHE_DIVINE_RAY,
    payload: {
      mode: "line",
      target: { col: 8, row: 2 },
      source: { type: "heroResource", resourceId: ABILITY_LUCHE_SUN_GLORY, amount: 1 },
    },
  } as any, makeRngSequence([]));
  assert(invalidLightSource.state === state, "Light Ray must reject a forged Sun amount without mutation");
  const resolved = resolveAllPendingRollsWithEvents(fired.state, makeRngSequence([0.99, 0.8, 0.01, 0.2]));
  assert(resolved.state.units[enemy.id].blindUntilOwnTurnStart, "failed defense against Light Ray should apply Blind");

  ({ state, heroes, enemies } = setupBatch());
  const blindedLuche = heroes[HERO_LUCHE_ID];
  const distantEnemy = enemies[0];
  state = setUnit(state, blindedLuche.id, {
    position: { col: 2, row: 2 },
    blindUntilOwnTurnStart: true,
    charges: { ...blindedLuche.charges, [ABILITY_LUCHE_SUN_GLORY]: 2 },
  });
  state = setUnit(state, distantEnemy.id, { position: { col: 4, row: 2 } });
  state = battleFor(state, state.units[blindedLuche.id]);
  const rejectedLine = applyAction(state, {
    type: "useAbility",
    unitId: blindedLuche.id,
    abilityId: ABILITY_LUCHE_DIVINE_RAY,
    payload: { mode: "line", target: { col: 8, row: 2 } },
  } as any, makeRngSequence([]));
  assert(!rejectedLine.state.pendingRoll, "Blind should reject a mass-attack center beyond radius 1");
  assert(rejectedLine.state.units[blindedLuche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 2, "rejected Blind targeting must not spend Sun");
  const rejectedAttack = applyAction(state, {
    type: "attack",
    attackerId: blindedLuche.id,
    defenderId: distantEnemy.id,
  }, makeRngSequence([]));
  assert(!rejectedAttack.state.pendingRoll, "Blind should reject a direct attack beyond radius 1");
  assert(!rejectedAttack.state.units[blindedLuche.id].turn.actionUsed, "rejected blinded attack must not spend its action");

  ({ state, heroes, enemies } = setupBatch());
  const artemis = heroes[HERO_ARTEMIDA_ID];
  const hidden = enemies[0];
  state = setUnit(state, artemis.id, { position: { col: 1, row: 1 }, charges: { ...artemis.charges, [ABILITY_ARTEMIDA_MOONLIGHT_SHINE]: 3 } });
  state = setUnit(state, hidden.id, { position: { col: 4, row: 2 }, isStealthed: true, stealthTurnsLeft: 3 });
  const forgedMoonState = battleFor(state, state.units[artemis.id]);
  const forgedMoon = applyAction(forgedMoonState, {
    type: "useAbility",
    unitId: artemis.id,
    abilityId: ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
    payload: { center: { col: 4, row: 1 }, impulse: true },
  } as any, makeRngSequence([]));
  assert(forgedMoon.state === forgedMoonState, "a client cannot forge Moon Insight's privileged impulse execution");
  state = initKnowledgeForOwners({
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [artemis.id],
    turnQueueIndex: 0,
    turnOrder: [artemis.id],
    turnOrderIndex: 0,
  });
  const started = applyAction(state, { type: "unitStartTurn", unitId: artemis.id } as any, makeRngSequence([]));
  assert(started.state.pendingRoll?.kind === "chargedImpulseTargetChoice", "Moon Insight should create a start-turn center choice");
  const pending = started.state.pendingRoll!;
  const invalid = applyAction(started.state, {
    type: "resolvePendingRoll",
    pendingRollId: pending.id,
    player: pending.player,
    choice: { type: "chargedImpulseTarget", position: { col: 3, row: 2 } },
  } as any, makeRngSequence([]));
  assert(invalid.state === started.state, "off-line Moon Insight center should be rejected without spending");
  const revealed = applyAction(started.state, {
    type: "resolvePendingRoll",
    pendingRollId: pending.id,
    player: pending.player,
    choice: { type: "chargedImpulseTarget", position: { col: 4, row: 1 } },
  } as any, makeRngSequence([]));
  assert(!revealed.state.units[hidden.id].isStealthed, "Moon Insight should reveal enemies in its 3x3 area");
  assert(revealed.state.units[artemis.id].charges[ABILITY_ARTEMIDA_MOONLIGHT_SHINE] === 0, "Moon Insight should spend three charges");

  ({ state, heroes, enemies } = setupBatch());
  const impulseDuolingo = heroes[HERO_DUOLINGO_ID];
  const impulseDuolingoTarget = enemies[0];
  state = setUnit(state, impulseDuolingo.id, {
    position: { col: 1, row: 1 },
    charges: {
      ...impulseDuolingo.charges,
      [ABILITY_DUOLINGO_PUSH_NOTIFICATION]: 2,
      [ABILITY_DUOLINGO_SKIP_CLASSES]: 3,
    },
  });
  state = setUnit(state, impulseDuolingoTarget.id, { position: { col: 3, row: 3 } });
  const duolingoStarted = applyAction(
    startTurnFor(state, state.units[impulseDuolingo.id]),
    { type: "unitStartTurn", unitId: impulseDuolingo.id } as any,
    makeRngSequence([]),
  );
  assert(duolingoStarted.state.units[impulseDuolingo.id].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 3, "Push Notification own counter should gain +1 at Duolingo turn start");
  assert(duolingoStarted.state.units[impulseDuolingo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 3, "Push Notification start-turn charge must not alter Missed Lessons");
  const duplicateDuolingoStart = applyAction(duolingoStarted.state, { type: "unitStartTurn", unitId: impulseDuolingo.id } as any, makeRngSequence([]));
  assert(duplicateDuolingoStart.state === duolingoStarted.state, "duplicate start-turn commands must not increment Push Notification again");

  ({ state, heroes, enemies } = setupBatch());
  const impulseLuche = heroes[HERO_LUCHE_ID];
  const impulseLucheTarget = enemies[0];
  state = setUnit(state, impulseLuche.id, {
    position: { col: 2, row: 2 },
    charges: {
      ...impulseLuche.charges,
      [ABILITY_LUCHE_DIVINE_RAY]: 1,
      [ABILITY_LUCHE_SUN_GLORY]: 0,
    },
  });
  state = setUnit(state, impulseLucheTarget.id, { position: { col: 5, row: 2 } });
  const forgedLightState = battleFor(
    setUnit(state, impulseLuche.id, {
      charges: {
        ...state.units[impulseLuche.id].charges,
        [ABILITY_LUCHE_DIVINE_RAY]: 2,
        [ABILITY_LUCHE_SUN_GLORY]: 0,
      },
    }),
    state.units[impulseLuche.id],
  );
  const forgedLight = applyAction(forgedLightState, {
    type: "useAbility",
    unitId: impulseLuche.id,
    abilityId: ABILITY_LUCHE_DIVINE_RAY,
    payload: {
      mode: "line",
      target: { col: 5, row: 2 },
      source: { type: "abilityCounter", counterId: ABILITY_LUCHE_DIVINE_RAY },
    },
  } as any, makeRngSequence([]));
  assert(forgedLight.state === forgedLightState, "Light Ray counter source cannot be invoked manually");
  const lucheStarted = applyAction(startTurnFor(state, state.units[impulseLuche.id]), { type: "unitStartTurn", unitId: impulseLuche.id } as any, makeRngSequence([]));
  assert(lucheStarted.state.units[impulseLuche.id].charges[ABILITY_LUCHE_DIVINE_RAY] === 2, "Light Ray own counter should gain +1 at Luche turn start");
  assert(lucheStarted.state.pendingRoll?.kind === "chargedImpulseTargetChoice", "full Light Ray counter should activate a start-turn impulse choice");
  const lightPending = lucheStarted.state.pendingRoll!;
  const lucheImpulse = applyAction(lucheStarted.state, {
    type: "resolvePendingRoll",
    pendingRollId: lightPending.id,
    player: lightPending.player,
    choice: { type: "chargedImpulseTarget", position: { col: 5, row: 2 } },
  } as any, makeRngSequence([]));
  assert(lucheImpulse.state.units[impulseLuche.id].charges[ABILITY_LUCHE_DIVINE_RAY] === 0, "impulse Light Ray should spend its own counter");
  assert(lucheImpulse.state.units[impulseLuche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 0, "impulse Light Ray must not spend Sun");
  assert(!lucheImpulse.state.units[impulseLuche.id].turn.actionUsed && !lucheImpulse.state.units[impulseLuche.id].turn.moveUsed, "impulse Light Ray must not consume Action or Movement");

  ({ state, heroes, enemies } = setupBatch());
  const impulseZoro = heroes[HERO_ZORO_ID];
  const impulseZoroTarget = enemies[0];
  state = setUnit(state, impulseZoro.id, {
    position: { col: 1, row: 1 },
    charges: {
      ...impulseZoro.charges,
      [ABILITY_ZORO_ONI_GIRI]: 1,
      [ABILITY_ZORO_DETERMINATION]: 0,
    },
  });
  state = setUnit(state, impulseZoroTarget.id, { position: { col: 3, row: 1 } });
  const forgedOniState = battleFor(
    setUnit(state, impulseZoro.id, {
      charges: {
        ...state.units[impulseZoro.id].charges,
        [ABILITY_ZORO_ONI_GIRI]: 2,
        [ABILITY_ZORO_DETERMINATION]: 0,
      },
    }),
    state.units[impulseZoro.id],
  );
  const forgedOni = applyAction(forgedOniState, {
    type: "useAbility",
    unitId: impulseZoro.id,
    abilityId: ABILITY_ZORO_ONI_GIRI,
    payload: { targetId: impulseZoroTarget.id, destination: { col: 2, row: 1 }, impulse: true },
  } as any, makeRngSequence([]));
  assert(forgedOni.state === forgedOniState, "a client cannot forge the free Oni Giri variant");
  const zoroStarted = applyAction(startTurnFor(state, state.units[impulseZoro.id]), { type: "unitStartTurn", unitId: impulseZoro.id } as any, makeRngSequence([]));
  assert(zoroStarted.state.units[impulseZoro.id].charges[ABILITY_ZORO_ONI_GIRI] === 2, "Oni Giri own counter should gain +1 at Zoro turn start");
  const duplicateStart = applyAction(zoroStarted.state, { type: "unitStartTurn", unitId: impulseZoro.id } as any, makeRngSequence([]));
  assert(duplicateStart.state === zoroStarted.state, "duplicate start-turn commands must not increment Oni Giri again");
  const counterOniWithoutMove = setUnit(zoroStarted.state, impulseZoro.id, {
    turn: { ...zoroStarted.state.units[impulseZoro.id].turn, moveUsed: true },
  });
  const rejectedCounterOni = applyAction(counterOniWithoutMove, {
    type: "useAbility",
    unitId: impulseZoro.id,
    abilityId: ABILITY_ZORO_ONI_GIRI,
    payload: {
      targetId: impulseZoroTarget.id,
      destination: { col: 2, row: 1 },
      source: { type: "abilityCounter", counterId: ABILITY_ZORO_ONI_GIRI },
    },
  } as any, makeRngSequence([]));
  assert(rejectedCounterOni.state === counterOniWithoutMove, "counter Oni Giri without Movement must reject without spending Action or charges");
  const zoroImpulse = applyAction(zoroStarted.state, {
    type: "useAbility",
    unitId: impulseZoro.id,
    abilityId: ABILITY_ZORO_ONI_GIRI,
    payload: {
      targetId: impulseZoroTarget.id,
      destination: { col: 2, row: 1 },
      source: { type: "abilityCounter", counterId: ABILITY_ZORO_ONI_GIRI },
    },
  } as any, makeRngSequence([]));
  assert(zoroImpulse.state.units[impulseZoro.id].charges[ABILITY_ZORO_ONI_GIRI] === 0, "Oni Giri impulse should spend only its own counter");
  assert(zoroImpulse.state.units[impulseZoro.id].charges[ABILITY_ZORO_DETERMINATION] === 0, "Oni Giri impulse must not spend Determination");
  assert(zoroImpulse.state.units[impulseZoro.id].turn.actionUsed && zoroImpulse.state.units[impulseZoro.id].turn.moveUsed, "counter Oni Giri must consume Action and Movement");
  console.log("new_playable_batch_line_and_reveal_effects passed");
}

export function testLucheRadiancePassiveAndLightRayModes() {
  let { state, heroes, enemies } = setupBatch();
  const luche = heroes[HERO_LUCHE_ID];
  const attacker = enemies[0];
  state = setUnit(state, luche.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, attacker.id, {
    position: { col: 3, row: 2 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  const started = applyAction(
    startTurnFor(state, state.units[luche.id]),
    { type: "unitStartTurn", unitId: luche.id } as any,
    makeRngSequence([]),
  );
  assert(
    started.state.units[attacker.id].isStealthed,
    "Radiance must not reveal a nearby hidden enemy at Luche turn start",
  );
  assert(
    !started.events.some(
      (event) =>
        event.type === "stealthRevealed" ||
        (event.type === "abilityUsed" && event.abilityId === ABILITY_LUCHE_SHINE),
    ),
    "Radiance turn start must not emit reveal or ability-use events",
  );
  assert(
    started.state.pendingRoll?.context.abilityId !== ABILITY_LUCHE_SHINE,
    "Radiance must not create an impulse pending task",
  );
  assert(
    getAbilitySpec(ABILITY_LUCHE_SHINE)?.kind === "passive",
    "Radiance metadata must be passive",
  );

  ({ state, heroes, enemies } = setupBatch());
  const passiveLuche = heroes[HERO_LUCHE_ID];
  const actualAttacker = enemies[0];
  const otherUnit = enemies[1];
  const miss = applyNewBatchPostAction(
    state,
    state,
    [{
      type: "attackResolved",
      attackerId: actualAttacker.id,
      defenderId: passiveLuche.id,
      hit: false,
      damage: 0,
      defenderHpAfter: passiveLuche.hp,
    }] as any,
    makeRngSequence([]),
  );
  assert(
    !miss.state.units[actualAttacker.id].blindUntilOwnTurnStart,
    "a figure that misses Luche must not become Blinded",
  );

  const hit = applyNewBatchPostAction(
    state,
    state,
    [{
      type: "attackResolved",
      attackerId: actualAttacker.id,
      defenderId: passiveLuche.id,
      hit: true,
      damage: 0,
      defenderHpAfter: passiveLuche.hp,
    }] as any,
    makeRngSequence([]),
  );
  assert(
    hit.state.units[actualAttacker.id].blindUntilOwnTurnStart,
    "the actual figure that successfully hits Luche must become Blinded",
  );
  assert(
    !hit.state.units[otherUnit.id].blindUntilOwnTurnStart,
    "Radiance must not Blind a different unit or commanding player surrogate",
  );

  const nextTurnOrdinal = hit.state.units[actualAttacker.id].blindExpiresAfterOwnTurn;
  assert(nextTurnOrdinal === 1, "Blind should track the attacker's next own turn");
  const duringNextTurn = setUnit(
    {
      ...hit.state,
      phase: "battle",
      currentPlayer: actualAttacker.owner,
      activeUnitId: actualAttacker.id,
      turnQueue: [actualAttacker.id, passiveLuche.id],
      turnQueueIndex: 0,
      turnOrder: [actualAttacker.id, passiveLuche.id],
      turnOrderIndex: 0,
    },
    actualAttacker.id,
    { ownTurnsStarted: 1 },
  );
  const expired = applyAction(duringNextTurn, { type: "endTurn" }, makeRngSequence([]));
  assert(
    !expired.state.units[actualAttacker.id].blindUntilOwnTurnStart,
    "Radiance Blind must expire at the end of the attacker's next turn",
  );

  const refreshed = applyNewBatchPostAction(
    duringNextTurn,
    duringNextTurn,
    [{
      type: "attackResolved",
      attackerId: actualAttacker.id,
      defenderId: passiveLuche.id,
      hit: true,
      damage: 1,
      defenderHpAfter: Math.max(0, passiveLuche.hp - 1),
    }] as any,
    makeRngSequence([]),
  );
  assert(
    refreshed.state.units[actualAttacker.id].blindExpiresAfterOwnTurn === 2,
    "a repeated hit should refresh Blind through the following own turn",
  );
  const notExpired = applyAction(refreshed.state, { type: "endTurn" }, makeRngSequence([]));
  assert(
    notExpired.state.units[actualAttacker.id].blindUntilOwnTurnStart,
    "refreshed Blind must not expire at the end of the current turn",
  );

  ({ state, heroes, enemies } = setupBatch());
  const rayLuche = heroes[HERO_LUCHE_ID];
  const adjacent = enemies[0];
  const distant = enemies[1];
  state = setUnit(state, rayLuche.id, {
    position: { col: 4, row: 4 },
    charges: { ...rayLuche.charges, [ABILITY_LUCHE_SUN_GLORY]: 2 },
  });
  state = setUnit(state, adjacent.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, distant.id, { position: { col: 6, row: 4 } });
  state = battleFor(state, state.units[rayLuche.id]);
  const invalidMode = applyAction(state, {
    type: "useAbility",
    unitId: rayLuche.id,
    abilityId: ABILITY_LUCHE_DIVINE_RAY,
    payload: { mode: "cone", target: { col: 8, row: 4 } },
  } as any, makeRngSequence([]));
  assert(invalidMode.state === state, "invalid Light Ray mode must reject without mutation");
  assert(
    invalidMode.state.units[rayLuche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 2,
    "invalid Light Ray mode must not spend Sun",
  );
  const around = applyAction(state, {
    type: "useAbility",
    unitId: rayLuche.id,
    abilityId: ABILITY_LUCHE_DIVINE_RAY,
    payload: { mode: "aroundSelf" },
  } as any, makeRngSequence([]));
  assert(
    around.state.units[rayLuche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 0,
    "Around Self Light Ray should spend the same two Sun as Line",
  );
  assert(
    around.state.pendingRoll?.context.defenderId === adjacent.id,
    "Around Self Light Ray should attack an adjacent target",
  );
  assert(
    !(around.state.pendingCombatQueue ?? []).some((entry) => entry.defenderId === distant.id),
    "Around Self Light Ray must use radius 1",
  );
  const targeting = makePlayerView(state, "P1").abilitiesByUnitId[rayLuche.id]
    .find((ability) => ability.id === ABILITY_LUCHE_DIVINE_RAY)?.targeting;
  assert(
    targeting?.modes?.aroundSelf?.cells.length === 8,
    "projected Around Self geometry should contain the eight radius-1 cells",
  );

  ({ state, heroes, enemies } = setupBatch());
  const impulseLuche = heroes[HERO_LUCHE_ID];
  const impulseAdjacent = enemies[0];
  state = setUnit(state, impulseLuche.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...impulseLuche.charges,
      [ABILITY_LUCHE_DIVINE_RAY]: 1,
      [ABILITY_LUCHE_SUN_GLORY]: 0,
    },
  });
  state = setUnit(state, impulseAdjacent.id, { position: { col: 5, row: 4 } });
  const impulseStarted = applyAction(
    startTurnFor(state, state.units[impulseLuche.id]),
    { type: "unitStartTurn", unitId: impulseLuche.id } as any,
    makeRngSequence([]),
  );
  const impulsePending = impulseStarted.state.pendingRoll!;
  assert(
    (impulsePending.context.options as any[]).some(
      (cell) => cell.col === 4 && cell.row === 4,
    ),
    "charged Light Ray should offer Luche's cell as the Around Self mode",
  );
  const impulseAround = applyAction(impulseStarted.state, {
    type: "resolvePendingRoll",
    pendingRollId: impulsePending.id,
    player: impulsePending.player,
    choice: { type: "chargedImpulseTarget", position: { col: 4, row: 4 } },
  } as any, makeRngSequence([]));
  assert(
    impulseAround.state.units[impulseLuche.id].charges[ABILITY_LUCHE_DIVINE_RAY] === 0,
    "Around Self impulse should spend Light Ray's own counter",
  );
  assert(
    impulseAround.state.units[impulseLuche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 0 &&
      !impulseAround.state.units[impulseLuche.id].turn.actionUsed,
    "Around Self impulse must spend neither Sun nor Action",
  );

  console.log("luche_radiance_passive_and_light_ray_modes passed");
}

export function testNewPlayableBatchCombatCountersAndReactions() {
  let { state, heroes, enemies } = setupBatch();
  const duo = heroes[HERO_DUOLINGO_ID];
  const luche = heroes[HERO_LUCHE_ID];
  const kaneki = heroes[HERO_KANEKI_ID];
  const zoro = heroes[HERO_ZORO_ID];
  const don = heroes[HERO_DON_KIHOTE_ID];
  const jack = heroes[HERO_JACK_RIPPER_ID];
  const victim = enemies[0];
  state = setUnit(state, don.id, { position: { col: 4, row: 4 }, turn: makeEmptyTurnEconomy() });
  state = setUnit(state, duo.id, { charges: { ...duo.charges, [ABILITY_DUOLINGO_SKIP_CLASSES]: 12 } });
  const events = [
    { type: "attackResolved", attackerId: duo.id, defenderId: victim.id, hit: false, damage: 0, defenderHpAfter: victim.hp },
    { type: "attackResolved", attackerId: victim.id, defenderId: luche.id, hit: false, damage: 0, defenderHpAfter: luche.hp },
    { type: "attackResolved", attackerId: kaneki.id, defenderId: victim.id, hit: true, damage: 1, defenderHpAfter: 0 },
    { type: "unitDied", unitId: victim.id, killerId: kaneki.id },
    { type: "attackResolved", attackerId: zoro.id, defenderId: victim.id, hit: true, damage: 1, defenderHpAfter: 0 },
    { type: "attackResolved", attackerId: victim.id, defenderId: don.id, hit: true, damage: 1, defenderHpAfter: don.hp - 1 },
    { type: "attackResolved", attackerId: jack.id, defenderId: victim.id, hit: true, damage: 1, defenderHpAfter: 2 },
  ] as any;
  const processed = applyNewBatchPostAction(state, state, events, makeRngSequence([]));
  assert(processed.state.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 13, "Missed Lessons must exceed threshold without a cap");
  assert(processed.state.units[duo.id].duolingoBerserkerUnlocked, "Duolingo should unlock Berserker at 12+");
  assert(processed.state.units[luche.id].charges[ABILITY_LUCHE_SUN_GLORY] === 1, "Luche dodge should grant Sun");
  assert(processed.state.units[kaneki.id].charges[ABILITY_KANEKI_RC_CELLS] === 4, "Kaneki hit plus kill should grant 1+3 RC");
  assert(processed.state.units[zoro.id].charges[ABILITY_ZORO_DETERMINATION] === 1, "successful Zoro attack should grant Determination");
  assert(processed.state.units[don.id].donSorrowfulReactionAvailable, "failed Don defense should arm the free move reaction");
  assert(processed.state.pendingRoll?.kind === "donSorrowfulMoveChoice", "damage from an enemy attack should create Don's optional board reaction");
  const donMoveBefore = processed.state.units[don.id].turn.moveUsed;
  const donDestination = (processed.state.pendingRoll?.context.options as any[])[0];
  const movedDon = applyAction(processed.state, {
    type: "resolvePendingRoll",
    pendingRollId: processed.state.pendingRoll!.id,
    player: processed.state.pendingRoll!.player,
    choice: { type: "donSorrowfulMove", destination: donDestination },
  } as any, makeRngSequence([]));
  assert(movedDon.state.units[don.id].position?.col === donDestination.col, "Don reaction should resolve through a board cell choice");
  assert(movedDon.state.units[don.id].turn.moveUsed === donMoveBefore, "Don reaction must not consume normal movement");
  assert(processed.state.units[jack.id].jackKnownHpByTarget?.[victim.id] === 2, "Surgeon should remember remaining HP");
  console.log("new_playable_batch_combat_counters_and_reactions passed");
}
