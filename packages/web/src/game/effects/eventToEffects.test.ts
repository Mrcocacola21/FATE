import assert from "node:assert/strict";
import test from "node:test";
import type { GameEvent, PlayerView, UnitState } from "rules";
import { effectsFromGameEvent } from "./eventToEffects";

function unit(
  id: string,
  position: { col: number; row: number } | null,
  isAlive = true,
): UnitState {
  return {
    id,
    position,
    isAlive,
  } as UnitState;
}

function view(units: UnitState[]): PlayerView {
  return {
    boardSize: 9,
    units: Object.fromEntries(units.map((entry) => [entry.id, entry])),
  } as PlayerView;
}

test("a visible ranged hit maps to a beam, hit flash, and damage text", () => {
  const currentView = view([
    unit("attacker", { col: 1, row: 1 }),
    unit("defender", { col: 5, row: 1 }),
  ]);
  const effects = effectsFromGameEvent(
    {
      type: "attackResolved",
      attackerId: "attacker",
      defenderId: "defender",
      attackerRoll: { dice: [6], sum: 6 },
      defenderRoll: { dice: [1], sum: 1 },
      hit: true,
      damage: 2,
      defenderHpAfter: 3,
    } as GameEvent,
    { view: currentView, previousPositions: {} },
  );

  assert.ok(effects.some((effect) => effect.kind === "beam"));
  assert.ok(effects.some((effect) => effect.kind === "unitFlash" && effect.tone === "hit"));
  assert.ok(
    effects.some(
      (effect) =>
        effect.kind === "floatingText" && effect.tone === "damage" && effect.text === "-2",
    ),
  );
});

test("an AoE uses only visible projected units for hit and damage feedback", () => {
  const currentView = view([
    unit("caster", { col: 4, row: 4 }),
    unit("visible-target", { col: 5, row: 5 }),
  ]);
  const effects = effectsFromGameEvent(
    {
      type: "aoeResolved",
      sourceUnitId: "caster",
      center: { col: 4, row: 4 },
      radius: 1,
      affectedUnitIds: ["visible-target", "redacted-target"],
      revealedUnitIds: [],
      damagedUnitIds: ["visible-target", "redacted-target"],
      damageByUnitId: {
        "visible-target": 2,
        "redacted-target": 3,
      },
    },
    { view: currentView, previousPositions: {} },
  );

  const area = effects.find((effect) => effect.kind === "areaHighlight");
  assert.equal(area?.kind === "areaHighlight" ? area.cells.length : 0, 9);
  assert.ok(
    effects.some((effect) => effect.kind === "unitFlash" && effect.unitId === "visible-target"),
  );
  assert.ok(
    !effects.some((effect) => effect.kind === "unitFlash" && effect.unitId === "redacted-target"),
  );
  assert.ok(
    !effects.some(
      (effect) =>
        effect.kind === "floatingText" && effect.coord.col === 0 && effect.coord.row === 0,
    ),
  );
  assert.ok(
    effects.some(
      (effect) =>
        effect.kind === "floatingText" && effect.tone === "damage" && effect.text === "-2",
    ),
  );
});

test("movement maps to a trail between explicit projected coordinates", () => {
  const effects = effectsFromGameEvent(
    {
      type: "unitMoved",
      unitId: "mover",
      from: { col: 1, row: 1 },
      to: { col: 1, row: 4 },
    },
    { view: view([unit("mover", { col: 1, row: 4 })]), previousPositions: {} },
  );

  const trail = effects.find((effect) => effect.kind === "movementTrail");
  assert.equal(trail?.kind === "movementTrail" ? trail.path.length : 0, 4);
});

test("an event naming a hidden unit does not use a cached hidden coordinate", () => {
  const effects = effectsFromGameEvent(
    {
      type: "stealthRevealed",
      unitId: "hidden-unit",
      reason: "attacked",
    } as GameEvent,
    {
      view: view([]),
      previousPositions: { "hidden-unit": { col: 7, row: 7 } },
    },
  );

  assert.deepEqual(effects, []);
});

test("Papyrus Blue Bone application maps to a blue pulse and localized label", () => {
  const effects = effectsFromGameEvent(
    {
      type: "papyrusBoneApplied",
      papyrusId: "papyrus",
      targetId: "target",
      boneType: "blue",
      expiresOnSourceOwnTurn: 2,
    },
    { view: view([unit("target", { col: 3, row: 4 })]), previousPositions: {} },
  );

  assert.ok(effects.some((effect) => effect.kind === "cellPulse" && effect.tone === "boneBlue"));
  assert.ok(
    effects.some(
      (effect) =>
        effect.kind === "floatingText" && effect.label === "blueBone" && effect.tone === "boneBlue",
    ),
  );
});

test("Sans Bone Field Orange Bone application maps to an orange pulse and label", () => {
  const effects = effectsFromGameEvent(
    {
      type: "sansBoneFieldApplied",
      unitId: "target",
      boneType: "orange",
      turnNumber: 7,
    },
    { view: view([unit("target", { col: 6, row: 2 })]), previousPositions: {} },
  );

  assert.ok(effects.some((effect) => effect.kind === "cellPulse" && effect.tone === "boneOrange"));
  assert.ok(
    effects.some(
      (effect) =>
        effect.kind === "floatingText" &&
        effect.label === "orangeBone" &&
        effect.tone === "boneOrange",
    ),
  );
});

test("bone punishment keeps its color cue and shows the exact damage", () => {
  const effects = effectsFromGameEvent(
    {
      type: "papyrusBonePunished",
      papyrusId: "papyrus",
      targetId: "target",
      boneType: "orange",
      damage: 1,
      reason: "moveNotSpent",
      hpAfter: 2,
    },
    { view: view([unit("target", { col: 2, row: 5 })]), previousPositions: {} },
  );

  assert.ok(effects.some((effect) => effect.kind === "cellPulse" && effect.tone === "boneOrange"));
  assert.ok(
    effects.some(
      (effect) =>
        effect.kind === "floatingText" && effect.tone === "damage" && effect.text === "-1",
    ),
  );
});
