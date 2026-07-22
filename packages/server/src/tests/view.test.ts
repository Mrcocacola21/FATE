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
  ABILITY_LUCHE_SUN_GLORY,
  ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  ABILITY_DUOLINGO_SKIP_CLASSES,
  initUnitAbilities,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
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

function setUnit(
  state: GameState,
  unitId: string,
  patch: Partial<UnitState>
): GameState {
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
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  );
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
  assert(
    !view.units[enemy!.id],
    "stealthed unknown enemy should be omitted from view"
  );
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position"
  );

  console.log("view_hidden_enemy_omitted passed");
}

function testKnownStealthedEnemyUsesLastKnown() {
  let state = setupState();
  const enemy = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  );
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
  assert(
    !view.units[enemy!.id],
    "stealthed enemy should be hidden even if previously known"
  );
  assert(
    view.lastKnownPositions[enemy!.id] &&
      view.lastKnownPositions[enemy!.id].col === 4 &&
      view.lastKnownPositions[enemy!.id].row === 4,
    "lastKnownPositions should include hidden enemy position"
  );

  console.log("view_known_stealthed_enemy_uses_last_known passed");
}

function testChikatiloTrackedHiddenTargetProjectionIsPrivate() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  );
  const target = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  );
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
    "owner projection should expose legal attack targetability"
  );

  const opponentView = makePlayerView(state, "P2");
  assert.equal(
    opponentView.units[target.id].chikatiloMarkStatus,
    undefined,
    "opponent should not receive chikatilo private mark metadata"
  );
  assert.equal(
    opponentView.units[chikatilo.id]?.chikatiloMarkedTargets,
    undefined,
    "opponent should not receive chikatilo private marked target list"
  );
  assert.equal(
    opponentView.units[chikatilo.id]?.chikatiloTrackedTargets,
    undefined,
    "opponent should not receive chikatilo private tracked target list"
  );

  const spectatorView = makeSpectatorView(state);
  assert.equal(
    spectatorView.units[target.id],
    undefined,
    "spectator should not see the tracked hidden target"
  );
  assert.equal(
    spectatorView.units[chikatilo.id]?.chikatiloMarkedTargets,
    undefined,
    "spectator should not receive chikatilo private marked target list"
  );

  console.log("view_chikatilo_tracked_hidden_target_private passed");
}

function testChikatiloMarkEventProjectionRedactsPrivateTarget() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { assassin: HERO_CHIKATILO_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const chikatilo = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_CHIKATILO_ID
  );
  const target = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  );
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
    (ownerEvents.find((event) => event.type === "chikatiloMarkApplied") as any)
      ?.targetId,
    target.id,
    "owner should receive full mark target identity"
  );
  assert(
    opponentEvents.some(
      (event) => event.type === "abilityUsed" && !("unitId" in event)
    ),
    "hidden chikatilo ability use should be redacted for opponent"
  );
  assert(
    opponentEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && !("targetId" in event)
    ),
    "opponent should not receive private mark target identity"
  );
  assert(
    spectatorEvents.some(
      (event) => event.type === "chikatiloMarkApplied" && !("targetId" in event)
    ),
    "spectator should not receive private mark target identity"
  );

  console.log("view_chikatilo_mark_event_projection_redacts_private_target passed");
}

function testGroupedSemanticEventProjectionFiltersHiddenTargets() {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { trickster: HERO_LOKI_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const loki = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.heroId === HERO_LOKI_ID
  );
  const visibleTarget = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight"
  );
  const hiddenTarget = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
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

  const ownerEvent = ownerEvents.find(
    (item) => item.type === "lokiChickenGroupApplied"
  ) as Extract<GameEvent, { type: "lokiChickenGroupApplied" }> | undefined;
  const opponentEvent = opponentEvents.find(
    (item) => item.type === "lokiChickenGroupApplied"
  ) as Extract<GameEvent, { type: "lokiChickenGroupApplied" }> | undefined;
  const spectatorEvent = spectatorEvents.find(
    (item) => item.type === "lokiChickenGroupApplied"
  ) as Extract<GameEvent, { type: "lokiChickenGroupApplied" }> | undefined;

  assert.deepEqual(
    ownerEvent?.targetIds,
    [visibleTarget.id],
    "owner should not receive unknown hidden target ids in grouped events"
  );
  assert(
    opponentEvent?.targetIds.includes(hiddenTarget.id),
    "target owner should still receive their own hidden target in grouped events"
  );
  assert.deepEqual(
    spectatorEvent?.targetIds,
    [visibleTarget.id],
    "spectator should not receive hidden target ids in grouped events"
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
      { sourceUnitId: jack.id, owner: "P1", position: { col: 2, row: 3 }, isRevealed: false },
    ],
  };
  assert.deepEqual(makePlayerView(state, "P1").jackTraps?.map((trap) => trap.position), [{ col: 2, row: 3 }]);
  assert.deepEqual(makePlayerView(state, "P2").jackTraps, []);
  assert.deepEqual(makeSpectatorView(state).jackTraps, []);
  const revealed = {
    ...state,
    jackTraps: state.jackTraps?.map((trap) => ({ ...trap, isRevealed: true })),
  };
  assert.deepEqual(makePlayerView(revealed, "P2").jackTraps?.map((trap) => trap.position), [{ col: 2, row: 3 }]);
  console.log("view_jack_trap_owner_private_until_triggered passed");
}

function testRiderMovementProjectionDoesNotLeakHiddenTarget() {
  let state = setupState();
  const rider = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const hidden = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
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
    "rider movement event projection should not mention the hidden target"
  );

  console.log("view_rider_movement_projection_does_not_leak_hidden_target passed");
}

function testNewBatchAbilitySourceProjection() {
  let state = setupState();
  const zoroBase = Object.values(state.units).find((unit) => unit.owner === "P1" && unit.class === "knight")!;
  const lucheBase = Object.values(state.units).find((unit) => unit.owner === "P1" && unit.class === "spearman")!;
  const duoBase = Object.values(state.units).find((unit) => unit.owner === "P1" && unit.class === "trickster")!;
  const enemy = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  const zoro = initUnitAbilities({ ...zoroBase, heroId: HERO_ZORO_ID, position: { col: 1, row: 1 } });
  const luche = initUnitAbilities({ ...lucheBase, heroId: HERO_LUCHE_ID, position: { col: 1, row: 3 } });
  const duo = initUnitAbilities({ ...duoBase, heroId: HERO_DUOLINGO_ID, position: { col: 1, row: 5 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: zoro.id,
    units: {
      ...state.units,
      [zoro.id]: { ...zoro, charges: { ...zoro.charges, [ABILITY_ZORO_ONI_GIRI]: 2, [ABILITY_ZORO_DETERMINATION]: 2 } },
      [luche.id]: { ...luche, charges: { ...luche.charges, [ABILITY_LUCHE_DIVINE_RAY]: 2, [ABILITY_LUCHE_SUN_GLORY]: 2 } },
      [duo.id]: { ...duo, charges: { ...duo.charges, [ABILITY_DUOLINGO_PUSH_NOTIFICATION]: 3, [ABILITY_DUOLINGO_SKIP_CLASSES]: 3 } },
      [enemy.id]: { ...enemy, position: { col: 3, row: 1 } },
    },
  };
  const view = makePlayerView(state, "P1");
  const oni = view.abilitiesByUnitId[zoro.id].find((ability) => ability.id === ABILITY_ZORO_ONI_GIRI)!;
  const light = view.abilitiesByUnitId[luche.id].find((ability) => ability.id === ABILITY_LUCHE_DIVINE_RAY)!;
  const push = view.abilitiesByUnitId[duo.id].find((ability) => ability.id === ABILITY_DUOLINGO_PUSH_NOTIFICATION)!;
  assert.deepEqual(oni.useOptions?.map((option) => option.source.type), ["abilityCounter", "heroResource"]);
  assert(oni.targeting?.targetIds?.includes(enemy.id), "Oni Giri projection should include an authoritative legal target");
  assert.deepEqual(light.useOptions?.map((option) => option.source.type), ["heroResource"]);
  assert(light.useOptions?.[0].source.type === "heroResource" && light.useOptions[0].source.resourceId === ABILITY_LUCHE_SUN_GLORY);
  assert((light.targeting?.cells?.length ?? 0) > 0, "Light Ray projection should include authoritative line cells");
  assert.deepEqual(push.useOptions?.map((option) => option.source.type), ["abilityCounter", "heroResource"]);
  assert(push.useOptions?.[0].source.type === "abilityCounter" && push.useOptions[0].source.counterId === ABILITY_DUOLINGO_PUSH_NOTIFICATION);
  assert(push.useOptions?.[1].source.type === "heroResource" && push.useOptions[1].source.resourceId === ABILITY_DUOLINGO_SKIP_CLASSES);
  assert(view.units[duo.id].charges[ABILITY_DUOLINGO_PUSH_NOTIFICATION] === 3, "Push Notification counter should project separately");
  assert(view.units[duo.id].charges[ABILITY_DUOLINGO_SKIP_CLASSES] === 3, "Missed Lessons should project separately");
  assert(oni.useOptions?.every((option) => option.consumes?.action && option.consumes?.move), "both Oni Giri sources should consume Action and Movement");
  assert(push.useOptions?.every((option) => option.consumes?.move), "both Push Notification sources should consume Movement");
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
  assert.equal(ownerView.units[don.id]?.position?.col, 4, "the pending source must remain projectable");
  assert.equal(opponentView.pendingRoll, null, "the opponent should receive only public waiting metadata");
  console.log("view_don_madness_direction_projection_is_owner_private_and_valid passed");
}

function main() {
  testHiddenEnemyOmitted();
  testKnownStealthedEnemyUsesLastKnown();
  testChikatiloTrackedHiddenTargetProjectionIsPrivate();
  testChikatiloMarkEventProjectionRedactsPrivateTarget();
  testGroupedSemanticEventProjectionFiltersHiddenTargets();
  testJackKnownHpProjectionIsOwnerPrivate();
  testJackTrapProjectionIsOwnerPrivateUntilTriggered();
  testRiderMovementProjectionDoesNotLeakHiddenTarget();
  testNewBatchAbilitySourceProjection();
  testDonMadnessDirectionProjectionIsOwnerPrivateAndValid();
}

main();
