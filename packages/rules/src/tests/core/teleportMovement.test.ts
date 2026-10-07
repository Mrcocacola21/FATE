import assert from "node:assert/strict";
import {
  applyActionRaw as applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  initKnowledgeForOwners,
  makeRngSequence,
  setUnit,
  toBattleState,
} from "../helpers/testUtils";
import {
  HERO_KALADIN_ID,
  HERO_JACK_RIPPER_ID,
  projectEventsForRecipient,
  type GameState,
  type MoveMode,
} from "../../index";
import { evUnitMoved } from "../../core";

const from = { col: 0, row: 4 };
const destination = { col: 8, row: 4 };

export function teleportMovementFixture(
  mode: "default" | "normal" | "borrowed" | "court" = "default",
) {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", { spearman: HERO_KALADIN_ID }));
  state = attachArmy(state, createDefaultArmy("P2", { assassin: HERO_JACK_RIPPER_ID }));
  const unit = Object.values(state.units).find(
    (candidate) =>
      candidate.owner === "P1" &&
      candidate.class ===
        (mode === "borrowed" ? "spearman" : mode === "court" ? "knight" : "trickster"),
  )!;
  const jack = Object.values(state.units).find(
    (candidate) => candidate.heroId === HERO_JACK_RIPPER_ID,
  )!;
  state = setUnit(state, unit.id, {
    position: from,
    ...(mode === "court" ? { courtGlobalMoveOnce: { expiresAtRoundEnd: 2, used: false } } : {}),
  });
  state = setUnit(state, jack.id, { position: { col: 8, row: 8 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", unit.id));
  const requestedMode: MoveMode | undefined =
    mode === "borrowed" ? "trickster" : mode === "normal" ? "normal" : undefined;
  const requested = applyAction(
    state,
    {
      type: "requestMoveOptions",
      unitId: unit.id,
      ...(requestedMode ? { mode: requestedMode } : {}),
    },
    makeRngSequence([]),
  );
  state = requested.state;
  if (state.pendingRoll) {
    state = applyAction(
      state,
      {
        type: "resolvePendingRoll",
        pendingRollId: state.pendingRoll.id,
        player: state.pendingRoll.player,
      },
      makeRngSequence([0.99]),
    ).state;
  }
  assert(
    state.pendingMove?.legalTo.some(
      (cell) => cell.col === destination.col && cell.row === destination.row,
    ),
  );
  return { state, unit: state.units[unit.id], jack: state.units[jack.id], from, destination };
}

function hazards(state: GameState, sourceUnitId: string, atDestination: boolean): GameState {
  return {
    ...state,
    stakeMarkers: [
      {
        id: "teleport-stake",
        owner: "P2",
        position: atDestination ? destination : { col: 2, row: 4 },
        createdAt: 1,
        isRevealed: false,
      },
    ],
    jackTraps: [
      {
        id: "teleport-snare",
        owner: "P2",
        sourceUnitId,
        position: atDestination ? destination : { col: 3, row: 4 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
  };
}

export function testTeleportsIgnoreIntermediateHazardsAndForest() {
  for (const mode of ["default", "normal", "borrowed", "court"] as const) {
    const fixture = teleportMovementFixture(mode);
    for (const forest of [false, true]) {
      let state = hazards(fixture.state, fixture.jack.id, false);
      if (forest)
        state = {
          ...state,
          forestMarkers: [{ owner: "P2", position: { col: 4, row: 4 } }],
          forestMarker: { owner: "P2", position: { col: 4, row: 4 } },
        };
      const result = applyAction(
        state,
        { type: "move", unitId: fixture.unit.id, to: destination },
        makeRngSequence([]),
      );
      const movement = result.events.filter((event) => event.type === "unitMoved");
      assert.equal(movement.length, 1);
      assert.deepEqual(movement[0].from, from);
      assert.deepEqual(movement[0].to, destination);
      assert.equal(movement[0].provenance.kind, "teleport");
      assert.deepEqual(result.state.units[fixture.unit.id].position, destination);
      assert.equal(result.state.units[fixture.unit.id].hp, fixture.unit.hp);
      assert(!result.state.units[fixture.unit.id].immobilizedUntilOwnTurnStart);
      assert(
        !result.events.some(
          (event) => event.type === "stakeTriggered" || event.type === "snareTriggered",
        ),
      );
      assert.equal(result.state.stakeMarkers[0].isRevealed, false);
      assert.equal(result.state.jackTraps![0].isRevealed, false);
      assert.equal(
        result.state.pendingRoll,
        null,
        "teleport does not cross the forest or request Rider path attacks",
      );
    }
  }
  console.log("teleports_ignore_intermediate_hazards_and_forest passed");
}

export function testTeleportsTriggerOnlyDestinationHazards() {
  for (const mode of ["default", "normal", "borrowed", "court"] as const) {
    const fixture = teleportMovementFixture(mode);
    const result = applyAction(
      hazards(fixture.state, fixture.jack.id, true),
      { type: "move", unitId: fixture.unit.id, to: destination },
      makeRngSequence([]),
    );
    assert.deepEqual(result.state.units[fixture.unit.id].position, destination);
    assert.equal(result.events.filter((event) => event.type === "stakeTriggered").length, 1);
    assert.equal(result.events.filter((event) => event.type === "snareTriggered").length, 1);
    assert.equal(result.state.units[fixture.unit.id].hp, fixture.unit.hp - 1);
    assert(result.state.units[fixture.unit.id].immobilizedUntilOwnTurnStart);
  }
  console.log("teleports_trigger_only_destination_hazards passed");
}

export function testAbilityTeleportProjectionPreservesRelocationWithoutRevealingCause() {
  const fixture = teleportMovementFixture();
  const event = evUnitMoved(fixture.state, {
    unitId: fixture.unit.id,
    from,
    to: destination,
    provenance: { kind: "ability", abilityId: "PRIVATE_ABILITY", movementKind: "teleport" },
  });
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(fixture.state, [event], recipient);
    assert(projected[0]?.type === "unitMoved");
    assert.deepEqual(projected[0].provenance, { kind: "ability", movementKind: "teleport" });
    assert(!JSON.stringify(projected).includes("PRIVATE_ABILITY"));
  }
  console.log("ability_teleport_projection_preserves_relocation_without_revealing_cause passed");
}
