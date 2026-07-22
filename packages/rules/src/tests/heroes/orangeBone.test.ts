import {
  ABILITY_PAPYRUS_SPAGHETTI,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getLegalMovesForUnit,
  HERO_PAPYRUS_ID,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  setUnit,
  toBattleState,
  type GameState,
  type UnitState,
} from "../helpers/testUtils";

function orangeTurn(hp = 6): {
  state: GameState;
  actor: UnitState;
  defender: UnitState;
  papyrus: UnitState;
} {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID })
  );
  state = attachArmy(state, createDefaultArmy("P2"));

  const papyrus = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const actor = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, papyrus.id, {
    position: { col: 1, row: 1 },
    ownTurnsStarted: 0,
  });
  state = setUnit(state, defender.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, actor.id, {
    position: { col: 4, row: 4 },
    hp,
    turn: makeEmptyTurnEconomy(),
    papyrusBoneStatus: {
      sourceUnitId: papyrus.id,
      kind: "orange",
      expiresOnSourceOwnTurn: 1,
    },
    orangeBoneFirstMoveSatisfied: false,
    orangeBonePenaltyAppliedThisTurn: false,
    hasSpentMeaningfulTurnAction: false,
  });
  state = toBattleState(state, "P2", actor.id);
  state = initKnowledgeForOwners(state);

  return {
    state,
    actor: state.units[actor.id],
    defender: state.units[defender.id],
    papyrus: state.units[papyrus.id],
  };
}

function orangePenaltyEvents(events: ReturnType<typeof applyAction>["events"]) {
  return events.filter(
    (event) =>
      event.type === "papyrusBonePunished" &&
      event.reason === "nonMoveFirst"
  );
}

export function testOrangeBoneRequiresMovementFirst() {
  const base = orangeTurn();

  const moves = getLegalMovesForUnit(base.state, base.actor.id);
  assert(moves.length > 0, "Orange Bone movement test needs a legal move");
  const moved = applyAction(
    base.state,
    { type: "move", unitId: base.actor.id, to: moves[0] } as any,
    makeRngSequence([])
  );
  assert(
    moved.state.units[base.actor.id].hp === base.actor.hp,
    "moving first must not deal Orange Bone damage"
  );
  assert(
    moved.state.units[base.actor.id].orangeBoneFirstMoveSatisfied === true &&
      moved.state.units[base.actor.id].hasSpentMeaningfulTurnAction === true,
    "a successful Movement spend should satisfy Orange Bone for the turn"
  );
  const endedAfterMove = applyAction(
    moved.state,
    { type: "endTurn" } as any,
    makeRngSequence([])
  );
  assert(
    orangePenaltyEvents(endedAfterMove.events).length === 0,
    "ending after moving first must not deal Orange Bone damage"
  );

  const attackFirst = applyAction(
    base.state,
    {
      type: "attack",
      attackerId: base.actor.id,
      defenderId: base.defender.id,
    } as any,
    makeRngSequence([])
  );
  assert(
    attackFirst.state.units[base.actor.id].hp === base.actor.hp - 1,
    "a legal Attack declaration should take Orange Bone damage immediately"
  );
  assert(
    attackFirst.events[0]?.type === "papyrusBonePunished" &&
      attackFirst.events.some((event) => event.type === "rollRequested"),
    "Orange Bone damage must be emitted before attack resolution starts"
  );
  const attackResolved = resolveAllPendingRollsWithEvents(
    attackFirst.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01])
  );
  const stealthAfterAttack = applyAction(
    attackResolved.state,
    { type: "enterStealth", unitId: base.actor.id } as any,
    makeRngSequence([])
  );
  assert(
    stealthAfterAttack.state.units[base.actor.id].hp ===
      attackResolved.state.units[base.actor.id].hp &&
      orangePenaltyEvents(stealthAfterAttack.events).length === 0,
    "Orange Bone must apply at most once in a turn"
  );

  const stealthFirst = applyAction(
    base.state,
    { type: "enterStealth", unitId: base.actor.id } as any,
    makeRngSequence([])
  );
  assert(
    stealthFirst.state.units[base.actor.id].hp === base.actor.hp - 1 &&
      orangePenaltyEvents(stealthFirst.events).length === 1,
    "a legal Stealth attempt should trigger Orange Bone before its outcome"
  );

  const searchActionFirst = applyAction(
    base.state,
    { type: "searchStealth", unitId: base.actor.id, mode: "action" } as any,
    makeRngSequence([])
  );
  assert(
    searchActionFirst.state.units[base.actor.id].hp === base.actor.hp - 1 &&
      searchActionFirst.state.units[base.actor.id].turn.actionUsed,
    "Search(Action) should trigger Orange Bone and then spend Action"
  );
  assert(
    searchActionFirst.events[0]?.type === "papyrusBonePunished",
    "Search(Action) should emit damage before its search event"
  );

  const searchMoveFirst = applyAction(
    base.state,
    { type: "searchStealth", unitId: base.actor.id, mode: "move" } as any,
    makeRngSequence([])
  );
  assert(
    searchMoveFirst.state.units[base.actor.id].hp === base.actor.hp &&
      searchMoveFirst.state.units[base.actor.id].orangeBoneFirstMoveSatisfied === true,
    "Search(Move) should safely satisfy Orange Bone when it spends Movement"
  );

  const preview = applyAction(
    base.state,
    { type: "requestMoveOptions", unitId: base.actor.id } as any,
    makeRngSequence([])
  );
  assert(
    preview.state.units[base.actor.id].orangeBoneFirstMoveSatisfied !== true &&
      preview.state.units[base.actor.id].hp === base.actor.hp,
    "opening movement options must neither satisfy nor trigger Orange Bone"
  );
  const invalidMove = applyAction(
    preview.state,
    { type: "move", unitId: base.actor.id, to: { col: -1, row: -1 } } as any,
    makeRngSequence([])
  );
  assert(
    invalidMove.state.units[base.actor.id].orangeBoneFirstMoveSatisfied !== true &&
      invalidMove.state.units[base.actor.id].hp === base.actor.hp,
    "an invalid movement attempt must not satisfy Orange Bone"
  );

  const invalidAttack = applyAction(
    base.state,
    {
      type: "attack",
      attackerId: base.actor.id,
      defenderId: "missing-unit",
    } as any,
    makeRngSequence([])
  );
  assert(
    invalidAttack.state === base.state &&
      invalidAttack.events.length === 0 &&
      invalidAttack.state.units[base.actor.id].hp === base.actor.hp,
    "a command rejected before gameplay resolution must not trigger Orange Bone"
  );

  const endedFirst = applyAction(
    base.state,
    { type: "endTurn" } as any,
    makeRngSequence([])
  );
  assert(
    endedFirst.state.units[base.actor.id].hp === base.actor.hp - 1 &&
      endedFirst.events[0]?.type === "papyrusBonePunished",
    "End Turn without moving first should trigger Orange Bone before turn advance"
  );

  const staleTracking = setUnit(base.state, base.actor.id, {
    orangeBoneFirstMoveSatisfied: true,
    orangeBonePenaltyAppliedThisTurn: true,
    hasSpentMeaningfulTurnAction: true,
  });
  const restarted = applyAction(
    {
      ...staleTracking,
      activeUnitId: null,
      currentPlayer: "P2",
      turnQueue: [base.actor.id],
      turnQueueIndex: 0,
      turnOrder: [base.actor.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: base.actor.id } as any,
    makeRngSequence([])
  );
  assert(
    restarted.state.units[base.actor.id].orangeBoneFirstMoveSatisfied === false &&
      restarted.state.units[base.actor.id].orangeBonePenaltyAppliedThisTurn === false &&
      restarted.state.units[base.actor.id].hasSpentMeaningfulTurnAction === false,
    "Orange Bone tracking must reset at the affected unit's turn start"
  );

  let abilityState = setUnit(base.state, base.papyrus.id, {
    hp: 4,
    papyrusUnbelieverActive: true,
    charges: {
      ...base.papyrus.charges,
      [ABILITY_PAPYRUS_SPAGHETTI]: 3,
    },
    papyrusBoneStatus: {
      sourceUnitId: base.papyrus.id,
      kind: "orange",
      expiresOnSourceOwnTurn: 1,
    },
    turn: makeEmptyTurnEconomy(),
    orangeBoneFirstMoveSatisfied: false,
    orangeBonePenaltyAppliedThisTurn: false,
    hasSpentMeaningfulTurnAction: false,
  });
  abilityState = {
    ...abilityState,
    currentPlayer: "P1",
    activeUnitId: base.papyrus.id,
  };
  const abilityFirst = applyAction(
    abilityState,
    {
      type: "useAbility",
      unitId: base.papyrus.id,
      abilityId: ABILITY_PAPYRUS_SPAGHETTI,
    } as any,
    makeRngSequence([])
  );
  assert(
    abilityFirst.state.units[base.papyrus.id].hp === 5 &&
      abilityFirst.events[0]?.type === "papyrusBonePunished" &&
      abilityFirst.events.some((event) => event.type === "abilityUsed"),
    "an active ability should take Orange Bone damage before it resolves"
  );

  const lethalState = setUnit(abilityState, base.papyrus.id, { hp: 1 });
  const lethalAbility = applyAction(
    lethalState,
    {
      type: "useAbility",
      unitId: base.papyrus.id,
      abilityId: ABILITY_PAPYRUS_SPAGHETTI,
    } as any,
    makeRngSequence([])
  );
  assert(
    !lethalAbility.state.units[base.papyrus.id].isAlive &&
      lethalAbility.state.units[base.papyrus.id].charges[ABILITY_PAPYRUS_SPAGHETTI] === 3 &&
      !lethalAbility.events.some((event) => event.type === "abilityUsed"),
    "lethal Orange Bone damage must stop the declared ability before its effects or costs"
  );

  console.log("orange_bone_requires_movement_first passed");
}
