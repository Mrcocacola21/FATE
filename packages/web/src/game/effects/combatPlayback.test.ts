import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectedGameEvent, PlayerView, UnitState } from "rules";
import {
  buildCombatVisualPlaybackPlan,
  combatVisualPlaybackFrame,
  isGameplayProjectedUnit,
} from "./combatPlayback";
import { meleeLungeDirection } from "./meleeLunge";

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

function attack(previousHp: number, nextHp: number): Extract<ProjectedGameEvent, { type: "attackResolved" }> {
  return {
    type: "attackResolved",
    attackerId: "attacker",
    defenderId: "target",
    sourceCell: { col: 2, row: 1 },
    targetCell: { col: 2, row: 2 },
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

test("adjacent melee leans toward contact and returns without moving tactical coordinates or changing hit timing", () => {
  for (const hit of [true, false]) {
    const finalView = playerView(unit("target", hit ? 3 : 5));
    const event = { ...attack(5, hit ? 3 : 5), isBasicAttack: true, hit };
    const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, events: [event] },
      startingHpByUnitId: { attacker: 6, target: 5 }, startingUnitsByUnitId: playerView(unit("target", 5)).units,
      finalView, reducedMotion: false });
    const cue = plan.batch.combatCues!.find(cue => cue.kind === (hit ? "hit" : "miss"))!;
    assert.equal(cue.atMs, 210);
    const windup = combatVisualPlaybackFrame(plan, 70).visualAttackByUnitId.attacker;
    assert(windup.distance < 0, "small anticipation before forward thrust");
    const contact = combatVisualPlaybackFrame(plan, cue.atMs);
    assert.deepEqual(contact.visualAttackByUnitId.attacker.direction, { col: 0, row: 1 });
    assert(Math.abs(contact.visualAttackByUnitId.attacker.distance - .24) < .0001);
    assert(Math.abs(contact.visualAttackByUnitId.attacker.stretch - 1.075) < .0001);
    assert.deepEqual(contact.visualUnitsByUnitId.attacker.position, { col: 2, row: 1 });
    assert.deepEqual(contact.visualMotionByUnitId, {}, "lunge cannot move aura, route or status anchors");
    assert(combatVisualPlaybackFrame(plan, 250).visualAttackByUnitId.attacker.distance < .24);
    assert.equal(combatVisualPlaybackFrame(plan, 290).visualAttackByUnitId.attacker, undefined);
    assert.deepEqual(combatVisualPlaybackFrame(plan, plan.durationMs).visualAttackByUnitId, {});
  }
});

test("lunge excludes distant, ranged, special, hidden and missing-source attacks and normalizes diagonals", () => {
  const current = playerView(unit("target", 5));
  const event = { ...attack(5, 3), isBasicAttack: true };
  assert.equal(meleeLungeDirection({ ...event, targetCell: { col: 2, row: 3 } }, current), null);
  assert.equal(meleeLungeDirection({ ...event, sourceCell: null }, current), null);
  assert.equal(meleeLungeDirection({ ...event, isBasicAttack: undefined }, current), null);
  assert.equal(meleeLungeDirection({ ...event, attackSignature: "friskPrecisionStrike" }, current), null);
  current.units.attacker.class = "archer";
  assert.equal(meleeLungeDirection(event, current), null);
  current.units.attacker.heroId = "artemida";
  assert.equal(meleeLungeDirection(event, current), null, "adjacent arrow still releases a projectile");
  current.units.attacker.heroId = "guts";
  current.units.attacker.class = "berserker";
  assert(meleeLungeDirection({ ...event, isBasicAttack: undefined, attackSignature: "gutsBerserkSingle" }, current));
  const direction = meleeLungeDirection({ ...event, targetCell: { col: 3, row: 2 } }, current)!;
  assert(Math.abs(Math.hypot(direction.col, direction.row) - 1) < .0001);
  current.units.attacker.position = null;
  assert.equal(meleeLungeDirection(event, current), null);
});

test("reduced motion preserves the adjacent attack outcome without token thrust", () => {
  const current = playerView(unit("target", 5));
  const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, events: [{ ...attack(5, 3), isBasicAttack: true }] },
    startingHpByUnitId: { attacker: 6, target: 5 }, startingUnitsByUnitId: current.units,
    finalView: playerView(unit("target", 3)), reducedMotion: true });
  assert.equal(plan.batch.combatCues!.find(cue => cue.kind === "hit")!.atMs, 70);
  assert.deepEqual(combatVisualPlaybackFrame(plan, 60).visualAttackByUnitId, {});
});

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
      revision: 9,
      events: [
        attack(2, 0),
        { type: "unitDied", unitId: "target", killerId: "attacker", deathCell: { col: 2, row: 2 } },
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
    batch: { revision: 2, events: [attack(5, 3)] },
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
      revision: 3,
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
      revision: 4,
      events: [
        attack(2, 0),
        { type: "unitDied", unitId: "target", killerId: "attacker" },
      ] as ProjectedGameEvent[],
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
