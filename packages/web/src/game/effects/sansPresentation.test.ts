import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ABILITY_SANS_GASTER_BLASTER,
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  type GameState,
  type GameEvent,
  type PlayerView,
  type LiveEventBatch,
  type DeliveredGameEvent,
} from "rules";
import {
  setupSansState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
  makeAttackWinRng,
  resolvePendingRollOnce,
} from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  snapshotVisualHp,
  snapshotVisualUnits,
} from "./visualResolution";
import { PresentationSession } from "./presentationSession";
import { effectsFromEventBatch } from "./eventToEffects";
import { GASTER_TIMING } from "./sansPresentation";
import type { BoardEventBatch, PresentationEvent } from "./types";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { rayToBoardEdge, cellToBoardPoint } from "../../features/vfx/vfxGeometry";
import { enqueueBoardVfx, simplifyVfxForReducedMotion } from "../../features/vfx/vfxQueue";
import { VfxLayer } from "../../features/vfx/VfxLayer";
import { buildActionPreview } from "../targeting/buildActionPreview";
import { buildPendingPreview } from "../targeting/buildPendingPreview";
import { EVENT_VISIBILITY } from "../../../../rules/src/model/events/visibility";
import { projectEventsForRecipient as projectSourceEvents } from "../../../../rules/src/view/events";
import { preloadSansSounds } from "../../features/sfx/audioPreload";

test("projected Sans pack can warm all seven lazy sound keys without playing them", async () => {
  const keys: string[] = [];
  await preloadSansSounds({
    preload: async (key) => {
      keys.push(key);
    },
  });
  assert.deepEqual(
    keys.sort(),
    [
      "hero.sans.abilities.sansBadassJoke",
      "hero.sans.abilities.sansBoneField",
      "hero.sans.abilities.sansGasterBlaster.charge",
      "hero.sans.abilities.sansGasterBlaster.fire",
      "hero.sans.abilities.sansLastAttack.apply",
      "hero.sans.abilities.sansLastAttack.tick",
      "hero.sans.abilities.sansLastAttack.remove",
    ].sort(),
  );
});

function batch(
  events: GameEvent[] | PresentationEvent[],
  state: GameState,
  revision = 1,
): BoardEventBatch & LiveEventBatch {
  return {
    streamId: "sans-pack",
    revision,
    view: makePlayerView(state, "P1"),
    events: events.map((event, i) => ({ ...event, eventId: `sans-${revision}-${i}` })),
  };
}
function plan(b: BoardEventBatch, before: PlayerView, reducedMotion = false) {
  return buildCombatVisualPlaybackPlan({
    batch: b,
    finalView: b.view!,
    reducedMotion,
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
  });
}
function outputs(b: BoardEventBatch) {
  const args = { ...b, view: b.view!, previousPositions: {} };
  return {
    sprites: mapEventBatchToVfx(args),
    sounds: mapEventBatchToSfx(args),
    effects: effectsFromEventBatch(b.events, args, b.eventDelaysMs, b.combatCues, b.movementCues),
  };
}
function gaster(empty = false, mixed = false, lethal = false) {
  const f = setupSansState();
  const targets = Object.values(f.state.units)
    .filter((u) => u.owner === "P2" && ["archer", "knight", "spearman"].includes(u.class))
    .slice(0, 3);
  let state = setUnit(f.state, f.sans.id, {
    position: { col: 0, row: 4 },
    charges: { ...f.sans.charges, [ABILITY_SANS_GASTER_BLASTER]: 2 },
  });
  if (!empty)
    targets.forEach((u, i) => {
      state = setUnit(state, u.id, {
        position: { col: 2 + i * 2, row: 4 },
        hp: lethal && i === 0 ? 1 : 5,
      });
    });
  state = setUnit(state, f.ally.id, { position: { col: 3, row: empty ? 3 : 4 }, hp: 5 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", f.sans.id));
  const before = state;
  let result = applyAction(
    state,
    {
      type: "useAbility",
      unitId: f.sans.id,
      abilityId: ABILITY_SANS_GASTER_BLASTER,
      payload: { target: { col: 2, row: 4 } },
    },
    makeRngSequence([]),
  );
  const stages = [result];
  let defender = 0;
  for (let i = 0; result.state.pendingRoll; i++) {
    assert(i < 10);
    const pending = result.state.pendingRoll;
    const values = pending.kind.endsWith("_attackerRoll")
      ? [0.8, 0.5]
      : mixed && defender++ === 2
        ? [0.99, 0.99]
        : [0.01, 0.2];
    result = applyAction(
      result.state,
      { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id },
      makeRngSequence(values),
    );
    stages.push(result);
  }
  return {
    ...f,
    before,
    targets,
    stages,
    after: result.state,
    events: stages.flatMap((s) => s.events),
  };
}

test("real Gaster chain: one shared manual attacker roll, four defenders including an ally, one signature and no damage duplication", () => {
  const f = gaster(false, true);
  assert.equal(f.stages[0].state.pendingRoll?.kind, "tricksterAoE_attackerRoll");
  assert(f.targets.every((u) => f.stages[0].state.units[u.id].hp === 5));
  const before = makePlayerView(f.before, "P1");
  let scheduler = createVisualResolutionState({ batch: null, view: before, enabled: true });
  let previous = before;
  const plans = f.stages.flatMap((stage, i) => {
    const incoming = batch(
      projectEventsForRecipient(stage.state, stage.events, "P1"),
      stage.state,
      i + 1,
    );
    scheduler = advanceVisualResolution(scheduler, {
      batch: incoming,
      view: incoming.view!,
      enabled: true,
    });
    if (!scheduler.visualBatch) return [];
    const p = plan(scheduler.visualBatch, previous);
    previous = { ...incoming.view!, units: p.finalUnitsByUnitId };
    return [p];
  });
  const sprites = plans.flatMap((p) => outputs(p.batch).sprites);
  const sounds = plans.flatMap((p) => outputs(p.batch).sounds);
  assert.equal(sprites.filter((s) => s.effectId === "gasterCannon").length, 1);
  assert.equal(sprites.filter((s) => s.effectId === "gasterBeam").length, 1);
  for (const key of ["charge", "fire"])
    assert.equal(
      sounds.filter((s) => s.key === `hero.sans.abilities.sansGasterBlaster.${key}`).length,
      1,
    );
  const rolls = plans.flatMap((p) => p.batch.combatCues!).filter((c) => c.kind === "roll");
  assert.equal(
    rolls.filter((c) => c.kind === "roll" && c.roll.rollKind.endsWith("_attackerRoll")).length,
    1,
  );
  assert.equal(
    rolls.filter((c) => c.kind === "roll" && c.roll.rollKind.endsWith("_defenderRoll")).length,
    4,
  );
  const damage = plans.flatMap((p) => p.queue).filter((q) => q.type === "damageHpTween");
  assert.deepEqual(
    damage.map((q) => q.type === "damageHpTween" && q.damage.targetUnitId),
    [f.targets[0].id, f.ally.id, f.targets[2].id],
  );
  assert.equal(f.after.units[f.ally.id].hp, 4);
  assert.equal(sprites.filter((s) => s.effectId === "combatMiss").length, 1);
  assert.equal(sprites.filter((s) => s.effectId === "combatHit").length, 3);
  const final = plans[plans.length - 1]!;
  const cannon = outputs(final.batch).sprites.find((s) => s.effectId === "gasterCannon")!;
  const beam = outputs(final.batch).sprites.find((s) => s.effectId === "gasterBeam")!;
  assert.equal(beam.delayMs! - cannon.delayMs!, GASTER_TIMING.fireMs);
  assert(
    final.batch
      .combatCues!.filter((c) => c.kind === "hit" || c.kind === "miss")
      .every((c) => c.atMs > beam.delayMs!),
  );
  assert(
    !outputs(final.batch).effects.some((e) => e.kind === "beam" || e.kind === "areaHighlight"),
  );
});

test("Gaster empty ray still fires once; lethal target has only generic final death", () => {
  for (const empty of [true, false]) {
    const f = gaster(empty, false, true);
    const p = plan(
      batch(projectEventsForRecipient(f.after, f.events, "P1"), f.after),
      makePlayerView(f.before, "P1"),
    );
    const o = outputs(p.batch);
    assert.equal(o.sprites.filter((s) => s.effectId === "gasterBeam").length, 1);
    assert.equal(o.sprites.filter((s) => s.effectId === "unitDeath").length, empty ? 0 : 1);
    assert.equal(o.sounds.filter((s) => s.key === "common.combat.death").length, empty ? 0 : 1);
    assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, empty ? 0 : 4);
    assert(p.durationMs >= GASTER_TIMING.endMs);
  }
});

test("Gaster preview uses the full piercing ray, includes visible allies and enemies and emits no presentation", () => {
  const f = gaster();
  const view = makePlayerView(f.before, "P1");
  const preview = buildActionPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: f.sans.id,
    actionMode: "sansGasterBlaster",
    targetingCell: { col: 2, row: 4 },
  });
  assert(preview?.kind === "line");
  assert(preview.lineCells.some((c) => c.col === 8 && c.row === 4));
  assert.deepEqual(
    preview.affectedTargets?.map((t) => t.unitId).sort(),
    [f.ally.id, ...f.targets.map((t) => t.id)].sort(),
  );
  assert.deepEqual(outputs(batch([], f.before)).sprites, []);
  assert.deepEqual(outputs(batch([], f.before)).sounds, []);
});

test("Gaster uses frozen source and canonical literal board-edge ray in both orientations, including asymmetric diagonals", () => {
  const f = gaster();
  const state = setUnit(f.after, f.sans.id, { position: { col: 7, row: 1 } });
  for (const [source, target, edge] of [
    [
      { col: 2, row: 2 },
      { col: 4, row: 2 },
      { col: 8.5, row: 2 },
    ],
    [
      { col: 2, row: 2 },
      { col: 2, row: 4 },
      { col: 2, row: 8.5 },
    ],
    [
      { col: 1, row: 3 },
      { col: 2, row: 4 },
      { col: 6.5, row: 8.5 },
    ],
    [
      { col: 6, row: 2 },
      { col: 5, row: 3 },
      { col: -0.5, row: 8.5 },
    ],
  ]) {
    const aggregate = f.events.find((e) => e.type === "aoeResolved")!;
    assert(aggregate.type === "aoeResolved");
    const b = batch([{ ...aggregate, sourceCell: source, center: target }], state);
    const beam = outputs(b).sprites.find((s) => s.effectId === "gasterBeam")!;
    assert.deepEqual(beam.sourceCell, source);
    assert.equal(beam.placement, "ray");
    for (const flipped of [false, true]) {
      const direction = { col: target.col - source.col, row: target.row - source.row };
      const geometry = rayToBoardEdge(source, direction, 9, 50, flipped)!;
      const end = cellToBoardPoint(edge, 9, 50, flipped);
      const radians = (geometry.angleDeg * Math.PI) / 180;
      assert(Math.abs(geometry.left + Math.cos(radians) * geometry.width - end.x) < 0.001);
      assert(Math.abs(geometry.top + Math.sin(radians) * geometry.width - end.y) < 0.001);
      const html = renderToStaticMarkup(
        createElement(VfxLayer, {
          effects: enqueueBoardVfx({
            current: [],
            incoming: outputs(b).sprites,
            now: Date.now(),
          }),
          view: b.view!,
          boardSize: 9,
          cellSize: 50,
          isFlipped: flipped,
          reducedMotion: false,
        }),
      );
      assert(html.includes(`width:${geometry.width}px`));
      assert.equal(
        (html.match(/data-vfx-frames="20"/g) ?? []).length,
        2,
        "synchronized primary + accent",
      );
      assert(html.includes("vfx-sprite-frame"));
    }
  }
});

test("Gaster source redaction suppresses cannon and ray even with current/cache positions; reduced motion retains all semantic stages", () => {
  const f = gaster();
  const events = projectEventsForRecipient(f.after, f.events, "P1");
  const aggregate = events.find((e) => e.type === "aoeResolved")!;
  assert(aggregate.type === "aoeResolved");
  const b = batch([{ ...aggregate, sourceCell: undefined }], f.after);
  assert.deepEqual(
    mapEventBatchToVfx({
      ...b,
      view: b.view!,
      previousPositions: { [f.sans.id]: { col: 0, row: 4 } },
    }),
    [],
  );
  const p = plan(batch(events, f.after), makePlayerView(f.before, "P1"), true);
  const reduced = simplifyVfxForReducedMotion(outputs(p.batch).sprites);
  assert(reduced.some((s) => s.effectId === "gasterCannon"));
  assert(reduced.some((s) => s.effectId === "gasterBeam" && s.placement === "ray"));
  const html = renderToStaticMarkup(
    createElement(VfxLayer, {
      effects: enqueueBoardVfx({ current: [], incoming: reduced, now: Date.now() }),
      view: p.batch.view!,
      boardSize: 9,
      cellSize: 40,
      isFlipped: true,
      reducedMotion: true,
    }),
  );
  assert(html.includes("animation-name:none"));
});

function pendingDeath() {
  const f = setupSansState();
  let state = setUnit(f.state, f.sans.id, {
    hp: 1,
    position: { col: 4, row: 4 },
    sansUnbelieverUnlocked: true,
  });
  state = setUnit(state, f.enemy.id, { hp: 4, position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P2", f.enemy.id));
  const before = state;
  const rng = makeAttackWinRng(1);
  let result = applyAction(
    state,
    { type: "attack", attackerId: f.enemy.id, defenderId: f.sans.id },
    rng,
  );
  const events = [...result.events];
  for (let i = 0; result.state.pendingRoll?.kind !== "selectLastAttackTarget"; i++) {
    assert(i < 10);
    result = resolvePendingRollOnce(result.state, rng);
    events.push(...result.events);
  }
  return { ...f, before, pending: result.state, events };
}
function select(f: ReturnType<typeof pendingDeath>) {
  return applyAction(
    f.pending,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: f.pending.pendingRoll!.id,
      choice: { type: "sansLastAttackTarget", targetId: f.enemy.id },
    },
    makeRngSequence([]),
  );
}

test("Last Attack pending choice restores silently, blocks unrelated actions, exposes only safe waiting to other recipients, then applies before one final death", () => {
  const f = pendingDeath();
  const owner = makePlayerView(f.pending, "P1");
  assert(owner.pendingRoll?.kind === "selectLastAttackTarget");
  assert(buildPendingPreview(owner));
  assert(f.pending.units[f.sans.id].position);
  const early = plan(
    batch(projectEventsForRecipient(f.pending, f.events, "P1"), f.pending),
    makePlayerView(f.before, "P1"),
  );
  assert(!outputs(early.batch).sprites.some((s) => s.effectId === "unitDeath"));
  assert(!outputs(early.batch).sounds.some((s) => s.key === "common.combat.death"));
  for (const view of [makePlayerView(f.pending, "P2"), makeSpectatorView(f.pending)]) {
    assert.equal(view.pendingRoll, null);
    assert(!JSON.stringify(view.pendingDecision).includes("legalTargetIds"));
    assert.equal(buildPendingPreview(view), null);
  }
  for (const action of [
    { type: "move", unitId: f.enemy.id, to: { col: 4, row: 6 } },
    { type: "endTurn" },
    { type: "useAbility", unitId: f.sans.id, abilityId: ABILITY_SANS_GASTER_BLASTER },
  ] as const)
    assert.equal(applyAction(f.pending, action, makeRngSequence([])).state, f.pending);
  const session = new PresentationSession();
  const binding = { roomId: "sans", recipient: "P1" };
  session.begin(binding);
  assert.deepEqual(
    session.snapshot({ ...binding, streamId: "sans-pack", revision: 10, view: owner }),
    [],
  );
  const resolved = select(f);
  const incoming = batch(
    projectEventsForRecipient(resolved.state, resolved.events, "P1"),
    resolved.state,
    11,
  );
  const accepted = session.receive(incoming, binding, incoming.view);
  assert.equal(accepted.length, 1);
  const p = plan(accepted[0], owner);
  const o = outputs(p.batch);
  const apply = o.sprites.find((s) => s.effectId === "sansCurseApply")!;
  const death = o.sprites.find((s) => s.effectId === "unitDeath")!;
  assert(death.delayMs! > apply.delayMs!);
  assert.deepEqual(apply.sourceCell, { col: 4, row: 5 });
  assert.equal(o.sounds.filter((s) => s.key === "common.combat.death").length, 1);
  assert.equal(
    o.sounds.filter((s) => s.key === "hero.sans.abilities.sansLastAttack.apply").length,
    1,
  );
  assert.equal(
    combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId[f.sans.id].position,
    null,
  );
  assert.deepEqual(session.receive(incoming, binding, incoming.view), []);
});

test("curse own-turn tick has one HP transition/float/small pulse; removal at one HP is distinct and cannot kill", () => {
  const f = pendingDeath();
  const selected = select(f);
  const before = setUnit(selected.state, f.enemy.id, { hp: 2 });
  const activation: GameState = {
    ...before,
    currentPlayer: "P2",
    activeUnitId: null,
    turnNumber: before.turnNumber + 1,
    turnQueue: [f.enemy.id],
    turnQueueIndex: 0,
    turnOrder: [f.enemy.id],
    turnOrderIndex: 0,
  };
  const tick = applyAction(
    activation,
    { type: "unitStartTurn", unitId: f.enemy.id },
    makeRngSequence([]),
  );
  assert.equal(tick.state.units[f.enemy.id].hp, 1);
  assert.equal(tick.state.units[f.enemy.id].sansLastAttackCurseSourceId, undefined);
  const p = plan(
    batch(projectEventsForRecipient(tick.state, tick.events, "P1"), tick.state),
    makePlayerView(before, "P1"),
  );
  const o = outputs(p.batch);
  assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 1);
  assert.equal(o.effects.filter((e) => e.kind === "floatingText").length, 1);
  assert.equal(o.sprites.filter((s) => s.effectId === "sansCurseTick").length, 1);
  assert.equal(o.sprites.filter((s) => s.effectId === "sansCurseRemove").length, 1);
  assert(!o.sprites.some((s) => s.effectId === "combatHit" || s.effectId === "unitDeath"));
  assert.equal(
    o.sounds.filter((s) => s.key === "hero.sans.abilities.sansLastAttack.tick").length,
    1,
  );
  assert.equal(
    o.sounds.filter((s) => s.key === "hero.sans.abilities.sansLastAttack.remove").length,
    1,
  );
  assert(!o.sounds.some((s) => s.key === "common.combat.hit" || s.key === "common.combat.death"));
  const one = applyAction(
    setUnit(activation, f.enemy.id, { hp: 1 }),
    { type: "unitStartTurn", unitId: f.enemy.id },
    makeRngSequence([]),
  );
  assert.equal(one.state.units[f.enemy.id].hp, 1);
  assert(!one.events.some((e) => e.type === "sansLastAttackTick" || e.type === "unitDied"));
});

test("curse anchors are event-time authorized; current visibility cannot authorize a hidden old position", () => {
  const f = pendingDeath();
  const selected = select(f);
  const event = selected.events.find((e) => e.type === "sansLastAttackApplied")!;
  assert(event.type === "sansLastAttackApplied");
  const moved = setUnit(selected.state, f.enemy.id, { position: { col: 8, row: 8 } });
  const projected = projectEventsForRecipient(moved, [event], "P1");
  assert.deepEqual(outputs(batch(projected, moved)).sprites[0].sourceCell, { col: 4, row: 5 });
  const restricted = {
    ...event,
    [EVENT_VISIBILITY]: { recipients: [], targetCellRecipients: ["P2" as const] },
  };
  for (const recipient of ["P1", "spectator"] as const) {
    const safe = projectSourceEvents(moved, [restricted], recipient);
    assert(safe.every((e) => e.type !== "sansLastAttackApplied" || !e.targetCell));
    assert.equal(outputs(batch(safe, moved)).sprites.length, 0);
  }
});

test("reconnect after completed Gaster or active curse is silent; duplicate live apply/tick/remove is ignored, future genuine cues play", () => {
  const f = gaster();
  const d = pendingDeath();
  const cursed = select(d);
  for (const current of [f.after, cursed.state]) {
    const session = new PresentationSession();
    const binding = { roomId: "sans", recipient: "P1" };
    session.begin(binding);
    const view = makePlayerView(current, "P1");
    assert.deepEqual(
      session.snapshot({ ...binding, streamId: "sans-pack", revision: 10, view }),
      [],
    );
    assert.deepEqual(
      session.receive(
        batch(projectEventsForRecipient(f.after, f.events, "P1"), f.after, 10),
        binding,
        view,
      ),
      [],
    );
    assert.equal(
      createVisualResolutionState({ batch: null, view, enabled: true }).visualBatch,
      null,
    );
    const future: DeliveredGameEvent[] = [
      {
        type: "sansLastAttackApplied",
        sansId: d.sans.id,
        targetId: d.enemy.id,
        targetCell: { col: 4, row: 5 },
        eventId: "apply",
      },
      {
        type: "sansLastAttackTick",
        targetId: d.enemy.id,
        targetCell: { col: 4, row: 5 },
        damage: 1,
        hpAfter: 2,
        eventId: "tick",
      },
      {
        type: "sansLastAttackRemoved",
        targetId: d.enemy.id,
        targetCell: { col: 4, row: 5 },
        reason: "hpOne",
        eventId: "remove",
      },
    ];
    const incoming = { streamId: "sans-pack", revision: 11, events: future };
    const live = session.receive(incoming, binding, view);
    assert.equal(live.length, 1);
    assert.equal(outputs(live[0]).sounds.length, 3);
    assert.deepEqual(session.receive(incoming, binding, view), []);
    assert.equal(session.receive({ ...incoming, revision: 12 }, binding, view)[0].events.length, 0);
    const freshGaster = session.receive(
      batch(projectEventsForRecipient(f.after, f.events, "P1"), f.after, 13),
      binding,
      view,
    );
    assert.equal(
      outputs(freshGaster[0]).sprites.filter((s) => s.effectId === "gasterBeam").length,
      1,
    );
  }
});
