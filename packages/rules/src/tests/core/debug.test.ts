import assert from "assert";
import {
  DebugDiceRNG,
  SeededRNG,
  applyDebugStateCommand,
  createDebugSandboxState,
  getHeroMeta,
  rollD6,
} from "../..";

export function testDebugSpawnUsesCatalogMetadata() {
  const state = createDebugSandboxState();
  const result = applyDebugStateCommand(state, {
    type: "debugSpawnUnit",
    heroId: "guts",
    owner: "P1",
    coord: { col: 2, row: 3 },
  });
  assert.equal(result.changed, true);
  const unit = Object.values(result.state.units)[0];
  const meta = getHeroMeta("guts");
  assert(unit);
  assert(meta);
  assert.equal(unit.heroId, "guts");
  assert.equal(unit.class, meta.mainClass);
  assert.equal(unit.hp, meta.baseStats.hp);
  console.log("debug_spawn_uses_catalog_metadata passed");
}

export function testDebugChargeAndStatusMutation() {
  let state = createDebugSandboxState();
  state = applyDebugStateCommand(state, {
    type: "debugSpawnUnit",
    heroId: "grand-kaiser",
    owner: "P1",
    coord: { col: 1, row: 1 },
  }).state;
  const unitId = Object.keys(state.units)[0];
  state = applyDebugStateCommand(state, {
    type: "debugSetCharges",
    unitId,
    abilityId: "kaiserEngineeringMiracle",
    mode: "set",
    value: 4,
  }).state;
  state = applyDebugStateCommand(state, {
    type: "debugSetStatus",
    unitId,
    status: "bunker",
    value: true,
  }).state;
  assert.equal(state.units[unitId].charges.kaiserEngineeringMiracle, 4);
  assert.equal(state.units[unitId].bunker?.active, true);
  console.log("debug_charge_and_status_mutation passed");
}

export function testDebugDiceQueueControlsRolls() {
  const rng = new DebugDiceRNG(new SeededRNG(1), [6, 1, 4]);
  assert.deepEqual([rollD6(rng), rollD6(rng), rollD6(rng)], [6, 1, 4]);
  assert.deepEqual(rng.getQueue(), []);
  console.log("debug_dice_queue_controls_rolls passed");
}
