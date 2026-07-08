import {
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  applyAction,
  assert,
  Coord,
  getHeroMeta,
  getUnitDefinition,
  HERO_RIVER_PERSON_ID,
  initKnowledgeForOwners,
  makeAttackWinRng,
  makeEmptyTurnEconomy,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  resolvePendingWithChoice,
  setUnit,
  setupRiverPersonState,
  toBattleState,
} from "../helpers/testUtils";

function abilityAction(unitId: string, abilityId: string) {
  return {
    type: "useAbility",
    unitId,
    abilityId,
  } as any;
}

function getPendingOptions<T = Coord>(state: ReturnType<typeof setupRiverPersonState>["state"]): T[] {
  return ((state.pendingRoll?.context as { options?: T[] } | undefined)?.options ??
    []) as T[];
}

function expectCoord(options: Coord[], expected: Coord, message: string): void {
  assert(
    options.some(
      (coord) => coord.col === expected.col && coord.row === expected.row
    ),
    message
  );
}

function completeBoatUse(
  state: ReturnType<typeof setupRiverPersonState>["state"],
  riverId: string,
  allyId: string,
  destination: Coord,
  preferredDrop?: Coord
) {
  const used = applyAction(
    state,
    abilityAction(riverId, ABILITY_RIVER_PERSON_BOAT),
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "riverBoatCarryChoice",
    "Boat should begin with explicit passenger selection"
  );
  const carrySelected = resolvePendingWithChoice(
    used.state,
    { type: "hassanTrueEnemyTarget", targetId: allyId },
    makeRngSequence([])
  );
  assert(
    carrySelected.state.pendingRoll?.kind === "riverBoatDestinationChoice",
    "Boat passenger selection should request River destination"
  );
  const destinationSelected = resolvePendingWithChoice(
    carrySelected.state,
    { type: "forestMoveDestination", position: destination },
    makeRngSequence([])
  );
  assert(
    destinationSelected.state.pendingRoll?.kind === "riverBoatDropDestination",
    "Boat destination selection should request final passenger drop"
  );
  const dropOptions = getPendingOptions(destinationSelected.state);
  const drop =
    preferredDrop ??
    dropOptions.find(
      (coord) => coord.col !== destination.col || coord.row !== destination.row
    );
  assert(drop, "Boat drop options should include an adjacent empty cell");
  return resolvePendingWithChoice(
    destinationSelected.state,
    { type: "forestMoveDestination", position: drop },
    makeRngSequence([])
  );
}

export function testRiverPersonHpBonus() {
  const { river } = setupRiverPersonState();
  const baseHp = getUnitDefinition("rider").maxHp;
  const meta = getHeroMeta(HERO_RIVER_PERSON_ID);

  assert(river.hp === baseHp + 1, "River Person HP should be base rider HP + 1");
  assert(
    meta?.baseStats.hp === baseHp + 1,
    "River Person hero meta HP should be base rider HP + 1"
  );

  console.log("river_person_hp_bonus passed");
}

export function testRiverPersonNoRiderPathFeature() {
  let { state, river } = setupRiverPersonState();
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;

  state = setUnit(state, river.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, enemy.id, { position: { col: 0, row: 1 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  const moved = applyAction(
    state,
    { type: "move", unitId: river.id, to: { col: 0, row: 4 } } as any,
    makeRngSequence([])
  );
  assert(
    moved.state.units[river.id].position?.col === 0 &&
      moved.state.units[river.id].position?.row === 4,
    "River Person should still use rider baseline movement"
  );
  assert(
    moved.state.pendingRoll?.kind !== "riderPathAttack_attackerRoll",
    "River Person should not trigger rider path attacks"
  );
  const riderPathRequested = moved.events.some(
    (event) =>
      event.type === "rollRequested" &&
      event.kind === "riderPathAttack_attackerRoll"
  );
  assert(!riderPathRequested, "River Person movement should not queue rider path roll");

  console.log("river_person_no_rider_path_feature passed");
}

export function testRiverPersonBoatCarryFlowAndConstraints() {
  {
    let { state, river } = setupRiverPersonState();
    state = setUnit(state, river.id, { position: { col: 4, row: 4 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const moveOptions = applyAction(
      state,
      { type: "requestMoveOptions", unitId: river.id } as any,
      makeRngSequence([])
    );
    assert(
      moveOptions.state.pendingRoll?.kind !== "riverBoatCarryChoice",
      "Normal move options should not auto-open Boat passenger selection"
    );

    const boat = applyAction(
      state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOAT),
      makeRngSequence([])
    );
    assert(
      boat.state.pendingRoll?.kind !== "riverBoatCarryChoice",
      "Boat should not start without an adjacent allied passenger"
    );
    assert(!boat.state.units[river.id].turn.moveUsed, "Rejected Boat should not spend move");
  }

  {
    let { state, river } = setupRiverPersonState();
    const carriedAlly = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    )!;
    const blockA = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "knight"
    )!;
    const blockB = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "knight"
    )!;
    const blockC = Object.values(state.units).find(
      (unit) => unit.owner === "P2" && unit.class === "archer"
    )!;

    state = setUnit(state, river.id, { position: { col: 0, row: 3 } });
    state = setUnit(state, carriedAlly.id, { position: { col: 1, row: 3 } });
    state = setUnit(state, blockA.id, { position: { col: 0, row: 1 } });
    state = setUnit(state, blockB.id, { position: { col: 1, row: 0 } });
    state = setUnit(state, blockC.id, { position: { col: 1, row: 1 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const used = applyAction(
      state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOAT),
      makeRngSequence([])
    );
    assert(
      used.state.pendingRoll?.kind === "riverBoatCarryChoice",
      "Boat should prompt explicit passenger selection"
    );
    assert(!used.state.units[river.id].turn.moveUsed, "Boat activation should not spend move");

    const canceled = resolvePendingWithChoice(
      used.state,
      "skip",
      makeRngSequence([])
    );
    assert(!canceled.state.pendingRoll, "Boat cancel should clear pending state");
    assert(!canceled.state.units[river.id].turn.moveUsed, "Boat cancel should not spend move");

    const restarted = applyAction(
      state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOAT),
      makeRngSequence([])
    );
    const carrySelected = resolvePendingWithChoice(
      restarted.state,
      { type: "hassanTrueEnemyTarget", targetId: carriedAlly.id },
      makeRngSequence([])
    );
    assert(
      carrySelected.state.pendingRoll?.kind === "riverBoatDestinationChoice",
      "Boat passenger selection should request destination"
    );
    assert(
      !carrySelected.state.units[river.id].turn.moveUsed,
      "Boat passenger selection should not spend move"
    );

    const legalDestinations = getPendingOptions(carrySelected.state);
    assert(
      !legalDestinations.some((coord) => coord.col === 0 && coord.row === 0),
      "Boat destination options should exclude destinations without legal drop"
    );
    expectCoord(
      legalDestinations,
      { col: 0, row: 5 },
      "Boat destination options should include legal carry destination"
    );

    const destinationSelected = resolvePendingWithChoice(
      carrySelected.state,
      { type: "forestMoveDestination", position: { col: 0, row: 5 } },
      makeRngSequence([])
    );
    assert(
      destinationSelected.state.pendingRoll?.kind === "riverBoatDropDestination",
      "Boat destination should request passenger drop"
    );
    assert(
      destinationSelected.state.units[river.id].position?.row === 3,
      "Boat destination selection should not move River early"
    );
    assert(
      !destinationSelected.state.units[river.id].turn.moveUsed,
      "Boat destination selection should not spend move"
    );

    const invalidDrop = resolvePendingWithChoice(
      destinationSelected.state,
      { type: "forestMoveDestination", position: { col: 2, row: 5 } },
      makeRngSequence([])
    );
    assert(
      invalidDrop.state.pendingRoll?.kind === "riverBoatDropDestination",
      "Invalid Boat drop should be rejected without clearing pending state"
    );
    assert(
      invalidDrop.state.units[river.id].position?.row === 3 &&
        invalidDrop.state.units[carriedAlly.id].position?.row === 3,
      "Invalid Boat drop should not move or corrupt carried state"
    );

    const dropOptions = getPendingOptions(destinationSelected.state);
    assert(dropOptions.length > 0, "Boat drop options should be provided");
    const chosenDrop = dropOptions[0]!;
    const dropped = resolvePendingWithChoice(
      destinationSelected.state,
      { type: "forestMoveDestination", position: chosenDrop },
      makeRngSequence([])
    );

    const riverAfter = dropped.state.units[river.id];
    const allyAfter = dropped.state.units[carriedAlly.id];
    assert(
      riverAfter.position?.col === 0 && riverAfter.position?.row === 5,
      "Boat should move River Person on final drop resolution"
    );
    assert(
      allyAfter.position?.col === chosenDrop.col &&
        allyAfter.position?.row === chosenDrop.row,
      "Boat should drop passenger on chosen legal cell"
    );
    assert(riverAfter.turn.moveUsed, "Boat should consume one move after final drop");
    assert(!riverAfter.turn.actionUsed, "Boat should not consume main action");
    assert(
      riverAfter.riverBoatCarryAllyId === undefined,
      "Boat should not leave stale carried state"
    );
    assert(
      dropped.events.some(
        (event) =>
          event.type === "riverBoatResolved" &&
          event.riverId === river.id &&
          event.passengerId === carriedAlly.id &&
          event.dropDestination.col === chosenDrop.col &&
          event.dropDestination.row === chosenDrop.row
      ),
      "completed Boat should emit one semantic transport event after final drop"
    );
  }

  console.log("river_person_boat_carry_flow_and_constraints passed");
}

export function testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry() {
  {
    let { state, river } = setupRiverPersonState();
    const ally = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    )!;
    state = setUnit(state, river.id, { position: { col: 3, row: 3 } });
    state = setUnit(state, ally.id, { position: { col: 3, row: 4 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const usedBoatman = applyAction(
      state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOATMAN),
      makeRngSequence([])
    );
    const riverAfter = usedBoatman.state.units[river.id];
    assert(riverAfter.turn.actionUsed, "Boatman should consume main action immediately");
    assert(!riverAfter.turn.moveUsed, "Boatman should not consume normal move slot");
    assert(
      riverAfter.riverBoatmanExtraMoves === 1,
      "Boatman should grant exactly one extra movement action"
    );
    assert(
      riverAfter.position?.col === 3 && riverAfter.position?.row === 3,
      "Boatman should not move River Person"
    );
    assert(
      !usedBoatman.state.pendingRoll,
      "Boatman should not start passenger selection or movement"
    );
    assert(
      usedBoatman.events.some(
        (event) =>
          event.type === "riverBoatmanGranted" &&
          event.riverId === river.id &&
          event.extraMoves === 1
      ),
      "Boatman should emit a semantic extra-movement grant event"
    );

    const duplicate = applyAction(
      usedBoatman.state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOATMAN),
      makeRngSequence([])
    );
    assert(
      duplicate.state.units[river.id].riverBoatmanExtraMoves === 1,
      "Duplicate illegal Boatman activation should not grant another move"
    );
    assert(
      duplicate.state.units[river.id].turn.actionUsed,
      "Rejected duplicate Boatman should preserve already spent action"
    );
  }

  {
    let { state, river } = setupRiverPersonState();
    const ally = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    )!;
    state = setUnit(state, river.id, { position: { col: 3, row: 3 } });
    state = setUnit(state, ally.id, { position: { col: 3, row: 4 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const boatman = applyAction(
      state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOATMAN),
      makeRngSequence([])
    );
    const firstBoat = completeBoatUse(
      boatman.state,
      river.id,
      ally.id,
      { col: 3, row: 5 },
      { col: 4, row: 5 }
    );
    assert(
      firstBoat.state.units[river.id].turn.moveUsed,
      "First Boat after Boatman should consume the normal move slot"
    );
    assert(
      firstBoat.state.units[river.id].riverBoatmanExtraMoves === 1,
      "First Boat after Boatman should leave one extra move available"
    );

    const secondBoat = completeBoatUse(
      firstBoat.state,
      river.id,
      ally.id,
      { col: 3, row: 7 },
      { col: 4, row: 7 }
    );
    assert(
      secondBoat.state.units[river.id].riverBoatmanExtraMoves === 0,
      "Second Boat after Boatman should consume the granted extra move"
    );
    assert(
      secondBoat.state.units[river.id].turn.moveUsed,
      "Second Boat should share the normal movement budget state"
    );

    const thirdAttempt = applyAction(
      secondBoat.state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOAT),
      makeRngSequence([])
    );
    assert(
      !thirdAttempt.state.pendingRoll,
      "Third Boat attempt should be rejected after both movement actions are spent"
    );
  }

  {
    let { state, river } = setupRiverPersonState();
    const ally = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.class === "assassin"
    )!;
    state = setUnit(state, river.id, { position: { col: 3, row: 3 } });
    state = setUnit(state, ally.id, { position: { col: 3, row: 4 } });
    state = toBattleState(state, "P1", river.id);
    state = initKnowledgeForOwners(state);

    const firstBoat = completeBoatUse(
      state,
      river.id,
      ally.id,
      { col: 3, row: 5 },
      { col: 4, row: 5 }
    );
    const secondAttempt = applyAction(
      firstBoat.state,
      abilityAction(river.id, ABILITY_RIVER_PERSON_BOAT),
      makeRngSequence([])
    );
    assert(
      !secondAttempt.state.pendingRoll,
      "Without Boatman, only one Boat use should be possible"
    );
  }

  console.log("river_person_boatman_converts_action_to_move_and_supports_carry passed");
}

export function testRiverPersonGuideOfSoulsStormImmunity() {
  let { state, river } = setupRiverPersonState();
  state = setUnit(state, river.id, { position: { col: 4, row: 4 }, hp: 7 });
  state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: null,
    arenaId: "storm",
    turnQueue: [river.id],
    turnQueueIndex: 0,
    turnOrder: [river.id],
    turnOrderIndex: 0,
  };
  state = initKnowledgeForOwners(state);

  const started = applyAction(
    state,
    { type: "unitStartTurn", unitId: river.id } as any,
    makeRngSequence([0.0])
  );
  assert(
    started.state.units[river.id].hp === 7,
    "Guide of Souls should prevent storm start-turn damage"
  );

  console.log("river_person_guide_of_souls_storm_immunity passed");
}

export function testRiverPersonTraLaLaGatingAndFlow() {
  let { state, river } = setupRiverPersonState();
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "berserker"
  )!;
  const enemyPathBlocker = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight"
  )!;
  const allySpearman = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const allyKnight = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const allyPathBlocker = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;
  const deadAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "archer"
  )!;

  state = setUnit(state, river.id, {
    position: { col: 4, row: 4 },
    charges: { ...river.charges, [ABILITY_RIVER_PERSON_TRA_LA_LA]: 3 },
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 }, hp: 10 });
  state = setUnit(state, enemyPathBlocker.id, { position: { col: 4, row: 6 } });
  state = setUnit(state, allySpearman.id, { position: { col: 3, row: 4 } });
  state = setUnit(state, allyKnight.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, allyPathBlocker.id, { position: { col: 4, row: 5 } });
  state = setUnit(state, deadAlly.id, {
    position: { col: 3, row: 5 },
    isAlive: false,
  });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    abilityAction(river.id, ABILITY_RIVER_PERSON_TRA_LA_LA),
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind !== "riverTraLaLaTargetChoice",
    "Tra-la-la should be unavailable before full 4 charges"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 3,
    "Rejected Tra-la-la should not spend charges"
  );

  state = setUnit(state, river.id, {
    turn: makeEmptyTurnEconomy(),
    charges: {
      ...state.units[river.id].charges,
      [ABILITY_RIVER_PERSON_TRA_LA_LA]: 4,
    },
  });
  used = applyAction(
    state,
    abilityAction(river.id, ABILITY_RIVER_PERSON_TRA_LA_LA),
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "riverTraLaLaTargetChoice",
    "Tra-la-la should request adjacent target selection"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 4,
    "Tra-la-la activation should not spend charges"
  );
  assert(!used.state.units[river.id].turn.actionUsed, "Tra-la-la activation should not spend action");

  const canceled = resolvePendingWithChoice(used.state, "skip", makeRngSequence([]));
  assert(!canceled.state.pendingRoll, "Tra-la-la target cancel should clear pending state");
  assert(
    canceled.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 4 &&
      !canceled.state.units[river.id].turn.actionUsed,
    "Tra-la-la target cancel should spend nothing"
  );

  used = applyAction(
    state,
    abilityAction(river.id, ABILITY_RIVER_PERSON_TRA_LA_LA),
    makeRngSequence([])
  );
  const targetSelected = resolvePendingWithChoice(
    used.state,
    { type: "hassanTrueEnemyTarget", targetId: target.id },
    makeRngSequence([])
  );
  assert(
    targetSelected.state.pendingRoll?.kind === "riverTraLaLaDestinationChoice",
    "Tra-la-la should request line destination after target"
  );
  assert(
    targetSelected.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 4,
    "Tra-la-la target selection should not spend charges"
  );
  assert(!targetSelected.state.units[river.id].turn.actionUsed, "Tra-la-la target selection should not spend action");

  const destinationOptions = getPendingOptions(targetSelected.state);
  expectCoord(
    destinationOptions,
    { col: 7, row: 4 },
    "Tra-la-la destination options should include horizontal line"
  );
  expectCoord(
    destinationOptions,
    { col: 4, row: 7 },
    "Tra-la-la destination options should include vertical line through occupied cells"
  );
  expectCoord(
    destinationOptions,
    { col: 7, row: 7 },
    "Tra-la-la destination options should include diagonal line"
  );

  const invalidDestination = resolvePendingWithChoice(
    targetSelected.state,
    { type: "forestMoveDestination", position: { col: 6, row: 7 } },
    makeRngSequence([])
  );
  assert(
    invalidDestination.state.pendingRoll?.kind === "riverTraLaLaDestinationChoice",
    "Invalid non-straight Tra-la-la destination should be rejected"
  );
  assert(
    invalidDestination.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 4,
    "Invalid Tra-la-la destination should not spend resources"
  );

  const destinationSelected = resolvePendingWithChoice(
    targetSelected.state,
    { type: "forestMoveDestination", position: { col: 4, row: 7 } },
    makeRngSequence([])
  );
  assert(
    destinationSelected.state.pendingRoll?.kind === "riverTraLaLaDropDestinationChoice",
    "Tra-la-la destination should request final dragged-target drop"
  );
  assert(
    destinationSelected.state.units[river.id].position?.row === 4 &&
      destinationSelected.state.units[target.id].position?.col === 5,
    "Tra-la-la destination selection should not move units early"
  );
  assert(
    destinationSelected.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 4 &&
      !destinationSelected.state.units[river.id].turn.actionUsed,
    "Tra-la-la destination selection should spend nothing"
  );

  const invalidDrop = resolvePendingWithChoice(
    destinationSelected.state,
    { type: "forestMoveDestination", position: { col: 4, row: 6 } },
    makeRngSequence([])
  );
  assert(
    invalidDrop.state.pendingRoll?.kind === "riverTraLaLaDropDestinationChoice",
    "Occupied Tra-la-la drop should be rejected"
  );
  assert(
    invalidDrop.state.units[river.id].position?.row === 4,
    "Invalid Tra-la-la drop should not move River"
  );

  const dropOptions = getPendingOptions(destinationSelected.state);
  const chosenDrop =
    dropOptions.find((coord) => coord.col === 5 && coord.row === 7) ??
    dropOptions[0]!;
  const dropped = resolvePendingWithChoice(
    destinationSelected.state,
    { type: "forestMoveDestination", position: chosenDrop },
    makeRngSequence([])
  );
  assert(
    dropped.state.units[river.id].position?.col === 4 &&
      dropped.state.units[river.id].position?.row === 7,
    "Tra-la-la should move River on final drop resolution"
  );
  assert(
    dropped.state.units[target.id].position?.col === chosenDrop.col &&
      dropped.state.units[target.id].position?.row === chosenDrop.row,
    "Tra-la-la should place dragged target on selected adjacent drop cell"
  );
  assert(
    dropped.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 0,
    "Tra-la-la final drop should spend charges exactly once"
  );
  assert(
    dropped.state.units[river.id].turn.actionUsed,
    "Tra-la-la final drop should consume main action"
  );
  assert(
    dropped.state.pendingRoll?.kind === "attack_attackerRoll",
    "Tra-la-la touched allies should start forced attack resolution"
  );

  const queue = dropped.state.pendingCombatQueue ?? [];
  const attackerIds = queue.map((entry) => entry.attackerId);
  const uniqueAttackers = Array.from(new Set(attackerIds));
  assert(
    uniqueAttackers.length === attackerIds.length,
    "Each touched ally should attack at most once"
  );
  assert(
    attackerIds.includes(allySpearman.id) &&
      attackerIds.includes(allyKnight.id) &&
      attackerIds.includes(allyPathBlocker.id),
    "All eligible allies within one cell of the path should be queued"
  );
  assert(
    !attackerIds.includes(deadAlly.id),
    "Dead or otherwise ineligible touched allies should be skipped"
  );
  assert(
    !attackerIds.includes(enemyPathBlocker.id),
    "Enemy units touched by the path should not become allied forced attackers"
  );
  assert(
    attackerIds[0] === allySpearman.id,
    "Tra-la-la touched attacks should use deterministic first-contact then board order"
  );
  assert(
    queue.every((entry) => entry.consumeSlots === false),
    "Tra-la-la touched attacks should not consume touched units' normal action slots"
  );
  const tralalaEvent = dropped.events.find(
    (event) => event.type === "riverTraLaLaResolved"
  );
  assert(
    tralalaEvent?.type === "riverTraLaLaResolved" &&
      tralalaEvent.riverId === river.id &&
      tralalaEvent.targetId === target.id &&
      tralalaEvent.dropDestination.col === chosenDrop.col &&
      tralalaEvent.dropDestination.row === chosenDrop.row,
    "completed Tra-la-la should emit one semantic drag/drop event"
  );
  assert(
    tralalaEvent?.type === "riverTraLaLaResolved" &&
      uniqueAttackers.every((unitId) =>
        tralalaEvent.touchedAttackerIds.includes(unitId)
      ),
    "Tra-la-la event should list eligible touched attackers"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    dropped.state,
    makeAttackWinRng(uniqueAttackers.length)
  );
  const combinedEvents = [...dropped.events, ...resolved.events];
  const allyAttackEvents = combinedEvents.filter(
    (event) =>
      event.type === "attackResolved" &&
      uniqueAttackers.includes(event.attackerId) &&
      event.defenderId === target.id
  );
  assert(
    allyAttackEvents.length === uniqueAttackers.length,
    "Tra-la-la should resolve exactly one attack per queued touched ally"
  );

  console.log("river_person_tralala_gating_and_flow passed");
}
