import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  createEmptyGame,
  attachArmy,
  createDefaultArmy,
  type PlayerView,
  type GameState,
  type ResolveRollChoice,
  type GameEvent,
} from "rules";
import {
  initKnowledgeForOwners,
  setUnit,
  toBattleState,
  makeRngSequence,
  setupHassanState,
} from "../../../../rules/src/tests/helpers/testUtils";
import { requestHassanAssassinOrderSelection } from "../../../../rules/src/actions/heroes/hassan";
import { buildCombatVisualPlaybackPlan } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import {
  REMAINING_CASTS,
  REMAINING_AREAS,
  chargeReadyAbilities,
} from "./remainingHeroPresentation";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { vfxAnchor } from "../../features/vfx/VfxLayer";
import { cellToBoardPoint } from "../../features/vfx/vfxGeometry";
import { PresentationSession } from "./presentationSession";
import { SfxPlaybackSession } from "../../features/sfx/sfxPlaybackSession";
import type { PresentationEvent } from "./types";

const origin = { col: 2, row: 2 },
  center = { col: 3, row: 3 };
const noDice = {
  next(): number {
    throw new Error("Choice or presentation consumed RNG");
  },
};
function view(): PlayerView {
  return {
    boardSize: 9,
    abilitiesByUnitId: {},
    pendingCombatQueueCount: 0,
    units: {
      source: {
        id: "source",
        owner: "P1",
        class: "assassin",
        hp: 6,
        isAlive: true,
        position: origin,
      },
      target: {
        id: "target",
        owner: "P2",
        class: "knight",
        hp: 5,
        isAlive: true,
        position: center,
      },
      other: {
        id: "other",
        owner: "P2",
        class: "knight",
        hp: 5,
        isAlive: true,
        position: { col: 4, row: 3 },
      },
    },
  } as unknown as PlayerView;
}
function outputs(events: PresentationEvent[], currentView = view(), streamId = "phase13") {
  const batch = { events, streamId, revision: 1, view: currentView };
  return {
    sounds: mapEventBatchToSfx(batch),
    sprites: mapEventBatchToVfx({ ...batch, previousPositions: {} }),
  };
}
function delivered(events: ReturnType<typeof projectEventsForRecipient>): PresentationEvent[] {
  return events.map((event, index) => ({ ...event, eventId: `e-${index}` }));
}
function plan(
  events: PresentationEvent[],
  before: PlayerView,
  after: PlayerView,
  reducedMotion = false,
) {
  return buildCombatVisualPlaybackPlan({
    batch: { streamId: "phase13", revision: 1, events, view: after },
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
    finalView: after,
    reducedMotion,
  });
}
function resolve(state: GameState, choice?: ResolveRollChoice, rng = noDice) {
  assert.ok(state.pendingRoll);
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll.id,
      player: state.pendingRoll.player,
      ...(choice !== undefined ? { choice } : {}),
    },
    rng,
  );
}

test("every new cast freezes the authorized commit cell, not the later unit position", () => {
  for (const [abilityId, signature] of Object.entries(REMAINING_CASTS)) {
    const cast: PresentationEvent = {
      type: "abilityUsed",
      eventId: abilityId,
      unitId: "source",
      abilityId,
      abilityUseId: `use-${abilityId}`,
      sourceCell: origin,
    };
    const movedView = view();
    movedView.units.source.position = { col: 8, row: 8 };
    const mapped = outputs([cast], movedView);
    assert.equal(mapped.sprites.length, 1, abilityId);
    assert.equal(mapped.sprites[0].effectId, signature.vfx);
    assert.deepEqual(mapped.sprites[0].sourceCell, origin);
    assert.equal(mapped.sounds.length, signature.sfx ? 1 : 0, abilityId);
    const redacted = outputs([{ ...cast, sourceCell: undefined }], movedView);
    assert.equal(redacted.sprites.length, 0, `No guessed source: ${abilityId}`);
  }
});

test("all new areas play once per use; sparse footprints never become a bounding-square hit", () => {
  for (const [abilityId, signature] of Object.entries(REMAINING_AREAS)) {
    const event: PresentationEvent = {
      type: "aoeResolved",
      eventId: abilityId,
      sourceUnitId: "source",
      abilityId,
      abilityUseId: `use-${abilityId}`,
      sourceCell: origin,
      center,
      radius: 1,
      affectedUnitIds: ["target"],
      damagedUnitIds: [],
      revealedUnitIds: [],
      damageByUnitId: {},
    };
    const result = outputs([event, { ...event, eventId: `${abilityId}-repeat` }]);
    assert.equal(result.sprites.length, 1, abilityId);
    assert.equal(result.sounds.length, signature.sfx ? 1 : 0, abilityId);
    assert.equal(result.sprites[0].placement, signature.square ? "area" : "cell");
    if (!signature.square) assert.equal(result.sprites[0].cells, undefined);
    const missing = outputs([
      { ...event, sourceCell: undefined, center: undefined } as unknown as PresentationEvent,
    ]);
    assert.equal(missing.sprites.length, 0, abilityId);
    assert.equal(
      outputs([event, { ...event, eventId: "second", abilityUseId: "another-use" }]).sprites.length,
      2,
    );
  }
});

test("Hassan selects exactly two privately; invalid choices and pending UI are silent", () => {
  const f = setupHassanState();
  let positioned = toBattleState(
    setUnit(f.state, f.hassan.id, { position: origin }),
    "P1",
    f.hassan.id,
  );
  for (const [i, unit] of Object.values(positioned.units)
    .filter((u) => u.owner === "P1" && u.id !== f.hassan.id)
    .entries())
    positioned = setUnit(positioned, unit.id, { position: { col: i, row: 0 } });
  const state = requestHassanAssassinOrderSelection(positioned, "P1").state;
  const candidates = makePlayerView(state, "P1").pendingRoll!.context.eligibleUnitIds as string[];
  assert.ok(candidates.length >= 2);
  for (const ids of [[candidates[0]], [candidates[0], candidates[0]], candidates.slice(0, 3)]) {
    const rejected = resolve(state, { type: "hassanAssassinOrderPick", unitIds: ids });
    assert.equal(rejected.events.filter((e) => e.type === "abilityUsed").length, 0);
    assert.equal(rejected.state.pendingRoll?.id, state.pendingRoll?.id);
  }
  const committed = resolve(state, {
    type: "hassanAssassinOrderPick",
    unitIds: candidates.slice(0, 2),
  });
  assert.equal(committed.events.filter((e) => e.type === "abilityUsed").length, 1);
  assert.equal(
    outputs(
      delivered(projectEventsForRecipient(committed.state, committed.events, "P1")),
      makePlayerView(committed.state, "P1"),
    ).sounds.length,
    1,
  );
  for (const recipient of ["P2", "spectator"] as const) {
    const pendingView = recipient === "P2" ? makePlayerView(state, "P2") : makeSpectatorView(state);
    assert.equal(pendingView.pendingRoll, null);
    const serialized = JSON.stringify(pendingView.pendingDecision);
    for (const id of candidates) assert.ok(!serialized?.includes(id));
    for (const field of ["eligibleUnitIds", "selectedIds", "selectedCount", "candidateCells"])
      assert.ok(!serialized?.includes(field));
    const events = delivered(
      projectEventsForRecipient(committed.state, committed.events, recipient),
    );
    assert.ok(!events.some((e) => e.type === "abilityUsed"));
    const recipientView =
      recipient === "P2"
        ? makePlayerView(committed.state, "P2")
        : makeSpectatorView(committed.state);
    const result = outputs(events, recipientView);
    assert.equal(result.sounds.length, 0);
    assert.equal(result.sprites.length, 0);
    assert.ok(!JSON.stringify(recipientView).includes("stealthSuccessMinRoll"));
  }
});

test("actual sixth-snare Covering Tracks direct damage precedes final death and remains once", () => {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: "jackRipper" })),
    createDefaultArmy("P2"),
  );
  const jack = Object.values(state.units).find((u) => u.heroId === "jackRipper")!;
  const targets = Object.values(state.units)
    .filter((u) => u.owner === "P2")
    .slice(0, 2);
  for (const unit of Object.values(state.units))
    state = setUnit(state, unit.id, { position: null });
  state = setUnit(state, jack.id, { position: { col: 8, row: 8 } });
  targets.forEach((unit, i) => {
    state = setUnit(state, unit.id, { position: { col: 1 + i, row: 1 }, hp: i === 0 ? 1 : 5 });
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", jack.id));
  state = {
    ...state,
    jackTrapCounter: 5,
    jackTraps: [1, 3, 4, 5, 6].map((i, index) => ({
      id: `SECRET-${index}`,
      owner: "P1",
      sourceUnitId: jack.id,
      position: { col: i, row: i },
      isRevealed: false,
      triggeredTargetIds: [],
    })),
    pendingRoll: {
      id: "place-six",
      kind: "chargedImpulseTargetChoice",
      player: "P1",
      context: {
        unitId: jack.id,
        abilityId: "jackRipperSnares",
        options: [{ col: 0, row: 8 }],
      },
    },
  };
  const requested = resolve(state, { type: "chargedImpulseTarget", position: { col: 0, row: 8 } });
  const before = makePlayerView(requested.state, "P1");
  const result = resolve(
    requested.state,
    { type: "chargedImpulseTarget", position: { col: 1, row: 1 } },
    makeRngSequence([0, 0]),
  );
  assert.equal(
    result.events.some((e) => e.type === "attackResolved"),
    false,
  );
  const after = makePlayerView(result.state, "P1");
  const events = delivered(projectEventsForRecipient(result.state, result.events, "P1"));
  for (const reduced of [false, true]) {
    const playback = plan(events, before, after, reduced);
    const cues = playback.batch.combatCues!;
    for (const target of targets)
      assert.equal(cues.filter((c) => c.kind === "damage" && c.unitId === target.id).length, 1);
    const hit = cues.find((c) => c.kind === "damage" && c.unitId === targets[0].id)!;
    const death = cues.find((c) => c.kind === "death" && c.unitId === targets[0].id)!;
    assert.ok(death.atMs > hit.atMs, JSON.stringify({ events, cues }));
    assert.equal(cues.filter((c) => c.kind === "death").length, 1);
    assert.equal(
      mapEventBatchToVfx({ ...playback.batch, view: after, previousPositions: {} }).filter(
        (c) => c.effectId === "jackCoverTracks",
      ).length,
      1,
    );
    const sounds = mapEventBatchToSfx({ ...playback.batch, view: after });
    assert.equal(sounds.filter((c) => c.key === "common.combat.hit").length, 2);
    assert.equal(sounds.filter((c) => c.key === "common.combat.death").length, 1);
  }
  for (const recipient of ["P2", "spectator"] as const) {
    const recipientView =
      recipient === "P2" ? makePlayerView(result.state, "P2") : makeSpectatorView(result.state);
    const serialized = JSON.stringify({
      view: recipientView,
      events: projectEventsForRecipient(result.state, result.events, recipient),
    });
    assert.ok(!serialized.includes("SECRET-"));
    assert.deepEqual(recipientView.jackTraps, []);
    assert.ok(!serialized.includes('"col":0,"row":8'));
  }
});

test("Jack placement stays private; reached snare trigger immobilizes without invented damage", () => {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: "jackRipper" })),
    createDefaultArmy("P2"),
  );
  const jack = Object.values(state.units).find((u) => u.heroId === "jackRipper")!;
  const target = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "knight")!;
  state = setUnit(state, jack.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, target.id, { position: { col: 1, row: 0 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", jack.id));
  state = {
    ...state,
    jackTraps: [
      {
        id: "STILL_SECRET",
        owner: "P1",
        sourceUnitId: jack.id,
        position: { col: 7, row: 7 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
    pendingRoll: {
      id: "place",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: jack.id,
        abilityId: "jackRipperSnares",
        options: [{ col: 1, row: 1 }],
      },
    },
  };
  const placed = resolve(state, { type: "chargedImpulseTarget", position: { col: 1, row: 1 } });
  const ownerView = makePlayerView(placed.state, "P1");
  const ownerPlan = plan(
    delivered(projectEventsForRecipient(placed.state, placed.events, "P1")),
    makePlayerView(state, "P1"),
    ownerView,
  );
  const ownerOutput = {
    sprites: mapEventBatchToVfx({ ...ownerPlan.batch, view: ownerView, previousPositions: {} }),
    sounds: mapEventBatchToSfx({ ...ownerPlan.batch, view: ownerView }),
  };
  assert.equal(ownerOutput.sprites.filter((s) => s.effectId === "snarePlace").length, 1);
  assert.equal(
    ownerOutput.sounds.filter((s) => s.key === "hero.jackRipper.abilities.jackRipperSnares.place")
      .length,
    1,
  );
  for (const recipient of ["P2", "spectator"] as const) {
    const recipientView =
      recipient === "P2" ? makePlayerView(placed.state, "P2") : makeSpectatorView(placed.state);
    const events = delivered(projectEventsForRecipient(placed.state, placed.events, recipient));
    assert.equal(
      events.some((e) => e.type === "snarePlaced"),
      false,
    );
    assert.deepEqual(outputs(events, recipientView).sounds, []);
    assert.deepEqual(outputs(events, recipientView).sprites, []);
    assert.ok(!JSON.stringify(recipientView).includes("STILL_SECRET"));
  }
  const moving = toBattleState(placed.state, "P2", target.id);
  const before = makePlayerView(moving, "P2");
  const triggered = applyAction(
    moving,
    { type: "move", unitId: target.id, to: { col: 1, row: 1 } },
    noDice,
  );
  assert.equal(triggered.state.units[target.id].hp, moving.units[target.id].hp);
  assert.ok(triggered.state.units[target.id].immobilizedUntilOwnTurnStart);
  const after = makePlayerView(triggered.state, "P2");
  const playback = plan(
    delivered(projectEventsForRecipient(triggered.state, triggered.events, "P2")),
    before,
    after,
  );
  const sprites = mapEventBatchToVfx({ ...playback.batch, view: after, previousPositions: {} });
  assert.equal(sprites.filter((s) => s.effectId === "snareTrigger").length, 1);
  const arrival = playback.batch.movementCues?.find((c) => c.kind === "movement");
  assert.ok(arrival);
  assert.ok(
    (sprites.find((s) => s.effectId === "snareTrigger")?.delayMs ?? 0) >=
      arrival.atMs + arrival.durationMs,
  );
  assert.equal(playback.batch.combatCues?.filter((c) => c.kind === "damage").length, 0);
  assert.deepEqual(after.jackTraps, []);
  assert.ok(
    !JSON.stringify({ view: after, events: playback.batch.events }).includes("STILL_SECRET"),
  );
});

test("actual Chikatilo mark has one owner target cue and no opponent/spectator signature", () => {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: "chikatilo" })),
    createDefaultArmy("P2"),
  );
  const source = Object.values(state.units).find((u) => u.heroId === "chikatilo")!;
  const target = Object.values(state.units).find((u) => u.owner === "P2" && u.class === "knight")!;
  state = setUnit(state, source.id, { position: origin });
  state = setUnit(state, target.id, { position: center });
  state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
  const marked = applyAction(
    state,
    {
      type: "useAbility",
      unitId: source.id,
      abilityId: "chikatiloAssassinMark",
      payload: { targetId: target.id },
    },
    noDice,
  );
  assert.ok(marked.events.some((e) => e.type === "chikatiloMarkApplied"));
  const owner = outputs(
    delivered(projectEventsForRecipient(marked.state, marked.events, "P1")),
    makePlayerView(marked.state, "P1"),
  );
  assert.equal(owner.sprites.length, 1);
  assert.equal(owner.sprites[0].unitId, target.id);
  assert.equal(owner.sounds.length, 1);
  for (const recipient of ["P2", "spectator"] as const) {
    const recipientView =
      recipient === "P2" ? makePlayerView(marked.state, "P2") : makeSpectatorView(marked.state);
    const events = delivered(projectEventsForRecipient(marked.state, marked.events, recipient));
    assert.ok(!events.some((e) => e.type === "abilityUsed" || e.type === "chikatiloMarkApplied"));
    assert.deepEqual(outputs(events, recipientView).sounds, []);
    assert.deepEqual(outputs(events, recipientView).sprites, []);
    assert.ok(!JSON.stringify(recipientView).includes("chikatiloMarkStatus"));
  }
});

test("Papyrus bones, Lechy storm and transformations use semantic results; hidden status anchors disappear", () => {
  const events: PresentationEvent[] = [
    {
      type: "papyrusBoneApplied",
      eventId: "blue",
      papyrusId: "source",
      targetId: "target",
      boneType: "blue",
      expiresOnSourceOwnTurn: 2,
    },
    {
      type: "papyrusBoneApplied",
      eventId: "orange",
      papyrusId: "source",
      targetId: "other",
      boneType: "orange",
      expiresOnSourceOwnTurn: 2,
    },
    {
      type: "lechyStormStarted",
      eventId: "storm",
      sourceUnitId: "source",
      duration: 2,
      durationUnit: "turn",
      roll: 2,
    },
    {
      type: "unitTransformed",
      eventId: "neo",
      unitId: "source",
      fromHeroId: "mettaton",
      toHeroId: "mettaton",
      toFormId: "mettatonNeo",
      reason: "mettatonThreshold",
    },
  ];
  const result = outputs(events);
  assert.equal(result.sprites.filter((s) => s.effectId === "papyrusBones").length, 2);
  assert.equal(result.sprites.filter((s) => s.effectId === "lechyStorm").length, 1);
  assert.equal(result.sprites.filter((s) => s.effectId === "mettatonNeo").length, 1);
  assert.equal(result.sprites.filter((s) => s.effectId === "mettatonEx").length, 0);
  const hidden = view();
  hidden.units.target.position = null;
  assert.equal(outputs([events[0]], hidden).sprites.length, 0);
  assert.equal(outputs(events).sounds.filter((s) => s.key.startsWith("hero.papyrus")).length, 2);
});

test("confirmed hit accent is once per use, synchronized with generic hits; misses never get it", () => {
  const attack = (eventId: string, abilityUseId: string, hit = true): PresentationEvent => ({
    type: "attackResolved",
    eventId,
    abilityUseId,
    abilityId: "gutsCannon",
    attackerId: "source",
    defenderId: "target",
    sourceCell: origin,
    targetCell: center,
    attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
    defenderRoll: { dice: [2, 1], sum: 3, isDouble: false },
    hit,
    damage: hit ? 1 : 0,
    previousHp: 5,
    nextHp: hit ? 4 : 5,
    defenderHpAfter: hit ? 4 : 5,
    maxHp: 5,
  });
  const current = view();
  const events = [
    attack("a", "use1"),
    attack("b", "use1"),
    attack("c", "use2"),
    attack("miss", "use3", false),
  ];
  const playback = plan(events, current, current);
  const sprites = mapEventBatchToVfx({ ...playback.batch, view: current, previousPositions: {} });
  const accents = sprites.filter((s) => s.effectId === "gutsCannon");
  assert.equal(accents.length, 2);
  assert.equal(sprites.filter((s) => s.effectId === "combatHit").length, 3);
  assert.equal(sprites.filter((s) => s.effectId === "combatMiss").length, 1);
  for (const accent of accents)
    assert.ok(
      playback.batch.combatCues?.some((c) => c.kind === "hit" && c.atMs === accent.delayMs),
    );
});

test("Genghis processes independent Attack/Pass/Attack through manual combat and reached Rider steps", () => {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { rider: "genghisKhan" })),
    createDefaultArmy("P2"),
  );
  const genghis = Object.values(state.units).find((u) => u.heroId === "genghisKhan")!;
  const allies = ["knight", "berserker", "assassin"].map(
    (cls) => Object.values(state.units).find((u) => u.owner === "P1" && u.class === cls)!,
  );
  const targets = Object.values(state.units)
    .filter((u) => u.owner === "P2")
    .slice(0, 3);
  for (const unit of Object.values(state.units))
    state = setUnit(state, unit.id, { position: null });
  state = setUnit(state, genghis.id, {
    position: { col: 0, row: 1 },
    charges: { ...genghis.charges, genghisKhanMongolCharge: 4 },
  });
  allies.forEach((unit, i) => {
    state = setUnit(state, unit.id, { position: { col: 1 + i * 2, row: 0 } });
  });
  targets.forEach((unit, i) => {
    state = setUnit(state, unit.id, { class: "knight", position: { col: i * 2, row: 0 }, hp: 30 });
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", genghis.id));
  const slots = allies.map((u) => ({ ...state.units[u.id].turn }));
  const activated = applyAction(
    state,
    { type: "useAbility", unitId: genghis.id, abilityId: "genghisKhanMongolCharge" },
    noDice,
  );
  assert.equal(
    outputs(
      delivered(projectEventsForRecipient(activated.state, activated.events, "P1")),
      makePlayerView(activated.state, "P1"),
    ).sounds.length,
    1,
  );
  let result = applyAction(
    activated.state,
    { type: "move", unitId: genghis.id, to: { col: 5, row: 1 } },
    noDice,
  );
  const actors: string[] = [],
    events: GameEvent[] = [...result.events];
  while (result.state.pendingRoll?.kind === "reactionChoice") {
    const actor = result.state.pendingRoll.context.reactorUnitId as string;
    actors.push(actor);
    const choice: ResolveRollChoice =
      actors.length === 2
        ? { type: "resolveReactionChoice", choice: "pass" }
        : {
            type: "resolveReactionChoice",
            choice: "attack",
            targetId: String((result.state.pendingRoll.context.options as string[])[0]),
          };
    result = resolve(result.state, choice);
    events.push(...result.events);
    if (actors.length === 2)
      assert.ok(
        !result.events.some((e) => e.type === "attackResolved" || e.type === "rollResolved"),
      );
    else {
      assert.equal(result.state.pendingRoll?.kind, "attack_attackerRoll");
      result = resolve(result.state, undefined, makeRngSequence([0.99, 0.8]));
      events.push(...result.events);
      assert.equal(result.state.pendingRoll?.kind, "attack_defenderRoll");
      result = resolve(result.state, undefined, makeRngSequence([0, 0.2]));
      events.push(...result.events);
    }
    assert.ok(actors.length <= 3);
  }
  assert.equal(actors.length, 3);
  assert.equal(new Set(actors).size, 3);
  assert.deepEqual(new Set(actors), new Set(allies.map((u) => u.id)));
  assert.equal(events.filter((e) => e.type === "attackResolved").length, 2);
  allies.forEach((unit, i) => assert.deepEqual(result.state.units[unit.id].turn, slots[i]));
  assert.deepEqual(result.state.units[genghis.id].position, { col: 5, row: 1 });
  const moved = events.filter((e) => e.type === "unitMoved");
  assert.ok(moved.length > 1);
  assert.ok(moved.every((e) => e.provenance.kind === "rider"));
});

test("readiness uses actual charge threshold crossings; successful stealth only", () => {
  const current = view();
  current.abilitiesByUnitId.source = [
    { id: "genghisKhanMongolCharge", kind: "phantasm", chargeRequired: 4 },
    { id: "passiveCounter", kind: "passive", chargeRequired: 4 },
  ] as PlayerView["abilitiesByUnitId"][string];
  const event: PresentationEvent = {
    type: "chargesUpdated",
    eventId: "ready",
    unitId: "source",
    now: { genghisKhanMongolCharge: 4, passiveCounter: 4 },
    deltas: { genghisKhanMongolCharge: 1, passiveCounter: 1 },
  };
  assert.deepEqual(chargeReadyAbilities(event, current), ["genghisKhanMongolCharge"]);
  assert.equal(outputs([event], current).sounds.length, 1);
  assert.deepEqual(
    chargeReadyAbilities({ ...event, deltas: { genghisKhanMongolCharge: 0 } }, current),
    [],
  );
  assert.deepEqual(
    outputs([{ type: "stealthEntered", eventId: "failed", unitId: "source", success: false }])
      .sounds,
    [],
  );
  assert.deepEqual(
    outputs([{ type: "stealthEntered", eventId: "failed", unitId: "source", success: false }])
      .sprites,
    [],
  );
});

test("owner mark cue is cancelled when authorization or session changes; hydration/delivery do not replay", async () => {
  const current = view();
  const event: PresentationEvent & { eventId: string } = {
    type: "chikatiloMarkApplied",
    eventId: "mark",
    targetId: "target",
    ownerPlayerId: "P1",
    chikatiloId: "source",
    trackingStarts: "startOfChikatiloTurn",
    trackingExpires: "afterMarkedUnitTurn",
  };
  const session = new PresentationSession(),
    binding = { roomId: "room", recipient: "P1" };
  session.begin(binding);
  assert.deepEqual(
    session.snapshot({ ...binding, streamId: "phase13", revision: 0, view: current }),
    [],
  );
  const [batch] = session.receive(
    { streamId: "phase13", revision: 1, events: [event] },
    binding,
    current,
  );
  assert.ok(batch);
  assert.ok(
    session
      .receive({ streamId: "phase13", revision: 2, events: [event] }, binding, current)
      .every((b) => b.events.length === 0),
  );
  const played: string[] = [];
  const audio = new SfxPlaybackSession({
    play: (cue) => {
      if (cue && typeof cue !== "string") played.push(cue.key);
      return true;
    },
    stopGameplay: () => {},
    isMuted: () => false,
    getVolume: () => 1,
  });
  audio.schedule({ ...batch, playbackStartedAt: Date.now(), eventDelaysMs: [35] }, current);
  const hidden = view();
  hidden.units.target.position = null;
  audio.updateView(hidden);
  const sprite = outputs([event], current).sprites[0];
  assert.equal(
    vfxAnchor(hidden, { ...sprite, startedAt: Date.now() } as Parameters<typeof vfxAnchor>[1]),
    null,
  );
  await new Promise((resolve) => setTimeout(resolve, 65));
  assert.deepEqual(played, []);
  audio.schedule(
    {
      ...batch,
      events: [{ ...event, eventId: "mark2" }],
      playbackStartedAt: Date.now(),
      eventDelaysMs: [35],
    },
    current,
  );
  session.begin({ roomId: "other", recipient: "spectator" });
  await new Promise((resolve) => setTimeout(resolve, 65));
  assert.deepEqual(played, []);
  audio.reset();
  assert.equal(cellToBoardPoint(center, 9, 1, false).x + cellToBoardPoint(center, 9, 1, true).x, 9);
});
