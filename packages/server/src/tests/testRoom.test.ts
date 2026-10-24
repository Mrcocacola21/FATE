import assert from "assert";
import { randomUUID } from "node:crypto";
import {
  attachArmy,
  applyDebugStateCommand,
  createDefaultArmy,
  createDebugSandboxState,
  rollD6,
  applyNormalVictoryCheck,
  applyRuleDeclarationWinChecks,
  type GameAction,
} from "rules";
import { buildTestServer as buildServer } from "./matchTestSupport";
import { applyGameAction, createGameRoomWithId, storeTestHooks } from "../store";
import { isActionAllowedByPlayer } from "../permissions";
import {
  MAX_TEST_SNAPSHOT_BYTES,
  TestRoomCommandSchema,
  applyTestRoomCommand,
  type TestRoomCommand,
} from "../testRoom";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function testProductionDisabledCreationRejected() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.ENABLE_TEST_ROOMS;
  const server = await buildServer();
  try {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_TEST_ROOMS;
    const response = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { roomMode: "test" },
    });
    assert.equal(response.statusCode, 403);
  } finally {
    await server.close();
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("ENABLE_TEST_ROOMS", previousEnabled);
  }
  console.log("test_room_production_disabled_creation_rejected passed");
}

function testStoreStampsGameOverRevisionAndRejectsFurtherActions() {
  const room = createGameRoomWithId(randomUUID(), { seed: 44 });
  room.state = {
    ...room.state,
    phase: "battle",
    currentPlayer: "P1",
    ruleDeclaration: {
      ...room.state.ruleDeclaration,
      selectedRuleId: "normal_rule",
      setupComplete: true,
    },
    units: Object.fromEntries(
      Object.entries(room.state.units).map(([id, unit]) => [
        id,
        unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
      ])
    ),
  };
  const ended = applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(ended.ok, true);
  assert.equal(room.state.phase, "ended");
  assert.equal(room.state.gameOver?.winnerPlayerId, "P1");
  assert.equal(room.state.gameOver?.endedAtRevision, room.revision);
  assert.equal(room.state.gameOver?.endedAtRevision, 1);

  const revision = room.revision;
  const rejected = applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(rejected.ok, false);
  assert.equal("message" in rejected ? rejected.message : null, "Game is already over.");
  assert.equal(room.revision, revision);
  console.log("store_stamps_game_over_revision_and_rejects_further_actions passed");
}

function testDebugDamageNeverEndsSandbox() {
  const room = createGameRoomWithId(randomUUID(), { roomMode: "test", seed: 45 });
  room.state = attachArmy(room.state, createDefaultArmy("P1"));
  room.state = attachArmy(room.state, createDefaultArmy("P2"));
  const p2Units = Object.values(room.state.units).filter((unit) => unit.owner === "P2");
  for (const unit of p2Units) {
    const result = applyTestRoomCommand(room, {
      type: "debugSetHp",
      unitId: unit.id,
      hp: 0,
    });
    assert.equal(result.command.ok, true);
  }
  assert.equal(room.state.phase, "battle");
  assert.equal(room.state.gameOver, null);
  assert.equal(applyNormalVictoryCheck(room.state, []).state.phase, "battle");
  applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(room.state.phase, "battle");

  const reset = applyTestRoomCommand(room, { type: "debugClearBoard" });
  assert.equal(reset.command.ok, true);
  assert.equal(room.state.phase, "battle");
  assert.equal(room.state.gameOver, null);
  assert.equal(room.state.victoryDisabled, true);
  applyGameAction(room, { type: "endTurn" }, "P1");
  assert.equal(room.state.phase, "battle", "an empty sandbox cannot draw/end");
  console.log("debug_damage_never_ends_sandbox passed");
}

function testSandboxSurvivesLethalCombatAndSpecialVictoryRules() {
  for (const owner of ["P1", "P2"] as const) {
    const room = createGameRoomWithId(randomUUID(), { roomMode: "test" });
    const enemy = owner === "P1" ? "P2" : "P1";
    for (const [player, row] of [[owner, 3], [enemy, 4]] as const) {
      assert.equal(applyTestRoomCommand(room, { type: "debugSpawnUnit", heroId: "frisk",
        owner: player, coord: { col: 4, row } }).command.ok, true);
    }
    const attacker = Object.values(room.state.units).find(unit => unit.owner === owner)!;
    const defender = Object.values(room.state.units).find(unit => unit.owner === enemy)!;
    assert.equal(applyTestRoomCommand(room, { type: "debugSimulateStartTurn", unitId: attacker.id }).command.ok, true);
    assert.equal(room.state.phase, "battle", "Frisk friendship cannot win a sandbox at turn start");
    assert.equal(applyTestRoomCommand(room, { type: "debugSetHp", unitId: defender.id, hp: 1 }).command.ok, true);
    applyTestRoomCommand(room, { type: "debugSetDiceQueue", values: [6, 5, 1, 2] });
    assert.equal(applyGameAction(room, { type: "attack", attackerId: attacker.id, defenderId: defender.id }, owner).ok, true);
    for (let i = 0; room.state.pendingRoll; i++) {
      assert(i < 20, "combat must finish resolving");
      const pending = room.state.pendingRoll;
      const result = applyGameAction(room, { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player }, pending.player);
      assert.equal(result.ok, true);
      if (result.ok) assert(!result.events.some(event => event.type === "gameEnded" || event.type === "friskFriendshipWon"));
    }
    assert.equal(room.state.units[defender.id].isAlive, false);
    assert.equal(room.state.phase, "battle");
    assert.equal(room.state.gameOver, null);
    assert.equal(applyGameAction(room, { type: "endTurn" }, owner).ok, true);
    for (const ruleId of ["normal_rule", "chess_party", "advantage_game"] as const) {
      applyTestRoomCommand(room, { type: "debugSetRuleDeclaration", ruleId });
      room.state.ruleDeclaration.ruleData.chessParty = { kings: { [owner]: attacker.id, [enemy]: defender.id } } as { kings: { P1: string; P2: string } };
      const checked = applyRuleDeclarationWinChecks(room.state, []);
      assert.equal(checked.state.phase, "battle");
      assert.deepEqual(checked.events, []);
    }
    const snapshot = applyTestRoomCommand(room, { type: "debugExportSnapshot" }).snapshot!;
    snapshot.state.victoryDisabled = false;
    snapshot.state.phase = "ended";
    assert.equal(applyTestRoomCommand(room, { type: "debugImportSnapshot", snapshot }).command.ok, true);
    assert.equal(room.state.victoryDisabled, true);
    assert.equal(room.state.phase, "battle");
    assert.equal(applyTestRoomCommand(room, { type: "debugRemoveUnit", unitId: defender.id }).command.ok, true);
    assert.equal(room.state.phase, "battle");
    assert.equal(applyTestRoomCommand(room, { type: "debugApplyPreset", presetId: "basic-duel" }).command.ok, true);
    assert.equal(room.state.victoryDisabled, true);
  }
  console.log("sandbox_survives_lethal_combat_and_special_victories passed");
}

async function testProductionEnabledCreationRequiresToken() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.ENABLE_TEST_ROOMS;
  const previousToken = process.env.FATE_DEBUG_TOKEN;
  const server = await buildServer();
  try {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_TEST_ROOMS = "true";
    process.env.FATE_DEBUG_TOKEN = "sandbox-secret";
    const denied = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { roomMode: "test", debugToken: "wrong" },
    });
    assert.equal(denied.statusCode, 403);
    const accepted = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { roomMode: "test", debugToken: "sandbox-secret" },
    });
    assert.equal(accepted.statusCode, 201);
    assert.equal(accepted.json().roomMode, "test");
  } finally {
    await server.close();
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("ENABLE_TEST_ROOMS", previousEnabled);
    restoreEnv("FATE_DEBUG_TOKEN", previousToken);
  }
  console.log("test_room_production_enabled_creation_requires_token passed");
}

function testCommandsAreIsolatedAndRevisioned() {
  storeTestHooks.reset();
  const normal = createGameRoomWithId(`normal-${randomUUID()}`);
  const rejected = applyTestRoomCommand(normal, {
    type: "debugClearBoard",
  });
  assert.equal(rejected.command.ok, false);
  assert.equal(normal.revision, 0);

  const testRoom = createGameRoomWithId(`test-${randomUUID()}`, {
    roomMode: "test",
    hostSeat: "P1",
    hostConnId: "test-controller",
  });
  const accepted = applyTestRoomCommand(testRoom, {
    type: "debugSpawnUnit",
    heroId: "guts",
    owner: "P2",
    coord: { col: 4, row: 4 },
  });
  assert.equal(accepted.command.ok, true);
  assert.equal(testRoom.revision, 1);
  assert.equal(Object.values(testRoom.state.units)[0]?.owner, "P2");
  assert.equal(testRoom.actionLog[0]?.action.type, "debugSpawnUnit");
  console.log("test_room_commands_isolated_and_revisioned passed");
}

function testDiceQueueAndSnapshotValidation() {
  const room = createGameRoomWithId(`dice-${randomUUID()}`, {
    roomMode: "test",
    hostSeat: "P1",
    hostConnId: "test-controller",
  });
  const queued = applyTestRoomCommand(room, {
    type: "debugSetDiceQueue",
    values: [6, 2],
  });
  assert.equal(queued.command.ok, true);
  assert.deepEqual([rollD6(room.rng), rollD6(room.rng)], [6, 2]);

  const exported = applyTestRoomCommand(room, {
    type: "debugExportSnapshot",
  });
  assert(exported.snapshot);
  const imported = applyTestRoomCommand(room, {
    type: "debugImportSnapshot",
    snapshot: exported.snapshot,
  });
  assert.equal(imported.command.ok, true);

  const oversized = applyTestRoomCommand(room, {
    type: "debugImportSnapshot",
    snapshot: { payload: "x".repeat(MAX_TEST_SNAPSHOT_BYTES + 1) },
  });
  assert.equal(oversized.command.ok, false);
  for (const snapshot of [undefined, null, {}, []]) {
    assert.equal(applyTestRoomCommand(room, { type: "debugImportSnapshot", snapshot }).command.ok, false);
  }
  console.log("test_room_dice_and_snapshot_validation passed");
}

function testInvalidPayloadRejectedBySchema() {
  const parsed = TestRoomCommandSchema.safeParse({
    type: "debugSetDiceQueue",
    values: [0, 7, 3],
  });
  assert.equal(parsed.success, false);
  console.log("test_room_invalid_payload_rejected passed");
}

function testSandboxPresetsAndEditingTools() {
  const room = createGameRoomWithId(randomUUID(), { roomMode: "test", hostSeat: "P2", hostConnId: "controller" });
  const run = (command: TestRoomCommand) => {
    const result = applyTestRoomCommand(room, command);
    assert.equal(result.command.ok, true, `${command.type}: ${JSON.stringify(result.command)}`);
    return result;
  };
  for (const presetId of ["empty", "basic-duel", "aoe-cluster", "line-attack", "rider-path", "stake-trigger",
    "stealth-reveal", "transformation", "impulse", "healing-status"] as const) {
    const previousStream = room.streamId;
    run({ type: "debugApplyPreset", presetId });
    assert.notEqual(room.streamId, previousStream);
    assert.equal(room.state.victoryDisabled, true);
    assert.equal(room.state.seats.P2, true);
    assert.equal(room.state.hostPlayerId, "P2");
    const snapshot = run({ type: "debugExportSnapshot" }).snapshot!;
    run({ type: "debugImportSnapshot", snapshot });
  }
  run({ type: "debugClearBoard" });
  run({ type: "debugSpawnUnit", heroId: "grand-kaiser", owner: "P2", coord: { col: 1, row: 1 }, options: { charges: "full" } });
  const unitId = Object.keys(room.state.units)[0];
  assert.equal(room.state.activeUnitId, unitId);
  assert.equal(room.state.currentPlayer, "P2", "a lone P2 spawn must be usable immediately");
  run({ type: "debugMoveUnit", unitId, to: { col: 2, row: 2 } });
  run({ type: "debugSetOwner", unitId, owner: "P1" });
  assert.equal(room.state.currentPlayer, "P1");
  run({ type: "debugSetTurn", player: "P1", unitId });
  run({ type: "debugSimulateStartTurn", unitId });
  run({ type: "debugClearPendingRoll" });
  run({ type: "debugSetHp", unitId, hp: 5 });
  run({ type: "debugDirectDamage", unitId, amount: 2 });
  assert.equal(room.state.units[unitId].hp, 3);
  for (const mode of ["fill", "clear", "add", "set"] as const) {
    run({ type: "debugSetCharges", unitId, mode, abilityId: "kaiserEngineeringMiracle", value: 4 });
  }
  for (const status of ["isStealthed", "movementDisabledNextTurn", "bunker", "gutsBerserkModeActive", "papyrusUnbelieverActive",
    "sansUnbelieverUnlocked", "mettatonExUnlocked", "mettatonNeoUnlocked", "undyneImmortalActive", "chicken"] as const) {
    run({ type: "debugSetStatus", unitId, status, value: true });
    run({ type: "debugSetStatus", unitId, status, value: false });
  }
  run({ type: "debugSetStatus", unitId, status: "transformed", value: true });
  run({ type: "debugResetActions", unitId });
  run({ type: "debugSetMarkedTarget", sourceUnitId: unitId, targetUnitId: unitId, value: true });
  for (const kind of ["stake", "forest"] as const) {
    run({ type: "debugAddMarker", marker: { kind, owner: "P1", coord: { col: 3, row: 3 }, revealed: true } });
    run({ type: "debugRemoveMarker", kind, coord: { col: 3, row: 3 } });
  }
  run({ type: "debugClearMarkers" });
  for (const ruleId of ["normal_rule", "court", "chess_party", "moon_game", "advantage_game"] as const) {
    run({ type: "debugSetRuleDeclaration", ruleId, threshold: 3 });
  }
  run({ type: "debugSetRuleDeclaration", ruleId: "normal_rule" });
  run({ type: "debugTriggerRuleRoundEnd", rolls: [1, 2] });
  run({ type: "debugClearPendingRoll" });
  run({ type: "debugSetPhase", phase: "placement" });
  run({ type: "debugSetPhase", phase: "battle" });
  run({ type: "debugSetDiceQueue", values: [6] });
  run({ type: "debugClearDiceQueue" });
  run({ type: "debugSetHp", unitId, hp: 0 });
  assert(!room.state.turnQueue.includes(unitId));
  run({ type: "debugSetHp", unitId, hp: 5 });
  assert(room.state.turnQueue.includes(unitId), "healing a debug-killed figure restores its turn");
  run({ type: "debugRemoveUnit", unitId });
  assert.equal(room.state.phase, "battle");
  const invalid = run({ type: "debugExportSnapshot" }).snapshot!;
  delete (invalid.state as Partial<typeof invalid.state>).ruleDeclaration;
  const stateBefore = room.state, streamBefore = room.streamId;
  assert.equal(applyTestRoomCommand(room, { type: "debugImportSnapshot", snapshot: invalid }).command.ok, false);
  assert.equal(room.state, stateBefore);
  assert.equal(room.streamId, streamBefore);
  console.log("sandbox_presets_and_editing_tools passed");
}

function testNormalRoomRejectsOutOfTurnBasicAttack() {
  storeTestHooks.reset();
  const room = createGameRoomWithId(`normal-out-of-turn-${randomUUID()}`);
  let state = createDebugSandboxState();
  state = applyDebugStateCommand(state, {
    type: "debugSpawnUnit",
    heroId: "frisk",
    owner: "P1",
    coord: { col: 4, row: 3 },
  }).state;
  state = applyDebugStateCommand(state, {
    type: "debugSpawnUnit",
    heroId: "frisk",
    owner: "P2",
    coord: { col: 4, row: 4 },
  }).state;

  const units = Object.values(state.units);
  const defender = units.find((unit) => unit.owner === "P1");
  const attacker = units.find((unit) => unit.owner === "P2");
  assert(attacker);
  assert(defender);

  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P1",
    activeUnitId: defender.id,
    pendingRoll: null,
  };
  const action: GameAction = {
    type: "attack",
    attackerId: attacker.id,
    defenderId: defender.id,
  };

  assert.equal(isActionAllowedByPlayer(room.state, action, "P2"), false);
  const result = applyGameAction(room, action, "P2");
  assert.equal(result.ok, false);
  assert.equal(room.revision, 0);
  assert.equal(room.state.units[defender.id].hp, defender.hp);
  console.log("normal_room_rejects_out_of_turn_basic_attack passed");
}

async function main() {
  await testProductionDisabledCreationRejected();
  await testProductionEnabledCreationRequiresToken();
  testCommandsAreIsolatedAndRevisioned();
  testDiceQueueAndSnapshotValidation();
  testInvalidPayloadRejectedBySchema();
  testNormalRoomRejectsOutOfTurnBasicAttack();
  testStoreStampsGameOverRevisionAndRejectsFurtherActions();
  testDebugDamageNeverEndsSandbox();
  testSandboxSurvivesLethalCombatAndSpecialVictoryRules();
  testSandboxPresetsAndEditingTools();
  storeTestHooks.reset();
  console.log("test room tests passed");
}

void main();
