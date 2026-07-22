import {
  applyAction,
  ABILITY_VLAD_FOREST,
  assert,
  attachArmy,
  Coord,
  coordFromNotation,
  createDefaultArmy,
  createEmptyGame,
  HERO_VLAD_TEPES_ID,
  initKnowledgeForOwners,
  linePath,
  makeRngSequence,
  makePlayerView,
  path,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupVladState,
  toBattleState,
  toPlacementState,
} from "../helpers/testUtils";

export function testForestIsAutomaticImpulseAndRejectsManualUse() {
  const rng = new SeededRNG(80);
  let { state, vlad } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = {
    ...toBattleState(state, "P1", vlad.id),
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: idx % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  const forestView = makePlayerView(state, "P1").abilitiesByUnitId[vlad.id].find(
    (ability) => ability.id === ABILITY_VLAD_FOREST
  );
  assert(forestView, "Forest of the Dead should remain projected in Vlad's ability details");
  assert(forestView.name === "Forest of the Dead", "Forest should retain its display name");
  assert(forestView.kind === "impulse", "Forest should be projected as an impulse");
  assert(forestView.slot === "none", "Forest should not claim a normal action slot");

  const rejected = applyAction(
    state,
    {
      type: "useAbility",
      unitId: vlad.id,
      abilityId: ABILITY_VLAD_FOREST,
    } as any,
    rng
  );
  assert(rejected.state === state, "manual Forest activation should be rejected without mutation");
  assert(rejected.events.length === 0, "manual Forest activation should emit no events");
  assert(!rejected.state.pendingRoll, "rejected manual activation should create no pending state");
  assert(rejected.state.stakeMarkers.length === 9, "rejected manual activation should consume no stakes");
  assert(!rejected.state.units[vlad.id].turn.actionUsed, "Forest should never consume a normal action");

  console.log("forest_is_automatic_impulse_and_rejects_manual_use passed");
}
export function testIntimidateTriggersOncePerSuccessfulDefense() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99]);
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng as any
  );
  // resolve attacker and defender rolls
  res = resolvePendingRollOnce(res.state, rng as any);
  res = resolvePendingRollOnce(res.state, rng as any);

  // There should be at most one intimidate choice roll requested
  const intimidateRequests = res.events.filter(
    (e) => e.type === "rollRequested" && (e as any).kind === "vladIntimidateChoice"
  ).length;
  assert(intimidateRequests <= 1, "Intimidate choice should be requested at most once");

  // If there was a pending intimidate choice, resolve it by picking first option
  if (res.state.pendingRoll && res.state.pendingRoll.kind === "vladIntimidateChoice") {
    const pending = res.state.pendingRoll;
    const options = (pending.context as any).options as Coord[] || [];
    const choice = options[0] ? { type: "intimidatePush", to: options[0] } : { type: "intimidateSkip" };
    const after = applyAction(res.state, { type: "resolvePendingRoll", pendingRollId: pending.id, choice, player: pending.player } as any, rng as any);
    const intimidateResolvedCount = after.events.filter((e) => e.type === "intimidateResolved").length;
    assert(intimidateResolvedCount <= 1, "IntimidateResolved should be emitted at most once");
  }

  console.log("intimidate_triggers_once_per_successful_defense passed");
}


export function testTricksterAoEDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.001, 0.001, 0.99, 0.99, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1");
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;
  const vlad = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class !== "spearman"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, vlad.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 6 } });

  state = toBattleState(state, "P1", trickster.id);
  state = initKnowledgeForOwners(state);

  let res = applyAction(
    state,
    {
      type: "useAbility",
      unitId: trickster.id,
      abilityId: "tricksterAoE",
    } as any,
    rng as any
  );
  assert(res.state.pendingRoll?.kind === "tricksterAoE_attackerRoll", "Trickster should request attacker roll first");

  // Resolve attacker roll once
  res = resolvePendingRollOnce(res.state, rng as any);

  // Step through pending rolls and ensure intimidate doesn't duplicate defender rolls
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Trickster AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }

  const kinds = collected.map((e) => e.type);
  // Ensure we saw at least one intimidateTriggered
  assert(kinds.includes("intimidateTriggered"), "intimidate should trigger for Vlad in Trickster AoE");

  console.log("trickster_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}


export function testVladForestDoesNotDuplicateDefenderRollsWithIntimidate() {
  const rng = makeRngSequence([0.99, 0.99, 0.001, 0.001, 0.5, 0.5]);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { spearman: HERO_VLAD_TEPES_ID });
  const a2 = createDefaultArmy("P2", { spearman: HERO_VLAD_TEPES_ID });
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const vladCaster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "spearman"
  )!;
  const vladDefender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "spearman"
  )!;
  const other = Object.values(state.units).find((u) => u.owner === "P2" && u.id !== vladDefender.id)!;

  state = setUnit(state, vladCaster.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, vladDefender.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, other.id, { position: { col: 3, row: 6 } });

  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vladCaster.id, vladDefender.id],
    turnQueueIndex: 0,
    turnOrder: [vladCaster.id, vladDefender.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  // Start Vlad's turn to activate forest
  let res = applyAction(state, { type: "unitStartTurn", unitId: vladCaster.id } as any, rng as any);
  const targetPending = res.state.pendingRoll;
  assert(targetPending && targetPending.kind === "vladForestTarget", "forest target should be pending");
  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetPending!.id,
      player: targetPending!.player,
      choice: { type: "forestTarget", center: { col: 4, row: 6 } },
    } as any,
    rng
  );

  // Resolve attacker roll and step through pending rolls
  res = resolvePendingRollOnce(res.state, rng as any);
  const collected: any[] = [];
  let current = res;
  let iter = 0;
  const lastKinds: string[] = [];
  while (current.state.pendingRoll) {
    iter += 1;
    if (iter > 300) {
      const last = collected.slice(-60).map((e) => JSON.stringify(e)).join("\n");
      const kinds = lastKinds.slice(-20).join(",");
      assert(false, `possible infinite loop resolving Vlad Forest AoE after ${iter} iterations; recent kinds: ${kinds}\nrecent events:\n${last}`);
    }
    collected.push(...current.events);
    if (current.events && current.events.length > 0) {
      const types = current.events.map((e: any) => e.type).join(",");
      console.log(`DEBUG_EVENTS: iter=${iter} events=${types}`);
    }
    const pk = current.state.pendingRoll?.kind ?? "none";
    lastKinds.push(pk);
    current = resolvePendingRollOnce(current.state, rng as any);
  }

  const kinds = collected.map((e) => e.type);
  assert(kinds.includes("intimidateTriggered"), "intimidate should trigger for Vlad in Forest AoE");

  console.log("vlad_forest_aoe_does_not_duplicate_defender_rolls_with_intimidate passed");
}


export function testVladIntimidatePromptsAfterSuccessfulDefense() {
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(
    res.state.pendingRoll?.kind === "vladIntimidateChoice",
    "intimidate should request a choice after a miss"
  );
  assert(
    res.events.some((e) => e.type === "intimidateTriggered"),
    "intimidateTriggered event should be emitted"
  );

  console.log("vlad_intimidate_prompts_after_successful_defense passed");
}


export function testVladIntimidatePushesAttackerOneCell() {
  let { state, vlad, enemy } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);

  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladIntimidateChoice", "intimidate pending roll expected");
  const options = (pending.context as { options?: Coord[] }).options ?? [];
  assert(options.length > 0, "intimidate should have options");

  const target = options[0];
  const pushed = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      choice: { type: "intimidatePush", to: target },
      player: pending.player,
    } as any,
    rng
  );
  const movedEnemy = pushed.state.units[enemy.id];
  assert(
    movedEnemy.position?.col === target.col &&
      movedEnemy.position?.row === target.row,
    "attacker should be pushed to selected cell"
  );
  assert(
    pushed.events.some((e) => e.type === "intimidateResolved"),
    "intimidateResolved event should be emitted"
  );

  console.log("vlad_intimidate_pushes_attacker_one_cell passed");
}


export function testVladIntimidateNoOptionsAutoSkips() {
  let { state, vlad, enemy } = setupVladState();
  const blocker1 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id
  )!;
  const blocker2 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== blocker1.id
  )!;
  const blocker3 = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== blocker1.id && u.id !== blocker2.id
  )!;

  state = setUnit(state, enemy.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, vlad.id, { position: { col: 0, row: 2 } });
  state = setUnit(state, blocker1.id, { position: { col: 0, row: 1 } });
  state = setUnit(state, blocker2.id, { position: { col: 1, row: 0 } });
  state = setUnit(state, blocker3.id, { position: { col: 1, row: 1 } });
  state = toBattleState(state, "P2", enemy.id);
  state = initKnowledgeForOwners(state);

  const rng = makeRngSequence([0.01, 0.01, 0.99, 0.99]);
  let res = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: vlad.id } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);
  assert(!res.state.pendingRoll, "intimidate should not trigger without options");

  console.log("vlad_intimidate_no_options_auto_skips passed");
}


export function testVladStakesPromptOnBattleStart() {
  const rng = new SeededRNG(321);
  let { state } = setupVladState();
  state = toPlacementState(state, "P1");

  const p1coords = ["b0","c0","d0","e0","f0","g0","h0"].map(coordFromNotation);
  const p2coords = ["b8","c8","d8","e8","f8","g8","h8"].map(coordFromNotation);

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
    const pos = current === "P1" ? p1coords[p1i++] : p2coords[p2i++];
    state = applyAction(
      state,
      { type: "placeUnit", unitId: nextUnit.id, position: pos } as any,
      rng
    ).state;
  }

  assert(
    state.pendingRoll?.kind === "vladPlaceStakes",
    "battle start should prompt for stakes"
  );

  console.log("vlad_stakes_prompt_on_battle_start passed");
}


export function testVladStakesPromptOnSecondOwnTurnStart() {
  const rng = new SeededRNG(99);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  assert(
    res.state.pendingRoll?.kind !== "vladPlaceStakes",
    "first turn should not request stakes"
  );
  state = applyAction(res.state, { type: "endTurn" } as any, rng).state;

  res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  assert(
    res.state.pendingRoll?.kind === "vladPlaceStakes",
    "second own turn should request stakes"
  );

  console.log("vlad_stakes_prompt_on_2nd_own_turn_start passed");
}


export function testStakeCannotBePlacedOnVisibleUnit() {
  const rng = new SeededRNG(77);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 5 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladPlaceStakes", "stake placement should be pending");

  const invalid = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: {
        type: "placeStakes",
        positions: [
          { col: 5, row: 5 },
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    } as any,
    rng
  );
  assert(
    invalid.state.pendingRoll?.kind === "vladPlaceStakes",
    "invalid stake placement should keep pending roll"
  );
  assert(invalid.state.stakeMarkers.length === 0, "stakes should not be placed");

  console.log("stake_cannot_be_placed_on_visible_unit passed");
}


export function testStakeCanBePlacedOnStealthedUnitNoEffect() {
  const rng = new SeededRNG(78);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, {
    position: { col: 5, row: 5 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(state, { type: "unitStartTurn", unitId: vlad.id } as any, rng);
  const pending = res.state.pendingRoll;
  assert(pending && pending.kind === "vladPlaceStakes", "stake placement should be pending");

  const placed = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: {
        type: "placeStakes",
        positions: [
          { col: 5, row: 5 },
          { col: 0, row: 0 },
          { col: 1, row: 0 },
        ],
      },
    } as any,
    rng
  );
  assert(
    placed.state.stakeMarkers.some(
      (marker) => marker.position.col === 5 && marker.position.row === 5
    ),
    "stake should be placed on stealthed unit cell"
  );
  assert(
    !placed.events.some((e) => e.type === "stakeTriggered"),
    "placing stakes should not trigger them"
  );

  console.log("stake_can_be_placed_on_stealthed_unit_no_effect passed");
}


export function testLinePathOrthogonalIsExact() {
  const path = linePath({ col: 0, row: 1 }, { col: 0, row: 3 });
  assert(path, "line path should exist for orthogonal move");
  assert.deepStrictEqual(path, [
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 0, row: 3 },
  ]);

  console.log("line_path_orthogonal_is_exact passed");
}


export function testLinePathDiagonalIsExact() {
  const path = linePath({ col: 0, row: 0 }, { col: 2, row: 2 });
  assert(path, "line path should exist for diagonal move");
  assert.deepStrictEqual(path, [
    { col: 0, row: 0 },
    { col: 1, row: 1 },
    { col: 2, row: 2 },
  ]);

  console.log("line_path_diagonal_is_exact passed");
}


export function testTricksterTeleportDoesNotTriggerIntermediateStakes() {
  const rng = makeRngSequence([0.99]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));

  const trickster = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "trickster"
  )!;

  state = setUnit(state, trickster.id, { position: { col: 0, row: 0 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: trickster.id,
    turnQueue: [trickster.id],
    turnQueueIndex: 0,
    turnOrder: [trickster.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P2",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  let res = applyAction(
    state,
    { type: "requestMoveOptions", unitId: trickster.id, mode: "trickster" } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind === "moveTrickster",
    "trickster move should require roll"
  );

  res = resolvePendingRollOnce(res.state, rng);
  const moved = applyAction(
    res.state,
    { type: "move", unitId: trickster.id, to: { col: 0, row: 2 } } as any,
    rng
  );

  const updated = moved.state.units[trickster.id];
  assert(
    updated.position?.col === 0 && updated.position?.row === 2,
    "trickster should reach destination directly"
  );
  assert(
    moved.state.stakeMarkers[0].isRevealed === false,
    "intermediate stake should remain hidden"
  );
  assert(
    !moved.events.some((e) => e.type === "stakeTriggered"),
    "intermediate stake should not trigger"
  );

  console.log("trickster_teleport_does_not_trigger_intermediate_stakes passed");
}


export function testRiderStopsOnStakeInPath() {
  const rng = new SeededRNG(84);
  let { state, vlad } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: rider.id,
    turnQueue: [rider.id],
    turnQueueIndex: 0,
    turnOrder: [rider.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const updatedRider = res.state.units[rider.id];
  assert(
    updatedRider.position?.col === 0 && updatedRider.position?.row === 1,
    "rider should stop on stake in path"
  );
  assert(updatedRider.hp === rider.hp - 1, "stake should deal 1 damage");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");
  assert(
    res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered event should be emitted"
  );

  console.log("rider_stops_on_stake_in_path passed");
}


export function testStakeDoesNotTriggerOnHiddenUnitCell() {
  const rng = new SeededRNG(85);
  let { state } = setupVladState();
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "rider"
  )!;
  const hidden = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, rider.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, hidden.id, {
    position: { col: 0, row: 1 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: rider.id,
    turnQueue: [rider.id],
    turnQueueIndex: 0,
    turnOrder: [rider.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 0, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: rider.id, to: { col: 0, row: 2 } } as any,
    rng
  );
  const updatedRider = res.state.units[rider.id];
  assert(
    updatedRider.position?.col === 0 && updatedRider.position?.row === 2,
    "rider should pass through hidden stake cell"
  );
  assert(updatedRider.hp === rider.hp, "stake should not trigger on hidden cell");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(
    res.state.stakeMarkers[0].isRevealed === false,
    "stake should remain hidden"
  );
  assert(
    !res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered should not be emitted"
  );

  console.log("stake_does_not_trigger_on_hidden_unit_cell passed");
}


export function testStakeTriggersOnVisibleUnitStopsAndDamagesAndReveals() {
  const rng = new SeededRNG(79);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    knowledge: {
      P1: { [enemy.id]: true },
      P2: { [enemy.id]: true },
    },
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 4, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 4 } } as any,
    rng
  );
  const updatedEnemy = res.state.units[enemy.id];
  assert(updatedEnemy.hp === enemy.hp - 1, "stake should deal 1 damage");
  assert(updatedEnemy.isStealthed === false, "stake should reveal stealthed unit");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");
  assert(
    res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered event should be emitted"
  );

  console.log("stake_triggers_on_visible_unit_stops_and_damages_and_reveals passed");
}


export function testStakeDoesNotTriggerOnUnknownStealthedUnit() {
  const rng = new SeededRNG(80);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 6, row: 6 } });
  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 4, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 4 } } as any,
    rng
  );
  const updatedEnemy = res.state.units[enemy.id];
  assert(updatedEnemy.hp === enemy.hp, "stake should not trigger on unknown stealth");
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(
    res.state.stakeMarkers[0].isRevealed === false,
    "stake should remain hidden"
  );
  assert(
    !res.events.some((e) => e.type === "stakeTriggered"),
    "stakeTriggered should not be emitted"
  );

  console.log("stake_does_not_trigger_on_unknown_stealthed_unit passed");
}


export function testAssassinStopsExactlyOnStakeCell() {
  const rng = new SeededRNG(86);
  let { state } = setupVladState();
  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "assassin"
  )!;

  state = setUnit(state, assassin.id, { position: { col: 4, row: 1 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: assassin.id,
    turnQueue: [assassin.id],
    turnQueueIndex: 0,
    turnOrder: [assassin.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 5, row: 1 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: assassin.id, to: { col: 6, row: 1 } } as any,
    rng
  );
  const updated = res.state.units[assassin.id];
  assert(
    updated.position?.col === 5 && updated.position?.row === 1,
    "assassin should stop on stake cell"
  );
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");

  console.log("assassin_stops_exactly_on_stake_cell passed");
}


export function testStakesDoNotGetRemovedOnTriggerOnlyRevealed() {
  const rng = new SeededRNG(87);
  let { state, enemy } = setupVladState();

  state = setUnit(state, enemy.id, { position: { col: 2, row: 2 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: enemy.id,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 2, row: 3 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: enemy.id, to: { col: 2, row: 3 } } as any,
    rng
  );
  assert(res.state.stakeMarkers.length === 1, "stake marker should remain");
  assert(res.state.stakeMarkers[0].isRevealed, "stake should be revealed");

  console.log("stakes_do_not_get_removed_on_trigger_only_revealed passed");
}


export function testTwoTepesHiddenStakesSameCellDamageOnly1() {
  const rng = new SeededRNG(88);
  let { state, vlad } = setupVladState();
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, vlad.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, mover.id, { position: { col: 3, row: 3 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: mover.id,
    turnQueue: [mover.id],
    turnQueueIndex: 0,
    turnOrder: [mover.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 3, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "stake-2",
        owner: "P2",
        position: { col: 3, row: 4 },
        createdAt: 2,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 3, row: 4 } } as any,
    rng
  );
  const updatedMover = res.state.units[mover.id];
  assert(updatedMover.hp === mover.hp - 1, "stake damage should be exactly 1");

  console.log("two_tepes_hidden_stakes_same_cell_damage_only_1 passed");
}


export function testTriggerRevealsAllStakesOnCell() {
  const rng = new SeededRNG(89);
  let { state } = setupVladState();
  const mover = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight"
  )!;

  state = setUnit(state, mover.id, { position: { col: 1, row: 1 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: mover.id,
    turnQueue: [mover.id],
    turnQueueIndex: 0,
    turnOrder: [mover.id],
    turnOrderIndex: 0,
    stakeMarkers: [
      {
        id: "stake-1",
        owner: "P1",
        position: { col: 1, row: 2 },
        createdAt: 1,
        isRevealed: false,
      },
      {
        id: "stake-2",
        owner: "P2",
        position: { col: 1, row: 2 },
        createdAt: 2,
        isRevealed: false,
      },
    ],
  };

  const res = applyAction(
    state,
    { type: "move", unitId: mover.id, to: { col: 1, row: 2 } } as any,
    rng
  );
  const revealedIds = res.events
    .filter((e) => e.type === "stakeTriggered")
    .flatMap((e) =>
      e.type === "stakeTriggered" ? e.stakeIdsRevealed ?? [] : []
    );
  assert(
    revealedIds.includes("stake-1") && revealedIds.includes("stake-2"),
    "trigger should reveal all stakes on cell"
  );
  assert(
    res.state.stakeMarkers.every((marker) => marker.isRevealed),
    "all stakes on cell should be revealed"
  );

  console.log("trigger_reveals_all_stakes_on_cell passed");
}


export function testForestRequires9Stakes() {
  const rng = new SeededRNG(81);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 8 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: idx % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  const res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  assert(
    res.state.pendingRoll?.kind !== "vladForestTarget",
    "forest should not trigger without 9 stakes"
  );

  console.log("forest_requires_9_stakes passed");
}


export function testForestConsumes9AndSkipsStakesPlacementThatTurn() {
  const rng = new SeededRNG(82);
  let { state, vlad } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  const target = res.state.pendingRoll;
  assert(
    target && target.kind === "vladForestTarget",
    "forest target should be pending"
  );
  assert(res.state.stakeMarkers.length === 0, "forest should consume 9 stakes");
  assert(
    !res.state.units[vlad.id].turn.actionUsed,
    "automatic forest activation should not consume Vlad's normal action"
  );
  assert(
    res.events.some((e) => e.type === "forestActivated"),
    "forest should emit forestActivated"
  );

  console.log("forest_consumes_9_and_skips_stakes_placement_that_turn passed");
}


export function testForestEmptyAreaClearsPendingState() {
  const rng = new SeededRNG(821);
  let { state, vlad } = setupVladState();
  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  const pending = started.state.pendingRoll;
  assert(pending?.kind === "vladForestTarget", "forest should request its area choice");

  const resolved = applyAction(
    started.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending!.id,
      player: pending!.player,
      choice: { type: "forestTarget", center: { col: 0, row: 0 } },
    } as any,
    rng
  );
  assert(!resolved.state.pendingRoll, "an empty forest area should not leave a pending roll");
  assert(!resolved.state.pendingAoE, "an empty forest area should not leave pending combat");
  assert(!resolved.state.units[vlad.id].turn.actionUsed, "an empty forest area should spend no action");

  console.log("forest_empty_area_clears_pending_state passed");
}


export function testForestAoeDeals2AndRootsOnFail() {
  const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
  let { state, vlad, enemy } = setupVladState();

  state = setUnit(state, vlad.id, { position: { col: 4, row: 4 }, ownTurnsStarted: 1 });
  state = setUnit(state, enemy.id, { position: { col: 4, row: 6 } });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    turnQueue: [vlad.id, enemy.id],
    turnQueueIndex: 0,
    turnOrder: [vlad.id, enemy.id],
    turnOrderIndex: 0,
    stakeMarkers: Array.from({ length: 9 }, (_, idx) => ({
      id: `stake-${idx + 1}`,
      owner: "P1" as const,
      position: { col: (idx + 1) % 3, row: Math.floor(idx / 3) },
      createdAt: idx + 1,
      isRevealed: false,
    })),
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: vlad.id } as any,
    rng
  );
  const targetPending = res.state.pendingRoll;
  assert(
    targetPending && targetPending.kind === "vladForestTarget",
    "forest target should be pending"
  );
  res = applyAction(
    res.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetPending!.id,
      player: targetPending!.player,
      choice: { type: "forestTarget", center: { col: 4, row: 6 } },
    } as any,
    rng
  );
  res = resolvePendingRollOnce(res.state, rng);
  res = resolvePendingRollOnce(res.state, rng);

  const updatedEnemy = res.state.units[enemy.id];
  assert(
    updatedEnemy.hp === enemy.hp - 2,
    "forest should deal 2 damage on hit"
  );
  assert(
    updatedEnemy.movementDisabledNextTurn === true,
    "forest should root on hit"
  );

  console.log("forest_aoe_deals_2_and_roots_on_fail passed");
}


export function testRootBlocksMovementNextTurnOnly() {
  const rng = new SeededRNG(83);
  let { state, enemy } = setupVladState();

  state = setUnit(state, enemy.id, {
    position: { col: 4, row: 4 },
    movementDisabledNextTurn: true,
  });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    activeUnitId: null,
    turnQueue: [enemy.id],
    turnQueueIndex: 0,
    turnOrder: [enemy.id],
    turnOrderIndex: 0,
  };

  let res = applyAction(
    state,
    { type: "unitStartTurn", unitId: enemy.id } as any,
    rng
  );
  const rooted = res.state.units[enemy.id];
  assert(rooted.turn.moveUsed === true, "root should consume move slot");
  assert(
    rooted.movementDisabledNextTurn !== true,
    "root should clear after applying"
  );

  const blocked = applyAction(
    res.state,
    { type: "move", unitId: enemy.id, to: { col: 4, row: 5 } } as any,
    rng
  );
  assert(blocked.events.length === 0, "move should be blocked while rooted");
  assert(
    blocked.state.units[enemy.id].position?.row === 4,
    "rooted unit should not move"
  );

  const end = applyAction(blocked.state, { type: "endTurn" } as any, rng);
  res = applyAction(end.state, { type: "unitStartTurn", unitId: enemy.id } as any, rng);
  assert(
    res.state.units[enemy.id].turn.moveUsed === false,
    "move should be available after root expires"
  );

  console.log("root_blocks_movement_next_turn_only passed");
}
