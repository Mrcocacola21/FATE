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
  makePlayerView,
  makeAttackWinRng,
  coordKeys,
  resolvePendingWithChoice,
  resolveAllPendingRollsWithEvents,
  SeededRNG,
  setUnit,
  setupGroznyTyrantState,
  toBattleState,
} from "../helpers/testUtils";

function chooseGroznyOption(
  state: ReturnType<typeof toBattleState>,
  mode: "normal" | "invadeTime",
  rng: any
) {
  assert(
    state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "expected Grozny Tyrant option choice"
  );
  return resolvePendingWithChoice(
    state,
    { type: "groznyTyrantOption", mode },
    rng
  );
}

function chooseGroznyAllyIfNeeded(
  state: ReturnType<typeof toBattleState>,
  targetId: string,
  rng: any
) {
  if (state.pendingRoll?.kind !== "groznyTyrantAllyChoice") {
    return { state, events: [] as GameEvent[] };
  }
  return resolvePendingWithChoice(
    state,
    { type: "groznyTyrantAlly", targetId },
    rng
  );
}

function chooseGroznyModeAndAlly(
  state: ReturnType<typeof toBattleState>,
  mode: "normal" | "invadeTime",
  targetId: string,
  rng: any
) {
  const modeChosen = chooseGroznyOption(state, mode, rng);
  const allyChosen = chooseGroznyAllyIfNeeded(modeChosen.state, targetId, rng);
  return {
    state: allyChosen.state,
    events: [...modeChosen.events, ...allyChosen.events],
  };
}
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
    "tyrant should request a start-turn option choice when eligible"
  );
  assert(
    startTrigger.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "tyrant should let the player choose how to resolve the flow"
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


export function testGroznyTyrantPromptsForAttackCellAndSkipsWithoutSpending() {
  const rng = new SeededRNG(742);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 0, row: 0 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    started.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "tyrant should prompt for a mode before showing attack cells"
  );
  const modeContext = started.state.pendingRoll.context as {
    allowSkip?: boolean;
    options?: ("normal" | "invadeTime")[];
  };
  assert(modeContext.allowSkip === true, "initial tyrant prompt should allow skip");
  assert(
    (modeContext.options ?? []).includes("invadeTime"),
    "combined tyrant + invade time option should be offered when legal"
  );
  assert(
    !(modeContext.options ?? []).includes("normal"),
    "normal tyrant option should be omitted when normal movement cannot reach an attack origin"
  );

  const afterMode = chooseGroznyModeAndAlly(
    started.state,
    "invadeTime",
    ally.id,
    rng
  );
  assert(
    afterMode.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "choosing invade time should expose attack-origin cells"
  );
  const context = afterMode.state.pendingRoll.context as {
    allowSkip?: boolean;
    mode?: "normal" | "invadeTime";
    targetId?: string;
    options?: {
      targetId: string;
      mode: "normal" | "invadeTime";
      position: { col: number; row: number };
    }[];
  };
  assert(context.allowSkip === true, "attack-cell prompt should keep skip legal");
  assert(context.mode === "invadeTime", "attack-cell prompt should keep selected mode");
  assert(context.targetId === ally.id, "attack-cell prompt should keep selected ally");
  const invadeOptions = (context.options ?? []).filter(
    (option) => option.targetId === ally.id && option.mode === "invadeTime"
  );
  const expectedCells = [
    { col: 3, row: 3 },
    { col: 3, row: 4 },
    { col: 3, row: 5 },
    { col: 4, row: 3 },
    { col: 4, row: 5 },
    { col: 5, row: 3 },
    { col: 5, row: 4 },
    { col: 5, row: 5 },
  ];
  const optionKeys = coordKeys(invadeOptions.map((option) => option.position));
  for (const key of coordKeys(expectedCells)) {
    assert(
      optionKeys.includes(key),
      `tyrant + invade time should include attack cell ${key}`
    );
  }
  assert(
    started.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 3,
    "opening tyrant prompt should not spend invade time charges"
  );
  assert(
    started.state.units[grozny.id].turn.moveUsed === false,
    "opening tyrant prompt should not spend the move slot"
  );

  const skipped = resolvePendingWithChoice(started.state, "skip", rng);
  assert(!skipped.state.pendingRoll, "skip should clear tyrant choice");
  assert(
    skipped.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 3,
    "skipping tyrant should not spend invade time charges"
  );
  assert(
    skipped.state.units[grozny.id].turn.moveUsed === false,
    "skipping tyrant should not spend the move slot"
  );
  assert(
    skipped.state.units[grozny.id].position?.col === 0 &&
      skipped.state.units[grozny.id].position?.row === 0,
    "skipping tyrant should not move Grozny"
  );

  console.log(
    "grozny_tyrant_prompts_for_attack_cell_and_skips_without_spending passed"
  );
}


export function testGroznyTyrantInvadeTimeOptionSpendsOnlyAfterCellChoice() {
  const rng = makeAttackWinRng(1);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 0, row: 0 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  assert(
    started.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "tyrant should prompt for mode before spending invade time"
  );
  const afterMode = chooseGroznyModeAndAlly(
    started.state,
    "invadeTime",
    ally.id,
    rng
  );
  assert(
    afterMode.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "tyrant should prompt for attack-origin cell after selecting mode"
  );
  assert(
    afterMode.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 3,
    "selecting invade time mode should not spend charges"
  );
  assert(
    afterMode.state.units[grozny.id].turn.moveUsed === false,
    "selecting invade time mode should not spend the move slot"
  );

  const choice = {
    type: "groznyTyrantAttackCell" as const,
    mode: "invadeTime" as const,
    targetId: ally.id,
    position: { col: 5, row: 5 },
  };
  const chosen = resolvePendingWithChoice(afterMode.state, choice, rng);

  assert(
    chosen.state.pendingRoll?.kind === "attack_attackerRoll",
    "chosen tyrant cell should start the attack roll"
  );
  assert(
    chosen.state.units[grozny.id].position?.col === 5 &&
      chosen.state.units[grozny.id].position?.row === 5,
    "Grozny should move to the selected attack cell"
  );
  assert(
    chosen.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 0,
    "confirmed invade time tyrant cell should spend charges"
  );
  assert(
    chosen.state.units[grozny.id].turn.moveUsed === true,
    "confirmed invade time tyrant cell should spend the move slot"
  );
  assert(
    chosen.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.abilityId === ABILITY_GROZNY_INVADE_TIME
    ),
    "confirmed tyrant + invade time should log invade time use"
  );
  assert(
    chosen.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.abilityId === "groznyTyrant"
    ),
    "confirmed tyrant + invade time should log tyrant use"
  );

  const resolved = resolveAllPendingRollsWithEvents(chosen.state, rng);
  const attackEvent = resolved.events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === grozny.id &&
      event.defenderId === ally.id
  ) as Extract<GameEvent, { type: "attackResolved" }> | undefined;
  assert(attackEvent, "chosen tyrant cell should resolve the ally attack");
  assert(!resolved.state.units[ally.id].isAlive, "chosen tyrant attack should kill ally");

  console.log(
    "grozny_tyrant_invade_time_option_spends_only_after_cell_choice passed"
  );
}


export function testGroznyTyrantOmitsInvadeTimeWhenUnavailableButKeepsNormal() {
  const rng = new SeededRNG(743);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 0,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    started.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "tyrant should still prompt when normal mode is legal"
  );
  const context = started.state.pendingRoll.context as {
    options?: ("normal" | "invadeTime")[];
  };
  assert.deepEqual(
    context.options,
    ["normal"],
    "invade time option should be omitted when charges are unavailable"
  );

  const normal = chooseGroznyModeAndAlly(started.state, "normal", ally.id, rng);
  assert(
    normal.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "normal tyrant should proceed to attack-cell choice"
  );
  assert(
    (normal.state.pendingRoll.context as { mode?: string }).mode === "normal",
    "normal tyrant attack-cell choice should preserve selected mode"
  );

  console.log(
    "grozny_tyrant_omits_invade_time_when_unavailable_but_keeps_normal passed"
  );
}


export function testGroznyTyrantOffersNormalAndInvadeTimeWhenBothLegal() {
  const rng = new SeededRNG(746);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  assert(
    started.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "tyrant should prompt when both normal and invade time modes are legal"
  );
  const context = started.state.pendingRoll.context as {
    options?: ("normal" | "invadeTime")[];
  };
  assert.deepEqual(
    context.options,
    ["normal", "invadeTime"],
    "prompt should expose normal and invade time only when both are independently legal"
  );

  const normal = chooseGroznyModeAndAlly(started.state, "normal", ally.id, rng);
  assert(
    normal.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "normal mode should proceed to attack-origin selection"
  );
  assert(
    (normal.state.pendingRoll.context as { mode?: string }).mode === "normal",
    "normal mode should be preserved in the attack-origin context"
  );
  assert(
    normal.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 3,
    "choosing normal mode should not spend invade time charges"
  );

  console.log(
    "grozny_tyrant_offers_normal_and_invade_time_when_both_legal passed"
  );
}


export function testGroznyTyrantRequiresAllyChoiceWhenMultipleQualify() {
  const rng = new SeededRNG(744);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 0,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = setUnit(state, commander.id, { position: { col: 7, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  const afterMode = chooseGroznyOption(started.state, "normal", rng);

  assert(
    afterMode.state.pendingRoll?.kind === "groznyTyrantAllyChoice",
    "multiple legal allies should require an ally choice"
  );
  const allyContext = afterMode.state.pendingRoll.context as { options?: string[] };
  assert(
    (allyContext.options ?? []).includes(ally.id) &&
      (allyContext.options ?? []).includes(commander.id),
    "ally choice should include every finishable ally"
  );

  const afterAlly = resolvePendingWithChoice(
    afterMode.state,
    { type: "groznyTyrantAlly", targetId: commander.id },
    rng
  );
  assert(
    afterAlly.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "chosen ally should advance to attack-cell choice"
  );
  assert(
    (afterAlly.state.pendingRoll.context as { targetId?: string }).targetId ===
      commander.id,
    "attack-cell choice should preserve the selected ally"
  );

  console.log("grozny_tyrant_requires_ally_choice_when_multiple_qualify passed");
}


export function testGroznyTyrantRejectsInvalidOriginWithoutSpending() {
  const rng = makeAttackWinRng(1);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 0, row: 0 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  const afterMode = chooseGroznyModeAndAlly(
    started.state,
    "invadeTime",
    ally.id,
    rng
  );
  const pendingId = afterMode.state.pendingRoll?.id;

  const invalid = resolvePendingWithChoice(
    afterMode.state,
    {
      type: "groznyTyrantAttackCell",
      mode: "invadeTime",
      targetId: ally.id,
      position: { col: 0, row: 1 },
    },
    rng
  );

  assert(
    invalid.state.pendingRoll?.id === pendingId,
    "invalid origin should leave the pending choice unresolved"
  );
  assert.equal(invalid.events.length, 0, "invalid origin should emit no events");
  assert(
    invalid.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 3,
    "invalid origin should not spend invade time charges"
  );
  assert(
    invalid.state.units[grozny.id].turn.moveUsed === false,
    "invalid origin should not spend the move slot"
  );

  console.log("grozny_tyrant_rejects_invalid_origin_without_spending passed");
}


export function testGroznyTyrantDuplicateOriginResolutionDoesNotRepeatEffects() {
  const rng = makeAttackWinRng(1);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 0, row: 0 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );
  const afterMode = chooseGroznyModeAndAlly(
    started.state,
    "invadeTime",
    ally.id,
    rng
  );
  const pendingId = afterMode.state.pendingRoll!.id;
  const choice = {
    type: "groznyTyrantAttackCell" as const,
    mode: "invadeTime" as const,
    targetId: ally.id,
    position: { col: 5, row: 5 },
  };
  const chosen = resolvePendingWithChoice(afterMode.state, choice, rng);
  const duplicate = applyAction(
    chosen.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingId,
      player: "P1",
      choice,
    } as any,
    rng
  );

  assert.equal(duplicate.events.length, 0, "stale duplicate resolution should emit no events");
  assert(
    duplicate.state.units[grozny.id].charges[ABILITY_GROZNY_INVADE_TIME] === 0,
    "duplicate resolution should not spend charges again"
  );
  assert(
    duplicate.state.units[grozny.id].position?.col === 5 &&
      duplicate.state.units[grozny.id].position?.row === 5,
    "duplicate resolution should not move Grozny again"
  );

  console.log("grozny_tyrant_duplicate_origin_resolution_does_not_repeat_effects passed");
}


export function testGroznyTyrantPendingChoiceProjectsOnlyToOwner() {
  const rng = new SeededRNG(745);
  const { state: baseState, grozny, ally } = setupGroznyTyrantState();

  let state = baseState;
  state = setUnit(state, grozny.id, {
    position: { col: 0, row: 0 },
    attack: 2,
    hp: 4,
    charges: {
      ...grozny.charges,
      [ABILITY_GROZNY_INVADE_TIME]: 3,
    },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: grozny.id } as any,
    rng
  );

  const ownerView = makePlayerView(started.state, "P1");
  const opponentView = makePlayerView(started.state, "P2");

  assert(
    ownerView.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "owner projection should restore unresolved Grozny choice"
  );
  assert(
    opponentView.pendingRoll === null,
    "opponent projection should not expose Grozny private pending choice"
  );

  console.log("grozny_tyrant_pending_choice_projects_only_to_owner passed");
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
