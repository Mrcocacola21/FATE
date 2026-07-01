import assert from "assert";
import { randomUUID } from "node:crypto";
import {
  applyDebugStateCommand,
  createDebugSandboxState,
  rollD6,
  type GameAction,
} from "rules";
import { buildServer } from "../index";
import { applyGameAction, createGameRoomWithId, storeTestHooks } from "../store";
import { isActionAllowedByPlayer } from "../permissions";
import {
  MAX_TEST_SNAPSHOT_BYTES,
  TestRoomCommandSchema,
  applyTestRoomCommand,
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
    assert.equal(accepted.statusCode, 200);
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
  storeTestHooks.reset();
  console.log("test room tests passed");
}

void main();
