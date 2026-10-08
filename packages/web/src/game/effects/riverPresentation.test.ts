import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  type GameState,
  type GameEvent,
  type Coord,
  type ResolveRollChoice,
  type PlayerView,
  type LiveEventBatch,
} from "rules";
import {
  setupRiverPersonState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
} from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import { PresentationSession } from "./presentationSession";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { vfxRegistry, validateVfxRegistry } from "../../features/vfx/vfxRegistry";
import { cellToBoardPoint, lineBetweenCellsToCssTransform } from "../../features/vfx/vfxGeometry";
import { preloadRiverSounds } from "../../features/sfx/audioPreload";
import { SfxPlayer } from "../../features/sfx/sfxPlayer";
import { SfxPlaybackSession } from "../../features/sfx/sfxPlaybackSession";
import { audioFixture } from "../../features/sfx/audioTestUtils";
import type { BoardEventBatch } from "./types";

const origin = { col: 0, row: 0 },
  end = { col: 0, row: 5 },
  drop = { col: 1, row: 5 };
const noDice = {
  next(): number {
    throw new Error("Presentation/choices consumed gameplay RNG");
  },
};
function fixture(tralala = false, reactors = 0) {
  const f = setupRiverPersonState();
  let state = f.state;
  const passenger = Object.values(state.units).find(
    (u) => u.owner === (tralala ? "P2" : "P1") && u.class === "assassin",
  )!;
  const allies = ["berserker", "spearman", "knight"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P1" && u.class === cls)!,
  );
  for (const u of Object.values(state.units)) state = setUnit(state, u.id, { position: null });
  state = setUnit(state, f.river.id, {
    position: origin,
    charges: { ...f.river.charges, riverTraLaLa: 4 },
  });
  state = setUnit(state, passenger.id, { position: { col: 1, row: 0 }, hp: 20 });
  allies.slice(0, reactors).forEach((u, i) => {
    state = setUnit(state, u.id, { position: { col: 1, row: i + 2 } });
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", f.river.id));
  return {
    state,
    riverId: f.river.id,
    passengerId: passenger.id,
    allyIds: allies.slice(0, reactors).map((u) => u.id),
  };
}
function respond(state: GameState, choice?: ResolveRollChoice, dice?: number[]) {
  const p = state.pendingRoll!;
  assert(p);
  return applyAction(
    state,
    { type: "resolvePendingRoll", player: p.player, pendingRollId: p.id, choice },
    dice ? makeRngSequence(dice) : noDice,
  );
}
function select(f: ReturnType<typeof fixture>, tralala = false, destination = end, landing = drop) {
  const opened = applyAction(
    f.state,
    {
      type: "useAbility",
      unitId: f.riverId,
      abilityId: tralala ? ABILITY_RIVER_PERSON_TRA_LA_LA : ABILITY_RIVER_PERSON_BOAT,
    },
    noDice,
  );
  const target = respond(opened.state, { type: "hassanTrueEnemyTarget", targetId: f.passengerId });
  const destinationChoice = respond(target.state, {
    type: "forestMoveDestination",
    position: destination,
  });
  const committed = respond(destinationChoice.state, {
    type: "forestMoveDestination",
    position: landing,
  });
  return { opened, target, destinationChoice, committed };
}
function batch(
  result: { state: GameState; events: GameEvent[] },
  revision = 1,
  recipient: "P1" | "P2" | "spectator" = "P1",
): BoardEventBatch & LiveEventBatch {
  return {
    streamId: "river-test",
    revision,
    view:
      recipient === "spectator"
        ? makeSpectatorView(result.state)
        : makePlayerView(result.state, recipient),
    events: projectEventsForRecipient(result.state, result.events, recipient).map((e, i) => ({
      ...e,
      eventId: `E${revision}:${i}`,
    })),
  };
}
function plan(
  b: BoardEventBatch,
  before: PlayerView,
  attachments?: ReturnType<typeof buildCombatVisualPlaybackPlan>["transportAttachments"],
) {
  return buildCombatVisualPlaybackPlan({
    batch: b,
    finalView: b.view!,
    reducedMotion: false,
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
    transportAttachments: attachments,
  });
}
function outputs(p: ReturnType<typeof plan>) {
  return {
    vfx: mapEventBatchToVfx({ ...p.batch, view: p.batch.view!, previousPositions: {} }),
    sfx: mapEventBatchToSfx({ ...p.batch, view: p.batch.view! }),
  };
}
function stake(state: GameState, cell: Coord, count = 1): GameState {
  return {
    ...state,
    stakeMarkers: Array.from({ length: count }, (_, i) => ({
      id: `stake-${i}`,
      owner: "P2",
      position: cell,
      createdAt: i,
      isRevealed: false,
    })),
  };
}
const pass: ResolveRollChoice = { type: "resolveReactionChoice", choice: "pass" };
const attack: ResolveRollChoice = { type: "resolveReactionChoice", choice: "attack" };
function combat(state: GameState) {
  const chosen = respond(state, attack);
  assert.equal(chosen.state.pendingRoll?.kind, "attack_attackerRoll");
  const attacker = respond(chosen.state, undefined, [0.99, 0.99]);
  assert.equal(attacker.state.pendingRoll?.kind, "attack_defenderRoll");
  const defender = respond(attacker.state, undefined, [0.01, 0.2]);
  return { chosen, attacker, defender };
}

test("Boat and Tralala selections stay silent; only committed events activate/pick up", () => {
  for (const tralala of [false, true]) {
    const f = fixture(tralala),
      s = select(f, tralala);
    for (const result of [s.opened, s.target, s.destinationChoice]) {
      const o = outputs(plan(batch(result), makePlayerView(f.state, "P1")));
      assert.equal(o.sfx.length, 0);
      assert(
        !o.vfx.some((v) => ["boatPickup", "boat", "tralala", "boatDrop"].includes(v.effectId)),
      );
    }
    const p = plan(batch(s.committed), makePlayerView(f.state, "P1")),
      o = outputs(p);
    assert.equal(
      p.batch.transportCues!.filter((c) => c.kind === (tralala ? "activation" : "pickup")).length,
      1,
    );
    assert.equal(
      o.sfx.filter((s) => s.key.endsWith(tralala ? "riverTraLaLa" : ".pickup")).length,
      1,
    );
  }
});

test("Boat pickup, grouped reached travel and drop use one operation and one travel sound", () => {
  const f = fixture(),
    r = select(f).committed,
    p = plan(batch(r), makePlayerView(f.state, "P1")),
    o = outputs(p);
  assert.deepEqual(
    p.batch.transportCues!.map((c) => c.kind),
    ["pickup", "travel", "drop"],
  );
  assert.equal(new Set(p.batch.transportCues!.map((c) => c.abilityUseId)).size, 1);
  assert.equal(o.sfx.filter((c) => c.key.endsWith(".move")).length, 1);
  const travel = p.queue.filter((q) => q.type === "movement" && q.cue.transportPhase === "travel");
  assert.equal(travel.length, 2);
  assert.equal(travel[0].startsAtMs, travel[1].startsAtMs);
  const frame = combatVisualPlaybackFrame(p, travel[0].startsAtMs + 70);
  assert.deepEqual(
    frame.visualMotionByUnitId[f.riverId].position,
    frame.visualMotionByUnitId[f.passengerId].position,
  );
  assert.equal(o.vfx.filter((v) => v.effectId === "boat").length, 1);
  assert.equal(o.vfx.filter((v) => v.effectId === "boatDrop").length, 1);
  assert(o.vfx.every((v) => v.placement !== "path"));
});

test("Boat returning the passenger to its original cell still presents confirmed disembark before landing VFX", () => {
  const f = fixture(),
    original = { col: 1, row: 0 };
  const r = select(f, false, { col: 0, row: 1 }, original).committed;
  assert(!r.events.some((e) => e.type === "unitMoved" && e.unitId === f.passengerId));
  const p = plan(batch(r), makePlayerView(f.state, "P1"));
  const movement = p.movementPlan.cues.find(
    (c) => c.kind === "movement" && c.transportPhase === "drop",
  );
  assert(movement?.kind === "movement");
  assert.deepEqual(movement.from, { col: 0, row: 1 });
  assert.deepEqual(movement.to, original);
  assert(
    p.batch.transportCues!.find((c) => c.kind === "drop")!.atMs >=
      movement.atMs + movement.durationMs,
  );
});

test("hidden Boat stake preserves previews, truncates travel, retains attachment and requires a new cost-free drop", () => {
  const f = fixture(),
    stop = { col: 0, row: 2 };
  const clean = select(f);
  f.state = stake(f.state, stop);
  const selected = select(f),
    r = selected.committed;
  assert.deepEqual(
    makePlayerView(selected.destinationChoice.state, "P1"),
    makePlayerView(clean.destinationChoice.state, "P1"),
  );
  assert.equal(r.state.pendingRoll?.context.phase, "selectDisembark");
  assert.equal(r.state.pendingRoll?.context.reason, "movementInterrupted");
  assert.deepEqual(r.state.units[f.riverId].position, stop);
  const p = plan(batch(r), makePlayerView(f.state, "P1")),
    o = outputs(p);
  assert.deepEqual(o.vfx.find((v) => v.effectId === "boat")?.targetCell, stop);
  assert.equal(o.vfx.filter((v) => v.effectId === "boatDrop").length, 0);
  assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 1);
  assert.equal(p.transportAttachments.length, 1);
  assert.deepEqual(p.finalUnitsByUnitId[f.passengerId].position, stop);
  const options = r.state.pendingRoll!.context.options as Coord[];
  assert(
    options.every((c) => Math.max(Math.abs(c.col - stop.col), Math.abs(c.row - stop.row)) === 1),
  );
  const landed = respond(r.state, { type: "forestMoveDestination", position: options[0] });
  assert.deepEqual(landed.state.units[f.riverId].turn, r.state.units[f.riverId].turn);
  assert.deepEqual(landed.state.units[f.riverId].charges, r.state.units[f.riverId].charges);
  assert.equal(
    landed.state.units[f.riverId].riverBoatmanExtraMoves,
    r.state.units[f.riverId].riverBoatmanExtraMoves,
  );
  const use = r.events.find((e) => e.type === "riverBoatPickup")!.abilityUseId;
  assert.equal(landed.events.find((e) => e.type === "riverBoatDisembarked")!.abilityUseId, use);
  const resumed = plan(batch(landed, 2), makePlayerView(r.state, "P1"), p.transportAttachments);
  assert.equal(resumed.transportAttachments.length, 0);
  assert.equal(
    outputs(resumed).sfx.filter((c) => c.key.endsWith(".pickup") || c.key.endsWith(".move")).length,
    0,
  );
});

test("Boat still-legal planned drop requires confirmation and impossible disembark follows the original fallback", () => {
  const f = fixture();
  f.state = stake(f.state, { col: 0, row: 4 });
  const r = select(f).committed;
  assert.equal(r.state.pendingRoll?.kind, "riverBoatDropDestination");
  assert(
    (r.state.pendingRoll!.context.options as Coord[]).some(
      (c) => c.col === drop.col && c.row === drop.row,
    ),
  );
  assert.deepEqual(r.state.units[f.passengerId].position, { col: 1, row: 0 });
  const blocked = fixture();
  blocked.state = stake(blocked.state, { col: 0, row: 2 });
  const blockers = Object.values(blocked.state.units).filter(
    (u) => u.id !== blocked.riverId && u.id !== blocked.passengerId,
  );
  const cells = [
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: 1, row: 2 },
    { col: 1, row: 3 },
    { col: 0, row: 3 },
  ];
  cells.forEach((cell, i) => {
    blocked.state = setUnit(blocked.state, blockers[i].id, { position: cell });
  });
  const fail = select(blocked).committed;
  assert.equal(fail.state.pendingRoll, null);
  assert(
    fail.events.some(
      (e) => e.type === "riverBoatDisembarkFailed" && e.reason === "noLegalDestinations",
    ),
  );
  assert.deepEqual(fail.state.units[blocked.passengerId].position, { col: 1, row: 0 });
  assert.equal(
    outputs(plan(batch(fail), makePlayerView(blocked.state, "P1"))).vfx.filter(
      (v) => v.effectId === "boatDrop",
    ).length,
    0,
  );
});

for (const hp of [20, 1])
  test(`Boat landing on stacked stakes: landing first, one damage, final death only (HP ${hp})`, () => {
    const f = fixture();
    f.state = stake(setUnit(f.state, f.passengerId, { hp }), drop, 2);
    const r = select(f).committed,
      p = plan(batch(r), makePlayerView(f.state, "P1")),
      o = outputs(p);
    const landingIndex = r.events.findIndex((e) => e.type === "riverBoatDisembarked"),
      hazardIndex = r.events.findIndex((e) => e.type === "stakeTriggered");
    assert(landingIndex < hazardIndex);
    assert.equal(r.events.filter((e) => e.type === "stakeTriggered").length, 1);
    assert(r.state.stakeMarkers.every((s) => s.isRevealed));
    assert.equal(r.state.stakeMarkers.length, 2);
    assert.equal(r.state.pendingRoll, null);
    assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 1);
    const landingCue = p.batch.transportCues!.find((c) => c.kind === "drop")!;
    assert(p.batch.eventDelaysMs![hazardIndex] >= landingCue.atMs + landingCue.durationMs);
    assert.equal(o.vfx.filter((v) => v.effectId === "stakeTrigger").length, 1);
    assert.equal(p.queue.filter((q) => q.type === "death").length, hp === 1 ? 1 : 0);
    if (hp === 1)
      assert(
        !combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId[f.passengerId]?.position,
      );
  });

test("hidden Boat passenger never exposes pickup/path; landing reveal authorizes only hazard/death anchors", () => {
  const f = fixture();
  f.state = stake(
    setUnit(f.state, f.passengerId, { isStealthed: true, stealthTurnsLeft: 3 }),
    drop,
  );
  const r = select(f).committed;
  for (const recipient of ["P2", "spectator"] as const) {
    const b = batch(r, 1, recipient);
    assert(
      !b.events.some(
        (e) =>
          e.type === "riverBoatPickup" ||
          e.type === "riverBoatDisembarked" ||
          (e.type === "unitMoved" && e.unitId === f.passengerId),
      ),
    );
    assert(b.events.some((e) => e.type === "stakeTriggered" && e.unitId === f.passengerId));
    const before =
      recipient === "spectator" ? makeSpectatorView(f.state) : makePlayerView(f.state, recipient);
    const p = plan(b, before),
      o = outputs(p);
    assert(!p.movementPlan.cues.some((c) => c.kind === "movement" && c.unitId === f.passengerId));
    assert.equal(o.vfx.filter((v) => v.effectId === "boatPickup").length, 0);
  }
});

test("Tralala groups confirmed steps, pauses for reaction, and Pass resumes only from authoritative continuation", () => {
  const f = fixture(true, 3),
    r = select(f, true).committed;
  assert.equal(r.state.pendingRoll?.kind, "reactionChoice");
  const p = plan(batch(r), makePlayerView(f.state, "P1")),
    o = outputs(p);
  const carrier = p.movementPlan.cues.filter(
    (c) => c.kind === "movement" && c.unitId === f.riverId,
  );
  const lastCarrier = carrier[carrier.length - 1];
  assert.deepEqual(
    lastCarrier?.kind === "movement" ? lastCarrier.to : null,
    r.state.units[f.riverId].position,
  );
  assert(
    o.vfx
      .filter((v) => v.placement === "projectile")
      .every((v) => v.targetCell!.row <= r.state.units[f.riverId].position!.row),
  );
  const last = p.batch.transportCues![p.batch.transportCues!.length - 1];
  assert.equal(last.kind, "reaction");
  const passed = respond(r.state, pass);
  assert(!passed.events.some((e) => e.type === "rollResolved" || e.type === "attackResolved"));
  const next = plan(batch(passed, 2), makePlayerView(r.state, "P1"));
  assert.equal(next.batch.transportCues!.filter((c) => c.kind === "activation").length, 0);
  assert(passed.events.some((e) => e.type === "reactionMovementResumed"));
  for (const [result, revision] of [
    [r, 1],
    [passed, 2],
  ] as const) {
    const q = plan(batch(result, revision), makePlayerView(f.state, "P1"));
    for (const cue of q.batch.transportCues!.filter((c) => c.kind === "travel")) {
      const bodies = q.movementPlan.cues.filter(
        (c) =>
          c.kind === "movement" &&
          c.transportGroup &&
          c.atMs === cue.atMs &&
          c.transportPhase === "travel",
      );
      assert.equal(bodies.length, 2);
      assert.equal(new Set(bodies.map((c) => c.atMs)).size, 1);
    }
    assert.equal(
      outputs(q).sfx.filter((c) => c.key.endsWith(".move")).length,
      q.batch.transportCues!.filter((c) => c.kind === "travel").length,
    );
  }
});

test("three reactors independently Attack/Pass/Attack with manual rolls, preserved slots and two combat outcomes", () => {
  const f = fixture(true, 3),
    initial = select(f, true).committed;
  assert.equal(initial.state.pendingRoll?.context.reactorUnitId, f.allyIds[0]);
  const first = combat(initial.state);
  assert.equal(first.defender.state.pendingRoll?.context.reactorUnitId, f.allyIds[1]);
  const passed = respond(first.defender.state, pass);
  assert.equal(passed.state.pendingRoll?.context.reactorUnitId, f.allyIds[2]);
  const third = combat(passed.state);
  const events = [
    initial,
    first.chosen,
    first.attacker,
    first.defender,
    passed,
    third.chosen,
    third.attacker,
    third.defender,
  ].flatMap((r) => r.events);
  assert.equal(events.filter((e) => e.type === "attackResolved").length, 2);
  assert.equal(events.filter((e) => e.type === "reactionOpportunity").length, 3);
  assert.equal(
    events.filter((e) => e.type === "rollResolved" && e.rollKind.endsWith("Roll")).length,
    4,
  );
  assert.equal(third.defender.state.pendingReactionMovement, null);
  for (const id of f.allyIds)
    assert.deepEqual(third.defender.state.units[id].turn, f.state.units[id].turn);
  const p = plan(batch(first.attacker, 2), makePlayerView(first.chosen.state, "P1"));
  assert.equal(p.batch.combatCues!.filter((c) => c.kind === "roll").length, 1);
  assert.equal(p.batch.transportCues!.filter((c) => c.kind === "travel").length, 0);
});

test("target death during reaction stops at reached cell without final result or future movement", () => {
  const f = fixture(true, 1);
  f.state = setUnit(f.state, f.passengerId, { hp: 1 });
  const r = select(f, true).committed,
    c = combat(r.state);
  assert.equal(c.defender.state.pendingReactionMovement, null);
  assert(
    !c.defender.events.some((e) => e.type === "riverTraLaLaResolved" || e.type === "unitMoved"),
  );
  const p = plan(batch(c.defender, 3), makePlayerView(c.attacker.state, "P1"));
  assert.equal(p.queue.filter((q) => q.type === "death").length, 1);
  assert.equal(outputs(p).sfx.filter((s) => s.key.endsWith(".move")).length, 0);
  assert(p.batch.transportCues!.some((c) => c.kind === "cancelled"));
  assert.deepEqual(c.defender.state.units[f.riverId].position, r.state.units[f.riverId].position);
});

test("Tralala no-legal-drop early exit clears cosmetic attachment even without a resolved result", () => {
  const f = fixture(true, 1),
    r = select(f, true).committed;
  const first = plan(batch(r), makePlayerView(f.state, "P1"));
  assert.equal(first.transportAttachments.length, 1);
  let stopped = {
    ...r.state,
    pendingReactionMovement: { ...r.state.pendingReactionMovement!, stopped: true },
  };
  const blockers = Object.values(stopped.units).filter(
    (u) => u.id !== f.riverId && u.id !== f.passengerId,
  );
  [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 1, row: 1 },
    { col: 1, row: 2 },
    { col: 0, row: 2 },
  ].forEach((cell, i) => {
    stopped = setUnit(stopped, blockers[i].id, { position: cell }) as typeof stopped;
  });
  const result = respond(stopped, pass);
  assert.equal(result.state.pendingReactionMovement, null);
  assert.equal(result.state.pendingRoll, null);
  assert(!result.events.some((e) => e.type === "riverTraLaLaResolved"));
  const p = plan(batch(result, 2), makePlayerView(r.state, "P1"), first.transportAttachments);
  assert.equal(p.transportAttachments.length, 0);
  assert(p.batch.transportCues!.some((c) => c.kind === "cancelled"));
  assert(!outputs(p).vfx.some((v) => v.effectId === "boatDrop"));
});

test("Sans lethal reaction holds pre-death choice and never presents final death or more travel early", () => {
  const f = fixture(true, 1);
  f.state = setUnit(f.state, f.passengerId, {
    hp: 1,
    heroId: "sans",
    sansUnbelieverUnlocked: true,
  });
  const r = select(f, true).committed,
    c = combat(r.state);
  assert.equal(c.defender.state.pendingRoll?.kind, "selectLastAttackTarget");
  const p = plan(batch(c.defender, 3), makePlayerView(c.attacker.state, "P1"));
  assert(!p.queue.some((q) => q.type === "death"));
  assert(!p.batch.transportCues!.some((c) => c.kind === "travel"));
  const final = respond(c.defender.state, { type: "sansLastAttackTarget", targetId: f.riverId });
  assert(final.events.some((e) => e.type === "unitDied"));
  assert.equal(final.state.pendingReactionMovement, null);
});

test("Tralala hazard stops before planned end and a final landing stake resolves once without reselecting", () => {
  const f = fixture(true);
  f.state = stake(f.state, { col: 0, row: 2 });
  const r = select(f, true).committed;
  assert.equal(r.state.pendingRoll?.kind, "reactionDropChoice");
  assert.deepEqual(r.state.units[f.riverId].position, { col: 0, row: 2 });
  const p = plan(batch(r), makePlayerView(f.state, "P1"));
  assert(
    outputs(p)
      .vfx.filter((v) => v.placement === "projectile")
      .every((v) => v.targetCell!.row <= 2),
  );
  const landing = { col: 1, row: 2 };
  const nextState = stake(r.state, landing, 2);
  const landed = respond(nextState, { type: "reactionDropDestination", position: landing });
  assert.equal(landed.state.units[f.passengerId].hp, r.state.units[f.passengerId].hp - 1);
  assert.equal(landed.state.pendingRoll, null);
  assert.equal(landed.state.pendingReactionMovement, null);
  const q = plan(batch(landed, 2), makePlayerView(r.state, "P1"));
  const hazard = landed.events.findIndex((e) => e.type === "stakeTriggered");
  const cue = q.batch.transportCues!.find((c) => c.kind === "drop")!;
  assert(q.batch.eventDelaysMs![hazard] >= cue.atMs + cue.durationMs);
  assert.equal(q.queue.filter((q) => q.type === "damageHpTween").length, 1);
});

test("normal Tralala final landing also applies destination hazards before completion", () => {
  const f = fixture(true);
  f.state = stake(f.state, drop, 2);
  const r = select(f, true).committed;
  assert.equal(r.state.pendingReactionMovement, null);
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.units[f.passengerId].hp, 19);
  assert.equal(r.events.filter((e) => e.type === "stakeTriggered").length, 1);
  assert(
    r.events.findIndex((e) => e.type === "stakeTriggered") <
      r.events.findIndex((e) => e.type === "riverTraLaLaResolved"),
  );
});

test("controller death follows the authoritative drop fallback and never reaches the planned endpoint", () => {
  const f = fixture(true, 1),
    r = select(f, true).committed;
  const reached = r.state.units[f.riverId].position!;
  const stopped = setUnit(r.state, f.riverId, { hp: 0, isAlive: false, position: null });
  const result = respond(stopped, pass);
  assert.equal(result.state.pendingRoll?.kind, "reactionDropChoice");
  assert(!result.events.some((e) => e.type === "unitMoved" && e.unitId === f.riverId));
  assert.deepEqual(result.state.units[f.passengerId].position, reached);
  const p = plan(batch(result, 2), makePlayerView(stopped, "P1"));
  assert(!p.batch.transportCues!.some((c) => c.kind === "travel"));
  const cell = (result.state.pendingRoll!.context.options as Coord[])[0];
  const dropped = respond(result.state, { type: "reactionDropDestination", position: cell });
  assert.equal(dropped.state.pendingReactionMovement, null);
  assert.deepEqual(dropped.state.units[f.passengerId].position, cell);
});

test("Boat Sans passenger landing preserves pre-death and completes without another disembark", () => {
  const f = fixture();
  f.state = stake(
    setUnit(f.state, f.passengerId, { hp: 1, heroId: "sans", sansUnbelieverUnlocked: true }),
    drop,
  );
  const enemy = Object.values(f.state.units).find((u) => u.owner === "P2")!;
  f.state = setUnit(f.state, enemy.id, { position: { col: 4, row: 4 } });
  const r = select(f).committed;
  assert.equal(r.state.pendingRoll?.kind, "selectLastAttackTarget");
  assert.equal(r.state.units[f.riverId].riverBoatCarryAllyId, undefined);
  const p = plan(batch(r), makePlayerView(f.state, "P1"));
  assert.equal(p.batch.transportCues!.filter((c) => c.kind === "drop").length, 1);
  assert.equal(p.queue.filter((q) => q.type === "death").length, 0);
  const final = respond(r.state, { type: "sansLastAttackTarget", targetId: enemy.id });
  assert(final.events.some((e) => e.type === "unitDied" && e.unitId === f.passengerId));
  assert.equal(final.state.pendingRoll, null);
});

test("Tralala destination stake lethal landing emits final death without a repeated drop decision", () => {
  const f = fixture(true);
  f.state = stake(setUnit(f.state, f.passengerId, { hp: 1 }), drop);
  const r = select(f, true).committed,
    p = plan(batch(r), makePlayerView(f.state, "P1"));
  assert.equal(r.state.pendingReactionMovement, null);
  assert.equal(r.state.pendingRoll, null);
  assert.equal(p.queue.filter((q) => q.type === "death").length, 1);
  const cue = p.batch.transportCues!.find((c) => c.kind === "drop")!;
  const death = p.batch.combatCues!.find((c) => c.kind === "death")!;
  assert(death.atMs > cue.atMs + cue.durationMs);
});

test("completion alone never adds activation or a start-to-end route, even with stale cached positions", () => {
  for (const tralala of [false, true]) {
    const f = fixture(tralala),
      r = select(f, tralala).committed;
    const finalEvents = r.events.filter(
      (e) => e.type === "riverBoatResolved" || e.type === "riverTraLaLaResolved",
    );
    const p = plan(batch({ ...r, events: finalEvents }), makePlayerView(f.state, "P1"));
    const o = outputs(p);
    assert.equal(p.movementPlan.cues.length, 0);
    assert.equal(o.vfx.length, 0);
    assert.equal(o.sfx.length, 0);
  }
});

test("reaction projection grants owner commands and gives opponent/spectator only safe waiting status", () => {
  const f = fixture(true, 3),
    r = select(f, true).committed;
  for (const who of ["P1", "P2", "spectator"] as const) {
    const b = batch(r, 1, who),
      view = b.view!;
    if (who === "P1") {
      assert.equal(view.pendingRoll?.kind, "reactionChoice");
      assert(b.events.some((e) => e.type === "reactionOpportunity"));
    } else {
      assert.equal(view.pendingRoll, null);
      assert.equal(view.pendingDecision?.type, "opponentResolvingDecision");
      assert(!b.events.some((e) => e.type === "reactionOpportunity"));
      assert(!JSON.stringify(view).includes('"targetUnitIds"'));
    }
    assert(!JSON.stringify(view).includes('"pendingReactionMovement"'));
    assert(!JSON.stringify(b.events).includes('"path"'));
  }
});

test("P1/P2 asymmetric confirmed movement, reaction, hazard and landing anchors share logical cells", () => {
  for (const tralala of [false, true]) {
    const f = fixture(tralala),
      r = select(f, tralala, { col: 3, row: 3 }, { col: 4, row: 3 }).committed;
    const p = plan(batch(r), makePlayerView(f.state, "P1"));
    for (const cue of p.batch.transportCues!.filter((c) => c.from)) {
      const normal = cellToBoardPoint(cue.from!, 9, 40, false),
        flipped = cellToBoardPoint(cue.from!, 9, 40, true);
      assert.equal(normal.x + flipped.x, 360);
      assert.equal(normal.y + flipped.y, 360);
      if (cue.to) {
        const a = lineBetweenCellsToCssTransform(cue.from!, cue.to, 9, 40, false),
          b = lineBetweenCellsToCssTransform(cue.from!, cue.to, 9, 40, true);
        assert.equal(a.width, b.width);
      }
    }
  }
});

test("duplicate transport/reaction events and reconnect hydration never replay historical one-shots", () => {
  for (const tralala of [false, true]) {
    const f = fixture(tralala, tralala ? 1 : 0);
    if (!tralala) f.state = stake(f.state, { col: 0, row: 2 });
    const r = select(f, tralala).committed,
      b = batch(r);
    const session = new PresentationSession(),
      binding = { roomId: "R", recipient: "P1" };
    session.begin(binding);
    session.snapshot({ ...binding, streamId: b.streamId!, revision: 0 });
    const accepted = session.receive(b, binding, b.view);
    assert.equal(accepted[0].events.length, b.events.length);
    assert.equal(session.receive(b, binding).length, 0);
    assert.equal(session.receive({ ...b, revision: 2 }, binding)[0].events.length, 0);
    session.begin(binding);
    assert.equal(accepted[0].presentationToken?.cancelled, true);
    assert.deepEqual(
      session.snapshot({ ...binding, streamId: b.streamId!, revision: 2, view: b.view }),
      [],
    );
    assert.deepEqual(session.receive(b, binding), []);
    assert(b.view!.pendingRoll);
    const next = respond(
      r.state,
      tralala
        ? pass
        : {
            type: "forestMoveDestination",
            position: (r.state.pendingRoll!.context.options as Coord[])[0],
          },
    );
    const continuationBatch = batch(next, 3);
    const continued = session.receive(continuationBatch, binding);
    assert(
      !continued[0].events.some((e) => e.type === "riverBoatPickup" || e.type === "abilityUsed"),
    );
    assert(
      continued[0].events.some(
        (e) => e.type === "riverBoatDisembarked" || e.type === "reactionMovementResumed",
      ),
    );
    assert.equal(session.receive(continuationBatch, binding).length, 0);
    assert.equal(
      session.receive({ ...continuationBatch, revision: 4 }, binding)[0].events.length,
      0,
    );
  }
});

test("River assets are real sprite strips/composite; finite audio and reset stop sources while caches survive", async () => {
  assert.deepEqual(validateVfxRegistry(), []);
  for (const [key, frames, file] of [
    ["boatPickup", 14, "boat_start_pickup.png"],
    ["boat", 20, "boat_travel.png"],
    ["boatDrop", 13, "boat_drop.png"],
    ["tralala", 26, "tralala_primary.png"],
  ] as const) {
    assert.equal(vfxRegistry[key].frames, frames);
    assert(vfxRegistry[key].asset!.endsWith(file));
  }
  assert.equal(vfxRegistry.tralala.layers!.length, 2);
  const keys: string[] = [];
  await preloadRiverSounds({
    preload: async (key) => {
      keys.push(key);
    },
  });
  assert.equal(keys.length, 8);
  const audio = audioFixture(),
    player = new SfxPlayer(audio.manager);
  await player.ensureAudioReady();
  await player.preload("hero.riverPerson.abilities.riverBoat.move");
  const f = fixture(),
    r = select(f).committed,
    cue = outputs(plan(batch(r), makePlayerView(f.state, "P1"))).sfx.find((c) =>
      c.key.endsWith(".move"),
    )!;
  assert(player.play(cue));
  assert.deepEqual(audio.sources[0].startArgs, [[0, 0, cue.durationMs! / 1000]]);
  new SfxPlaybackSession(player).reset();
  assert.equal(audio.sources[0].stops, 1);
  const decoded = audio.stats().decodes;
  await player.preload("hero.riverPerson.abilities.riverBoat.move");
  assert.equal(audio.stats().decodes, decoded);
});
