import {
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

    const requested = applyAction(
      state,
      { type: "requestMoveOptions", unitId: river.id } as any,
      makeRngSequence([])
    );
    assert(
      requested.state.pendingRoll?.kind !== "riverBoatCarryChoice",
      "Boat carry choice should not be requested without adjacent allies"
    );
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

    const requested = applyAction(
      state,
      { type: "requestMoveOptions", unitId: river.id } as any,
      makeRngSequence([])
    );
    assert(
      requested.state.pendingRoll?.kind === "riverBoatCarryChoice",
      "Boat move should prompt carry choice when adjacent ally exists"
    );

    const carrySelected = resolvePendingWithChoice(
      requested.state,
      { type: "hassanTrueEnemyTarget", targetId: carriedAlly.id },
      makeRngSequence([])
    );
    const legalMoves = carrySelected.state.pendingMove?.legalTo ?? [];
    assert(
      !legalMoves.some((coord) => coord.col === 0 && coord.row === 0),
      "Carry move options should exclude destinations without a legal drop cell"
    );
    assert(
      legalMoves.some((coord) => coord.col === 0 && coord.row === 5),
      "Carry move options should keep destinations that allow dropping ally"
    );

    const moved = applyAction(
      carrySelected.state,
      { type: "move", unitId: river.id, to: { col: 0, row: 5 } } as any,
      makeRngSequence([])
    );
    assert(
      moved.state.pendingRoll?.kind === "riverBoatDropDestination",
      "After carrying move, River Person should request drop destination"
    );

    const invalidDrop = resolvePendingWithChoice(
      moved.state,
      { type: "forestMoveDestination", position: { col: 2, row: 5 } },
      makeRngSequence([])
    );
    assert(
      invalidDrop.state.pendingRoll?.kind === "riverBoatDropDestination",
      "Invalid drop destination should be rejected"
    );

    const dropOptions =
      (moved.state.pendingRoll?.context as { options?: Coord[] } | undefined)
        ?.options ?? [];
    assert(dropOptions.length > 0, "drop options should be provided");
    const chosenDrop = dropOptions[0];
    const dropped = resolvePendingWithChoice(
      moved.state,
      { type: "forestMoveDestination", position: chosenDrop },
      makeRngSequence([])
    );

    const riverAfter = dropped.state.units[river.id];
    const allyAfter = dropped.state.units[carriedAlly.id];
    assert(
      allyAfter.position?.col === chosenDrop.col &&
        allyAfter.position?.row === chosenDrop.row,
      "carried ally should be dropped on chosen destination"
    );
    assert(
      Math.max(
        Math.abs((allyAfter.position?.col ?? 0) - (riverAfter.position?.col ?? 0)),
        Math.abs((allyAfter.position?.row ?? 0) - (riverAfter.position?.row ?? 0))
      ) <= 1,
      "dropped ally cell must be adjacent to River Person"
    );
    assert(
      !(allyAfter.position?.col === riverAfter.position?.col &&
        allyAfter.position?.row === riverAfter.position?.row),
      "drop destination must stay unoccupied by River Person"
    );
  }

  console.log("river_person_boat_carry_flow_and_constraints passed");
}


export function testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry() {
  let { state, river } = setupRiverPersonState();
  const carriedAlly = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;

  state = setUnit(state, river.id, {
    position: { col: 3, row: 3 },
    turn: {
      moveUsed: true,
      attackUsed: false,
      actionUsed: false,
      stealthUsed: false,
    },
  });
  state = setUnit(state, carriedAlly.id, { position: { col: 3, row: 4 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  const usedBoatman = applyAction(
    state,
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_BOATMAN,
    } as any,
    makeRngSequence([])
  );
  assert(
    usedBoatman.state.units[river.id].turn.actionUsed,
    "Boatman should consume River Person action slot"
  );
  assert(
    usedBoatman.state.units[river.id].turn.moveUsed,
    "Boatman should not reset/spend move slot state"
  );
  assert(
    usedBoatman.state.pendingRoll?.kind === "riverBoatCarryChoice",
    "Boatman movement should use carry choice flow when adjacent ally exists"
  );

  const carrySelected = resolvePendingWithChoice(
    usedBoatman.state,
    { type: "hassanTrueEnemyTarget", targetId: carriedAlly.id },
    makeRngSequence([])
  );
  const destination = carrySelected.state.pendingMove?.legalTo.find(
    (coord) => coord.col === 3 && coord.row === 5
  );
  assert(destination, "Boatman move should provide legal movement destinations");

  const moved = applyAction(
    carrySelected.state,
    { type: "move", unitId: river.id, to: destination! } as any,
    makeRngSequence([])
  );
  assert(
    moved.state.pendingRoll?.kind === "riverBoatDropDestination",
    "Boatman move with carry should request ally drop destination"
  );
  const dropOptions =
    (moved.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(dropOptions.length > 0, "Boatman carry should provide drop options");
  const dropped = resolvePendingWithChoice(
    moved.state,
    { type: "forestMoveDestination", position: dropOptions[0] },
    makeRngSequence([])
  );

  assert(
    dropped.state.units[river.id].position?.col === destination!.col &&
      dropped.state.units[river.id].position?.row === destination!.row,
    "River Person should move through Boatman even with move slot already spent"
  );
  assert(
    dropped.state.units[carriedAlly.id].position?.col === dropOptions[0].col &&
      dropped.state.units[carriedAlly.id].position?.row === dropOptions[0].row,
    "Boat carry should still work when movement is granted by Boatman"
  );
  assert(
    dropped.state.units[river.id].riverBoatmanMovePending !== true,
    "Boatman move flag should clear after movement resolves"
  );

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
  const allySpearman = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "spearman"
  )!;
  const allyKnight = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight"
  )!;
  const allyNoHit = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin"
  )!;

  state = setUnit(state, river.id, {
    position: { col: 4, row: 4 },
    charges: { ...river.charges, [ABILITY_RIVER_PERSON_TRA_LA_LA]: 3 },
  });
  state = setUnit(state, target.id, { position: { col: 5, row: 4 }, hp: 10 });
  state = setUnit(state, allySpearman.id, { position: { col: 4, row: 3 } });
  state = setUnit(state, allyKnight.id, { position: { col: 5, row: 5 } });
  state = setUnit(state, allyNoHit.id, { position: { col: 3, row: 5 } });
  state = toBattleState(state, "P1", river.id);
  state = initKnowledgeForOwners(state);

  let used = applyAction(
    state,
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_TRA_LA_LA,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind !== "riverTraLaLaTargetChoice",
    "Tra-la-la should be unavailable before full 4 charges"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 3,
    "Tra-la-la should not spend charges when unavailable"
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
    {
      type: "useAbility",
      unitId: river.id,
      abilityId: ABILITY_RIVER_PERSON_TRA_LA_LA,
    } as any,
    makeRngSequence([])
  );
  assert(
    used.state.pendingRoll?.kind === "riverTraLaLaTargetChoice",
    "Tra-la-la should request adjacent target selection"
  );
  assert(
    used.state.units[river.id].charges[ABILITY_RIVER_PERSON_TRA_LA_LA] === 0,
    "Tra-la-la should spend all 4 charges on activation"
  );
  assert(
    used.state.units[river.id].turn.actionUsed,
    "Tra-la-la should consume action slot"
  );

  const targetSelected = resolvePendingWithChoice(
    used.state,
    { type: "hassanTrueEnemyTarget", targetId: target.id },
    makeRngSequence([])
  );
  assert(
    targetSelected.state.pendingRoll?.kind === "riverTraLaLaDestinationChoice",
    "Tra-la-la should request destination after target selection"
  );
  const destinationOptions =
    (targetSelected.state.pendingRoll?.context as { options?: Coord[] } | undefined)
      ?.options ?? [];
  assert(
    destinationOptions.some((coord) => coord.col === 4 && coord.row === 7),
    "Tra-la-la destination options should include straight cardinal cells"
  );
  assert(
    !destinationOptions.some((coord) => coord.col === 5 && coord.row === 5),
    "Tra-la-la destination options should exclude diagonal cells"
  );

  const destinationSelected = resolvePendingWithChoice(
    targetSelected.state,
    { type: "forestMoveDestination", position: { col: 4, row: 7 } },
    makeRngSequence([])
  );
  assert(
    destinationSelected.state.units[river.id].position?.col === 4 &&
      destinationSelected.state.units[river.id].position?.row === 7,
    "Tra-la-la should move River Person to selected destination"
  );
  assert(
    destinationSelected.state.pendingRoll?.kind === "attack_attackerRoll",
    "Tra-la-la touched allies should start immediate attack resolution"
  );

  const queue = destinationSelected.state.pendingCombatQueue ?? [];
  const attackerIds = queue.map((entry) => entry.attackerId);
  const uniqueAttackers = Array.from(new Set(attackerIds));
  assert(
    uniqueAttackers.length === attackerIds.length,
    "Each touched ally should attack at most once"
  );
  assert(
    attackerIds.includes(allySpearman.id) && attackerIds.includes(allyKnight.id),
    "Touched allies that can legally attack must be queued"
  );
  assert(
    !attackerIds.includes(allyNoHit.id),
    "Touched allies without legal attack must not be queued"
  );
  assert(
    attackerIds[0] === allySpearman.id,
    "Tra-la-la ally attack order should be deterministic by board reading order"
  );

  const resolved = resolveAllPendingRollsWithEvents(
    destinationSelected.state,
    makeAttackWinRng(uniqueAttackers.length)
  );
  const combinedEvents = [...destinationSelected.events, ...resolved.events];
  const allyAttackEvents = combinedEvents.filter(
    (event) =>
      event.type === "attackResolved" &&
      uniqueAttackers.includes(event.attackerId) &&
      event.defenderId === target.id
  );
  assert(
    allyAttackEvents.length === uniqueAttackers.length,
    "Tra-la-la should resolve exactly one attack per queued ally"
  );

  console.log("river_person_tralala_gating_and_flow passed");
}
