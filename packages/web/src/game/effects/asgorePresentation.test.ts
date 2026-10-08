import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  getAbilityChargeCost,
  getAbilitySpec,
  getAbilityAvailability,
  type GameState,
  type GameEvent,
  type PlayerView,
  type LiveEventBatch,
} from "rules";
import {
  setupAsgoreState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
  startAsgoreSoulParadeTurn,
  makeEmptyTurnEconomy,
} from "../../../../rules/src/tests/helpers/testUtils";
import { FIREBALL_TIMING, asgoreReadyAbilities } from "./asgorePresentation";
import { buildCombatVisualPlaybackPlan } from "./combatPlayback";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  snapshotVisualHp,
  snapshotVisualUnits,
} from "./visualResolution";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { vfxRegistry } from "../../features/vfx/vfxRegistry";
import { spritePlayback } from "../../features/vfx/VfxSprite";
import { VfxLayer } from "../../features/vfx/VfxLayer";
import { enqueueBoardVfx, simplifyVfxForReducedMotion } from "../../features/vfx/vfxQueue";
import { cellToBoardPoint, lineBetweenCellsToCssTransform } from "../../features/vfx/vfxGeometry";
import { PresentationSession } from "./presentationSession";
import { effectsFromEventBatch } from "./eventToEffects";
import { buildActionPreview } from "../targeting/buildActionPreview";
import { preloadAsgoreSounds } from "../../features/sfx/audioPreload";
import { SfxPlayer } from "../../features/sfx/sfxPlayer";
import { audioFixture } from "../../features/sfx/audioTestUtils";
import { SfxPlaybackSession } from "../../features/sfx/sfxPlaybackSession";
import type { BoardEventBatch, PresentationEvent } from "./types";

const required = (id: string) => getAbilityChargeCost(getAbilitySpec(id)!);
function fixture(id = ABILITY_ASGORE_FIREBALL as string, count = required(id), lethalSans = false) {
  const f = setupAsgoreState();
  const target = Object.values(f.state.units).find(
    (u) => u.owner === "P2" && u.class === "knight",
  )!;
  let state = setUnit(f.state, f.asgore.id, {
    position: { col: 1, row: 2 },
    charges: { ...f.asgore.charges, [id]: count },
  });
  state = setUnit(state, target.id, {
    position: { col: 1, row: id === ABILITY_ASGORE_FIRE_PARADE ? 4 : 6 },
    hp: lethalSans ? 1 : 8,
    ...(lethalSans
      ? { heroId: "sans", class: "assassin" as const, sansUnbelieverUnlocked: true }
      : {}),
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", f.asgore.id));
  return { state, sourceId: f.asgore.id, targetId: target.id };
}
function activate(f: ReturnType<typeof fixture>, id = ABILITY_ASGORE_FIREBALL as string) {
  return applyAction(
    f.state,
    { type: "useAbility", unitId: f.sourceId, abilityId: id, payload: { targetId: f.targetId } },
    makeRngSequence([]),
  );
}
function respond(state: GameState, values: number[]) {
  const p = state.pendingRoll!;
  assert(p);
  return applyAction(
    state,
    { type: "resolvePendingRoll", player: p.player, pendingRollId: p.id },
    makeRngSequence(values),
  );
}
function batch(
  events: GameEvent[] | PresentationEvent[],
  state: GameState,
  revision = 1,
  recipient = "P1" as "P1" | "P2" | "spectator",
): BoardEventBatch & LiveEventBatch {
  return {
    streamId: "asgore-test",
    revision,
    view: recipient === "spectator" ? makeSpectatorView(state) : makePlayerView(state, recipient),
    events: projectEventsForRecipient(state, events as GameEvent[], recipient).map((e, i) => ({
      ...e,
      eventId: `E${revision}:${i}`,
    })),
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
function fireball(hit: boolean, lethalSans = false) {
  const f = fixture(ABILITY_ASGORE_FIREBALL, required(ABILITY_ASGORE_FIREBALL), lethalSans);
  const cast = activate(f);
  const attacker = respond(cast.state, hit ? [0.8, 0.5] : [0.1, 0.2]);
  // Round-trip the pending defense exactly as a recovery snapshot would.
  const restored = JSON.parse(JSON.stringify(attacker.state)) as GameState;
  const defender = respond(restored, hit ? [0.01, 0.2] : [0.8, 0.5]);
  return {
    ...f,
    cast,
    attacker,
    defender,
    events: [...cast.events, ...attacker.events, ...defender.events],
  };
}

test("Fireball hit/miss keep one authoritative use through both manual rolls and recovery; normal attacks inherit nothing", () => {
  for (const hit of [true, false]) {
    const f = fireball(hit);
    const use = f.cast.events.find((e) => e.type === "abilityUsed")!;
    assert(use.abilityUseId);
    assert.equal(f.cast.state.pendingRoll!.abilityUseId, use.abilityUseId);
    assert.equal(f.attacker.state.pendingRoll!.abilityUseId, use.abilityUseId);
    for (const e of f.events.filter((e) =>
      ["abilityUsed", "rollResolved", "attackResolved"].includes(e.type),
    )) {
      assert.equal(e.abilityUseId, use.abilityUseId);
      assert.equal(e.abilityId, ABILITY_ASGORE_FIREBALL);
    }
    assert.equal(f.events.find((e) => e.type === "attackResolved")!.hit, hit);
    const before = makePlayerView(f.state, "P1");
    for (const recipient of ["P1", "P2", "spectator"] as const) {
      const p = plan(batch(f.events, f.defender.state, 1, recipient), before);
      const o = outputs(p.batch);
      assert.equal(o.sprites.filter((s) => s.effectId === "fireballCast").length, 1);
      assert.equal(o.sprites.filter((s) => s.effectId === "fireball").length, 1);
      assert.equal(o.sprites.filter((s) => s.effectId === "fireballImpact").length, hit ? 1 : 0);
      assert.equal(o.sprites.filter((s) => s.effectId === "combatHit").length, 0);
      assert.equal(o.sprites.filter((s) => s.effectId === "combatMiss").length, hit ? 0 : 1);
      assert.equal(o.sounds.filter((s) => s.key.endsWith("asgoreFireball.cast")).length, 1);
      assert.equal(o.sounds.filter((s) => s.key.endsWith("asgoreFireball.travel")).length, 1);
      assert.equal(
        o.sounds.filter((s) => s.key.endsWith("asgoreFireball.impact")).length,
        hit ? 1 : 0,
      );
      assert.equal(o.sounds.filter((s) => s.key === "common.combat.hit").length, 0);
      assert.equal(o.sounds.filter((s) => s.key === "common.combat.miss").length, hit ? 0 : 1);
      assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, hit ? 1 : 0);
      assert.equal(p.queue.filter((q) => q.type === "death").length, 0);
      assert.equal(
        o.effects.filter((e) => e.kind === "floatingText" && e.text?.startsWith("-")).length,
        hit ? 1 : 0,
      );
      const travel = o.sprites.find((s) => s.effectId === "fireball")!;
      const termination = o.sprites.find((s) =>
        ["fireballImpact", "combatMiss"].includes(s.effectId),
      )!;
      const rolls = p.batch.combatCues!.filter((c) => c.kind === "roll");
      assert.equal(rolls.length, 2);
      assert(travel.delayMs! >= rolls[1].atMs + rolls[1].durationMs);
      assert.equal(termination.delayMs, travel.delayMs! + FIREBALL_TIMING.travelMs);
      for (const s of o.sprites.filter((s) =>
        ["fireball", "fireballCast", "fireballImpact", "combatMiss"].includes(s.effectId),
      ))
        assert(s.id.includes(use.abilityUseId!));
    }
    let normal = setUnit(f.defender.state, f.sourceId, {
      turn: makeEmptyTurnEconomy(),
      hasActedThisTurn: false,
      hasAttackedThisTurn: false,
    });
    normal = setUnit(normal, f.targetId, { position: { col: 1, row: 3 } });
    const started = applyAction(
      normal,
      { type: "attack", attackerId: f.sourceId, defenderId: f.targetId },
      makeRngSequence([]),
    );
    const a = respond(started.state, [0.8, 0.5]);
    const d = respond(a.state, [0.01, 0.2]);
    const attack = d.events.find((e) => e.type === "attackResolved")!;
    assert.equal(attack.abilityId, undefined);
    assert.equal(attack.abilityUseId, undefined);
  }
});

test("runtime miss artwork contains only the verified early ember; full combined flame strip is hit-only", () => {
  const f = fireball(false);
  const o = outputs(plan(batch(f.events, f.defender.state), makePlayerView(f.state, "P1")).batch);
  for (const request of o.sprites) {
    const def = vfxRegistry[request.effectId];
    if (!def.asset?.includes("asgore/fireball.png")) continue;
    assert(
      (def.endFrame ?? def.frames! - 1) <= 1,
      "miss must exclude ALL undocumented later frames",
    );
    assert(spritePlayback(def, def.durationMs).count <= 2);
  }
  assert.equal(vfxRegistry.fireball.startFrame, 1);
  assert.equal(vfxRegistry.fireball.endFrame, 1);
  assert.equal(spritePlayback(vfxRegistry.fireballImpact, 700).count, 17);
});

test("Fireball ignores UI preview changes and uses event-time anchors after the caster moves; P1/P2 and resize share projectile geometry", () => {
  const f = fireball(true);
  const moved = setUnit(f.defender.state, f.sourceId, { position: { col: 7, row: 8 } });
  const view = makePlayerView(moved, "P1");
  const preview = buildActionPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: f.sourceId,
    actionMode: "asgoreFireParade",
  });
  assert(preview);
  const b = plan(batch(f.events, moved), makePlayerView(f.state, "P1")).batch;
  const sprites = outputs(b).sprites;
  const travel = sprites.find((s) => s.effectId === "fireball")!;
  assert.deepEqual(travel.sourceCell, { col: 1, row: 2 });
  assert.deepEqual(travel.targetCell, { col: 1, row: 6 });
  assert.deepEqual(
    sprites.find((s) => s.effectId === "fireballCast")!.sourceCell,
    travel.sourceCell,
  );
  for (const flipped of [false, true])
    for (const cellSize of [32, 60]) {
      const geometry = lineBetweenCellsToCssTransform(
        travel.sourceCell!,
        travel.targetCell!,
        9,
        cellSize,
        flipped,
      );
      const end = cellToBoardPoint(travel.targetCell!, 9, cellSize, flipped);
      const angle = (geometry.angleDeg * Math.PI) / 180;
      assert(Math.abs(geometry.left + Math.cos(angle) * geometry.width - end.x) < 0.001);
      assert(Math.abs(geometry.top + Math.sin(angle) * geometry.width - end.y) < 0.001);
      const html = renderToStaticMarkup(
        createElement(VfxLayer, {
          effects: enqueueBoardVfx({ current: [], incoming: [travel], now: 0 }),
          view,
          boardSize: 9,
          cellSize,
          isFlipped: flipped,
          reducedMotion: false,
        }),
      );
      assert(html.includes(`--vfx-travel:${geometry.width}px`));
      assert(html.includes(`transform:${geometry.transform}`));
    }
  const reduced = simplifyVfxForReducedMotion(sprites);
  assert.equal(reduced.find((s) => s.effectId === "fireball")!.delayMs, travel.delayMs);
});

test("reconnect during defense hydrates silently, preserves Fireball outcome identity, and duplicate delivery cannot replay", () => {
  const f = fireball(true);
  const ingress = new PresentationSession();
  const binding = { roomId: "asgore-room", recipient: "P1" };
  const restored = JSON.parse(JSON.stringify(f.attacker.state)) as GameState;
  const view = makePlayerView(restored, "P1");
  ingress.begin(binding);
  assert.deepEqual(
    ingress.snapshot({ ...binding, streamId: "asgore-test", revision: 2, view }),
    [],
  );
  assert.equal(
    makePlayerView(restored, "P2").pendingRoll!.abilityUseId,
    f.attacker.state.pendingRoll!.abilityUseId,
  );
  assert.deepEqual(
    ingress.receive(batch(f.cast.events, f.cast.state, 1), binding, view),
    [],
  );
  const fresh = batch(f.defender.events, f.defender.state, 3);
  const accepted = ingress.receive(fresh, binding, fresh.view);
  assert.equal(accepted.length, 1);
  const p = plan(accepted[0], view);
  const o = outputs(p.batch);
  assert.equal(o.sprites.filter((s) => s.effectId === "fireballCast").length, 0);
  assert.equal(o.sprites.filter((s) => s.effectId === "fireballImpact").length, 1);
  assert.deepEqual(ingress.receive(fresh, binding, fresh.view), []);
  assert.equal(
    ingress.receive({ ...fresh, revision: 4 }, binding, fresh.view)[0].events.length,
    0,
  );
  const duplicated = { ...p.batch, events: [...p.batch.events, ...p.batch.events] };
  const vfx = outputs(duplicated).sprites.filter((s) =>
    ["fireball", "fireballImpact"].includes(s.effectId),
  );
  assert.equal(vfx.length, 2);
  const played: string[] = [];
  const audio = new SfxPlaybackSession({
    play: (cue) => {
      if (cue && typeof cue !== "string") played.push(cue.id);
      return true;
    },
    stopGameplay() {},
    isMuted: () => false,
    getVolume: () => 1,
  });
  audio.schedule(
    {
      ...p.batch,
      eventDelaysMs: undefined,
      eventSfxDelaysMs: undefined,
      combatCues: [],
      events: batch(f.cast.events, f.cast.state).events,
    },
    view,
  );
  audio.schedule(
    { ...p.batch, combatCues: [], events: batch(f.cast.events, f.cast.state).events },
    view,
  );
  assert.equal(played.filter((id) => id.includes("asgoreFireball.cast")).length, 1);
  audio.reset();
});

test("Fireball positional cues fail closed when projected coordinates/correlation are missing, despite visible tokens and caches", () => {
  const f = fireball(true);
  const p = plan(batch(f.events, f.defender.state), makePlayerView(f.state, "P1"));
  const redacted = {
    ...p.batch,
    events: p.batch.events.map((e) =>
      e.type === "attackResolved"
        ? { ...e, sourceCell: null, targetCell: null }
        : e.type === "abilityUsed"
          ? { ...e, sourceCell: undefined }
          : e,
    ),
  };
  const requests = mapEventBatchToVfx({
    ...redacted,
    view: redacted.view!,
    previousPositions: { [f.sourceId]: { col: 1, row: 2 }, [f.targetId]: { col: 1, row: 6 } },
  });
  assert.deepEqual(requests, []);
  const unidentified = {
    ...p.batch,
    events: p.batch.events.map((e) =>
      e.type === "attackResolved" ? { ...e, abilityUseId: undefined } : e,
    ),
  };
  assert(
    !outputs(unidentified).sprites.some(
      (s) => s.effectId === "fireball" || s.effectId === "fireballImpact",
    ),
  );
  // Event-time visibility remains redacted even if Asgore becomes public later.
  const hidden = fixture();
  hidden.state = setUnit(hidden.state, hidden.sourceId, { isStealthed: true });
  const cast = activate(hidden);
  const later = setUnit(cast.state, hidden.sourceId, { isStealthed: false });
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = batch(cast.events, later, 1, recipient);
    assert(!outputs(projected).sprites.some((s) => s.effectId === "fireballCast"));
  }
});

test("Fire Parade uses its real radius-two area, one signature and cast, shared dice, and individual HP/death exactly once", () => {
  const f = fixture(ABILITY_ASGORE_FIRE_PARADE);
  const ally = Object.values(f.state.units).find(
    (u) => u.owner === "P1" && u.id !== f.sourceId && u.class === "archer",
  )!;
  f.state = setUnit(f.state, ally.id, { position: { col: 2, row: 3 }, hp: 1 });
  const cast = activate(f, ABILITY_ASGORE_FIRE_PARADE);
  assert.equal(cast.state.pendingRoll!.kind, "tricksterAoE_attackerRoll");
  const early = advanceVisualResolution(
    createVisualResolutionState({
      batch: null,
      view: makePlayerView(f.state, "P1"),
      enabled: true,
    }),
    {
      batch: batch(cast.events, cast.state),
      view: makePlayerView(cast.state, "P1"),
      enabled: true,
    },
  );
  assert.equal(
    outputs(early.visualBatch!).sounds.filter((s) => s.key.endsWith("asgoreFireParade.cast"))
      .length,
    1,
  );
  assert(!outputs(early.visualBatch!).sprites.some((s) => s.effectId === "fireParade"));
  let result = cast;
  const events = [...cast.events];
  for (let i = 0; result.state.pendingRoll; i++) {
    assert(i < 20);
    result = respond(
      result.state,
      result.state.pendingRoll.kind.endsWith("_attackerRoll") ? [0.8, 0.5] : [0.01, 0.2],
    );
    events.push(...result.events);
  }
  const p = plan(batch(events, result.state), makePlayerView(f.state, "P1"));
  const o = outputs(p.batch);
  const aggregate = events.find((e) => e.type === "aoeResolved")!;
  assert.equal(aggregate.radius, 2);
  assert(aggregate.affectedUnitIds.includes(ally.id));
  const signature = o.sprites.filter((s) => s.effectId === "fireParade");
  assert.equal(signature.length, 1);
  assert.equal(signature[0].widthCells, 5);
  assert.equal(signature[0].heightCells, 5);
  assert.deepEqual(signature[0].sourceCell, { col: 1, row: 2 });
  assert.equal(vfxRegistry.fireParade.layers!.length, 2);
  const attacks = events.filter((e) => e.type === "attackResolved");
  assert.equal(attacks.length, 2);
  assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 2);
  assert.equal(p.queue.filter((q) => q.type === "death").length, 1);
  assert.equal(o.sprites.filter((s) => s.effectId === "unitDeath").length, 1);
  assert(signature[0].delayMs! < p.batch.combatCues!.find((c) => c.kind === "hit")!.atMs);
  const duplicated = outputs({ ...p.batch, events: [...p.batch.events, ...p.batch.events] });
  assert.equal(duplicated.sprites.filter((s) => s.effectId === "fireParade").length, 1);
  const hydrated = createVisualResolutionState({
    batch: p.batch,
    view: p.batch.view!,
    enabled: true,
  });
  assert.equal(hydrated.visualBatch, null);
});

test("every Asgore charge requirement is canonical, invalid activation is inert, regeneration crosses readiness once, and hydration stays silent", () => {
  for (const id of [ABILITY_ASGORE_FIREBALL, ABILITY_ASGORE_FIRE_PARADE]) {
    const f = fixture(id, required(id) - 1);
    assert.equal(getAbilityAvailability(f.state, f.sourceId, id).canUse, false);
    const rejected = activate(f, id);
    assert.equal(rejected.rejectionReason, "notEnoughCharges");
    assert.strictEqual(rejected.state, f.state);
    assert.deepEqual(outputs(batch(rejected.events, rejected.state)).sprites, []);
    assert.deepEqual(outputs(batch(rejected.events, rejected.state)).sounds, []);
    const scheduled = {
      ...f.state,
      activeUnitId: null,
      turnQueue: [f.sourceId],
      turnQueueIndex: 0,
      turnOrder: [f.sourceId],
      turnOrderIndex: 0,
      turnNumber: f.state.turnNumber + 1,
    };
    const regen = applyAction(
      scheduled,
      { type: "unitStartTurn", unitId: f.sourceId },
      makeRngSequence([]),
    );
    const fresh = batch(regen.events, regen.state);
    assert.equal(regen.state.units[f.sourceId].charges[id], required(id));
    assert.equal(
      fresh.events.flatMap((e) => asgoreReadyAbilities(e, fresh.view!)).filter((a) => a === id)
        .length,
      1,
    );
    assert.equal(outputs(fresh).sprites.filter((s) => s.effectId === "statusSmall").length, 1);
    const ingress = new PresentationSession();
    const binding = { roomId: "ready", recipient: "P1" };
    ingress.begin(binding);
    ingress.snapshot({
      ...binding,
      streamId: "asgore-test",
      revision: 0,
      view: makePlayerView(f.state, "P1"),
    });
    assert.equal(
      ingress.receive(fresh, binding, fresh.view)[0].events.length,
      fresh.events.length,
    );
    assert.deepEqual(ingress.receive(fresh, binding, fresh.view), []);
    ingress.begin(binding);
    assert.deepEqual(
      ingress.snapshot({ ...binding, streamId: "asgore-test", revision: 1, view: fresh.view }),
      [],
    );
    assert.deepEqual(ingress.receive(fresh, binding, fresh.view), []);
    const use = activate({ ...f, state: regen.state }, id);
    assert.equal(use.state.units[f.sourceId].charges[id], 0);
    assert.equal(use.events.filter((e) => e.type === "abilityUsed").length, 1);
  }
  const soul = fixture(ABILITY_ASGORE_SOUL_PARADE, required(ABILITY_ASGORE_SOUL_PARADE) - 1);
  assert.equal(
    getAbilityAvailability(soul.state, soul.sourceId, ABILITY_ASGORE_SOUL_PARADE).disabledReason,
    "automaticAbility",
  );
  const manual = activate(soul, ABILITY_ASGORE_SOUL_PARADE);
  assert.strictEqual(manual.state, soul.state);
  assert.deepEqual(manual.events, []);
});

test("Soul Parade reveals once from its authoritative outcome, keeps generic healing/movement/combat, and reconnect is silent", () => {
  for (const roll of [0.1, 0.2, 0.4, 0.55, 0.7, 0.95]) {
    const f = fixture(ABILITY_ASGORE_SOUL_PARADE, required(ABILITY_ASGORE_SOUL_PARADE) - 1);
    f.state = setUnit(f.state, f.sourceId, { hp: 5 });
    const started = startAsgoreSoulParadeTurn(f.state, f.sourceId);
    const result = respond(started.state, [roll]);
    const b = batch(result.events, result.state);
    const p = plan(b, makePlayerView(f.state, "P1"));
    const o = outputs(p.batch);
    assert.equal(o.sprites.filter((s) => s.effectId === "soulParade").length, 1);
    assert.equal(o.sounds.filter((s) => s.key.endsWith("asgoreSoulParade.reveal")).length, 1);
    assert.equal(o.sprites.filter((s) => s.effectId === "fireball").length, 0);
    if (roll === 0.7)
      assert.equal(
        p.queue.filter((q) => q.type === "healHpTween").length,
        1,
        JSON.stringify(result.events),
      );
    assert.equal(
      outputs({ ...p.batch, events: [...b.events, ...b.events] }).sprites.filter(
        (s) => s.effectId === "soulParade",
      ).length,
      1,
    );
    assert.equal(
      createVisualResolutionState({ batch: b, view: b.view!, enabled: true }).visualBatch,
      null,
    );
  }
});

test("lethal Fireball respects Sans pre-death choice; only final unitDied removes the token", () => {
  const f = fireball(true, true);
  assert.equal(f.defender.state.pendingRoll?.kind, "selectLastAttackTarget");
  assert(!f.events.some((e) => e.type === "unitDied"));
  const early = plan(batch(f.events, f.defender.state), makePlayerView(f.state, "P1"));
  assert.equal(
    outputs(early.batch).sprites.filter((s) => s.effectId === "fireballImpact").length,
    1,
  );
  assert.equal(early.queue.filter((q) => q.type === "damageHpTween").length, 1);
  assert(!early.queue.some((q) => q.type === "death" || q.type === "removeVisualUnit"));
  assert(f.defender.state.units[f.targetId].position);
  const final = applyAction(
    f.defender.state,
    {
      type: "resolvePendingRoll",
      player: "P2",
      pendingRollId: f.defender.state.pendingRoll!.id,
      choice: { type: "sansLastAttackTarget", targetId: f.sourceId },
    },
    makeRngSequence([]),
  );
  assert.equal(final.events.filter((e) => e.type === "unitDied").length, 1);
  const p = plan(batch(final.events, final.state, 2), makePlayerView(f.defender.state, "P1"));
  assert.equal(p.queue.filter((q) => q.type === "death").length, 1);
  assert.equal(p.queue.filter((q) => q.type === "removeVisualUnit").length, 1);
});

test("Asgore preloads only its five used keys; finite travel audio stops at the visual boundary and session reset/mute remain effective", async () => {
  const keys: string[] = [];
  await preloadAsgoreSounds({
    preload: async (key) => {
      keys.push(key);
    },
  });
  assert.equal(keys.length, 5);
  assert(keys.every((key) => key.startsWith("hero.asgore.")));
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  await player.preload("hero.asgore.abilities.asgoreFireball.travel");
  const hit = fireball(true);
  const o = outputs(
    plan(batch(hit.events, hit.defender.state), makePlayerView(hit.state, "P1")).batch,
  );
  const cue = o.sounds.find((s) => s.key.endsWith("asgoreFireball.travel"))!;
  assert.equal(player.play(cue), true);
  assert.deepEqual(f.sources[0].startArgs, [[0, 0, FIREBALL_TIMING.travelMs / 1000]]);
  new SfxPlaybackSession(player).reset();
  assert.equal(f.sources[0].stops, 1);
  player.setMuted(true);
  assert.equal(player.play(cue), false);
  player.setMuted(false);
  player.setVolume(0);
  assert.equal(player.play(cue), false);
});
