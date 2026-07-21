import assert from "node:assert/strict";
import test from "node:test";
import type { GameEvent, PlayerView, UnitState } from "rules";
import {
  advanceVisualResolution,
  createVisualResolutionState,
} from "./visualResolution";

function unit(id: string, hp: number): UnitState {
  return { id, hp, isAlive: hp > 0, position: { col: 1, row: 1 } } as UnitState;
}

function view(params: {
  hp: number;
  pendingAoE?: boolean;
  pendingQueue?: number;
}): PlayerView {
  return {
    boardSize: 9,
    units: { target: unit("target", params.hp) },
    pendingAoEPreview: params.pendingAoE
      ? {
          casterId: "caster",
          abilityId: "massAbility",
          center: { col: 4, row: 4 },
          radius: 1,
        }
      : null,
    pendingCombatQueueCount: params.pendingQueue ?? 0,
  } as unknown as PlayerView;
}

function attack(damage: number, hpAfter: number): GameEvent {
  return {
    type: "attackResolved",
    attackerId: "caster",
    defenderId: "target",
    attackerRoll: { dice: [6], sum: 6, isDouble: false },
    defenderRoll: { dice: [1], sum: 1, isDouble: false },
    hit: true,
    damage,
    defenderHpAfter: hpAfter,
  };
}

function aoe(): GameEvent {
  return {
    type: "aoeResolved",
    sourceUnitId: "caster",
    abilityId: "massAbility",
    center: { col: 4, row: 4 },
    radius: 1,
    affectedUnitIds: ["target"],
    revealedUnitIds: [],
    damagedUnitIds: ["target"],
    damageByUnitId: { target: 4 },
  };
}

test("an incomplete AoE buffers result events and freezes visual HP", () => {
  let state = createVisualResolutionState({
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5 }),
    enabled: true,
  });

  state = advanceVisualResolution(state, {
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5, pendingAoE: true }),
    enabled: true,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(2, 3)] },
    view: view({ hp: 3, pendingAoE: true }),
    enabled: true,
  });

  assert.equal(state.visualBatch, null);
  assert.equal(state.visualHpByUnitId.target, 5);
  assert.equal(state.visualUnitsByUnitId.target.hp, 5);
  assert.equal(state.bufferedEvents.length, 1);
});

test("AoE completion releases one aggregate batch and final HP", () => {
  let state = createVisualResolutionState({
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5, pendingAoE: true }),
    enabled: true,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(2, 3)] },
    view: view({ hp: 3, pendingAoE: true }),
    enabled: true,
  });

  // The authoritative snapshot arrives first, but is held until actionResult.
  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(2, 3)] },
    view: view({ hp: 1 }),
    enabled: true,
  });
  assert.equal(state.visualHpByUnitId.target, 5);

  state = advanceVisualResolution(state, {
    batch: { logIndex: 2, events: [attack(2, 1), aoe()] },
    view: view({ hp: 1 }),
    enabled: true,
  });

  assert.equal(state.visualHpByUnitId.target, 1);
  assert.equal(state.visualUnitsByUnitId.target.hp, 1);
  assert.deepEqual(
    state.visualBatch?.events.map((event) => event.type),
    ["aoeResolved"],
  );

  const sameState = advanceVisualResolution(state, {
    batch: { logIndex: 2, events: [attack(2, 1), aoe()] },
    view: view({ hp: 1 }),
    enabled: true,
  });
  assert.strictEqual(sameState, state, "the same log batch must not replay");
});

test("a queued non-AoE attack chain releases all target results together", () => {
  let state = createVisualResolutionState({
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5, pendingQueue: 2 }),
    enabled: true,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(1, 4)] },
    view: view({ hp: 4, pendingQueue: 1 }),
    enabled: true,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 2, events: [attack(1, 3)] },
    view: view({ hp: 3 }),
    enabled: true,
  });

  assert.equal(state.visualHpByUnitId.target, 3);
  assert.equal(
    state.visualBatch?.events.filter((event) => event.type === "attackResolved")
      .length,
    2,
  );
});

test("a unit revealed by a mass effect enters the board only with the final batch", () => {
  let state = createVisualResolutionState({
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5, pendingAoE: true }),
    enabled: true,
  });
  const projectedAfterReveal = view({ hp: 5, pendingAoE: true });
  projectedAfterReveal.units.revealed = unit("revealed", 4);

  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(1, 4)] },
    view: projectedAfterReveal,
    enabled: true,
  });
  assert.equal(state.visualUnitsByUnitId.revealed, undefined);

  const completedView = view({ hp: 5 });
  completedView.units.revealed = unit("revealed", 4);
  state = advanceVisualResolution(state, {
    batch: { logIndex: 2, events: [aoe()] },
    view: completedView,
    enabled: true,
  });
  assert.equal(state.visualUnitsByUnitId.revealed?.hp, 4);
});

test("a single-target attack stays responsive and reconnect baselines safely", () => {
  let state = createVisualResolutionState({
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 5 }),
    enabled: true,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 0, events: [] },
    view: view({ hp: 3 }),
    enabled: true,
  });
  assert.equal(state.visualHpByUnitId.target, 5);

  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(2, 3)] },
    view: view({ hp: 3 }),
    enabled: true,
  });
  assert.equal(state.visualHpByUnitId.target, 3);
  assert.equal(state.visualBatch?.events[0]?.type, "attackResolved");

  state = advanceVisualResolution(state, {
    batch: { logIndex: 1, events: [attack(2, 3)] },
    view: view({ hp: 2, pendingAoE: true }),
    enabled: false,
  });
  state = advanceVisualResolution(state, {
    batch: { logIndex: 5, events: [attack(1, 2)] },
    view: view({ hp: 2, pendingAoE: true }),
    enabled: true,
  });
  assert.equal(state.visualHpByUnitId.target, 2);
  assert.equal(state.visualBatch, null, "reconnect must not replay historical VFX");
});
