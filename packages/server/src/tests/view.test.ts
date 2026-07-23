// packages/server/src/tests/view.test.ts

import assert from "assert";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_CHIKATILO_ID,
  HERO_LOKI_ID,
  HERO_JACK_RIPPER_ID,
  HERO_ZORO_ID,
  HERO_LUCHE_ID,
  HERO_DUOLINGO_ID,
  HERO_DON_KIHOTE_ID,
  ABILITY_ZORO_ONI_GIRI,
  ABILITY_ZORO_DETERMINATION,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_LUCHE_SHINE,
  ABILITY_LUCHE_SUN_GLORY,
  ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  ABILITY_DUOLINGO_SKIP_CLASSES,
  initUnitAbilities,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  createPendingRollContext,
  projectPendingRollPresentation,
  type GameEvent,
  type GameState,
  type UnitState,
} from "rules";

function setupState() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  return state;
}

function setUnit(state: GameState, unitId: string, patch: Partial<UnitState>): GameState {
  const unit = state.units[unitId];
  assert(unit, `missing unit ${unitId}`);
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: { ...unit, ...patch },
    },
  };
}

function testHiddenEnemyOmitted() {
  let state = setupState();
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin");
  assert(enemy, "enemy unit should exist");

  state = {
    ...state,
    units: {
      ...state.units,
      [enemy!.id]: {
        ...enemy!,
        position: { col: 4, row: 4 },
        isStealthed: true,
        stealthTurnsLeft: 3,
      },
    },
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [enemy!.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(!view.units[enemy!.id], "stealthed unknown enemy should be omitted from view");
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position",
  );

  console.log("view_hidden_enemy_omitted passed");
}

function testKnownStealthedEnemyUsesLastKnown() {
  let state = setupState();
  const enemy = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "assassin");
  assert(enemy, "enemy unit should exist");

  state = {
    ...state,
    units: {
      ...state.units,
      [enemy!.id]: {
        ...enemy!,
        position: { col: 4, row: 4 },
        isStealthed: true,
        stealthTurnsLeft: 3,
      },
    },
    knowledge: {
      ...state.knowledge,
      P1: { ...state.knowledge.P1, [enemy!.id]: true },
    },
    lastKnownPositions: {
      ...state.lastKnownPositions,
      P1: {
        ...(state.lastKnownPositions?.P1 ?? {}),
        [enemy!.id]: { col: 4, row: 4 },
      },
    },
  };

  const view = makePlayerView(state, "P1");
  assert(!view.units[enemy!.id], "stealthed enemy should be hidden even if previously known");
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position",
  );

  console.log("view_known_stealthed_enemy_uses_last_known passed");
}

function testFinalBoardRevealOnlyAfterGameOver() {
  let state = setupState();
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin",
  )!;
  state = setUnit(state, hidden.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = { ...state, phase: "battle" };

  assert.equal(
    makePlayerView(state, "P1").units[hidden.id],
    undefined,
    "hidden enemy must remain hidden before game over",
  );
  assert.equal(
    makeSpectatorView(state).units[hidden.id],
    undefined,
    "spectator must not see hidden units before game over",
  );

  const ended: GameState = {
    ...state,
    phase: "ended",
    gameOver: {
      winnerPlayerId: "P1",
      loserPlayerId: "P2",
      reason: "allEnemyUnitsDefeated",
      endedAtRevision: 8,
      endedAtTurn: 5,
    },
  };
  assert.deepEqual(makePlayerView(ended, "P1").units[hidden.id].position, {
    col: 4,
    row: 4,
  });
  assert.equal(makePlayerView(ended, "P1").phase, "ended");
  assert.equal(makePlayerView(ended, "P2").phase, "ended");
  assert.equal(makePlayerView(ended, "P2").gameOver?.winnerPlayerId, "P1");
  assert.deepEqual(makeSpectatorView(ended).units[hidden.id].position, {
    col: 4,
    row: 4,
  });
  console.log("view_final_board_reveal_only_after_game_over passed");
}

function testChikatiloTrackedHiddenTargetProjectionIsPrivate() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID,
  );
  const target = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "knight");
  assert(chikatilo, "chikatilo should exist");
  assert(target, "target should exist");

  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 4 },
    chikatiloMarkedTargets: [target.id],
    chikatiloTrackedTargets: [target.id],
  });
  state = setUnit(state, target.id, {
    position: { col: 5, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: chikatilo.id,
    turnOrder: [chikatilo.id, target.id],
    turnQueue: [chikatilo.id, target.id],
  };

  const ownerView = makePlayerView(state, "P1");
  const targetProjection = ownerView.units[target.id];
  assert(targetProjection, "owner projection should include tracked hidden target");
  assert.deepEqual(targetProjection.position, { col: 5, row: 4 });
  assert.equal(targetProjection.chikatiloMarkStatus?.exactTrackingActive, true);
  assert(
    ownerView.legal?.attackTargetsByUnitId[chikatilo.id]?.includes(target.id),
    "owner projection should expose legal attack targetability",
  );

  const opponentView = makePlayerView(state, "P2");
  assert.equal(
    opponentView.units[target.id].chikatiloMarkStatus,
    undefined,
    "opponent should not receive chikatilo private mark metadata",
  );
  assert.equal(
    opponentView.units[chikatilo.id]?.chikatiloMarkedTargets,
    undefined,
    "opponent should not receive chikatilo private marked target list",
  );
  assert.equal(
    opponentView.units[chikatilo.id]?.chikatiloTrackedTargets,
    undefined,
    "opponent should not receive chikatilo private tracked target list",
  );

  const spectatorView = makeSpectatorView(state);
  assert.equal(
    spectatorView.units[target.id],
    undefined,
    "spectator should not see the tracked hidden target",
  );
  assert.equal(
    spectatorView.units[chikatilo.id]?.chikatiloMarkedTargets,
    undefined,
    "spectator should not receive chikatilo private marked target list",
  );

  console.log("view_chikatilo_tracked_hidden_target_private passed");
}

function testChikatiloMarkEventProjectionRedactsPrivateTarget() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID,
  );
  const target = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "knight");
  assert(chikatilo, "chikatilo should exist");
  assert(target, "target should exist");

  state = setUnit(state, chikatilo.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    chikatiloMarkedTargets: [target.id],
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 } });

  const events: GameEvent[] = [
    {
      type: "abilityUsed",
      unitId: chikatilo.id,
      abilityId: "chikatiloAssassinMark",
    },
    {
      type: "chikatiloMarkApplied",
      chikatiloId: chikatilo.id,
      targetId: target.id,
      ownerPlayerId: "P1",
      trackingStarts: "startOfChikatiloTurn",
      trackingExpires: "afterMarkedUnitTurn",
    },
  ];

  const ownerEvents = projectEventsForRecipient(state, events, "P1");
  const opponentEvents = projectEventsForRecipient(state, events, "P2");
  const spectatorEvents = projectEventsForRecipient(state, events, "spectator");

  assert.equal(
    (ownerEvents.find((event) => event.type === "chikatiloMarkApplied") as any)?.targetId,
    target.id,
    "owner should receive full mark target identity",
  );
  assert(
    opponentEvents.some((event) => event.type === "abilityUsed" && !("unitId" in event)),
    "hidden chikatilo ability use should be redacted for opponent",
  );
  assert(
    opponentEvents.some((event) => event.type === "chikatiloMarkApplied" && !("targetId" in event)),
    "opponent should not receive private mark target identity",
  );
  assert(
    spectatorEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && !("targetId" in event),
    ),
    "spectator should not receive private mark target identity",
  );

  console.log("view_chikatilo_mark_event_projection_redacts_private_target passed");
}

function testGroupedSemanticEventProjectionFiltersHiddenTargets() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { trickster: HERO_LOKI_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));

  const loki = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LOKI_ID,
  );
  const visibleTarget = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight",
  );
  const hiddenTarget = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin",
  );
  assert(loki, "loki should exist");
  assert(visibleTarget, "visible target should exist");
  assert(hiddenTarget, "hidden target should exist");

  state = setUnit(state, loki.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, visibleTarget.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, hiddenTarget.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  const event: GameEvent = {
    type: "lokiChickenGroupApplied",
    lokiId: loki.id,
    targetIds: [visibleTarget.id, hiddenTarget.id],
    abilityId: "lokiLaught",
  };

  const ownerEvents = projectEventsForRecipient(state, [event], "P1");
  const opponentEvents = projectEventsForRecipient(state, [event], "P2");
  const spectatorEvents = projectEventsForRecipient(state, [event], "spectator");

  const ownerEvent = ownerEvents.find((item) => item.type === "lokiChickenGroupApplied") as
    | Extract<GameEvent, { type: "lokiChickenGroupApplied" }>
    | undefined;
  const opponentEvent = opponentEvents.find((item) => item.type === "lokiChickenGroupApplied") as
    | Extract<GameEvent, { type: "lokiChickenGroupApplied" }>
    | undefined;
  const spectatorEvent = spectatorEvents.find((item) => item.type === "lokiChickenGroupApplied") as
    | Extract<GameEvent, { type: "lokiChickenGroupApplied" }>
    | undefined;

  assert.deepEqual(
    ownerEvent?.targetIds,
    [visibleTarget.id],
    "owner should not receive unknown hidden target ids in grouped events",
  );
  assert(
    opponentEvent?.targetIds.includes(hiddenTarget.id),
    "target owner should still receive their own hidden target in grouped events",
  );
  assert.deepEqual(
    spectatorEvent?.targetIds,
    [visibleTarget.id],
    "spectator should not receive hidden target ids in grouped events",
  );

  console.log("view_grouped_semantic_event_projection_filters_hidden_targets passed");
}

function testJackKnownHpProjectionIsOwnerPrivate() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const jack = Object.values(state.units).find((unit) => unit.heroId === HERO_JACK_RIPPER_ID);
  const target = Object.values(state.units).find((unit) => unit.owner === "P2");
  assert(jack && target, "Jack projection fixture should exist");
  state = setUnit(state, jack.id, { jackKnownHpByTarget: { [target.id]: 3 } });

  assert.equal(makePlayerView(state, "P1").units[jack.id].jackKnownHpByTarget?.[target.id], 3);
  assert.equal(makePlayerView(state, "P2").units[jack.id]?.jackKnownHpByTarget, undefined);
  assert.equal(makeSpectatorView(state).units[jack.id]?.jackKnownHpByTarget, undefined);
  console.log("view_jack_known_hp_owner_private passed");
}

function testJackTrapProjectionIsOwnerPrivateUntilTriggered() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID }));
  const jack = Object.values(state.units).find((unit) => unit.heroId === HERO_JACK_RIPPER_ID)!;
  state = {
    ...state,
    jackTraps: [
      {
        id: "jack-snare-P1-1",
        sourceUnitId: jack.id,
        owner: "P1",
        position: { col: 2, row: 3 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
  };
  assert.deepEqual(
    makePlayerView(state, "P1").jackTraps?.map((trap) => trap.position),
    [{ col: 2, row: 3 }],
  );
  assert.equal(
    "triggeredTargetIds" in makePlayerView(state, "P1").jackTraps[0],
    false,
    "trigger history is authoritative metadata and must not be projected",
  );
  assert.deepEqual(makePlayerView(state, "P2").jackTraps, []);
  assert.deepEqual(makeSpectatorView(state).jackTraps, []);
  const revealed = {
    ...state,
    jackTraps: state.jackTraps?.map((trap) => ({ ...trap, isRevealed: true })),
  };
  assert.deepEqual(
    makePlayerView(revealed, "P2").jackTraps?.map((trap) => trap.position),
    [{ col: 2, row: 3 }],
  );
  assert.equal(
    makePlayerView(revealed, "P2").jackTraps[0]?.sourceUnitId,
    undefined,
    "a revealed enemy snare must not project private source metadata",
  );
  console.log("view_jack_trap_owner_private_until_triggered passed");
}

function testCoveringTracksProjectionRedactsPendingAndHiddenExplosionTargets() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const jack = Object.values(state.units).find((unit) => unit.heroId === HERO_JACK_RIPPER_ID)!;
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin",
  )!;
  const visible = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  state = setUnit(state, jack.id, {
    position: { col: 8, row: 8 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, hidden.id, {
    position: { col: 1, row: 1 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, visible.id, { position: { col: 2, row: 1 } });
  state = {
    ...state,
    phase: "battle",
    pendingRoll: {
      id: "covering-tracks-choice",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: jack.id,
        abilityId: "jackRipperSnares",
        step: "coveringTracks",
        placement: { col: 0, row: 8 },
        options: [{ col: 1, row: 1 }],
      },
    },
  };
  assert.equal(makePlayerView(state, "P1").pendingRoll?.context.step, "coveringTracks");
  assert.equal(makePlayerView(state, "P2").pendingRoll, null);

  const explosion: GameEvent = {
    type: "aoeResolved",
    sourceUnitId: jack.id,
    casterId: jack.id,
    abilityId: "jackRipperCoveringTracks",
    center: { col: 1, row: 1 },
    radius: 1,
    affectedUnitIds: [hidden.id, visible.id],
    revealedUnitIds: [],
    damagedUnitIds: [hidden.id, visible.id],
    damageByUnitId: { [hidden.id]: 1, [visible.id]: 1 },
    rollsByUnitId: { [hidden.id]: 2, [visible.id]: 4 },
  };
  const projected = projectEventsForRecipient(state, [explosion], "P1")[0];
  assert.equal(projected.type, "aoeResolved");
  if (projected.type === "aoeResolved") {
    assert.deepEqual(projected.affectedUnitIds, [visible.id]);
    assert.deepEqual(projected.damagedUnitIds, [visible.id]);
    assert.deepEqual(projected.damageByUnitId, { [visible.id]: 1 });
    assert.deepEqual(projected.rollsByUnitId, { [visible.id]: 4 });
  }
  const opponentEvent = projectEventsForRecipient(state, [explosion], "P2")[0];
  if (opponentEvent.type === "aoeResolved") {
    assert.equal(
      opponentEvent.sourceUnitId,
      undefined,
      "the explosion log must not identify a hidden Jack to the opponent",
    );
    assert.equal(opponentEvent.casterId, undefined);
  }
  console.log("view_covering_tracks_pending_and_hidden_result_projection passed");
}

function testRiderMovementProjectionDoesNotLeakHiddenTarget() {
  let state = setupState();
  const rider = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider",
  )!;
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin",
  )!;
  state = setUnit(state, rider.id, { position: { col: 6, row: 0 } });
  state = setUnit(state, hidden.id, {
    position: { col: 3, row: 0 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });

  const movementOnly: GameEvent[] = [
    {
      type: "unitMoved",
      unitId: rider.id,
      from: { col: 0, row: 0 },
      to: { col: 6, row: 0 },
    },
  ];
  const projectedEvents = projectEventsForRecipient(state, movementOnly, "P1");
  const projectedView = makePlayerView(state, "P1");

  assert(!projectedView.units[hidden.id], "hidden touched unit should remain absent from view");
  assert(
    !JSON.stringify(projectedEvents).includes(hidden.id),
    "rider movement event projection should not mention the hidden target",
  );

  console.log("view_rider_movement_projection_does_not_leak_hidden_target passed");
}

function testNewBatchAbilitySourceProjection() {
  let state = setupState();
  const zoroBase = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight",
  )!;
  const lucheBase = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman",
  )!;
  const duoBase = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "trickster",
  )!;
  const enemy = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  const zoro = initUnitAbilities({
    ...zoroBase,
    heroId: HERO_ZORO_ID,
    position: { col: 1, row: 1 },
  });
  const luche = initUnitAbilities({
    ...lucheBase,
    heroId: HERO_LUCHE_ID,
    position: { col: 1, row: 3 },
  });
  const duo = initUnitAbilities({
    ...duoBase,
    heroId: HERO_DUOLINGO_ID,
    position: { col: 1, row: 5 },
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: zoro.id,
    units: {
      ...state.units,
      [zoro.id]: {
        ...zoro,
        charges: { ...zoro.charges, [ABILITY_ZORO_ONI_GIRI]: 2, [ABILITY_ZORO_DETERMINATION]: 2 },
      },
      [luche.id]: {
        ...luche,
        charges: { ...luche.charges, [ABILITY_LUCHE_DIVINE_RAY]: 2, [ABILITY_LUCHE_SUN_GLORY]: 2 },
      },
      [duo.id]: {
        ...duo,
        charges: {
          ...duo.charges,
          [ABILITY_DUOLINGO_PUSH_NOTIFICATION]: 3,
          [ABILITY_DUOLINGO_SKIP_CLASSES]: 3,
        },
      },
      [enemy.id]: {
        ...enemy,
        position: { col: 3, row: 1 },
        blindUntilOwnTurnStart: true,
        blindExpiresAfterOwnTurn: 2,
      },
    },
  };
  const view = makePlayerView(state, "P1");
  const oni = view.abilitiesByUnitId[zoro.id].find(
    (ability) => ability.id === ABILITY_ZORO_ONI_GIRI,
  )!;
  const light = view.abilitiesByUnitId[luche.id].find(
    (ability) => ability.id === ABILITY_LUCHE_DIVINE_RAY,
  )!;
  const push = view.abilitiesByUnitId[duo.id].find(
    (ability) => ability.id === ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  )!;
  assert.deepEqual(
    oni.useOptions?.map((option) => option.source.type),
    ["abilityCounter", "heroResource"],
  );
  assert(
    oni.targeting?.targetIds?.includes(enemy.id),
    "Oni Giri projection should include an authoritative legal target",
  );
  assert.deepEqual(
    light.useOptions?.map((option) => option.source.type),
    ["heroResource"],
  );
  assert(
    light.useOptions?.[0].source.type === "heroResource" &&
      light.useOptions[0].source.resourceId === ABILITY_LUCHE_SUN_GLORY,
  );
  assert(
    (light.targeting?.cells?.length ?? 0) > 0,
    "Light Ray projection should include authoritative line cells",
  );
  assert(
    (light.targeting?.modes?.line?.cells.length ?? 0) > 0,
    "Light Ray projection should expose line-mode cells",
  );
  assert.equal(
    light.targeting?.modes?.aroundSelf?.cells.length,
    8,
    "Light Ray projection should expose radius-1 Around Self cells",
  );
  const radiance = view.abilitiesByUnitId[luche.id].find(
    (ability) => ability.id === ABILITY_LUCHE_SHINE,
  );
  assert.equal(radiance?.kind, "passive", "Radiance should project as passive");
  assert.equal(
    view.units[enemy.id].blindUntilOwnTurnStart,
    true,
    "Blind status should survive player projection",
  );
  assert.deepEqual(
    push.useOptions?.map((option) => option.source.type),
    ["abilityCounter", "heroResource"],
  );
  assert(
    push.useOptions?.[0].source.type === "abilityCounter" &&
      push.useOptions[0].source.counterId === ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  );
  assert(
    push.useOptions?.[1].source.type === "heroResource" &&
      push.useOptions[1].source.resourceId === ABILITY_DUOLINGO_SKIP_CLASSES,
  );
  assert(
    view.units[duo.id].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 3,
    "Push Notification counter should project separately",
  );
  assert(
    view.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 3,
    "Missed Lessons should project separately",
  );
  assert(
    oni.useOptions?.every((option) => option.consumes?.action && option.consumes?.move),
    "both Oni Giri sources should consume Action and Movement",
  );
  assert(
    push.useOptions?.every((option) => option.consumes?.move),
    "both Push Notification sources should consume Movement",
  );

  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.id !== enemy.id,
  )!;
  const hiddenPendingState: GameState = {
    ...state,
    units: {
      ...state.units,
      [hidden.id]: {
        ...hidden,
        position: { col: 2, row: 3 },
        isStealthed: true,
        stealthTurnsLeft: 3,
      },
    },
    pendingRoll: {
      id: "light-ray-hidden-attacker-roll",
      player: "P1",
      kind: "attack_attackerRoll",
      context: {
        attackerId: luche.id,
        defenderId: hidden.id,
        sourceAbilityId: ABILITY_LUCHE_DIVINE_RAY,
        queueKind: "aoe",
      },
    },
    pendingAoE: {
      casterId: luche.id,
      abilityId: ABILITY_LUCHE_DIVINE_RAY,
      center: { ...luche.position! },
      radius: 1,
      affectedUnitIds: [hidden.id],
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };
  const hiddenSafeView = makePlayerView(hiddenPendingState, "P1");
  assert.equal(hiddenSafeView.units[hidden.id], undefined);
  assert.equal(
    hiddenSafeView.pendingRoll?.context.defenderId,
    undefined,
    "Light Ray pending projection must redact a hidden defender id",
  );
  assert(
    !JSON.stringify(hiddenSafeView.pendingAoEPreview).includes(hidden.id),
    "Light Ray area preview must not include hidden target ids",
  );
  console.log("view_new_batch_ability_source_projection passed");
}

function testDonMadnessDirectionProjectionIsOwnerPrivateAndValid() {
  let state = setupState();
  const donBase = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "rider",
  )!;
  const don = initUnitAbilities({
    ...donBase,
    heroId: HERO_DON_KIHOTE_ID,
    hp: 0,
    isAlive: true,
    position: { col: 4, row: 4 },
    donMadDelusionPending: true,
    donMadDelusionOrigin: { col: 4, row: 4 },
  });
  state = {
    ...state,
    phase: "battle",
    units: { ...state.units, [don.id]: don },
    pendingRoll: {
      id: "don-madness-direction",
      player: "P2",
      kind: "donMadDelusionDirection",
      context: {
        abilityId: "donKihoteMadness",
        unitId: don.id,
        origin: { col: 4, row: 4 },
        options: [{ col: 1, row: 0 }],
      },
    },
  };

  const ownerView = makePlayerView(state, "P2");
  const opponentView = makePlayerView(state, "P1");
  assert.equal(ownerView.pendingRoll?.kind, "donMadDelusionDirection");
  assert.equal(ownerView.pendingRoll?.player, "P2");
  assert.equal(ownerView.pendingRoll?.context.unitId, don.id);
  assert.equal(
    ownerView.units[don.id]?.position?.col,
    4,
    "the pending source must remain projectable",
  );
  assert.equal(
    opponentView.pendingRoll,
    null,
    "the opponent should receive only public waiting metadata",
  );
  console.log("view_don_madness_direction_projection_is_owner_private_and_valid passed");
}

function testPapyrusBoneChoiceProjectionIsOwnerPrivate() {
  let state = setupState();
  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman",
  )!;
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  state = setUnit(state, papyrus.id, { position: { col: 3, row: 3 } });
  state = setUnit(state, target.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    pendingPapyrusBoneChoices: [{ papyrusUnitId: papyrus.id, targetUnitId: target.id }],
    pendingRoll: {
      id: "papyrus-bone-choice",
      player: "P1",
      kind: "papyrusBoneChoice",
      context: {
        papyrusUnitId: papyrus.id,
        targetUnitId: target.id,
        targetIds: [target.id],
        currentTargetIndex: 0,
        targetIndex: 1,
        targetCount: 1,
        availableBones: ["blue", "orange"],
      },
    },
  };

  const ownerView = makePlayerView(state, "P1");
  const opponentView = makePlayerView(state, "P2");
  assert.equal(ownerView.pendingRoll?.kind, "papyrusBoneChoice");
  assert.equal(ownerView.pendingRoll?.context.targetUnitId, target.id);
  assert.equal(opponentView.pendingRoll, null);
  assert.equal(
    "pendingPapyrusBoneChoices" in ownerView,
    false,
    "the internal hit queue must never be projected",
  );
  console.log("view_papyrus_bone_choice_projection_is_owner_private passed");
}

function testPendingRollPresentationProjectionIsHiddenSafeAndBackwardCompatible() {
  let state = setupState();
  const actor = Object.values(state.units).find((unit) => unit.owner === "P1")!;
  const hiddenTarget = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  state = setUnit(state, actor.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, hiddenTarget.id, {
    position: { col: 3, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    figureId: "Secret Defender",
  });
  const resolutionContext = {
    attackerId: actor.id,
    defenderId: hiddenTarget.id,
    attackerDice: [6, 2],
    stage: "initial",
    queueKind: "normal",
  };
  const presentation = createPendingRollContext({
    state,
    requestedPlayerId: actor.owner,
    kind: "attack_attackerRoll",
    resolutionContext,
    actorUnitId: actor.id,
  });
  state = {
    ...state,
    pendingRoll: {
      id: "hidden-context-roll",
      player: actor.owner,
      kind: "attack_attackerRoll",
      context: resolutionContext,
      presentation,
    },
  };

  const ownerView = makePlayerView(state, actor.owner);
  assert.equal(ownerView.pendingRoll?.context.defenderId, undefined);
  assert.equal(ownerView.pendingRoll?.presentation?.targetUnitId, undefined);
  assert.equal(ownerView.pendingRoll?.presentation?.targetName, "Unknown target");
  assert(
    !JSON.stringify(ownerView.pendingRoll?.presentation).includes("Secret Defender"),
    "projected presentation must not leak a hidden unit name",
  );

  const waitingSummary = projectPendingRollPresentation(state, presentation, hiddenTarget.owner);
  assert.equal(waitingSummary?.sourceUnitId, actor.id);
  assert.equal(
    waitingSummary?.targetName,
    "Secret Defender",
    "an owner may see their own hidden unit without revealing it to the opponent",
  );

  const legacyState: GameState = {
    ...state,
    pendingRoll: {
      id: "legacy-minimal-roll",
      player: actor.owner,
      kind: "initiativeRoll",
      context: {},
    },
  };
  const legacyView = makePlayerView(legacyState, actor.owner);
  assert.equal(legacyView.pendingRoll?.id, "legacy-minimal-roll");
  assert.equal(legacyView.pendingRoll?.presentation, undefined);
  console.log("pending_roll_presentation_projection_is_hidden_safe passed");
}

function main() {
  testHiddenEnemyOmitted();
  testKnownStealthedEnemyUsesLastKnown();
  testFinalBoardRevealOnlyAfterGameOver();
  testChikatiloTrackedHiddenTargetProjectionIsPrivate();
  testChikatiloMarkEventProjectionRedactsPrivateTarget();
  testGroupedSemanticEventProjectionFiltersHiddenTargets();
  testJackKnownHpProjectionIsOwnerPrivate();
  testJackTrapProjectionIsOwnerPrivateUntilTriggered();
  testCoveringTracksProjectionRedactsPendingAndHiddenExplosionTargets();
  testRiderMovementProjectionDoesNotLeakHiddenTarget();
  testNewBatchAbilitySourceProjection();
  testDonMadnessDirectionProjectionIsOwnerPrivateAndValid();
  testPapyrusBoneChoiceProjectionIsOwnerPrivate();
  testPendingRollPresentationProjectionIsHiddenSafeAndBackwardCompatible();
}

main();
