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
import {
  getUnitMovementClasses,
} from "../../movement";
import {
  maybeTriggerGroznyTyrant,
} from "../../actions/heroes/grozny";

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

export function testGroznyTyrantRejectsEnemySelfAndDeadTargetsWithoutMutation() {
  const rng = new SeededRNG(747);
  const { state: baseState, grozny, commander, ally } = setupGroznyTyrantState();
  const enemy = Object.values(baseState.units).find((unit) => unit.owner === "P2")!;

  let state = setUnit(baseState, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
  });
  state = setUnit(state, commander.id, { position: { col: 7, row: 4 }, hp: 2 });
  state = setUnit(state, ally.id, { position: { col: 4, row: 7 }, hp: 2 });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 0 }, hp: 1 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };

  const triggered = maybeTriggerGroznyTyrant(state, grozny.id, rng);
  const afterMode = chooseGroznyOption(triggered.state, "normal", rng);
  assert(
    afterMode.state.pendingRoll?.kind === "groznyTyrantAllyChoice",
    "two living selectable allies should create an ally choice",
  );
  const context = afterMode.state.pendingRoll.context as { options: string[] };
  assert(!context.options.includes(enemy.id), "enemy targets must not be projected as selectable");
  assert(!context.options.includes(grozny.id), "Grozny must not be projected as his own target");

  for (const targetId of [enemy.id, grozny.id]) {
    const before = JSON.stringify(afterMode.state);
    const rejected = resolvePendingWithChoice(
      afterMode.state,
      { type: "groznyTyrantAlly", targetId },
      rng,
    );
    assert.equal(rejected.events.length, 0, "an invalid Tyrant target should emit no events");
    assert.equal(
      JSON.stringify(rejected.state),
      before,
      "an invalid Tyrant target must not mutate authoritative state",
    );
  }

  const deadState = setUnit(afterMode.state, ally.id, {
    hp: 0,
    isAlive: false,
    position: null,
  });
  const beforeDeadChoice = JSON.stringify(deadState);
  const deadRejected = resolvePendingWithChoice(
    deadState,
    { type: "groznyTyrantAlly", targetId: ally.id },
    rng,
  );
  assert.equal(deadRejected.events.length, 0, "a dead Tyrant target should emit no events");
  assert.equal(
    JSON.stringify(deadRejected.state),
    beforeDeadChoice,
    "a target that died after projection must be revalidated without mutation",
  );

  console.log("grozny_tyrant_rejects_enemy_self_and_dead_targets_without_mutation passed");
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


function resolveOneTyrantUse(
  state: ReturnType<typeof toBattleState>,
  groznyId: string,
  targetId: string,
  rng: any,
) {
  const triggered = maybeTriggerGroznyTyrant(state, groznyId, rng);
  assert(
    triggered.state.pendingRoll?.kind === "groznyTyrantOptionChoice",
    "each separate Tyrant proc should begin with one mode choice",
  );
  const modeChosen = chooseGroznyOption(triggered.state, "normal", rng);
  const allyChosen = chooseGroznyAllyIfNeeded(modeChosen.state, targetId, rng);
  assert(
    allyChosen.state.pendingRoll?.kind === "groznyTyrantAttackCellChoice",
    "the selected ally should lead to one attack-origin choice",
  );
  const cellContext = allyChosen.state.pendingRoll.context as {
    options: {
      targetId: string;
      mode: "normal";
      position: { col: number; row: number };
    }[];
  };
  const option = cellContext.options.find((entry) => entry.targetId === targetId);
  assert(option, "the selected ally should have a legal Tyrant attack origin");
  const attackRequested = resolvePendingWithChoice(
    allyChosen.state,
    { type: "groznyTyrantAttackCell", ...option },
    rng,
  );
  const resolved = resolveAllPendingRollsWithEvents(attackRequested.state, rng);
  return {
    state: resolved.state,
    events: [
      ...triggered.events,
      ...modeChosen.events,
      ...allyChosen.events,
      ...attackRequested.events,
      ...resolved.events,
    ],
  };
}

export function testGroznyTyrantSingleUseTracksAndGainsCumulativeMovement() {
  const rng = makeAttackWinRng(3);
  let state = createEmptyGame();
  const a1 = createDefaultArmy("P1", { berserker: HERO_GROZNY_ID });
  const a2 = createDefaultArmy("P2");
  state = attachArmy(state, a1);
  state = attachArmy(state, a2);

  const grozny = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "berserker"
  )!;
  const archer = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "archer"
  )!;
  const rider = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "rider"
  )!;
  const assassin = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "assassin"
  )!;

  state = setUnit(state, grozny.id, {
    position: { col: 4, row: 4 },
    attack: 2,
    hp: 3,
  });
  state = setUnit(state, archer.id, { position: { col: 6, row: 4 }, hp: 2 });
  state = setUnit(state, rider.id, { position: { col: 7, row: 4 }, hp: 2 });
  state = setUnit(state, assassin.id, { position: { col: 8, row: 4 }, hp: 2 });
  state = { ...toBattleState(state, "P1", grozny.id), activeUnitId: null };
  state = initKnowledgeForOwners(state);

  const first = resolveOneTyrantUse(
    state,
    grozny.id,
    archer.id,
    rng,
  );
  assert(!first.state.pendingRoll, "one Tyrant kill must end the current resolution");
  assert(!first.state.units[archer.id].isAlive, "the selected first ally should die");
  assert(first.state.units[rider.id].isAlive, "Tyrant must not continue to a second ally");
  assert(first.state.units[assassin.id].isAlive, "Tyrant must not continue to a third ally");
  assert.deepEqual(
    first.state.units[grozny.id].tyrantFinishedAllyIds,
    [archer.id],
    "the first successful Tyrant target should be tracked once",
  );
  assert.deepEqual(
    getUnitMovementClasses(first.state.units[grozny.id]),
    ["berserker"],
    "one finished ally must not grant inherited movement yet",
  );

  const second = resolveOneTyrantUse(
    first.state,
    grozny.id,
    rider.id,
    rng,
  );
  assert(!second.state.pendingRoll, "the second separate Tyrant use must also end after one ally");
  assert(!second.state.units[rider.id].isAlive, "the selected second ally should die");
  assert(second.state.units[assassin.id].isAlive, "the second use must not chain to a third ally");
  assert.deepEqual(
    second.state.units[grozny.id].tyrantFinishedAllyIds,
    [archer.id, rider.id],
    "separate Tyrant uses should accumulate unique finished ally ids",
  );
  assert.deepEqual(
    getUnitMovementClasses(second.state.units[grozny.id]),
    ["berserker", "archer", "rider"],
    "the second finished ally should unlock movement from both finished allies",
  );

  const third = resolveOneTyrantUse(
    second.state,
    grozny.id,
    assassin.id,
    rng,
  );
  const groznyAfter = third.state.units[grozny.id];
  assert(!third.state.pendingRoll, "the third separate Tyrant use must end without another picker");
  assert(!third.state.units[assassin.id].isAlive, "the selected third ally should die");
  assert.deepEqual(
    groznyAfter.tyrantFinishedAllyIds,
    [archer.id, rider.id, assassin.id],
    "a later Tyrant use should add its ally to persistent tracking",
  );
  assert.deepEqual(
    getUnitMovementClasses(groznyAfter),
    ["berserker", "archer", "rider", "assassin"],
    "later Tyrant uses should retain movement from every finished ally",
  );
  const duplicatedProfiles = {
    ...groznyAfter,
    tyrantFinishedAllyIds: [
      ...(groznyAfter.tyrantFinishedAllyIds ?? []),
      archer.id,
    ],
    tyrantMovementSources: (groznyAfter.tyrantMovementSources ?? []).map(
      (source) =>
        source.unitId === rider.id
          ? {
              ...source,
              movementClasses: [...source.movementClasses, "archer" as const],
            }
          : source,
    ),
  };
  assert.deepEqual(
    getUnitMovementClasses(duplicatedProfiles),
    ["berserker", "archer", "rider", "assassin"],
    "duplicate ids and inherited movement modes should be merged only once",
  );
  const stateWithoutFinishedUnits = {
    ...third.state,
    units: Object.fromEntries(
      Object.entries(third.state.units).filter(
        ([unitId]) => ![archer.id, rider.id, assassin.id].includes(unitId),
      ),
    ),
  };
  assert.deepEqual(
    getUnitMovementClasses(stateWithoutFinishedUnits.units[grozny.id]),
    ["berserker", "archer", "rider", "assassin"],
    "movement snapshots should survive removal of finished unit records",
  );

  const attackEvents = [...first.events, ...second.events, ...third.events].filter(
    (event) => event.type === "attackResolved" && event.attackerId === grozny.id,
  ) as Extract<GameEvent, { type: "attackResolved" }>[];
  assert.equal(attackEvents.length, 3, "three separate Tyrant uses should log three attacks");
  assert(
    groznyAfter.attack === state.units[grozny.id].attack + 3,
    "Grozny should retain +1 base damage per successful separate Tyrant use"
  );
  const maxHp = getHeroMeta(HERO_GROZNY_ID)?.baseStats.hp ?? groznyAfter.hp;
  const damageSum = attackEvents.reduce((sum, e) => sum + e.damage, 0);
  const expectedHp = Math.min(
    maxHp,
    state.units[grozny.id].hp + damageSum
  );
  assert(
    groznyAfter.hp === expectedHp,
    "Grozny should heal by total damage dealt across separate Tyrant uses"
  );
  assert(
    groznyAfter.turn.moveUsed === false,
    "normal Tyrant uses should not consume the move action"
  );

  const moveState = {
    ...third.state,
    activeUnitId: grozny.id,
    pendingMove: null,
  };
  const requestedAssassinMove = applyAction(
    moveState,
    { type: "requestMoveOptions", unitId: grozny.id, mode: "assassin" } as any,
    rng,
  );
  const inheritedDestination = requestedAssassinMove.state.pendingMove?.legalTo.find(
    (cell) =>
      groznyAfter.position &&
      Math.max(
        Math.abs(cell.col - groznyAfter.position.col),
        Math.abs(cell.row - groznyAfter.position.row),
      ) === 2,
  );
  assert(inheritedDestination, "inherited Assassin movement should generate distance-two moves");
  const moved = applyAction(
    requestedAssassinMove.state,
    { type: "move", unitId: grozny.id, to: inheritedDestination } as any,
    rng,
  );
  assert.deepEqual(
    moved.state.units[grozny.id].position,
    inheritedDestination,
    "normal movement execution should authorize the same inherited mode as preview",
  );

  console.log(
    "grozny_tyrant_single_use_tracks_and_gains_cumulative_movement passed"
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
