import {
  ABILITY_RIVER_PERSON_BOAT,
  applyAction,
  assert,
  Coord,
  GameState,
  initKnowledgeForOwners,
  makePlayerView,
  makeRngSequence,
  resolvePendingWithChoice,
  setUnit,
  setupRiverPersonState,
  toBattleState,
} from "../helpers/testUtils";
import { getMovementActionsRemaining } from "../../index";
import { getRiverDropOptions } from "../../actions/heroes/riverPerson/options";

const requestedDestination = { col: 0, row: 3 };
const plannedDrop = { col: 1, row: 3 };
const stoppedAt = { col: 0, row: 1 };

function setupBoat(hiddenStake = true) {
  let { state, river } = setupRiverPersonState();
  const passenger = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin",
  )!;
  state = setUnit(state, river.id, { position: { col: 0, row: 0 } });
  state = setUnit(state, passenger.id, { position: { col: 1, row: 0 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", river.id));
  if (hiddenStake) {
    state = {
      ...state,
      stakeMarkers: [
        { id: "stake-first", owner: "P2", position: stoppedAt, createdAt: 1, isRevealed: false },
      ],
    };
  }
  return { state, riverId: river.id, passengerId: passenger.id };
}

function chooseCell(state: GameState, position: Coord) {
  return resolvePendingWithChoice(
    state,
    { type: "forestMoveDestination", position },
    makeRngSequence([]),
  );
}

function selectPassenger(state: GameState, riverId: string, passengerId: string) {
  const activated = applyAction(
    state,
    {
      type: "useAbility",
      unitId: riverId,
      abilityId: ABILITY_RIVER_PERSON_BOAT,
    },
    makeRngSequence([]),
  );
  return resolvePendingWithChoice(
    activated.state,
    { type: "hassanTrueEnemyTarget", targetId: passengerId },
    makeRngSequence([]),
  );
}

function planBoat(
  state: GameState,
  riverId: string,
  passengerId: string,
  destination = requestedDestination,
) {
  return chooseCell(selectPassenger(state, riverId, passengerId).state, destination);
}

function options(state: GameState): Coord[] {
  return state.pendingRoll?.context.options as Coord[];
}

export function testBoatCanSelectDestinationEvenIfHiddenStakeIsOnPath() {
  const { state, riverId, passengerId } = setupBoat();
  const selected = selectPassenger(state, riverId, passengerId);
  assert(
    options(selected.state).some(
      (cell) => JSON.stringify(cell) === JSON.stringify(requestedDestination),
    ),
  );
  const planned = chooseCell(selected.state, requestedDestination);
  assert.strictEqual(planned.state.pendingRoll?.kind, "riverBoatDropDestination");
  assert(
    options(planned.state).some(
      (cell) => cell.col === plannedDrop.col && cell.row === plannedDrop.row,
    ),
  );
  assert.deepStrictEqual(planned.state.units[riverId].position, { col: 0, row: 0 });
  assert.strictEqual(planned.state.stakeMarkers[0].isRevealed, false);
  assert.deepStrictEqual(makePlayerView(planned.state, "P1").stakeMarkers, []);
  console.log("boat_can_select_destination_even_if_hidden_stake_is_on_path passed");
}

export function testBoatStopsAtFirstHiddenStake() {
  const setup = setupBoat();
  const state: GameState = {
    ...setup.state,
    stakeMarkers: [
      ...setup.state.stakeMarkers,
      { id: "stake-stacked", owner: "P2", position: stoppedAt, createdAt: 2, isRevealed: false },
      {
        id: "stake-later",
        owner: "P2",
        position: { col: 0, row: 2 },
        createdAt: 3,
        isRevealed: false,
      },
    ],
  };
  const result = chooseCell(planBoat(state, setup.riverId, setup.passengerId).state, plannedDrop);
  assert.deepStrictEqual(result.state.units[setup.riverId].position, stoppedAt);
  assert.strictEqual(result.state.units[setup.riverId].hp, state.units[setup.riverId].hp - 1);
  assert.deepStrictEqual(
    result.state.stakeMarkers.map((stake) => stake.isRevealed),
    [true, true, false],
  );
  const triggers = result.events.filter((event) => event.type === "stakeTriggered");
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].damage, 1);
  assert.deepStrictEqual(triggers[0].stakeIdsRevealed, ["stake-first", "stake-stacked"]);
  assert.deepStrictEqual(
    result.events.filter((event) => event.type === "unitMoved").map((event) => event.to),
    [stoppedAt],
  );
  console.log("boat_stops_at_first_hidden_stake passed");
}

export function testBoatRecalculatesDisembarkAfterInterruptedMovement() {
  const { state, riverId, passengerId } = setupBoat();
  const planned = planBoat(state, riverId, passengerId);
  const interrupted = chooseCell(planned.state, plannedDrop);
  const pending = interrupted.state.pendingRoll!;
  assert.strictEqual(pending.kind, "riverBoatDropDestination");
  assert.notStrictEqual(pending.id, planned.state.pendingRoll!.id);
  assert.strictEqual(pending.context.phase, "selectDisembark");
  assert.strictEqual(pending.context.reason, "movementInterrupted");
  assert.strictEqual(pending.context.interruptionReason, "stake");
  assert.deepStrictEqual(pending.context.riverDestination, stoppedAt);
  assert.deepStrictEqual(
    options(interrupted.state),
    getRiverDropOptions(interrupted.state, stoppedAt, passengerId),
  );
  assert(
    !options(interrupted.state).some(
      (cell) => cell.col === plannedDrop.col && cell.row === plannedDrop.row,
    ),
  );
  assert.deepStrictEqual(
    interrupted.state.units[passengerId].position,
    state.units[passengerId].position,
  );
  assert(!interrupted.events.some((event) => event.type === "riverBoatResolved"));
  const stale = chooseCell(interrupted.state, plannedDrop);
  assert.strictEqual(
    stale.state,
    interrupted.state,
    "Stale drop must not resolve the new decision",
  );
  const chosen = options(interrupted.state)[0];
  const completed = chooseCell(interrupted.state, chosen);
  assert.strictEqual(completed.state.pendingRoll, null);
  assert.deepStrictEqual(completed.state.units[passengerId].position, chosen);
  assert.deepStrictEqual(completed.state.units[riverId].position, stoppedAt);
  assert.strictEqual(completed.state.units[riverId].riverBoatCarryAllyId, undefined);
  assert.strictEqual(
    completed.events.filter((event) => event.type === "riverBoatResolved").length,
    1,
  );
  assert(!completed.events.some((event) => event.type === "stakeTriggered"));
  console.log("boat_recalculates_disembark_after_interrupted_movement passed");
}

export function testBoatInterruptionDoesNotDoubleSpendResources() {
  for (const grantedMove of [false, true]) {
    let { state, riverId, passengerId } = setupBoat();
    state = setUnit(state, riverId, {
      turn: { moveUsed: grantedMove, actionUsed: true, attackUsed: true, stealthUsed: true },
      riverBoatmanExtraMoves: grantedMove ? 1 : 0,
    });
    const interrupted = chooseCell(planBoat(state, riverId, passengerId).state, plannedDrop);
    const river = interrupted.state.units[riverId];
    assert.strictEqual(getMovementActionsRemaining(river), 0);
    assert.strictEqual(river.riverBoatmanExtraMoves, 0);
    assert.deepStrictEqual(river.charges, state.units[riverId].charges);
    assert.deepStrictEqual(river.cooldowns, state.units[riverId].cooldowns);
    assert.strictEqual(
      interrupted.events.filter((event) => event.type === "abilityUsed").length,
      1,
    );
    assert.strictEqual(interrupted.state.activeUnitId, riverId);
    assert.strictEqual(interrupted.state.turnNumber, state.turnNumber);
    for (const action of [
      { type: "endTurn" as const },
      { type: "move" as const, unitId: riverId, to: requestedDestination },
      { type: "useAbility" as const, unitId: riverId, abilityId: ABILITY_RIVER_PERSON_BOAT },
    ]) {
      assert.strictEqual(
        applyAction(interrupted.state, action, makeRngSequence([])).state,
        interrupted.state,
      );
    }
    assert.strictEqual(
      resolvePendingWithChoice(interrupted.state, "skip", makeRngSequence([])).state,
      interrupted.state,
    );
    const completed = chooseCell(interrupted.state, options(interrupted.state)[0]);
    assert.deepStrictEqual(completed.state.units[riverId].turn, river.turn);
    assert.deepStrictEqual(completed.state.units[riverId].charges, river.charges);
    assert.deepStrictEqual(completed.state.units[riverId].cooldowns, river.cooldowns);
    assert.strictEqual(getMovementActionsRemaining(completed.state.units[riverId]), 0);
    assert(!completed.events.some((event) => event.type === "abilityUsed"));
  }
  console.log("boat_interruption_does_not_double_spend_resources passed");
}

export function testHiddenStakeDoesNotLeakThroughClientOptions() {
  const hidden = setupBoat();
  const clear = { ...hidden.state, stakeMarkers: [] };
  assert.deepStrictEqual(makePlayerView(hidden.state, "P1"), makePlayerView(clear, "P1"));
  const hiddenMove = selectPassenger(hidden.state, hidden.riverId, hidden.passengerId);
  const clearMove = selectPassenger(clear, hidden.riverId, hidden.passengerId);
  assert.deepStrictEqual(
    makePlayerView(hiddenMove.state, "P1"),
    makePlayerView(clearMove.state, "P1"),
  );
  const hiddenDrop = chooseCell(hiddenMove.state, requestedDestination);
  const clearDrop = chooseCell(clearMove.state, requestedDestination);
  assert.deepStrictEqual(
    makePlayerView(hiddenDrop.state, "P1"),
    makePlayerView(clearDrop.state, "P1"),
  );
  console.log("hidden_stake_does_not_leak_through_client_options passed");
}

export function testBoatInterruptedLegalDropStillRequiresConfirmation() {
  for (const destination of [{ col: 0, row: 2 }, stoppedAt]) {
    const { state, riverId, passengerId } = setupBoat();
    const drop = { col: 1, row: 2 };
    const interrupted = chooseCell(planBoat(state, riverId, passengerId, destination).state, drop);
    assert.strictEqual(interrupted.state.pendingRoll?.context.phase, "selectDisembark");
    assert(
      options(interrupted.state).some((cell) => cell.col === drop.col && cell.row === drop.row),
    );
    assert.deepStrictEqual(
      interrupted.state.units[passengerId].position,
      state.units[passengerId].position,
    );
    const confirmed = chooseCell(interrupted.state, drop);
    assert.deepStrictEqual(confirmed.state.units[passengerId].position, drop);
    assert.strictEqual(confirmed.state.pendingRoll, null);
  }
  console.log("boat_interrupted_legal_drop_still_requires_confirmation passed");
}

export function testBoatInterruptionHandlesImpossibleDisembark() {
  for (const carrierDies of [false, true]) {
    let { state, riverId, passengerId } = setupBoat();
    if (carrierDies) {
      state = setUnit(state, riverId, { hp: 1 });
    } else {
      state = {
        ...state,
        stakeMarkers: [{ ...state.stakeMarkers[0], position: { col: 0, row: 2 } }],
      };
      const blockers = Object.values(state.units).filter(
        (unit) => unit.id !== riverId && unit.id !== passengerId,
      );
      [
        { col: 0, row: 1 },
        { col: 1, row: 1 },
        { col: 1, row: 2 },
        { col: 0, row: 3 },
        { col: 1, row: 3 },
      ].forEach((position, index) => {
        state = setUnit(state, blockers[index].id, { position });
      });
    }
    const destination = { col: 0, row: 4 };
    const result = chooseCell(planBoat(state, riverId, passengerId, destination).state, {
      col: 1,
      row: 4,
    });
    assert.strictEqual(result.state.pendingRoll, null);
    assert.strictEqual(result.state.units[riverId].riverBoatCarryAllyId, undefined);
    assert.deepStrictEqual(
      result.state.units[passengerId].position,
      state.units[passengerId].position,
    );
    assert(
      result.events.some(
        (event) =>
          event.type === "riverBoatDisembarkFailed" &&
          event.reason === (carrierDies ? "carrierDied" : "noLegalDestinations"),
      ),
    );
    assert(!result.events.some((event) => event.type === "riverBoatResolved"));
  }
  console.log("boat_interruption_handles_impossible_disembark passed");
}

export function testBoatWithoutPassengerUsesNormalStakeResolution() {
  const { state, riverId } = setupBoat();
  const activated = applyAction(
    state,
    { type: "useAbility", unitId: riverId, abilityId: ABILITY_RIVER_PERSON_BOAT },
    makeRngSequence([]),
  );
  const selected = resolvePendingWithChoice(
    activated.state,
    { type: "riverBoatNoPassenger" },
    makeRngSequence([]),
  );
  const moved = chooseCell(selected.state, requestedDestination);
  assert.deepStrictEqual(moved.state.units[riverId].position, stoppedAt);
  assert.strictEqual(moved.state.units[riverId].hp, state.units[riverId].hp - 1);
  assert.strictEqual(moved.state.stakeMarkers[0].isRevealed, true);
  assert.strictEqual(moved.state.pendingRoll, null);
  console.log("boat_without_passenger_uses_normal_stake_resolution passed");
}
