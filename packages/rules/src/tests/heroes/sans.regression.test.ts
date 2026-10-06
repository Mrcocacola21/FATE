import {
  ABILITY_SANS_GASTER_BLASTER,
  applyAction,
  assert,
  GameState,
  getLegalAttackTargets,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeSharedAttackerWinRng,
  resolveAllPendingRollsWithEvents,
  resolvePendingRollOnce,
  SeededRNG,
  setUnit,
  setupSansState,
  toBattleState,
  makePlayerView,
} from "../helpers/testUtils";
import { collectSansLineTargetIds, isSansCenterOnAttackLine } from "../../sans";
import { resolveUnitDeath } from "../../death";
import { applySansLastAttackFromDeaths } from "../../actions/heroes/sans/curses";
import { ARENA_STORM_ID } from "../../forest";
import { completePendingRoundAdvance } from "../../ruleDeclarations";

export function testSansLastAttackDefersRoundAdvance() {
  const { state: initial, sans, enemy } = setupSansState();
  const before = toBattleState(
    setUnit(initial, sans.id, {
      hp: 0,
      position: { col: 4, row: 4 },
      sansUnbelieverUnlocked: true,
      sansPendingDeath: { killerId: null },
    }),
    "P1",
    sans.id,
  );
  const state: GameState = {
    ...before,
    ruleDeclaration: {
      ...before.ruleDeclaration,
      ruleData: {
        ...before.ruleDeclaration.ruleData,
        pendingRoundAdvance: {
          nextRoundNumber: before.roundNumber + 1,
          nextTurnNumber: before.turnNumber + 1,
          nextIndex: 0,
          nextUnitId: enemy.id,
          nextPlayer: "P2",
        },
      },
    },
  };
  const held = completePendingRoundAdvance(state);
  assert(held.state === state, "Round-end lethal damage cannot advance before Last Attack");
  const decision = applySansLastAttackFromDeaths(held.state);
  const selected = applyAction(
    decision.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: decision.state.pendingRoll!.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    new SeededRNG(8),
  );
  assert(
    selected.state.turnNumber === state.turnNumber + 1 &&
      selected.state.roundNumber === state.roundNumber + 1,
    "Held round advance resumes after curse selection and death",
  );
  assert(
    !selected.state.ruleDeclaration.ruleData.pendingRoundAdvance,
    "Round advance is consumed exactly once",
  );
  console.log("sans_last_attack_defers_round_advance passed");
}

export function testSansCurseTurnStartContinuationAndActiveDeath() {
  const { state: initial, sans, papyrus, enemy } = setupSansState();
  let cursed = toBattleState(
    setUnit(initial, enemy.id, {
      hp: 4,
      position: { col: 5, row: 5 },
      sansLastAttackCurseSourceId: sans.id,
    }),
    "P2",
    enemy.id,
  );
  cursed = { ...cursed, arenaId: ARENA_STORM_ID };
  const start = startOwnTurn(cursed, enemy.id);
  assert(
    start.state.pendingRoll?.kind === "lechyStormStartTurnRoll",
    "Storm pauses own turn for a manual save",
  );
  assert(start.state.units[enemy.id].hp === 3, "Curse ticks before own-turn save");
  const storm = resolvePendingRollOnce(start.state, { next: () => 0.99 });
  const resumed = applyAction(
    storm.state,
    { type: "unitStartTurn", unitId: enemy.id },
    new SeededRNG(4),
  );
  assert(
    resumed.state.units[enemy.id].hp === 3,
    "Continuing the same activation must not tick twice",
  );
  assert(resumed.state.activeUnitId === enemy.id, "Cursed unit activates normally after its save");

  const state = toBattleState(
    setUnit(initial, sans.id, {
      hp: 1,
      position: { col: 4, row: 4 },
      sansUnbelieverUnlocked: true,
      papyrusBoneStatus: { sourceUnitId: papyrus.id, kind: "orange", expiresOnSourceOwnTurn: 99 },
    }),
    "P1",
    sans.id,
  );
  const lethal = applyAction(state, { type: "endTurn" }, new SeededRNG(5));
  assert(
    lethal.state.pendingRoll?.kind === "selectLastAttackTarget",
    "Lethal end-turn penalty enters pre-death choice",
  );
  assert(
    lethal.state.turnNumber === state.turnNumber && lethal.state.activeUnitId === sans.id,
    "No turn advance while Sans is choosing",
  );
  const selected = applyAction(
    lethal.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: lethal.state.pendingRoll.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    new SeededRNG(6),
  );
  assert(
    selected.state.activeUnitId === null && !selected.state.units[sans.id].isAlive,
    "Completed active-unit death releases activation",
  );
  console.log("sans_curse_turn_start_continuation_and_active_death passed");
}

function lethalSans() {
  const setup = setupSansState();
  const { sans, enemy, enemy2 } = setup;
  let state = setUnit(setup.state, sans.id, {
    hp: 1,
    position: { col: 4, row: 4 },
    sansUnbelieverUnlocked: true,
  });
  state = setUnit(state, enemy.id, { hp: 4, position: { col: 4, row: 5 } });
  state = setUnit(state, enemy2.id, { hp: 4, position: { col: 8, row: 7 } });
  state = initKnowledgeForOwners(toBattleState(state, "P2", enemy.id));
  const rng = makeAttackWinRng(1);
  let result = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id },
    rng,
  );
  const events = [...result.events];
  for (let i = 0; i < 10 && result.state.pendingRoll?.kind !== "selectLastAttackTarget"; i++) {
    result = resolvePendingRollOnce(result.state, rng);
    events.push(...result.events);
  }
  return { ...setup, before: state, state: result.state, events };
}

export function testSansLastAttackCreatesTargetChoiceBeforeDeath() {
  const { state, before, sans, enemy, enemy2, events } = lethalSans();
  const pending = state.pendingRoll;
  assert(
    pending?.kind === "selectLastAttackTarget",
    "Lethal damage must create owner's Last Attack choice",
  );
  assert(pending.player === sans.owner, "Choice belongs to Sans's owner, even on the enemy's turn");
  const legal = pending.context.legalTargetIds as string[];
  const allEnemies = Object.values(state.units)
    .filter((u) => u.isAlive && u.hp > 0 && u.owner !== sans.owner)
    .map((u) => u.id)
    .sort();
  assert(
    JSON.stringify(legal) === JSON.stringify(allEnemies),
    "Every living enemy must be legal, including distant enemies",
  );
  assert(
    legal.includes(enemy.id) && legal.includes(enemy2.id),
    "Both positioned enemies must be legal",
  );
  assert(
    state.units[sans.id].isAlive && !!state.units[sans.id].position,
    "Sans stays on the board until selection",
  );
  assert(
    !events.some((e) => e.type === "unitDied" && e.unitId === sans.id),
    "Death event waits for choice",
  );
  assert(!events.some((e) => e.type === "sansLastAttackApplied"), "Curse is never auto-selected");
  assert(
    state.turnNumber === before.turnNumber && state.activeUnitId === before.activeUnitId,
    "Game must not advance",
  );
  const rng = {
    next: (): number => {
      throw new Error("Last Attack must not roll dice");
    },
  };
  for (const action of [
    { type: "endTurn" } as const,
    { type: "unitStartTurn", unitId: enemy2.id } as const,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id } as const,
  ])
    assert(applyAction(state, action, rng).state === state, "Normal actions blocked during choice");
  for (const action of [
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P2",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: sans.id },
    },
    { type: "resolvePendingRoll", pendingRollId: pending.id, player: "P1" },
  ] as const)
    assert(
      applyAction(state, action, rng).state === state,
      "Wrong owner, ally and missing choice must be rejected",
    );
  const selected = applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    rng,
  );
  assert(
    selected.state.units[enemy.id].sansLastAttackCurseSourceId === sans.id,
    "Owner-selected enemy receives authoritative curse",
  );
  assert(selected.state.units[enemy.id].hp === 4, "Applying curse deals no immediate damage");
  assert(
    !selected.state.units[sans.id].isAlive && selected.state.units[sans.id].position === null,
    "Selection completes death",
  );
  assert(
    selected.events.findIndex((e) => e.type === "sansLastAttackApplied") <
      selected.events.findIndex((e) => e.type === "unitDied"),
    "Curse event precedes death",
  );
  assert(!selected.state.pendingRoll, "Choice clears after selection");
  const ended = applyAction(selected.state, { type: "endTurn" }, new SeededRNG(1));
  assert(ended.state.turnNumber > state.turnNumber, "Normal flow resumes");
  console.log("sans_last_attack_creates_target_choice_before_death passed");
}

function startOwnTurn(state: GameState, unitId: string) {
  return applyAction(
    {
      ...state,
      currentPlayer: state.units[unitId].owner,
      activeUnitId: null,
      turnNumber: state.turnNumber + 1,
      turnQueue: [unitId],
      turnQueueIndex: 0,
      turnOrder: [unitId],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId },
    new SeededRNG(12),
  );
}

export function testSansCurseDealsOneDamageAtTargetOwnTurnStart() {
  const { state: initial, sans, enemy, enemy2 } = setupSansState();
  let state = setUnit(initial, enemy.id, {
    hp: 4,
    position: { col: 4, row: 5 },
    sansLastAttackCurseSourceId: sans.id,
  });
  state = setUnit(state, enemy2.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P2", enemy2.id);
  const invalidStart = applyAction(
    state,
    { type: "unitStartTurn", unitId: enemy.id },
    new SeededRNG(2),
  );
  assert(
    invalidStart.state === state && invalidStart.state.units[enemy.id].hp === 4,
    "Rejected turn start must not tick curse",
  );
  const another = startOwnTurn(state, enemy2.id);
  assert(another.state.units[enemy.id].hp === 4, "Another unit's start cannot tick curse");
  const end = applyAction(another.state, { type: "endTurn" }, new SeededRNG(3));
  assert(end.state.units[enemy.id].hp === 4, "End turn cannot tick curse");
  const tick = startOwnTurn(end.state, enemy.id);
  assert(tick.state.units[enemy.id].hp === 3, "Own turn deals exactly one damage: 4 -> 3");
  assert(
    tick.state.units[enemy.id].sansLastAttackCurseSourceId === sans.id,
    "Curse remains above one HP",
  );
  const repeated = applyAction(
    tick.state,
    { type: "unitStartTurn", unitId: enemy.id },
    new SeededRNG(4),
  );
  assert(
    repeated.state.units[enemy.id].hp === 3,
    "Rejected duplicate activation cannot damage again",
  );
  console.log("sans_curse_deals_one_damage_at_target_own_turn_start passed");
}

export function testSansCurseStopsAtOneHp() {
  const { state: initial, sans, enemy } = setupSansState();
  const state = toBattleState(
    setUnit(initial, enemy.id, {
      hp: 2,
      position: { col: 4, row: 5 },
      sansLastAttackCurseSourceId: sans.id,
    }),
    "P2",
    enemy.id,
  );
  const tick = startOwnTurn(state, enemy.id);
  assert(
    tick.state.units[enemy.id].hp === 1 && tick.state.units[enemy.id].isAlive,
    "Curse cannot kill: 2 -> 1",
  );
  assert(!tick.state.units[enemy.id].sansLastAttackCurseSourceId, "Curse removes at one HP");
  const next = startOwnTurn(tick.state, enemy.id);
  assert(next.state.units[enemy.id].hp === 1, "Following own turn stays at one HP");
  const alreadyOne = startOwnTurn(setUnit(state, enemy.id, { hp: 1 }), enemy.id);
  assert(
    alreadyOne.state.units[enemy.id].hp === 1 &&
      !alreadyOne.state.units[enemy.id].sansLastAttackCurseSourceId,
    "Already-one target clears without damage",
  );
  assert(
    !alreadyOne.events.some((e) => e.type === "sansLastAttackTick"),
    "Already-one target takes no damage",
  );
  console.log("sans_curse_stops_at_one_hp passed");
}

export function testSansLastAttackSkipsIfNoEnemyExists() {
  const { state: initial, sans } = setupSansState();
  let state = toBattleState(initial, "P1", sans.id);
  const events: Parameters<typeof resolveUnitDeath>[2] = [];
  const unit = resolveUnitDeath(
    { ...sans, hp: 0, position: { col: 4, row: 4 }, sansUnbelieverUnlocked: true },
    null,
    events,
  );
  state = { ...state, units: { [unit.id]: unit } };
  const finished = applySansLastAttackFromDeaths(state);
  assert(!finished.state.pendingRoll, "No impossible decision without living enemies");
  assert(
    !finished.state.units[sans.id].isAlive && finished.state.units[sans.id].position === null,
    "Death resolves normally",
  );
  assert(
    finished.events.some((e) => e.type === "unitDied"),
    "Normal death event emitted",
  );
  console.log("sans_last_attack_skips_if_no_enemy_exists passed");
}

function blasterLine() {
  const setup = setupSansState();
  const { sans, enemy, enemy2 } = setup;
  const enemy3 = Object.values(setup.state.units).find(
    (u) => u.owner === "P2" && u.id !== enemy.id && u.id !== enemy2.id,
  )!;
  let state = setUnit(setup.state, sans.id, {
    position: { col: 0, row: 4 },
    charges: { ...sans.charges, [ABILITY_SANS_GASTER_BLASTER]: 2 },
  });
  for (const [unit, col] of [
    [enemy, 2],
    [enemy2, 4],
    [enemy3, 5],
  ] as const)
    state = setUnit(state, unit.id, { hp: 5, position: { col, row: 4 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", sans.id));
  return { ...setup, state, enemy3, target: { col: 8, row: 4 } };
}

export function testGasterBlasterPiercesMultipleEnemies() {
  const { state, sans, enemy, enemy2, enemy3, target } = blasterLine();
  const expected = [enemy.id, enemy2.id, enemy3.id];
  assert(
    isSansCenterOnAttackLine(state, state.units[sans.id], target),
    "Cells behind enemies can select ray",
  );
  assert(
    JSON.stringify(collectSansLineTargetIds(state, state.units[sans.id], target)) ===
      JSON.stringify(expected),
    "Collect all three enemies through gaps to board edge",
  );
  const rng = makeSharedAttackerWinRng(3);
  const cast = applyAction(
    state,
    {
      type: "useAbility",
      unitId: sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target },
    },
    rng,
  );
  assert(
    cast.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "Ability waits for explicit attacker roll",
  );
  assert(
    expected.every((id) => cast.state.units[id].hp === 5),
    "No autorolls or immediate damage",
  );
  assert(
    cast.state.units[sans.id].charges[ABILITY_SANS_GASTER_BLASTER] === 0,
    "Charge(2) spends exactly two",
  );
  const resolved = resolveAllPendingRollsWithEvents(cast.state, rng);
  const attacks = resolved.events.filter((e) => e.type === "attackResolved");
  assert(
    attacks.length === 3 &&
      attacks.every((e, i) => e.type === "attackResolved" && e.defenderId === expected[i]),
    "All three enter manual combat resolution",
  );
  assert(
    expected.every((id) => resolved.state.units[id].hp === 4),
    "All three enemies take existing Sans damage",
  );
  assert(
    !resolved.state.pendingRoll && !resolved.state.pendingAoE,
    "Queue only completes after all enemies",
  );
  console.log("gaster_blaster_pierces_multiple_enemies passed");
}

export function testNormalArcherAttackStillStopsAtFirstEnemy() {
  const { state, sans, enemy, enemy2, enemy3 } = blasterLine();
  const normal = setUnit(state, sans.id, {
    class: "archer",
    heroId: undefined,
    figureId: undefined,
  });
  const targets = getLegalAttackTargets(normal, sans.id);
  assert(
    targets.includes(enemy.id) && !targets.includes(enemy2.id) && !targets.includes(enemy3.id),
    "Normal Archer still stops at first enemy on identical ray",
  );
  console.log("normal_archer_attack_still_stops_at_first_enemy passed");
}

export function testGasterBlasterDoesNotAttackAllies() {
  const { state: initial, sans, ally, enemy, enemy2, enemy3, target } = blasterLine();
  const state = setUnit(initial, ally.id, { position: { col: 1, row: 4 }, hp: 5 });
  const targets = collectSansLineTargetIds(state, state.units[sans.id], target);
  assert(
    !targets.includes(ally.id) &&
      [enemy.id, enemy2.id, enemy3.id].every((id) => targets.includes(id)),
    "Pass through allies and collect every enemy",
  );
  const rng = makeSharedAttackerWinRng(3);
  const cast = applyAction(
    state,
    {
      type: "useAbility",
      unitId: sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target },
    },
    rng,
  );
  const resolved = resolveAllPendingRollsWithEvents(cast.state, rng);
  assert(resolved.state.units[ally.id].hp === 5, "Ally takes no damage");
  assert(
    !resolved.events.some((e) => e.type === "attackResolved" && e.defenderId === ally.id),
    "Ally never enters resolution queue",
  );
  console.log("gaster_blaster_does_not_attack_allies passed");
}

export function testSansLastAttackSuspendsQueuedRollAndKeepsHiddenEnemiesLegal() {
  const { state: initial, sans, enemy } = setupSansState();
  const suspended = {
    id: "queued-roll",
    player: "P2" as const,
    kind: "attack_attackerRoll" as const,
    context: { attackerId: enemy.id, defenderId: sans.id },
  };
  const state = setUnit({ ...initial, pendingRoll: suspended }, sans.id, {
    hp: 0,
    position: { col: 4, row: 4 },
    sansPendingDeath: { killerId: enemy.id },
    sansUnbelieverUnlocked: true,
  });
  const hiddenState = setUnit(state, enemy.id, { isStealthed: true, position: { col: 8, row: 8 } });
  const choice = applySansLastAttackFromDeaths(hiddenState);
  const view = makePlayerView(choice.state, "P1");
  assert(
    (view.pendingRoll?.context.legalTargetIds as string[]).includes(enemy.id),
    "Hidden enemy remains selectable",
  );
  assert(
    !view.pendingRoll?.context.resumePendingRoll,
    "Suspended combat context stays server-private",
  );
  const selected = applyAction(
    choice.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: choice.state.pendingRoll!.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    new SeededRNG(6),
  );
  assert(
    selected.state.pendingRoll?.id === suspended.id &&
      selected.state.pendingRoll.context === suspended.context,
    "Queued explicit roll restored unchanged after decision",
  );
  console.log("sans_last_attack_suspends_queued_roll_and_keeps_hidden_enemies_legal passed");
}
