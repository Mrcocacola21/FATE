import assert from "node:assert/strict";
import test from "node:test";
import { makeEmptyTurnEconomy, type GameEvent, type PlayerView, type UnitState } from "rules";
import { mapEventBatchToVfx } from "./vfxEventMapper";

function unit(id: string, position: UnitState["position"]): UnitState {
  return {
    id,
    owner: "P1",
    class: "berserker",
    hp: 5,
    attack: 2,
    position,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: makeEmptyTurnEconomy(),
    charges: {},
    cooldowns: {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: true,
  };
}

function view(units: UnitState[]): PlayerView {
  return {
    boardSize: 9,
    units: Object.fromEntries(units.map((entry) => [entry.id, entry])),
  } as PlayerView;
}

function map(events: GameEvent[], currentView: PlayerView, previousPositions = {}) {
  return mapEventBatchToVfx({
    events,
    view: currentView,
    previousPositions,
    logIndex: 12,
  });
}

test("public AoE ability events map to area VFX using affected radius geometry", () => {
  const effects = map(
    [
      {
        type: "aoeResolved",
        sourceUnitId: "asgore",
        abilityId: "asgoreFireParade",
        center: { col: 4, row: 4 },
        radius: 2,
        affectedUnitIds: [],
        revealedUnitIds: [],
        damagedUnitIds: [],
      } as GameEvent,
    ],
    view([unit("asgore", { col: 4, row: 4 })]),
  );

  assert.equal(effects.length, 1);
  assert.equal(effects[0]?.effectId, "fireParade");
  assert.equal(effects[0]?.placement, "area");
  assert.equal(effects[0]?.cells?.length, 25);
});

test("private mark VFX only plays when projected event and target coordinate are visible", () => {
  const visible = map(
    [
      {
        type: "chikatiloMarkApplied",
        chikatiloId: "chikatilo",
        targetId: "target",
        ownerPlayerId: "P1",
        trackingStarts: "startOfChikatiloTurn",
        trackingExpires: "afterMarkedUnitTurn",
      },
    ],
    view([unit("chikatilo", { col: 1, row: 1 }), unit("target", { col: 3, row: 3 })]),
  );
  assert.equal(visible[0]?.effectId, "markApply");
  assert.deepEqual(visible[0]?.sourceCell, { col: 3, row: 3 });

  const redacted = map([{ type: "chikatiloMarkApplied" } as GameEvent], view([]));
  assert.deepEqual(redacted, []);

  const hiddenTarget = map(
    [
      {
        type: "chikatiloMarkApplied",
        chikatiloId: "chikatilo",
        targetId: "hidden-target",
        ownerPlayerId: "P1",
        trackingStarts: "startOfChikatiloTurn",
        trackingExpires: "afterMarkedUnitTurn",
      },
    ],
    view([unit("chikatilo", { col: 1, row: 1 })]),
    { "hidden-target": { col: 7, row: 7 } },
  );
  assert.deepEqual(hiddenTarget, []);
});

test("Search reveal maps only visible revealed units to target VFX", () => {
  const effects = map(
    [
      {
        type: "searchStealth",
        unitId: "searcher",
        mode: "action",
        rolls: [
          { targetId: "visible-hidden", roll: 5, success: true },
          { targetId: "still-hidden", roll: 1, success: false },
        ],
      },
    ],
    view([unit("searcher", { col: 2, row: 2 }), unit("visible-hidden", { col: 5, row: 5 })]),
  );

  assert.ok(effects.some((effect) => effect.effectId === "searchReveal"));
  assert.ok(
    effects.some(
      (effect) =>
        effect.effectId === "hiddenReveal" &&
        effect.sourceCell?.col === 5 &&
        effect.sourceCell.row === 5,
    ),
  );
  assert.ok(!effects.some((effect) => effect.id.includes("still-hidden")));
});

test("resolved transport and phantasm movement map to path/cell VFX from public events", () => {
  const transport = map(
    [
      {
        type: "riverBoatResolved",
        riverId: "river",
        passengerId: "ally",
        riverDestination: { col: 4, row: 4 },
        dropDestination: { col: 5, row: 4 },
      },
    ],
    view([unit("river", { col: 4, row: 4 }), unit("ally", { col: 5, row: 4 })]),
    { river: { col: 1, row: 1 }, ally: { col: 2, row: 1 } },
  );
  assert.ok(transport.some((effect) => effect.effectId === "boat"));
  assert.ok(transport.some((effect) => effect.placement === "path"));

  const phantasm = map(
    [
      { type: "abilityUsed", unitId: "grozny", abilityId: "groznyInvadeTime" },
      {
        type: "unitMoved",
        unitId: "grozny",
        from: { col: 1, row: 1 },
        to: { col: 6, row: 6 },
      },
    ],
    view([unit("grozny", { col: 6, row: 6 })]),
  );
  assert.ok(phantasm.some((effect) => effect.effectId === "phantasm"));
  assert.ok(phantasm.some((effect) => effect.effectId === "phantasmTrace"));
});

test("redacted movement events do not create exact-cell phantasm traces", () => {
  const effects = map(
    [
      { type: "abilityUsed", unitId: "grozny", abilityId: "groznyInvadeTime" },
      { type: "unitMoved", unitId: "grozny" } as GameEvent,
    ],
    view([unit("grozny", { col: 6, row: 6 })]),
  );

  assert.ok(effects.some((effect) => effect.effectId === "phantasm"));
  assert.ok(!effects.some((effect) => effect.effectId === "phantasmTrace"));
  assert.ok(!effects.some((effect) => effect.placement === "line"));
});

test("storm, transformation, chicken, muzzle, and shield events map to unit-safe VFX", () => {
  const effects = map(
    [
      { type: "lechyStormRollResult", unitId: "target", roll: 1, success: false, damage: 1, hpAfter: 2 },
      {
        type: "unitTransformed",
        unitId: "griffith",
        fromHeroId: "griffith",
        toHeroId: "femto",
        reason: "griffithFemtoRebirth",
      },
      { type: "lokiChickenApplied", lokiId: "loki", targetId: "target", abilityId: "lokiLaught" },
      { type: "abilityUsed", unitId: "guts", abilityId: "gutsCannon" },
      { type: "berserkerDefenseChosen", defenderId: "target", choice: "auto" },
    ] as GameEvent[],
    view([
      unit("target", { col: 3, row: 3 }),
      unit("griffith", { col: 4, row: 4 }),
      unit("loki", { col: 2, row: 2 }),
      unit("guts", { col: 1, row: 1 }),
    ]),
  );

  assert.ok(effects.some((effect) => effect.effectId === "storm"));
  assert.ok(effects.some((effect) => effect.effectId === "transformation"));
  assert.ok(effects.some((effect) => effect.effectId === "chicken"));
  assert.ok(effects.some((effect) => effect.effectId === "muzzle"));
  assert.ok(effects.some((effect) => effect.effectId === "shield"));
});

test("storm roll VFX can use a previous visible projected cell after damage removes position", () => {
  const defeated = { ...unit("target", null), isAlive: false, hp: 0 };
  const effects = map(
    [
      {
        type: "lechyStormRollResult",
        unitId: "target",
        roll: 1,
        success: false,
        damage: 1,
        hpAfter: 0,
      },
    ] as GameEvent[],
    view([defeated]),
    { target: { col: 3, row: 3 } },
  );

  assert.equal(effects[0]?.effectId, "storm");
  assert.deepEqual(effects[0]?.sourceCell, { col: 3, row: 3 });
});
