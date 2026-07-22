import {
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_LOKI_LAUGHT,
  applyAction,
  assert,
  GameState,
  getLegalMovesForUnit,
  HERO_GENGHIS_KHAN_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makePlayerView,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingWithChoice,
  setUnit,
  setupLokiState,
  toBattleState,
} from "../helpers/testUtils";
import { getAbilityViewsForUnit } from "../../abilities";
export function testLokiLaughterIncrementsOnAnyDouble() {
  let { state, loki } = setupLokiState();
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 2, row: 2 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 15 },
  });
  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 4, row: 5 } });
  state = toBattleState(state, "P2", attacker.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id } as any,
    makeRngSequence([])
  );
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.01, 0.01, 0.6, 0.4])
  );

  assert(
    resolved.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 16,
    "Loki should gain Laughter beyond the old 15-point cap"
  );
  const chargeEvent = resolved.events.find(
    (event) =>
      event.type === "chargesUpdated" &&
      event.unitId === loki.id &&
      event.deltas[ABILITY_LOKI_LAUGHT] === 1
  );
  assert(chargeEvent, "double-triggered laughter gain should emit chargesUpdated");

  console.log("loki_laughter_increments_on_any_double passed");
}


export function testLokiLaughterSpendingAndGating() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 14 },
  });
  state = setUnit(state, ally.id, { position: { col: 5, row: 4 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  assert(
    started.state.pendingRoll?.kind === "lokiLaughtChoice",
    "Loki laughter should open a menu pending roll"
  );

  const blocked = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([])
  );
  assert(
    blocked.state.pendingRoll?.kind === "lokiLaughtChoice",
    "cost-15 option should stay unavailable below 15 laughter"
  );
  assert(
    blocked.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 14,
    "failed high-cost choice must not spend laughter"
  );

  const charged = setUnit(blocked.state, loki.id, {
    charges: {
      ...blocked.state.units[loki.id].charges,
      [ABILITY_LOKI_LAUGHT]: 15,
    },
  });
  const queued = resolvePendingWithChoice(
    charged,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([])
  );
  assert(
    queued.state.pendingRoll?.kind === "tricksterAoE_attackerRoll",
    "successful AoE option should start the shared Trickster attack flow"
  );
  const used = resolveAllPendingRollsWithEvents(
    queued.state,
    makeRngSequence([0.9, 0.7, 0.1, 0.3])
  );
  assert(!used.state.pendingRoll, "successful choice should resolve pending roll");
  assert(
    used.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 0,
    "cost-15 option should spend exactly 15 laughter"
  );

  console.log("loki_laughter_spending_and_gating passed");
}

export function testLokiLaughOptionAvailabilityThresholds() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const controlled = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const controlledTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  state = setUnit(state, loki.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, controlled.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, controlledTarget.id, { position: { col: 5, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", loki.id));

  const cases: Array<[number, number]> = [
    [2, 0],
    [3, 1],
    [5, 2],
    [10, 3],
    [12, 4],
    [15, 5],
  ];
  for (const [laugh, expectedAvailable] of cases) {
    const withLaugh = setUnit(state, loki.id, {
      charges: { ...state.units[loki.id].charges, [ABILITY_LOKI_LAUGHT]: laugh },
    });
    const view = getAbilityViewsForUnit(withLaugh, loki.id).find(
      (ability) => ability.id === ABILITY_LOKI_LAUGHT
    );
    assert(view?.useOptions?.length === 5, "Loki's Laugh should expose five options");
    assert(
      view!.useOptions!.filter((option) => option.isAvailable).length === expectedAvailable,
      `${laugh} Laugh should enable exactly ${expectedAvailable} options`
    );
    for (const option of view!.useOptions!.filter((item) => !item.isAvailable)) {
      if ((option.chargeRequired ?? 0) > laugh) {
        assert(option.disabledReason === "Not enough Laugh", "cost gating reason must be explicit");
      }
    }
  }

  console.log("loki_laugh_option_availability_thresholds passed");
}


export function testLokiOptionOneMoveLockDuration() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const successfulDefender = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const outside = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 3 },
  });
  state = setUnit(state, ally.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, enemy.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, successfulDefender.id, {
    position: { col: 3, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = setUnit(state, outside.id, { position: { col: 8, row: 8 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const queued = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "againSomeNonsense" },
    makeRngSequence([])
  );
  const orderedAreaTargets = [
    ...((queued.state.pendingRoll?.context.targetsQueue as string[]) ?? []),
  ];
  const projectedQueue =
    (makePlayerView(queued.state, "P1").pendingRoll?.context.targetsQueue as string[]) ?? [];
  assert(
    !projectedQueue.includes(successfulDefender.id),
    "pending AoE projection must not leak an unknown hidden target id"
  );
  const applied = resolveAllPendingRollsWithEvents(
    queued.state,
    makeRngSequence([
      0.5,
      0.7,
      ...orderedAreaTargets.flatMap((targetId) =>
        targetId === successfulDefender.id ? [0.99, 0.8] : [0.01, 0.2]
      ),
    ])
  );

  assert(applied.state.units[loki.id].isStealthed, "entangle must preserve Loki stealth");

  const attackEvents = applied.events.filter(
    (event) => event.type === "attackResolved" && event.attackerId === loki.id
  );
  assert.deepEqual(
    attackEvents.map((event) => event.type === "attackResolved" ? event.defenderId : ""),
    orderedAreaTargets,
    "Trickster area targets must resolve in deterministic id order"
  );
  const failedTargetIds = attackEvents
    .filter((event) => event.type === "attackResolved" && event.hit)
    .map((event) => event.type === "attackResolved" ? event.defenderId : "");
  const successfulTargetIds = attackEvents
    .filter((event) => event.type === "attackResolved" && !event.hit)
    .map((event) => event.type === "attackResolved" ? event.defenderId : "");
  assert(failedTargetIds.length > 0 && successfulTargetIds.length > 0, "AoE should cover hit and defended outcomes");
  assert(
    failedTargetIds.every((unitId) =>
      (applied.state.units[unitId].lokiMoveLockSources ?? []).includes(loki.id)
    ),
    "every failed defense should receive Entangled"
  );
  assert(
    successfulTargetIds.every((unitId) =>
      !(applied.state.units[unitId].lokiMoveLockSources ?? []).includes(loki.id)
    ),
    "successful defenses should not receive Entangled"
  );
  assert(
    !(applied.state.units[outside.id].lokiMoveLockSources ?? []).includes(loki.id),
    "targets outside the Trickster area must be unaffected"
  );
  const failedEnemyId = failedTargetIds.find(
    (unitId) => applied.state.units[unitId].owner === "P2"
  )!;
  assert(failedEnemyId, "at least one enemy should fail defense in this fixture");

  const blockedMoveState = {
    ...applied.state,
    currentPlayer: "P2" as const,
    activeUnitId: failedEnemyId,
    pendingRoll: null,
    pendingMove: null,
  };
  const blockedMove = applyAction(
    blockedMoveState,
    { type: "requestMoveOptions", unitId: failedEnemyId } as any,
    makeRngSequence([])
  );
  assert(
    !blockedMove.state.pendingMove,
    "move lock should block generating move options"
  );
  const allowedAttack = applyAction(
    blockedMoveState,
    { type: "attack", attackerId: failedEnemyId, defenderId: ally.id } as any,
    makeRngSequence([])
  );
  assert(
    allowedAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "Entangled must block Move without blocking Action/attack"
  );

  const lokiStartState: GameState = {
    ...applied.state,
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [loki.id],
    turnQueueIndex: 0,
    turnOrder: [loki.id],
    turnOrderIndex: 0,
  };
  const lokiStart = applyAction(
    lokiStartState,
    { type: "unitStartTurn", unitId: loki.id } as any,
    makeRngSequence([])
  );
  assert(
    (lokiStart.state.units[failedEnemyId].lokiMoveLockSources?.length ?? 0) === 0,
    "move lock should expire at Loki start turn"
  );

  const restoredMoveState = {
    ...lokiStart.state,
    currentPlayer: "P2" as const,
    activeUnitId: failedEnemyId,
    pendingRoll: null,
    pendingMove: null,
  };
  const restoredMove = applyAction(
    restoredMoveState,
    { type: "requestMoveOptions", unitId: failedEnemyId } as any,
    makeRngSequence([])
  );
  assert(
    !!restoredMove.state.pendingMove,
    "movement should be restored after Loki start turn cleanup"
  );

  console.log("loki_option_one_move_lock_duration passed");
}


export function testLokiOptionTwoChickenBlocksAndRestrictsMove() {
  let { state, loki } = setupLokiState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.heroId === HERO_GENGHIS_KHAN_ID
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 5 },
  });
  state = setUnit(state, enemy.id, {
    position: { col: 5, row: 4 },
    charges: {
      ...enemy.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 3,
    },
  });
  state = setUnit(state, defender.id, { position: { col: 5, row: 5 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const option = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "chicken" },
    makeRngSequence([])
  );
  assert(
    option.state.pendingRoll?.kind === "lokiChickenTargetChoice",
    "Chicken option should request target selection"
  );
  assert(
    option.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 5,
    "entering Chicken target selection should not spend Laughter"
  );
  assert(
    !option.state.units[loki.id].turn.actionUsed,
    "entering Chicken target selection should not spend Loki's action"
  );
  const invalid = resolvePendingWithChoice(
    option.state,
    { type: "lokiChickenTarget", targetId: defender.id },
    makeRngSequence([])
  );
  assert(
    invalid.state.pendingRoll?.kind === "lokiChickenTargetChoice" &&
      invalid.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 5,
    "invalid allied Chicken target must be rejected without cost"
  );
  const canceled = resolvePendingWithChoice(
    option.state,
    "skip",
    makeRngSequence([])
  );
  assert(!canceled.state.pendingRoll, "Chicken target cancel should clear pending");
  assert(
    canceled.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 5,
    "Chicken target cancel should not spend Laughter"
  );
  assert(
    !canceled.state.units[loki.id].turn.actionUsed,
    "Chicken target cancel should not spend Loki's action"
  );
  const reopened = applyAction(
    canceled.state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const optionAgain = resolvePendingWithChoice(
    reopened.state,
    { type: "lokiLaughtOption", option: "chicken" },
    makeRngSequence([])
  );
  const attackQueued = resolvePendingWithChoice(
    optionAgain.state,
    { type: "lokiChickenTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  assert(
    attackQueued.state.pendingRoll?.kind === "attack_attackerRoll",
    "Chicken should start an attack-vs-defense roll"
  );
  const applied = resolveAllPendingRollsWithEvents(
    attackQueued.state,
    makeRngSequence([0.9, 0.7, 0.01, 0.2])
  );
  assert(
    (applied.state.units[enemy.id].lokiChickenSources ?? []).includes(loki.id),
    "selected target should gain chicken status"
  );
  assert(
    applied.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 0,
    "Chicken should spend exactly 5 Laughter on target resolution"
  );
  assert(
    applied.state.units[loki.id].turn.actionUsed,
    "Chicken should spend Loki's action on target resolution"
  );
  assert(applied.state.units[loki.id].isStealthed, "Chicken must preserve Loki stealth");

  const chickenMoves = getLegalMovesForUnit(applied.state, enemy.id);
  assert(chickenMoves.length > 0, "chicken unit should still have move options");
  assert(
    chickenMoves.every((coord) => {
      const pos = applied.state.units[enemy.id].position!;
      return (
        Math.max(Math.abs(coord.col - pos.col), Math.abs(coord.row - pos.row)) <= 1
      );
    }),
    "chicken move options should be limited to 1 cell"
  );

  const enemyTurnState = {
    ...applied.state,
    currentPlayer: "P2" as const,
    activeUnitId: enemy.id,
    pendingRoll: null,
    pendingMove: null,
  };
  const blockedAttack = applyAction(
    enemyTurnState,
    { type: "attack", attackerId: enemy.id, defenderId: defender.id } as any,
    makeRngSequence([])
  );
  assert(
    blockedAttack.events.length === 0 && !blockedAttack.state.pendingRoll,
    "chicken should block attacks"
  );

  const blockedAbility = applyAction(
    enemyTurnState,
    {
      type: "useAbility",
      unitId: enemy.id,
      abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    } as any,
    makeRngSequence([])
  );
  assert(
    blockedAbility.events.length === 0,
    "chicken should block activating abilities"
  );

  const expiryState: GameState = {
    ...applied.state,
    currentPlayer: "P1",
    activeUnitId: null,
    pendingRoll: null,
    pendingMove: null,
    turnQueue: [loki.id],
    turnQueueIndex: 0,
    turnOrder: [loki.id],
    turnOrderIndex: 0,
  };
  const expired = applyAction(
    expiryState,
    { type: "unitStartTurn", unitId: loki.id } as any,
    makeRngSequence([])
  );
  assert(
    (expired.state.units[enemy.id].lokiChickenSources?.length ?? 0) === 0,
    "Chicken should expire at the start of Loki's next turn"
  );

  const retry = setUnit(expired.state, loki.id, {
    charges: { ...expired.state.units[loki.id].charges, [ABILITY_LOKI_LAUGHT]: 5 },
  });
  const retryMenu = applyAction(
    retry,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const retryTarget = resolvePendingWithChoice(
    resolvePendingWithChoice(
      retryMenu.state,
      { type: "lokiLaughtOption", option: "chicken" },
      makeRngSequence([])
    ).state,
    { type: "lokiChickenTarget", targetId: enemy.id },
    makeRngSequence([])
  );
  const defended = resolveAllPendingRollsWithEvents(
    retryTarget.state,
    makeRngSequence([0.01, 0.2, 0.99, 0.8])
  );
  assert(
    (defended.state.units[enemy.id].lokiChickenSources?.length ?? 0) === 0,
    "successful Chicken defense should not transform the target"
  );

  console.log("loki_option_two_chicken_blocks_and_restricts_move passed");
}


export function testLokiOptionThreeMindControlForcedAttackAndSlots() {
  let { state, loki } = setupLokiState();
  const controlled = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const controlledTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const controllerAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const hiddenEnemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "assassin"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 10 },
  });
  state = setUnit(state, controlled.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, controlledTarget.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, controllerAlly.id, { position: { col: 6, row: 4 } });
  state = setUnit(state, hiddenEnemy.id, {
    position: { col: 5, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 3,
  });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);
  const targetHpBefore = state.units[controlledTarget.id].hp;

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const option = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "mindControl" },
    makeRngSequence([])
  );
  assert(
    option.state.pendingRoll?.kind === "lokiMindControlEnemyChoice",
    "mind control option should request enemy selection"
  );
  assert(
    option.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 10,
    "entering mind control enemy selection should not spend Laughter"
  );
  assert(
    !option.state.units[loki.id].turn.actionUsed,
    "entering mind control enemy selection should not consume Loki action slot"
  );
  const enemyOptions = (option.state.pendingRoll?.context?.options ?? []) as string[];
  assert(
    !enemyOptions.includes(hiddenEnemy.id),
    "mind control should not offer an unknown hidden unit to control"
  );

  const pickedEnemy = resolvePendingWithChoice(
    option.state,
    { type: "lokiMindControlEnemy", targetId: controlled.id },
    makeRngSequence([])
  );
  assert(
    pickedEnemy.state.pendingRoll?.kind === "lokiMindControlTargetChoice",
    "mind control should request forced target selection"
  );
  assert(
    pickedEnemy.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 10,
    "picking a controlled enemy should not spend Laughter before attack target resolution"
  );
  assert(
    !pickedEnemy.state.units[loki.id].turn.actionUsed,
    "picking a controlled enemy should not consume Loki action before attack target resolution"
  );
  const options = (pickedEnemy.state.pendingRoll?.context?.options ?? []) as string[];
  assert(
    options.includes(controlledTarget.id),
    "mind control should let controlled unit target its own normal ally"
  );
  assert(
    !options.includes(controllerAlly.id),
    "mind control should treat controller-side units as allies during forced attack"
  );
  assert(
    !options.includes(hiddenEnemy.id),
    "mind control should not leak an unknown hidden forced-attack target"
  );
  const invalidTarget = resolvePendingWithChoice(
    pickedEnemy.state,
    { type: "lokiMindControlTarget", targetId: controllerAlly.id },
    makeRngSequence([])
  );
  assert(
    invalidTarget.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 10,
    "invalid mind control target should not spend Laughter"
  );
  assert(
    !invalidTarget.state.units[loki.id].turn.actionUsed,
    "invalid mind control target should not spend Loki action"
  );

  const pickedTarget = resolvePendingWithChoice(
    pickedEnemy.state,
    { type: "lokiMindControlTarget", targetId: controlledTarget.id },
    makeRngSequence([])
  );
  assert(
    pickedTarget.state.pendingRoll?.kind === "attack_attackerRoll",
    "mind control should transition into a normal attack roll"
  );
  assert(
    pickedTarget.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 0,
    "mind control should spend exactly 10 Laughter on attack target resolution"
  );
  assert(
    pickedTarget.state.units[loki.id].turn.actionUsed,
    "mind control should consume Loki action on attack target resolution"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    pickedTarget.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  assert(
    resolved.state.units[controlledTarget.id].hp < targetHpBefore,
    "forced attack should damage the selected target on successful hit"
  );
  assert(
    resolved.state.units[controlled.id].turn.attackUsed &&
      resolved.state.units[controlled.id].turn.actionUsed,
    "controlled enemy should spend attack+action slots"
  );
  assert(
    resolved.state.units[loki.id].isStealthed,
    "using Loki laughter options should not reveal Loki stealth"
  );
  const controlledAttackEvent = pickedTarget.events.find(
    (event) =>
      event.type === "controlledAttackDeclared" &&
      event.controllerUnitId === loki.id &&
      event.controlledUnitId === controlled.id &&
      event.targetId === controlledTarget.id
  );
  assert(controlledAttackEvent, "mind control should log controlled attack details");

  const restoredTurnState = setUnit(
    {
      ...resolved.state,
      currentPlayer: "P2",
      activeUnitId: controlled.id,
      pendingRoll: null,
      pendingMove: null,
    },
    controlled.id,
    {
      turn: makeEmptyTurnEconomy(),
      hasAttackedThisTurn: false,
      hasActedThisTurn: false,
    }
  );
  const normalEnemyAttack = applyAction(
    restoredTurnState,
    { type: "attack", attackerId: controlled.id, defenderId: controllerAlly.id } as any,
    makeRngSequence([])
  );
  assert(
    normalEnemyAttack.state.pendingRoll?.kind === "attack_attackerRoll",
    "controlled unit allegiance should be normal again after mind control"
  );

  console.log("loki_option_three_mind_control_forced_attack_and_slots passed");
}

export function testLokiSpinWheelPoolFallbackAndCost() {
  let { state, loki } = setupLokiState();
  const selected = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 12 },
  });
  state = setUnit(state, selected.id, {
    position: { col: 2, row: 2 },
    heroId: HERO_GENGHIS_KHAN_ID,
    charges: {
      ...selected.charges,
      [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: 2,
    },
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", loki.id));

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const spun = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "spinTheDrum" },
    makeRngSequence([0.5])
  );
  assert(
    spun.state.pendingRoll?.kind === "lokiSpinAbilityChoice",
    "an impossible selected phantasm should create a fallback ability choice"
  );
  assert(
    spun.state.pendingRoll?.context.selectedUnitId === selected.id,
    "spin pool must select the only positioned living ally and never Loki"
  );
  assert(
    (spun.state.pendingRoll?.context.options as string[]).includes(
      ABILITY_GENGHIS_KHAN_KHANS_DECREE
    ),
    "fallback should expose the selected ally's available active ability"
  );
  assert(
    spun.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 0,
    "Spin the Wheel should spend exactly 12 Laugh once"
  );
  const fallback = resolvePendingWithChoice(
    spun.state,
    { type: "lokiSpinAbility", abilityId: ABILITY_GENGHIS_KHAN_KHANS_DECREE },
    makeRngSequence([])
  );
  assert(!fallback.state.pendingRoll, "fallback ability selection should clear the spin choice");
  assert(
    fallback.state.units[selected.id].genghisKhanDecreeMovePending,
    "selected fallback ability should resolve through its normal pipeline"
  );
  assert(fallback.state.activeUnitId === loki.id, "temporary control must restore Loki as active");

  let noAlly = setUnit(state, selected.id, { position: null });
  noAlly = setUnit(noAlly, loki.id, {
    charges: { ...noAlly.units[loki.id].charges, [ABILITY_LOKI_LAUGHT]: 12 },
  });
  const noAllyStarted = applyAction(
    noAlly,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const rejected = resolvePendingWithChoice(
    noAllyStarted.state,
    { type: "lokiLaughtOption", option: "spinTheDrum" },
    makeRngSequence([0.5])
  );
  assert(
    rejected.state.pendingRoll?.kind === "lokiLaughtChoice" &&
      rejected.state.units[loki.id].charges[ABILITY_LOKI_LAUGHT] === 12,
    "Spin without another living positioned ally must reject without cost"
  );

  console.log("loki_spin_wheel_pool_fallback_and_cost passed");
}


export function testLokiOptionFiveMassChickenFailOnlyAlliesAndEnemies() {
  let { state, loki } = setupLokiState();
  const allyOne = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const allyTwo = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider"
  )!;
  const enemyOne = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const enemyTwo = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman"
  )!;
  const outside = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer"
  )!;

  state = setUnit(state, loki.id, {
    position: { col: 4, row: 4 },
    isStealthed: true,
    stealthTurnsLeft: 3,
    charges: { ...loki.charges, [ABILITY_LOKI_LAUGHT]: 15 },
  });
  state = setUnit(state, allyOne.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, allyTwo.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, enemyOne.id, { position: { col: 5, row: 4 } });
  state = setUnit(state, enemyTwo.id, { position: { col: 4, row: 3 } });
  state = setUnit(state, outside.id, { position: { col: 8, row: 8 } });
  state = toBattleState(state, "P1", loki.id);
  state = initKnowledgeForOwners(state);
  const hpBefore = Object.fromEntries(
    [allyOne.id, allyTwo.id, enemyOne.id, enemyTwo.id].map((unitId) => [
      unitId,
      state.units[unitId].hp,
    ])
  );

  const started = applyAction(
    state,
    { type: "useAbility", unitId: loki.id, abilityId: ABILITY_LOKI_LAUGHT } as any,
    makeRngSequence([])
  );
  const queued = resolvePendingWithChoice(
    started.state,
    { type: "lokiLaughtOption", option: "greatLokiJoke" },
    makeRngSequence([])
  );
  const applied = resolveAllPendingRollsWithEvents(
    queued.state,
    makeRngSequence([
      0.5, 0.7,
      0.01, 0.2,
      0.01, 0.2,
      0.01, 0.2,
      0.99, 0.8,
    ])
  );
  assert(!applied.state.pendingRoll, "mass chicken should resolve immediately");

  const targets = [allyOne.id, allyTwo.id, enemyOne.id, enemyTwo.id];
  const chickenedTargets = targets.filter((unitId) =>
    (applied.state.units[unitId].lokiChickenSources ?? []).includes(loki.id)
  );
  const chickenedAllies = chickenedTargets.filter(
    (unitId) => applied.state.units[unitId].owner === "P1"
  );
  const chickenedEnemies = chickenedTargets.filter(
    (unitId) => applied.state.units[unitId].owner === "P2"
  );

  assert(
    chickenedAllies.length > 0,
    "great Loki joke should be able to affect allies on failed rolls"
  );
  assert(
    chickenedEnemies.length > 0,
    "great Loki joke should be able to affect enemies on failed rolls"
  );
  assert(
    chickenedTargets.length < targets.length,
    "only failed resist rolls should apply chicken"
  );
  assert(
    targets.every((unitId) => applied.state.units[unitId].hp === hpBefore[unitId]),
    "Amazing Loki Joke should never deal damage"
  );
  assert(
    !(applied.state.units[outside.id].lokiChickenSources ?? []).includes(loki.id),
    "Amazing Loki Joke must not affect targets outside the Trickster area"
  );
  assert(
    !applied.state.units[loki.id].isStealthed,
    "Amazing Loki Joke follows the global attack reveal rule"
  );
  const chickenEvents = applied.events.filter(
    (event) => event.type === "lokiChickenGroupApplied"
  );
  assert(
    chickenEvents.length === 1,
    "great Loki joke should log one grouped chicken conversion"
  );
  const groupedEvent = chickenEvents[0];
  assert(
    groupedEvent?.type === "lokiChickenGroupApplied" &&
      groupedEvent.targetIds.length === chickenedTargets.length &&
      chickenedTargets.every((unitId) => groupedEvent.targetIds.includes(unitId)),
    "grouped chicken event should list only failed defenders"
  );
  assert(
    !applied.events.some((event) => event.type === "lokiChickenApplied"),
    "great Loki joke should not spam one chicken event per target"
  );

  console.log("loki_option_five_mass_chicken_fail_only_allies_and_enemies passed");
}
