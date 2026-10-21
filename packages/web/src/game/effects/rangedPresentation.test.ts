import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, attachArmy, createDefaultArmy, createEmptyGame, makePlayerView, makeSpectatorView, projectEventsForRecipient } from "../../../../rules/src/index";
import { initKnowledgeForOwners, makeRngSequence, resolveAllPendingRollsWithEvents, setUnit, toBattleState } from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { expansionAttack } from "../../features/vfx/expansionPresentation";
import { rangedAttackEffect, rangedFlightMs } from "./rangedPresentation";

function accepted(profile: string, hit = true) {
  const [hero, form] = profile.split(".");
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", hero === "base" ? {} : { archer: hero })), createDefaultArmy("P2"));
  const source = Object.values(state.units).find(unit => unit.owner === "P1" && unit.class === "archer")!;
  const target = Object.values(state.units).find(unit => unit.owner === "P2" && unit.class === "knight")!;
  state = setUnit(state, source.id, { position: { col: 1, row: 1 }, isStealthed: false,
    transformed: form === "engineering", mettatonExUnlocked: form === "ex" || form === "neo", mettatonNeoUnlocked: form === "neo" });
  state = initKnowledgeForOwners(toBattleState(setUnit(state, target.id, { position: { col: 6, row: 1 }, hp: 20 }), "P1", source.id));
  const rng = makeRngSequence(hit ? [.99, .8, .01, .2] : [.01, .2, .99, .8]);
  const started = applyAction(state, { type: "attack", attackerId: source.id, defenderId: target.id }, rng);
  const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
  return { before: state, after: resolved.state, events: [...started.events, ...resolved.events], source: state.units[source.id], target: state.units[target.id] };
}

test("all four archers, three ranged forms and the base Archer fly once on accepted hit and miss after the final dice", () => {
  const profiles: [string, string][] = [["grand-kaiser", "expansion.grand-kaiser.attack_projectile"],
    ["grand-kaiser.engineering", "expansion.grand-kaiser.engineering_attack"], ["artemida", "expansion.artemida.attack_projectile"],
    ["jebe", "expansion.jebe.attack_projectile"], ["mettaton", "expansion.mettaton.attack_projectile"],
    ["mettaton.ex", "expansion.mettaton.ex_attack"], ["mettaton.neo", "expansion.mettaton.neo_attack"], ["base", "basicProjectile"]];
  for (const [profile, effectId] of profiles) for (const hit of [true, false]) for (const recipient of ["P1", "P2", "spectator"] as const) {
    const f = accepted(profile, hit), saved = JSON.stringify(f.after);
    const view = recipient === "spectator" ? makeSpectatorView : (state: typeof f.after) => makePlayerView(state, recipient);
    const before = view(f.before), after = view(f.after);
    const events = projectEventsForRecipient(f.after, f.events, recipient);
    const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, streamId: "ranged", events, view: after },
      startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: snapshotVisualUnits(before), finalView: after, reducedMotion: false });
    const requests = mapEventBatchToVfx({ ...plan.batch, view: after, previousPositions: {} });
    const shots = requests.filter(request => request.placement === "projectile");
    assert.equal(shots.length, 1, `${profile}/${recipient}: exactly one flight`);
    const shot = shots[0], outcome = plan.batch.combatCues!.find(cue => cue.kind === (hit ? "hit" : "miss"))!;
    assert.equal(shot.effectId, effectId); assert.equal(shot.durationMs, 600);
    assert.equal(shot.delayMs! + shot.durationMs!, outcome.atMs);
    const lastRoll = plan.batch.combatCues!.filter(cue => cue.kind === "roll").slice(-1)[0]!;
    assert(shot.delayMs! >= lastRoll.atMs + lastRoll.durationMs, "flight starts after dice so the result cannot cover it");
    assert.deepEqual(shot.sourceCell, f.source.position); assert.deepEqual(shot.targetCell, { col: 6, row: 1 });
    assert.equal(requests.some(request => request.effectId === `expansion.${profile.split(".")[0]}.attack_impact`), profile !== "base" && hit);
    assert(!plan.queue.some(item => item.type === "attack" && item.lunge));
    assert.equal(JSON.stringify(f.after), saved, "presentation never changes the rules result");
  }
});

test("ranged timing is bounded by confirmed distance and preserves a 70ms reduced-motion phase", () => {
  const f = accepted("grand-kaiser"), before = makePlayerView(f.before, "P1"), after = makePlayerView(f.after, "P1");
  const events = projectEventsForRecipient(f.after, f.events, "P1");
  const event = events.find(event => event.type === "attackResolved")!;
  assert(event.type === "attackResolved");
  assert.equal(rangedFlightMs({ ...event, targetCell: { col: 2, row: 1 } }), 360);
  assert.equal(rangedFlightMs({ ...event, targetCell: { col: 100, row: 100 } }), 780);
  assert.equal(rangedAttackEffect({ ...event, sourceCell: null }, after), undefined);
  const hidden = { ...after, units: { ...after.units, [f.source.id]: { ...after.units[f.source.id], position: null } } };
  assert.equal(rangedAttackEffect(event, hidden), undefined);
  const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, events, view: after },
    startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: snapshotVisualUnits(before), finalView: after, reducedMotion: true });
  const shot = mapEventBatchToVfx({ ...plan.batch, view: after, previousPositions: {} }).find(request => request.placement === "projectile")!;
  assert.equal(shot.durationMs, 70);
  assert.equal(shot.delayMs! + shot.durationMs!, plan.batch.combatCues!.find(cue => cue.kind === "hit")!.atMs);
});

test("archer-like abilities release on hit and miss without borrowing melee swings or duplicating signature projectiles", () => {
  const f = accepted("grand-kaiser"), view = makePlayerView(f.after, "P1");
  const attack = projectEventsForRecipient(f.after, f.events, "P1").find(event => event.type === "attackResolved")!;
  assert(attack.type === "attackResolved");
  for (const [abilityId, expected] of [["gutsArbalet", "gutsCrossbow"], ["gutsCannon", "basicProjectile"], ["undyneSpearThrow", "undyneThrow"]]) {
    for (const hit of [true, false]) {
      const event = { ...attack, abilityId, isBasicAttack: undefined, hit };
      const requests = expansionAttack(event, { id: "hit", eventIndex: 0, kind: hit ? "hit" : "miss", unitId: f.target.id,
        attackAtMs: 50, atMs: 650, durationMs: 300 }, view, "shot");
      assert.equal(requests.length, 1); assert.equal(requests[0].effectId, expected);
      assert.equal(requests[0].placement, "projectile"); assert.equal(requests[0].durationMs, 600);
      assert.equal(requests[0].delayMs, 50);
    }
  }
  assert.deepEqual(expansionAttack({ ...attack, attackSignature: "friskPrecisionStrike" }, undefined, view, "precision"), []);
  assert.deepEqual(expansionAttack({ ...attack, abilityId: "jebeKhansShooter" }, undefined, view, "ricochet"), []);
  assert.deepEqual(expansionAttack({ ...attack, isBasicAttack: undefined, abilityId: "unknown" }, undefined, view, "unknown"), []);
});

test("Undying's accepted three-shot spear action has three separate flights on its existing combat clock", () => {
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", { berserker: "undyne" })), createDefaultArmy("P2"));
  const source = Object.values(state.units).find(unit => unit.heroId === "undyne")!;
  const target = Object.values(state.units).find(unit => unit.owner === "P2" && unit.class === "knight")!;
  state = setUnit(state, source.id, { position: { col: 1, row: 1 }, undyneImmortalActive: true,
    charges: { ...source.charges, undyneSpearThrow: 2 } });
  state = initKnowledgeForOwners(toBattleState(setUnit(state, target.id, { heroId: "griffith", hp: 20,
    position: { col: 6, row: 1 } }), "P1", source.id));
  const rng = makeRngSequence(Array.from({ length: 32 }, () => [.99, .8, .01, .2]).flat());
  const started = applyAction(state, { type: "useAbility", unitId: source.id, abilityId: "undyneSpearThrow", payload: { targetId: target.id } }, rng);
  const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
  const before = makePlayerView(state, "P1"), after = makePlayerView(resolved.state, "P1");
  const events = projectEventsForRecipient(resolved.state, [...started.events, ...resolved.events], "P1");
  assert.equal(events.filter(event => event.type === "attackResolved").length, 3);
  const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, events, view: after },
    startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: snapshotVisualUnits(before), finalView: after, reducedMotion: false });
  const shots = mapEventBatchToVfx({ ...plan.batch, view: after, previousPositions: {} }).filter(request => request.placement === "projectile");
  assert.equal(shots.length, 3); assert.equal(new Set(shots.map(shot => shot.id)).size, 3);
  const outcomes = plan.batch.combatCues!.filter(cue => cue.kind === "hit" || cue.kind === "miss");
  shots.forEach((shot, index) => {
    assert.equal(shot.effectId, "undyneThrow"); assert.equal(shot.durationMs, 600);
    assert.equal(shot.delayMs! + shot.durationMs!, outcomes[index].atMs);
    if (index) assert(shot.delayMs! >= outcomes[index - 1].atMs, "the next spear cannot overtake the previous result");
  });
});
