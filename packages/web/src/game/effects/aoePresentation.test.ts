import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerView } from "rules";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits, createVisualResolutionState, advanceVisualResolution } from "./visualResolution";
import { PresentationSession } from "./presentationSession";
import { GASTER_TIMING } from "./sansPresentation";
import { cellToBoardPoint } from "../../features/vfx/vfxGeometry";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { effectsFromEventBatch } from "./eventToEffects";
import type { PresentationEvent } from "./types";

function fixture(damage = [2, 0, 1, 0], abilityId = "kaiserDora", use = "aoe-1") {
  const before = { boardSize: 9, units: Object.fromEntries([
    ["source", { id: "source", owner: "P1", class: "knight", hp: 8, isAlive: true, position: { col: 1, row: 2 } }],
    ...damage.map((_, i) => [`target-${i}`, { id: `target-${i}`, owner: i === 2 ? "P1" : "P2",
      class: "spearman", hp: 5, isAlive: true, position: { col: i + 2, row: 3 } }]),
  ]) } as unknown as PlayerView;
  const after = structuredClone(before);
  const metadata = { abilityId, abilityUseId: use, chainId: use, visualBatchId: use };
  const attacks: Extract<PresentationEvent, { type: "attackResolved" }>[] = damage.map((amount, i) => {
    const id = `target-${i}`;
    after.units[id].hp -= amount;
    return { type: "attackResolved", eventId: `${use}:${id}`, ...metadata,
      attackerId: "source", defenderId: id, sourceCell: { col: 1, row: 2 }, targetCell: { col: i + 2, row: 3 },
      attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
      defenderRoll: { dice: [amount ? 1 : 6, 6], sum: amount ? 7 : 12, isDouble: !amount },
      hit: amount > 0, damage: amount, previousHp: 5, nextHp: 5 - amount, defenderHpAfter: 5 - amount, maxHp: 5 };
  });
  const aggregate: Extract<PresentationEvent, { type: "aoeResolved" }> = { type: "aoeResolved", eventId: `${use}:aggregate`, ...metadata,
    sourceUnitId: "source", sourceCell: { col: 1, row: 2 }, center: { col: 4, row: 3 }, radius: 2,
    affectedUnitIds: damage.map((_, i) => `target-${i}`), revealedUnitIds: [],
    damagedUnitIds: damage.flatMap((amount, i) => amount ? [`target-${i}`] : []),
    damageByUnitId: Object.fromEntries(damage.map((amount, i) => [`target-${i}`, amount])) };
  return { before, after, attacks, aggregate };
}

for (const ability of ["kaiserDora", "kaiserCarpetStrike", "vladForest", "sansGasterBlaster",
  "asgoreFireParade", "jebeHailOfArrows", "mettatonPoppins"]) {
  test(`${ability}: one area signature and one shared mixed outcome, including an ally`, () => {
    const f = fixture([2, 0, 1, 0], ability);
    if (ability === "sansGasterBlaster" && f.aggregate.type === "aoeResolved") f.aggregate.center = { col: 4, row: 2 };
    const p = plan(f);
    const cues = p.batch.combatCues!.filter(c => c.kind === "hit" || c.kind === "miss");
    assert.equal(new Set(cues.map(c => c.atMs)).size, 1);
    assert(p.queue.some(q => q.type === "damageHpTween" && q.damage.targetUnitId === "target-2"));
    const sprites = mapEventBatchToVfx({ ...p.batch, view: f.after, previousPositions: {} });
    const area = sprites.filter(s => !["combatHit", "missShield", "expansion.asgore.parade_hit"].includes(s.effectId));
    assert.equal(area.length, ability === "sansGasterBlaster" ? 3 : ability.startsWith("kaiser") ? 2 : 1);
    if (ability === "asgoreFireParade") assert.equal(sprites.filter(s => s.effectId === "expansion.asgore.parade_hit").length, 2);
    if (ability.startsWith("kaiser")) {
      const buildup = area.find(s => s.effectId.startsWith("expansion.grand-kaiser."))!;
      const impact = area.find(s => !s.effectId.startsWith("expansion."))!;
      assert.equal(buildup.delayMs! + buildup.durationMs!, impact.delayMs);
      assert.equal(impact.delayMs, cues[0].atMs);
    }
    const origin = p.batch.eventDelaysMs![f.attacks.length];
    assert.equal(cues[0].atMs - origin, ability === "sansGasterBlaster" ? GASTER_TIMING.outcomesMs
      : ability === "asgoreFireParade" ? 300 : 0);
    for (const flip of [false, true]) {
      const hit = sprites.find(s => s.effectId === "combatHit" || s.effectId === "expansion.asgore.parade_hit")!;
      assert.deepEqual(hit.sourceCell, { col: 2, row: 3 });
      assert.deepEqual(cellToBoardPoint(hit.sourceCell!, 9, 40, flip), flip ? { x: 260, y: 140 } : { x: 100, y: 220 });
    }
  });
}

test("direct aggregate damage has one synchronized transition/float per target; empty areas invent no outcomes", () => {
  const f = fixture([2, 1, 3], "jackRipperCoveringTracks");
  const p = plan(f, [f.aggregate]);
  const hp = p.queue.filter(q => q.type === "damageHpTween");
  assert.equal(hp.length, 3);
  assert.equal(new Set(hp.map(q => q.startsAtMs)).size, 1);
  const sprites = mapEventBatchToVfx({ ...p.batch, view: f.after, previousPositions: {} });
  assert.equal(sprites.filter(s => s.effectId === "combatHit").length, 3);
  assert(sprites.every(s => s.delayMs === hp[0].startsAtMs));
  const empty = fixture([], "kaiserDora"), e = plan(empty);
  assert.equal(e.batch.combatCues!.length, 0);
  assert.equal(e.queue.filter(q => q.type === "damageHpTween").length, 0);
  const emptyArt = mapEventBatchToVfx({ ...e.batch, view: empty.after, previousPositions: {} });
  assert.equal(emptyArt.length, 2);
  assert.deepEqual(emptyArt.map(r => r.effectId), ["expansion.grand-kaiser.dora_launch", "doraImpact"]);
});

test("confirmed Berserker auto-defense shares the impact and frozen anchor; Roll and zero damage never invent shields", () => {
  const f = fixture();
  const auto: PresentationEvent = { type: "berserkerDefenseChosen", eventId: "auto", defenderId: "target-1",
    choice: "auto", chainId: "aoe-1", deferVisuals: true };
  const roll: PresentationEvent = { ...auto, eventId: "roll-choice", defenderId: "target-3", choice: "roll" };
  const p = plan(f, [auto, roll, ...f.attacks, f.aggregate]);
  const later = structuredClone(f.after);
  later.units["target-1"].position = { col: 8, row: 8 };
  const vfx = mapEventBatchToVfx({ ...p.batch, view: later, previousPositions: {} });
  const shields = vfx.filter(s => s.effectId === "shield");
  assert.equal(shields.length, 1);
  assert.equal(shields[0].delayMs, p.batch.combatCues![0].atMs);
  assert.deepEqual(shields[0].sourceCell, { col: 3, row: 3 });
  const noAnchor = plan(f, [auto, ...f.attacks.map(e => e.type === "attackResolved" ? { ...e, targetCell: null } : e), f.aggregate]);
  assert(!mapEventBatchToVfx({ ...noAnchor.batch, view: later, previousPositions: {} }).some(s => s.effectId === "shield"));
  const privateOutcome = plan(f, [auto, ...f.attacks.filter(e => e.defenderId !== "target-1"), f.aggregate]);
  assert(!mapEventBatchToVfx({ ...privateOutcome.batch, view: later,
    previousPositions: { "target-1": { col: 8, row: 8 } } }).some(s => s.effectId === "shield"));
  const zero = plan(f, f.attacks.map(e => e.type === "attackResolved" ? { ...e, hit: true, damage: 0 } : e));
  assert(!zero.batch.combatCues!.some(c => c.kind === "miss"));
});

test("actual unitDied events share a phase after shared HP; lethal Sans without unitDied remains for Last Attack", () => {
  const f = fixture([5, 5, 2]);
  for (const id of ["target-0", "target-1"]) f.after.units[id] = { ...f.after.units[id], isAlive: false, position: null };
  const deaths: PresentationEvent[] = [0, 1].map(i => ({ type: "unitDied", eventId: `death-${i}`,
    unitId: `target-${i}`, killerId: "source", abilityUseId: "aoe-1", deathCell: { col: i + 2, row: 3 } }));
  const p = plan(f, [...f.attacks, ...deaths, f.aggregate]);
  const hp = p.queue.filter(q => q.type === "damageHpTween"), dying = p.queue.filter(q => q.type === "death");
  assert.equal(dying.length, 2);
  assert.equal(new Set(dying.map(q => q.startsAtMs)).size, 1);
  assert(dying.every(q => q.startsAtMs >= Math.max(...hp.map(item => item.endsAtMs))));
  const sans = fixture([5, 2]);
  sans.after.units["target-0"].heroId = "sans";
  const pending = plan(sans);
  assert(!pending.queue.some(q => q.type === "death" || q.type === "removeVisualUnit"));
  assert(combatVisualPlaybackFrame(pending, pending.durationMs).visualUnitsByUnitId["target-0"].position);
});

test("separate AoE uses retain independent impacts; ordinary multi-attack chains and repeated strikes stay sequential", () => {
  const f = fixture([2, 0], "kaiserDora", "first"), second = fixture([1, 0], "kaiserDora", "second");
  const p = plan(f, [...f.attacks, f.aggregate, ...second.attacks, second.aggregate]);
  const hits = p.batch.combatCues!.filter(c => c.kind === "hit" || c.kind === "miss");
  assert.equal(hits[0].atMs, hits[1].atMs);
  assert.equal(hits[2].atMs, hits[3].atMs);
  assert(hits[2].atMs > hits[0].atMs);
  const ordered = plan(f, f.attacks.map(e => ({ ...e, abilityId: "jebeKhansShooter" })));
  assert(ordered.batch.combatCues![1].atMs > ordered.batch.combatCues![0].atMs);
  const repeated = plan(f, [f.attacks[0], { ...f.attacks[0], eventId: "another-strike" }, f.aggregate]);
  assert(repeated.batch.combatCues![1].atMs > repeated.batch.combatCues![0].atMs);
  const pulses = plan(f, [f.attacks[0], f.aggregate, f.attacks[1], { ...f.aggregate, eventId: "second-pulse" }]);
  assert(pulses.batch.combatCues![1].atMs > pulses.batch.combatCues![0].atMs);
});

test("direct AoE cues freeze authorized ingress cells and do not recover hidden targets from later views", () => {
  const f = fixture([2, 1], "jackRipperCoveringTracks");
  const p = plan(f, [f.aggregate]);
  const cue = p.batch.combatCues!.find(c => c.kind === "damage" && c.unitId === "target-0");
  f.after.units["target-0"].position!.col = 8;
  assert(cue && "cell" in cue);
  assert.deepEqual(cue.cell, { col: 2, row: 3 });
  f.after.units["target-1"].position = null;
  const hidden = plan(f, [f.aggregate]);
  const later = structuredClone(f.after);
  later.units["target-1"].position = { col: 7, row: 7 };
  const sprites = mapEventBatchToVfx({ ...hidden.batch, view: later,
    previousPositions: { "target-1": { col: 6, row: 6 } } });
  assert.equal(sprites.filter(s => s.effectId === "combatHit").length, 1);
});

test("reconnect during defender rolls does not replay aggregate damage already in the snapshot", () => {
  const f = fixture([2, 1, 1]);
  // Defender zero resolved before reconnect. Only future events are delivered.
  f.before.units["target-0"].hp = f.after.units["target-0"].hp;
  const p = plan(f, [...f.attacks.slice(1), f.aggregate]);
  const hp = p.queue.filter(q => q.type === "damageHpTween");
  assert.deepEqual(hp.map(q => q.damage.targetUnitId).sort(), ["target-1", "target-2"]);
  assert.equal(new Set(hp.map(q => q.startsAtMs)).size, 1);
  assert(!p.batch.combatCues!.some(c => "unitId" in c && c.unitId === "target-0"));
  assert.deepEqual(combatVisualPlaybackFrame(p, p.durationMs).visualHpByUnitId, snapshotVisualHp(f.after));
  const healed = fixture([2], "jackRipperCoveringTracks");
  healed.after.units["target-0"].hp = 5;
  const heal: PresentationEvent = { type: "unitHealed", eventId: "heal", unitId: "target-0", amount: 2, hpAfter: 5 };
  const restored = plan(healed, [healed.aggregate, heal]);
  assert.equal(restored.queue.filter(q => q.type === "damageHpTween").length, 1);
  assert.equal(restored.queue.filter(q => q.type === "healHpTween").length, 1);
});

test("sequential manual rolls remain early; deferred outcomes wait for completion, duplicates/reconnect are silent", () => {
  const f = fixture([2, 0, 1]);
  let state = createVisualResolutionState({ batch: null, view: f.before, enabled: true });
  const roll = (id: string, defense: boolean): PresentationEvent => ({ type: "rollResolved", eventId: id,
    rollId: id, rollerPlayerId: defense ? "P2" : "P1", rollKind: defense ? "dora_defenderRoll" : "dora_attackerRoll",
    rollIndex: 0, dice: [5, 4], sides: 6, total: 9, chainId: "aoe-1", deferVisuals: true });
  const pending = { ...f.after, pendingCombatQueueCount: 1 };
  for (let i = 0; i < 3; i++) {
    state = advanceVisualResolution(state, { view: pending, enabled: true, batch: { streamId: "stream", revision: i + 1,
      events: [...(i === 0 ? [roll("attacker", false)] : []), roll(`defender-${i}`, true),
        { ...f.attacks[i], deferVisuals: true }] } });
    assert(state.visualBatch!.events.every(e => e.type === "rollResolved"));
    const early = buildCombatVisualPlaybackPlan({ batch: state.visualBatch!, finalView: pending, reducedMotion: false,
      startingHpByUnitId: snapshotVisualHp(f.before), startingUnitsByUnitId: snapshotVisualUnits(f.before), holdResolvedState: true });
    assert.equal(early.queue.length, 0);
    assert(early.batch.combatCues!.every(c => c.kind === "roll"));
    assert.deepEqual(early.finalHpByUnitId, snapshotVisualHp(f.before));
  }
  const complete: PresentationEvent = { type: "combatVisualBatchReady", eventId: "complete", chainId: "aoe-1",
    visualBatchId: "aoe-1", isChainComplete: true, deferVisuals: false };
  const batch = { streamId: "stream", revision: 4,
    events: [{ ...f.aggregate, deferVisuals: true }, complete].map((e, i) => ({ ...e, eventId: e.eventId ?? `completed-${i}` })) };
  state = advanceVisualResolution(state, { batch, view: f.after, enabled: true });
  const released = plan(f, state.visualBatch!.events);
  assert(!released.batch.combatCues!.some(c => c.kind === "roll"));
  assert.equal(new Set(released.batch.combatCues!.map(c => c.atMs)).size, 1);
  const ingress = new PresentationSession(), binding = { roomId: "room", recipient: "P1" };
  ingress.begin(binding); ingress.snapshot({ ...binding, streamId: "stream", revision: 3 });
  assert.equal(ingress.receive(batch, binding).length, 1);
  assert.equal(ingress.receive(batch, binding).length, 0);
  assert(ingress.receive({ ...batch, revision: 5 }, binding).every(b => b.events.length === 0));
  ingress.begin(binding); ingress.snapshot({ ...binding, streamId: "stream", revision: 5 });
  assert.equal(ingress.receive(batch, binding).length, 0);
});

function plan(f: ReturnType<typeof fixture>, events: PresentationEvent[] = [...f.attacks, f.aggregate], reducedMotion = false) {
  return buildCombatVisualPlaybackPlan({ batch: { streamId: "stream", revision: 1, events, view: f.after },
    startingHpByUnitId: snapshotVisualHp(f.before), startingUnitsByUnitId: snapshotVisualUnits(f.before),
    finalView: f.after, reducedMotion });
}

for (const reduced of [false, true]) {
  for (const damage of [[2, 0, 1, 0], [1, 2, 3, 1, 2], [0, 0, 0, 0]]) {
    test(`one AoE shares outcome/HP/VFX/text/audio timestamp: ${damage.join(",")} reduced=${reduced}`, () => {
      const f = fixture(damage), p = plan(f, undefined, reduced);
      const outcomes = p.batch.combatCues!.filter(c => c.kind === "hit" || c.kind === "miss");
      assert.equal(outcomes.length, damage.length);
      const impact = outcomes[0].atMs;
      assert(outcomes.every(c => c.atMs === impact), "AoE target outcomes must not cascade");
      const hp = p.queue.filter(q => q.type === "damageHpTween");
      assert.equal(hp.length, damage.filter(Boolean).length, "aggregate must not duplicate target damage");
      assert(hp.every(q => q.startsAtMs === impact));
      assert.equal(new Set(hp.map(q => q.endsAtMs)).size, hp.length ? 1 : 0);
      const sprites = mapEventBatchToVfx({ ...p.batch, view: f.after, previousPositions: {} });
      assert(sprites.filter(s => s.effectId === "combatHit" || s.effectId === "missShield").every(s => s.delayMs === impact));
      const audio = mapEventBatchToSfx({ ...p.batch, view: f.after });
      assert(audio.filter(s => s.key === "common.combat.hit" || s.key === "common.combat.miss").every(s => s.delayMs === impact));
      const text = effectsFromEventBatch(p.batch.events, { view: f.after, previousPositions: {} }, p.batch.eventDelaysMs, p.batch.combatCues);
      assert(text.filter(e => e.kind === "floatingText").every(e => e.delayMs === impact));
      if (hp.length) {
        const frame = combatVisualPlaybackFrame(p, (impact + hp[0].endsAtMs) / 2);
        assert(hp.every(q => q.type === "damageHpTween" && frame.visualStateByUnitId[q.damage.targetUnitId] === "takingDamage"));
        const end = combatVisualPlaybackFrame(p, hp[0].endsAtMs);
        assert(hp.every(q => q.type === "damageHpTween" && end.visualHpByUnitId[q.damage.targetUnitId] === q.damage.nextHp));
      }
    });
  }
}
