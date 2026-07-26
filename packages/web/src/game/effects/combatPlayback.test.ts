import assert from "node:assert/strict";
import test from "node:test";
import type { GameEvent, PlayerView, UnitState } from "rules";
import {
  buildCombatVisualPlaybackPlan,
  combatVisualPlaybackFrame,
  isGameplayProjectedUnit,
} from "./combatPlayback";

function unit(id: string, hp: number, position = { col: 2, row: 2 }): UnitState {
  return {
    id,
    owner: id === "attacker" ? "P1" : "P2",
    class: id === "attacker" ? "knight" : "spearman",
    hp,
    isAlive: hp > 0,
    position,
    isStealthed: false,
  } as UnitState;
}

function attack(previousHp: number, nextHp: number): GameEvent {
  return {
    type: "attackResolved",
    attackerId: "attacker",
    defenderId: "target",
    attackerRoll: { dice: [6], sum: 6, isDouble: false },
    defenderRoll: { dice: [1], sum: 1, isDouble: false },
    hit: true,
    damage: previousHp - nextHp,
    defenderHpAfter: nextHp,
    previousHp,
    nextHp,
    maxHp: 5,
  };
}

function playerView(target: UnitState): PlayerView {
  return {
    boardSize: 9,
    units: {
      attacker: unit("attacker", 6, { col: 2, row: 1 }),
      target,
    },
  } as unknown as PlayerView;
}

test("lethal damage keeps a render-only ghost through HP tween and death", () => {
  const startingUnits = {
    attacker: unit("attacker", 6, { col: 2, row: 1 }),
    target: unit("target", 2),
  };
  const deadTarget = {
    ...unit("target", 0),
    isAlive: false,
    position: null,
  };
  const plan = buildCombatVisualPlaybackPlan({
    batch: {
      logIndex: 9,
      events: [
        attack(2, 0),
        { type: "unitDied", unitId: "target", killerId: "attacker" },
      ],
    },
    startingHpByUnitId: { attacker: 6, target: 2 },
    startingUnitsByUnitId: startingUnits,
    finalView: playerView(deadTarget),
    reducedMotion: false,
  });

  const tween = plan.queue.find((item) => item.type === "damageHpTween");
  const death = plan.queue.find((item) => item.type === "death");
  const removal = plan.queue.find((item) => item.type === "removeVisualUnit");
  assert.ok(tween && death && removal);
  assert.ok(death.startsAtMs >= tween.endsAtMs, "death must wait for HP to reach zero");

  const duringDamage = combatVisualPlaybackFrame(
    plan,
    tween.startsAtMs + (tween.endsAtMs - tween.startsAtMs) / 2,
  );
  assert.ok(duringDamage.visualUnitsByUnitId.target?.position);
  assert.equal(duringDamage.visualStateByUnitId.target, "takingDamage");
  assert.ok(duringDamage.visualHpByUnitId.target < 2);

  const duringDeath = combatVisualPlaybackFrame(plan, death.startsAtMs + 1);
  assert.ok(duringDeath.visualUnitsByUnitId.target?.position);
  assert.equal(duringDeath.visualHpByUnitId.target, 0);
  assert.equal(duringDeath.visualStateByUnitId.target, "dying");

  const removed = combatVisualPlaybackFrame(plan, removal.startsAtMs + 1);
  assert.equal(removed.visualUnitsByUnitId.target, undefined);
  assert.equal(removed.visualStateByUnitId.target, "removed");
});

test("non-lethal damage finishes with the authoritative unit still visible", () => {
  const target = unit("target", 5);
  const finalTarget = unit("target", 3);
  const plan = buildCombatVisualPlaybackPlan({
    batch: { logIndex: 2, events: [attack(5, 3)] },
    startingHpByUnitId: { attacker: 6, target: 5 },
    startingUnitsByUnitId: {
      attacker: unit("attacker", 6, { col: 2, row: 1 }),
      target,
    },
    finalView: playerView(finalTarget),
    reducedMotion: false,
  });
  const complete = combatVisualPlaybackFrame(plan, plan.durationMs);
  assert.equal(complete.visualHpByUnitId.target, 3);
  assert.ok(complete.visualUnitsByUnitId.target.position);
});

test("multiple hits tween in event order and death is scheduled once", () => {
  const target = unit("target", 5);
  const deadTarget = { ...unit("target", 0), isAlive: false, position: null };
  const plan = buildCombatVisualPlaybackPlan({
    batch: {
      logIndex: 3,
      events: [
        attack(5, 3),
        attack(3, 0),
        { type: "unitDied", unitId: "target", killerId: "attacker" },
        { type: "unitDied", unitId: "target", killerId: "attacker" },
      ],
    },
    startingHpByUnitId: { attacker: 6, target: 5 },
    startingUnitsByUnitId: {
      attacker: unit("attacker", 6, { col: 2, row: 1 }),
      target,
    },
    finalView: playerView(deadTarget),
    reducedMotion: false,
  });
  const tweens = plan.queue.filter((item) => item.type === "damageHpTween");
  const deaths = plan.queue.filter((item) => item.type === "death");
  assert.equal(tweens.length, 2);
  assert.equal(deaths.length, 1);
  assert.equal(tweens[0].damage.previousHp, 5);
  assert.equal(tweens[0].damage.nextHp, 3);
  assert.equal(tweens[1].damage.previousHp, 3);
  assert.equal(tweens[1].damage.nextHp, 0);
  assert.ok(tweens[1].startsAtMs >= tweens[0].endsAtMs);
});

test("reduced motion keeps feedback but shortens the full playback", () => {
  const target = unit("target", 2);
  const deadTarget = { ...unit("target", 0), isAlive: false, position: null };
  const common = {
    batch: {
      logIndex: 4,
      events: [
        attack(2, 0),
        { type: "unitDied", unitId: "target", killerId: "attacker" },
      ] as GameEvent[],
    },
    startingHpByUnitId: { attacker: 6, target: 2 },
    startingUnitsByUnitId: {
      attacker: unit("attacker", 6, { col: 2, row: 1 }),
      target,
    },
    finalView: playerView(deadTarget),
  };
  const full = buildCombatVisualPlaybackPlan({ ...common, reducedMotion: false });
  const reduced = buildCombatVisualPlaybackPlan({ ...common, reducedMotion: true });
  assert.ok(reduced.durationMs < full.durationMs);
  assert.ok(reduced.queue.some((item) => item.type === "death"));
});

test("a visual ghost is never considered a selectable gameplay unit", () => {
  const deadTarget = { ...unit("target", 0), isAlive: false, position: null };
  const finalView = playerView(deadTarget);
  assert.equal(isGameplayProjectedUnit(finalView, "target"), false);
  assert.equal(isGameplayProjectedUnit(finalView, "attacker"), true);
});
