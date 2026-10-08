import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import {
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  type Coord,
  type GameEvent,
  type PlayerView,
} from "rules";
import {
  setupVladState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
} from "../../../../rules/src/tests/helpers/testUtils";
import { evUnitMoved, applyStakeTriggerIfAny } from "../../../../rules/src/core";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import { movementCueVfx, movementCueEffects } from "./movementPresentation";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { effectsFromEventBatch } from "./eventToEffects";
import { cellToBoardPoint } from "../../features/vfx/vfxGeometry";
import { PresentationSession } from "./presentationSession";
import { useVisualResolution } from "./useVisualResolution";
import type { BoardEventBatch, PresentationEvent } from "./types";
import { teleportMovementFixture } from "../../../../rules/src/tests/core/teleportMovement.test";

const A = { col: 1, row: 1 },
  B = { col: 2, row: 2 },
  C = { col: 3, row: 3 },
  D = { col: 4, row: 4 };
function view(position: Coord | null = A, hp = 5): PlayerView {
  return {
    boardSize: 9,
    units: {
      mover: {
        id: "mover",
        class: "rider",
        owner: "P1",
        isAlive: true,
        isStealthed: false,
        hp,
        position,
        turn: { moveUsed: false },
      },
    },
    pendingCombatQueueCount: 0,
  } as unknown as PlayerView;
}
function move(
  from = A,
  to = B,
  kind: "normal" | "rider" | "teleport" = "normal",
  id = "move",
): PresentationEvent {
  return { type: "unitMoved", eventId: id, unitId: "mover", provenance: { kind }, from, to };
}
function plan(
  events: PresentationEvent[],
  before = view(),
  after = view(B),
  reducedMotion = false,
) {
  return buildCombatVisualPlaybackPlan({
    batch: { streamId: "S", revision: 1, events },
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
    finalView: after,
    reducedMotion,
  });
}
function vfx(p: ReturnType<typeof plan>) {
  return mapEventBatchToVfx({
    ...p.batch,
    view: { units: {} } as PlayerView,
    previousPositions: {},
  });
}

test("normal provenance owns one quick segment even for a Rider class; state may already be ahead", () => {
  const p = plan([move()], view(D), view(B));
  assert.equal(p.movementPlan.cues.length, 1);
  const cue = p.movementPlan.cues[0];
  assert.equal(cue.kind, "movement");
  if (cue.kind !== "movement") return;
  assert.equal(cue.mode, "normal");
  assert.deepEqual(cue.from, A);
  assert.deepEqual(cue.to, B);
  assert.equal(p.durationMs, 160);
  assert.deepEqual(combatVisualPlaybackFrame(p, 0).visualUnitsByUnitId.mover.position, A);
  assert.deepEqual(combatVisualPlaybackFrame(p, 80).visualMotionByUnitId.mover.position, {
    col: 1.5,
    row: 1.5,
  });
  assert.deepEqual(
    combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId.mover.position,
    B,
  );
  assert.deepEqual(vfx(p), []);
});

test("confirmed steps remain separate, ordered, capped, and never become an endpoint shortcut", () => {
  const p = plan(
    [move(A, B, "rider", "1"), move(B, C, "rider", "2"), move(C, D, "rider", "3")],
    view(A),
    view(D),
  );
  assert.deepEqual(
    p.queue.filter((item) => item.type === "movement").map((item) => [item.cue.from, item.cue.to]),
    [
      [A, B],
      [B, C],
      [C, D],
    ],
  );
  assert.deepEqual(combatVisualPlaybackFrame(p, 240).visualMotionByUnitId.mover.position, {
    col: 2.5,
    row: 2.5,
  });
  const long = plan(Array.from({ length: 20 }, (_, i) => move(A, B, "rider", String(i))));
  assert.ok(long.durationMs <= 721);
  assert.equal(plan([move()], view(), view(B), true).durationMs, 50);
});

test("teleport fades at the two event endpoints with no intermediate movement/hazard geometry", () => {
  const p = plan([move(A, D, "teleport")], view(), view(D));
  const cue = p.movementPlan.cues[0];
  assert.deepEqual(movementCueEffects(cue), []);
  assert.deepEqual(
    vfx(p).map((request) => [request.effectId, request.sourceCell, request.delayMs]),
    [
      ["portal", A, 0],
      ["portal", D, 110],
    ],
  );
  assert.deepEqual(combatVisualPlaybackFrame(p, 55).visualMotionByUnitId.mover, {
    position: A,
    opacity: 0.5,
    mode: "teleport",
  });
  assert.deepEqual(combatVisualPlaybackFrame(p, 165).visualMotionByUnitId.mover, {
    position: D,
    opacity: 0.5,
    mode: "teleport",
  });
  assert.equal(p.movementPlan.cues.length, 1);
});

test("real default, selected, borrowed and Court teleports have one endpoint transition", () => {
  for (const mode of ["default", "normal", "borrowed", "court"] as const) {
    const fixture = teleportMovementFixture(mode);
    const result = applyAction(
      fixture.state,
      { type: "move", unitId: fixture.unit.id, to: fixture.destination },
      makeRngSequence([]),
    );
    const events = projectEventsForRecipient(result.state, result.events, "P1");
    const p = plan(events, makePlayerView(fixture.state, "P1"), makePlayerView(result.state, "P1"));
    const movements = p.movementPlan.cues.filter((cue) => cue.kind === "movement");
    assert.equal(movements.length, 1);
    assert.equal(movements[0].mode, "teleport");
    assert.equal(movements[0].durationMs, 220);
    assert.deepEqual(movementCueEffects(movements[0]), []);
    for (const elapsed of [0, 50, 109, 110, 170, 220]) {
      const frame = combatVisualPlaybackFrame(p, elapsed);
      const motion = frame.visualMotionByUnitId[fixture.unit.id];
      if (motion)
        assert.deepEqual(motion.position, elapsed < 110 ? fixture.from : fixture.destination);
    }
    assert(!vfx(p).some((effect) => effect.placement === "line" || effect.placement === "ray"));
  }
});

test("ability endpoint relocation uses teleport even when the private ability ID is redacted", () => {
  for (const abilityId of [
    "femtoDivineMove",
    "groznyInvadeTime",
    "lechyGuideTraveler",
    "asgoreSoulParade",
    "duolingoPushNotification",
    undefined,
  ]) {
    const event: PresentationEvent = {
      type: "unitMoved",
      unitId: "mover",
      from: A,
      to: D,
      provenance: {
        kind: "ability",
        ...(abilityId ? { abilityId } : {}),
        movementKind: "teleport",
      },
    };
    const p = plan([event], view(A), view(D));
    assert.equal(p.durationMs, 220);
    const cue = p.movementPlan.cues[0];
    assert.equal(cue.kind, "movement");
    assert.deepEqual(movementCueEffects(cue), []);
    assert.deepEqual(combatVisualPlaybackFrame(p, 55).visualMotionByUnitId.mover.position, A);
    assert.deepEqual(combatVisualPlaybackFrame(p, 165).visualMotionByUnitId.mover.position, D);
    assert.equal(vfx(p).filter((effect) => effect.effectId === "portal").length, 2);
    assert(!vfx(p).some((effect) => effect.placement === "line"));
  }
});

test("teleport arrival precedes destination hazard and shared damage/HP playback", () => {
  const p = plan(
    [
      move(A, D, "teleport"),
      {
        type: "stakeTriggered",
        eventId: "stake",
        unitId: "mover",
        markerPos: D,
        damage: 1,
        stopped: true,
      },
    ],
    view(),
    view(D, 4),
  );
  assert.equal(p.movementPlan.cues[1].atMs, 220);
  const hp = p.queue.find((item) => item.type === "damageHpTween")!;
  assert.ok(hp.startsAtMs > 220);
  assert.deepEqual(combatVisualPlaybackFrame(p, 221).visualUnitsByUnitId.mover.position, D);
  assert.equal(p.batch.combatCues?.filter((cue) => cue.kind === "damage").length, 1);
  assert.deepEqual(
    vfx(p)
      .filter((request) => request.effectId === "stakeTrigger")
      .map((request) => request.sourceCell),
    [D],
  );
  const sound = mapEventBatchToSfx({ ...p.batch, view: view(D, 4) });
  assert.equal(sound.length, 1);
  assert.equal(sound[0].delayMs, 220);
});

test("Stare and other explicit forced causes use push feedback and never modify voluntary Move slots", () => {
  const before = view();
  const original = JSON.stringify(before);
  const stare: PresentationEvent = {
    type: "intimidateResolved",
    provenance: { kind: "forced", cause: "intimidatingStare" },
    attackerId: "mover",
    from: A,
    to: B,
    eventId: "stare",
  };
  for (const event of [
    stare,
    ...(["hiddenCollision", "court", "moonSwap", "donWindmills"] as const).map((cause) => ({
      type: "unitMoved" as const,
      unitId: "mover",
      from: A,
      to: B,
      provenance: { kind: "forced" as const, cause },
      eventId: cause,
    })),
  ]) {
    const p = plan([event], before);
    assert.equal(p.movementPlan.cues[0].kind, "movement");
    assert.equal(movementCueEffects(p.movementPlan.cues[0])[0].kind, "movementTrail");
    assert.equal((movementCueEffects(p.movementPlan.cues[0])[0] as { tone: string }).tone, "push");
    assert.deepEqual(mapEventBatchToSfx({ ...p.batch, view: before }), []);
  }
  assert.equal(JSON.stringify(before), original);
});

test("Rider segments pause for combat in semantic order before further confirmed traversal", () => {
  const before = view();
  const after = view(C);
  const p = plan(
    [
      move(A, B, "rider", "first"),
      {
        type: "attackResolved",
        eventId: "attack",
        attackerId: "mover",
        defenderId: "target",
        sourceCell: B,
        targetCell: { col: 3, row: 2 },
        attackerRoll: { dice: [6], sum: 6, isDouble: false },
        defenderRoll: { dice: [1], sum: 1, isDouble: false },
        hit: false,
        damage: 0,
        defenderHpAfter: 5,
      },
      move(B, C, "rider", "next"),
    ],
    before,
    after,
  );
  const next = p.movementPlan.cues[1];
  assert.ok(next.atMs > p.batch.combatCues![0].atMs);
  const during = combatVisualPlaybackFrame(p, p.batch.combatCues![0].atMs);
  assert.deepEqual(during.visualUnitsByUnitId.mover.position, B);
  assert.deepEqual(
    combatVisualPlaybackFrame(p, next.atMs + 80).visualMotionByUnitId.mover.position,
    { col: 2.5, row: 2.5 },
  );
});

test("actual interrupted endpoint owns the plan; future selected cells never appear", () => {
  const p = plan(
    [
      move(A, B, "rider", "1"),
      move(B, C, "rider", "2"),
      {
        type: "stakeTriggered",
        unitId: "mover",
        markerPos: C,
        damage: 1,
        stopped: true,
        eventId: "stop",
      },
    ],
    view(),
    view(C, 4),
  );
  assert.equal(p.movementPlan.cues.filter((cue) => cue.kind === "movement").length, 2);
  assert.ok(!JSON.stringify(p.movementPlan).includes(JSON.stringify(D)));
  assert.deepEqual(combatVisualPlaybackFrame(p, 321).visualUnitsByUnitId.mover.position, C);
  assert.deepEqual(
    combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId.mover.position,
    C,
  );
});

test("real Rider move previews ignore hidden stakes and resolution presents only its interrupted endpoint", () => {
  const stop = { col: 1, row: 3 },
    selected = { col: 1, row: 4 };
  const setup = setupVladState();
  const rider = Object.values(setup.state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider",
  )!;
  let before = setUnit(setup.state, rider.id, { position: A });
  before = initKnowledgeForOwners(toBattleState(before, "P1", rider.id));
  const hidden = {
    ...before,
    stakeMarkers: [
      { id: "hidden", owner: "P2" as const, position: stop, isRevealed: false, createdAt: 0 },
    ],
  };
  const clearOptions = applyAction(
    before,
    { type: "requestMoveOptions", unitId: rider.id },
    makeRngSequence([]),
  );
  const hiddenOptions = applyAction(
    hidden,
    { type: "requestMoveOptions", unitId: rider.id },
    makeRngSequence([]),
  );
  assert.deepEqual(
    makePlayerView(hiddenOptions.state, "P1"),
    makePlayerView(clearOptions.state, "P1"),
  );
  const resolved = applyAction(
    hiddenOptions.state,
    { type: "move", unitId: rider.id, to: selected },
    makeRngSequence([]),
  );
  const events = projectEventsForRecipient(resolved.state, resolved.events, "P1").map(
    (event, index) => ({ ...event, eventId: `actual-${index}` }),
  );
  const movement = events.find((event) => event.type === "unitMoved");
  assert.ok(movement?.type === "unitMoved");
  assert.equal(movement.provenance.kind, "rider");
  assert.deepEqual(movement.to, stop);
  const p = plan(events, makePlayerView(before, "P1"), makePlayerView(resolved.state, "P1"));
  assert.equal(p.movementPlan.cues.filter((cue) => cue.kind === "movement").length, 1);
  assert.ok(!JSON.stringify(p.movementPlan).includes(JSON.stringify(selected)));
  assert.deepEqual(
    combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId[rider.id].position,
    stop,
  );
});

test("real owner/opponent/spectator projections alone authorize placement; snapshots never replay it", () => {
  const { state } = setupVladState();
  const events: GameEvent[] = [
    { type: "stakesPlaced", owner: "P1", positions: [B, C], hiddenFromOpponent: true },
    { type: "snarePlaced", owner: "P1", sourceUnitId: "jack", cell: D },
  ];
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(state, events, recipient);
    const p = plan(projected, view(), view());
    assert.equal(p.movementPlan.cues.length, recipient === "P1" ? 2 : 0);
    assert.equal(vfx(p).length, recipient === "P1" ? 3 : 0);
    assert.deepEqual(mapEventBatchToSfx({ ...p.batch, view: view() }), []);
    if (recipient !== "P1") assert.ok(!JSON.stringify(p.movementPlan).includes(JSON.stringify(D)));
  }
  const snapshotOnly = plan([], view(), {
    ...view(),
    stakeMarkers: [{ position: B, isRevealed: false }],
  } as PlayerView);
  assert.deepEqual(snapshotOnly.movementPlan.cues, []);
  assert.deepEqual(vfx(snapshotOnly), []);
});

test("real stacked stake trigger reveals once, retains both markers, and hides earlier mover path", () => {
  const setup = setupVladState();
  let before = setUnit(setup.state, setup.enemy.id, { position: A, hp: 5, isStealthed: true });
  before = initKnowledgeForOwners(toBattleState(before, "P2", setup.enemy.id));
  before = {
    ...before,
    stakeMarkers: ["P1", "P2"].map((owner, i) => ({
      id: `secret-${i}`,
      owner,
      position: C,
      isRevealed: false,
      createdAt: i,
    })),
  } as typeof before;
  const moved = { ...before.units[setup.enemy.id], position: C };
  const result = applyStakeTriggerIfAny(
    { ...before, units: { ...before.units, [moved.id]: moved } },
    moved,
    C,
    makeRngSequence([0.1]),
  );
  assert.equal(result.events.filter((event) => event.type === "stakeTriggered").length, 1);
  assert.equal(result.state.stakeMarkers.length, 2);
  assert.ok(result.state.stakeMarkers.every((marker) => marker.isRevealed));
  const movement = evUnitMoved(before, {
    unitId: moved.id,
    from: A,
    to: C,
    provenance: { kind: "rider" },
  });
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const events = projectEventsForRecipient(
      result.state,
      [movement, ...result.events],
      recipient,
    ).map((event, index) => ({ ...event, eventId: `event-${index}` }));
    const start =
      recipient === "spectator" ? makeSpectatorView(before) : makePlayerView(before, recipient);
    const final =
      recipient === "spectator"
        ? makeSpectatorView(result.state)
        : makePlayerView(result.state, recipient);
    const p = plan(events, start, final);
    assert.equal(
      p.movementPlan.cues.filter((cue) => cue.kind === "movement").length,
      recipient === "P2" ? 1 : 0,
    );
    assert.equal(p.movementPlan.cues.filter((cue) => cue.kind === "reveal").length, 1);
    assert.equal(p.movementPlan.cues.filter((cue) => cue.kind === "stakeTrigger").length, 1);
    assert.equal(p.queue.filter((item) => item.type === "damageHpTween").length, 1);
    assert.equal(p.batch.combatCues?.filter((cue) => cue.kind === "damage").length, 1);
    const hp = p.queue.find((item) => item.type === "damageHpTween")!;
    if (hp.type === "damageHpTween")
      assert.deepEqual([hp.damage.previousHp, hp.damage.nextHp], [5, 4]);
    const cues = effectsFromEventBatch(
      p.batch.events,
      { view: final, previousPositions: {} },
      p.batch.eventDelaysMs,
      p.batch.combatCues,
      p.batch.movementCues,
    );
    assert.equal(cues.filter((cue) => cue.kind === "floatingText" && cue.text === "-1").length, 1);
    assert.equal(vfx(p).filter((request) => request.effectId === "hiddenReveal").length, 1);
    if (recipient !== "P2") {
      assert.ok(!JSON.stringify(p.movementPlan).includes(JSON.stringify(A)));
      assert.equal(
        combatVisualPlaybackFrame(p, 0).visualUnitsByUnitId[moved.id]?.position?.col,
        C.col,
      ); // Explicit reveal is the first authorized cue.
    }
  }
});

test("snare impact is one shot with no damage, status begins at arrival, and other traps stay private", () => {
  const final = view(B);
  final.units.mover.immobilizedUntilOwnTurnStart = true;
  const p = plan(
    [
      move(),
      { type: "snareTriggered", eventId: "snare", unitId: "mover", cell: B, immobilized: true },
    ],
    view(),
    final,
  );
  assert.equal(p.movementPlan.cues.filter((cue) => cue.kind === "snareTrigger").length, 1);
  assert.equal(p.queue.filter((item) => item.type === "damageHpTween").length, 0);
  assert.equal(vfx(p).filter((request) => request.effectId === "snareTrigger").length, 1);
  assert.equal(
    combatVisualPlaybackFrame(p, 80).visualUnitsByUnitId.mover.immobilizedUntilOwnTurnStart,
    undefined,
  );
  assert.equal(
    combatVisualPlaybackFrame(p, 161).visualUnitsByUnitId.mover.immobilizedUntilOwnTurnStart,
    true,
  );
  assert.ok(!JSON.stringify(p.movementPlan).includes("trapId"));
});

test("an ahead snapshot cannot present a reveal while its semantic chain is still deferred", () => {
  const empty = { ...view(), units: {} };
  const final = view(C, 4);
  const p = buildCombatVisualPlaybackPlan({
    batch: {
      streamId: "S",
      revision: 1,
      events: [
        {
          type: "rollResolved",
          eventId: "roll",
          rollId: "manual",
          rollKind: "attack_attackerRoll",
          rollerPlayerId: "P1",
          rollIndex: 0,
          dice: [6],
          sides: 6,
          total: 6,
        },
      ],
    },
    startingHpByUnitId: {},
    startingUnitsByUnitId: {},
    finalView: final,
    reducedMotion: false,
    holdResolvedState: true,
  });
  assert.equal(combatVisualPlaybackFrame(p, 0).visualUnitsByUnitId.mover, undefined);
  assert.equal(combatVisualPlaybackFrame(p, p.durationMs).visualUnitsByUnitId.mover, undefined);
  assert.deepEqual(p.movementPlan.cues, []);
  const released = plan(
    [
      { type: "stealthRevealed", eventId: "reveal", unitId: "mover", reason: "attacked" },
      move(B, C),
    ],
    empty,
    final,
  );
  assert.deepEqual(
    released.movementPlan.cues[0].kind === "reveal" ? released.movementPlan.cues[0].cell : null,
    B,
  );
  assert.deepEqual(combatVisualPlaybackFrame(released, 0).visualUnitsByUnitId.mover.position, B);
});

test("Boat/Tralala confirmed moves interpolate without generic trails; unknown abilities stay silent", () => {
  for (const provenance of [
    { kind: "boat" as const },
    { kind: "tralala" as const },
    { kind: "ability" as const, abilityId: "hero" },
  ]) {
    const p = plan([{ type: "unitMoved", unitId: "mover", from: A, to: D, provenance }]);
    if (provenance.kind === "ability") {
      assert.deepEqual(p.movementPlan.cues, []);
      assert.deepEqual(p.queue, []);
    } else {
      assert.equal(p.movementPlan.cues.length, 1);
      assert.equal(p.queue[0].type, "movement");
      assert.deepEqual(movementCueEffects(p.movementPlan.cues[0]), []);
      assert.deepEqual(movementCueVfx(p.movementPlan.cues[0]), []);
    }
  }
});

test("asymmetric motion and hazard cells share P1/P2 canonical geometry at edges and corners", () => {
  for (const cell of [
    { col: 5, row: 4 },
    { col: 0, row: 0 },
    { col: 8, row: 8 },
    { col: 0, row: 8 },
    { col: 8, row: 0 },
  ]) {
    const p = plan(
      [
        move(A, cell),
        { type: "snareTriggered", eventId: "trigger", unitId: "mover", cell, immobilized: true },
      ],
      view(),
      view(cell),
    );
    const arrived = combatVisualPlaybackFrame(p, 161).visualMotionByUnitId.mover.position;
    const hazard = movementCueVfx(p.movementPlan.cues[1])[0].sourceCell!;
    for (const flipped of [false, true])
      assert.deepEqual(
        cellToBoardPoint(arrived, 9, 40, flipped),
        cellToBoardPoint(hazard, 9, 40, flipped),
      );
    const p1 = cellToBoardPoint(cell, 9, 40, false),
      p2 = cellToBoardPoint(cell, 9, 40, true);
    assert.equal(p1.x + p2.x, 360);
    assert.equal(p1.y + p2.y, 360);
  }
});

test("duplicate movement/hazard/reveal IDs are rejected by existing ingress, including higher revisions", () => {
  const session = new PresentationSession();
  const binding = { roomId: "room", recipient: "P1" };
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "S", revision: 0 });
  const events = [
    { ...move(), eventId: "move" },
    {
      type: "snareTriggered" as const,
      eventId: "snare",
      unitId: "mover",
      cell: B,
      immobilized: true as const,
    },
    {
      type: "stealthRevealed" as const,
      eventId: "reveal",
      unitId: "mover",
      reason: "stakeTriggered" as const,
    },
  ];
  assert.equal(
    session.receive({ streamId: "S", revision: 1, events }, binding)[0].events.length,
    3,
  );
  assert.deepEqual(session.receive({ streamId: "S", revision: 1, events }, binding), []);
  assert.deepEqual(session.receive({ streamId: "S", revision: 2, events }, binding)[0].events, []);
});

test("live hook holds ahead snapshots, then room/role/stream hydration resets cancel motion and silently reconcile", () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++frameId, callback);
        return frameId;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
      setTimeout,
      clearTimeout,
    },
  });
  let output: ReturnType<typeof useVisualResolution>;
  let renderer: ReactTestRenderer | undefined;
  const token = { cancelled: false };
  function Harness({
    currentView,
    batches = [],
    sessionKey = "room:P1:S",
  }: {
    currentView: PlayerView;
    batches?: BoardEventBatch[];
    sessionKey?: string;
  }) {
    output = useVisualResolution({
      view: currentView,
      batches,
      batch: null,
      sessionKey,
      enabled: true,
    });
    return null;
  }
  try {
    act(() => {
      renderer = create(createElement(Harness, { currentView: view() }));
    });
    act(() => {
      renderer!.update(createElement(Harness, { currentView: view(D) }));
    });
    assert.deepEqual(output!.visualUnitsByUnitId.mover.position, A);
    act(() => {
      renderer!.update(
        createElement(Harness, {
          currentView: view(D),
          batches: [
            {
              streamId: "S",
              revision: 1,
              presentationToken: token,
              events: [
                move(A, B, "rider", "1"),
                move(B, C, "teleport", "2"),
                move(C, D, "rider", "3"),
                {
                  type: "snareTriggered",
                  eventId: "snare",
                  unitId: "mover",
                  cell: D,
                  immobilized: true,
                },
              ],
            },
          ],
        }),
      );
    });
    const oldTick = [...frames.values()][0];
    assert.ok(oldTick);
    assert.equal(output!.batch?.movementCues?.length, 4);
    // This reset must be safe even when a local caller supplies no synchronous
    // token invalidation. Production ingress independently cancels its token.
    act(() => {
      renderer!.update(
        createElement(Harness, { currentView: view(C), sessionKey: "other:spectator:new-stream" }),
      );
    });
    act(() => oldTick(performance.now() + 10000));
    assert.equal(output!.batch, null);
    assert.deepEqual(output!.visualMotionByUnitId, {});
    assert.deepEqual(output!.visualUnitsByUnitId.mover.position, C);
    assert.equal(frames.size, 0);
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
