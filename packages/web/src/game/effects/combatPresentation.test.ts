import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAction, makePlayerView, projectEventsForRecipient, type PlayerView } from "rules";
import {
  setupSansState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeAttackWinRng,
  resolvePendingRollOnce,
} from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { CombatRollFeedback } from "./CombatRollFeedback";
import { effectsFromEventBatch } from "./eventToEffects";
import { createVisualResolutionState, advanceVisualResolution } from "./visualResolution";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import { PresentationSession } from "./presentationSession";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { cellToBoardPoint } from "../../features/vfx/vfxGeometry";
import { enqueueBoardVfx } from "../../features/vfx/vfxQueue";
import { SfxPlaybackSession } from "../../features/sfx/sfxPlaybackSession";
import type { Translate } from "../../i18n";
import type { BoardEventBatch, PresentationEvent } from "./types";

const cell = { col: 2, row: 3 };
function view(hp = 5): PlayerView {
  return {
    boardSize: 9,
    pendingCombatQueueCount: 0,
    units: {
      attacker: {
        id: "attacker",
        owner: "P1",
        class: "knight",
        hp: 6,
        isAlive: true,
        position: { col: 2, row: 2 },
      },
      target: { id: "target", owner: "P2", class: "spearman", hp, isAlive: true, position: cell },
      other: {
        id: "other",
        owner: "P2",
        class: "spearman",
        hp: 5,
        isAlive: true,
        position: { col: 3, row: 3 },
      },
    },
  } as unknown as PlayerView;
}
function attack(
  id = "hit",
  target = "target",
  hit = true,
  from = 5,
  to = 3,
): Extract<PresentationEvent, { type: "attackResolved" }> {
  return {
    type: "attackResolved",
    eventId: id,
    attackerId: "attacker",
    defenderId: target,
    sourceCell: { col: 2, row: 2 },
    targetCell: cell,
    attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
    defenderRoll: { dice: [2, 1], sum: 3, isDouble: false },
    hit,
    damage: hit ? from - to : 0,
    previousHp: from,
    nextHp: hit ? to : from,
    defenderHpAfter: hit ? to : from,
    maxHp: 5,
  };
}
function roll(
  id: string,
  defense = false,
  dice = [5, 4],
): Extract<PresentationEvent, { type: "rollResolved" }> {
  return {
    type: "rollResolved",
    eventId: id,
    rollId: id,
    rollKind: defense ? "attack_defenderRoll" : "attack_attackerRoll",
    rollerPlayerId: defense ? "P2" : "P1",
    unitId: defense ? "target" : "attacker",
    dice,
    total: dice.reduce((sum, value) => sum + value, 0),
    sides: 6,
    rollIndex: 0,
  };
}
function aoe(
  damageByUnitId = { target: 2, other: 1 },
): Extract<PresentationEvent, { type: "aoeResolved" }> {
  return {
    type: "aoeResolved",
    eventId: "aoe",
    sourceUnitId: "attacker",
    center: cell,
    radius: 1,
    affectedUnitIds: Object.keys(damageByUnitId),
    damagedUnitIds: Object.keys(damageByUnitId),
    revealedUnitIds: [],
    damageByUnitId,
  };
}
function plan(
  events: PresentationEvent[],
  before = view(),
  after = view(3),
  reducedMotion = false,
) {
  return buildCombatVisualPlaybackPlan({
    batch: { streamId: "s", revision: 1, events, view: after },
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
    finalView: after,
    reducedMotion,
  });
}
function outputs(batch: BoardEventBatch, currentView = view()) {
  return {
    sounds: mapEventBatchToSfx({ ...batch, view: currentView }),
    sprites: mapEventBatchToVfx({
      ...batch,
      view: currentView,
      previousPositions: { target: { col: 8, row: 8 } },
    }),
    text: effectsFromEventBatch(
      batch.events,
      { view: currentView, previousPositions: {} },
      batch.eventDelaysMs,
      batch.combatCues,
    ),
  };
}

test("pending/click has no result; actual attacker, defender and each tie-break display once in order", () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(CombatRollFeedback, { cue: null, t: ((key: string) => key) as Translate }),
    ),
    "",
  );
  const p = plan([
    roll("a"),
    roll("d", true, [4, 5]),
    roll("tie-a", false, [6]),
    roll("tie-d", true, [1]),
    attack(),
  ]);
  const cues = p.batch.combatCues!;
  assert.deepEqual(
    cues.map((cue) => cue.kind),
    ["roll", "roll", "roll", "roll", "hit"],
  );
  assert.deepEqual(
    outputs(p.batch).sounds.map((sound) => sound.key),
    [
      "common.combat.diceRoll",
      "common.combat.diceRoll",
      "common.combat.diceRoll",
      "common.combat.diceRoll",
      "common.combat.hit",
    ],
  );
  for (const cue of cues) {
    if (cue.kind !== "roll") continue;
    const frame = combatVisualPlaybackFrame(p, cue.atMs + 1);
    assert.equal(frame.roll?.id, cue.id);
    const markup = renderToStaticMarkup(
      createElement(CombatRollFeedback, {
        cue: frame.roll,
        t: ((key: string) => key) as Translate,
      }),
    );
    assert.equal((markup.match(/data-combat-die=/g) ?? []).length, cue.roll.dice.length);
    for (const value of cue.roll.dice) assert.ok(markup.includes(`data-combat-die="${value}"`));
    assert.ok(markup.includes(`= ${cue.roll.total}`));
  }
  assert.ok(cues.every((cue, index) => index === 0 || cue.atMs > cues[index - 1].atMs));
});

test("movement dice stay out of the combat slice", () => {
  const event = { ...roll("move"), rollKind: "moveBerserker" } as PresentationEvent;
  assert.equal(plan([event]).batch.combatCues!.length, 0);
  assert.equal(mapEventBatchToSfx({ events: [event], view: view(), revision: 1 }).length, 0);
});

test("hit audio/sprite/flash share impact; HP and damage text follow; final death follows HP", () => {
  for (const reduced of [false, true]) {
    const after = view(0);
    after.units.target = { ...after.units.target, isAlive: false, position: null };
    const p = plan(
      [
        attack("lethal", "target", true, 5, 0),
        {
          type: "unitDied",
          eventId: "death",
          unitId: "target",
          killerId: "attacker",
          deathCell: cell,
        },
      ],
      view(),
      after,
      reduced,
    );
    const out = outputs(p.batch, after);
    const hp = p.queue.find((item) => item.type === "damageHpTween")!;
    const death = p.queue.find((item) => item.type === "death")!;
    assert.equal(out.sounds.filter((sound) => sound.key === "common.combat.hit").length, 1);
    assert.equal(out.sprites.filter((sprite) => sprite.effectId === "combatHit").length, 1);
    assert.equal(out.sounds[0].delayMs, out.sprites[0].delayMs);
    assert.ok(out.sounds[0].delayMs! < hp.startsAtMs);
    assert.equal(
      out.text.find((effect) => effect.kind === "unitFlash")!.delayMs,
      out.sprites[0].delayMs,
    );
    assert.equal(
      out.text.find((effect) => effect.kind === "floatingText" && effect.tone === "damage")!
        .delayMs,
      hp.startsAtMs,
    );
    assert.ok(hp.endsAtMs < death.startsAtMs);
    assert.equal(out.sounds[1].delayMs, out.sprites[1].delayMs);
    assert.equal(combatVisualPlaybackFrame(p, hp.startsAtMs - 1).visualHpByUnitId.target, 5);
    assert.equal(combatVisualPlaybackFrame(p, death.startsAtMs).visualHpByUnitId.target, 0);
  }
});

test("miss has one sound/sprite/text and no damage/death; a zero-damage hit is still a hit", () => {
  const p = plan([attack("miss", "target", false)], view(), view());
  const out = outputs(p.batch);
  assert.deepEqual(
    out.sounds.map((sound) => sound.key),
    ["common.combat.miss"],
  );
  assert.deepEqual(
    out.sprites.map((sprite) => sprite.effectId),
    ["combatMiss"],
  );
  assert.equal(
    out.text.filter((effect) => effect.kind === "floatingText" && effect.label === "miss").length,
    1,
  );
  assert.equal(
    p.queue.filter((item) => item.type === "damageHpTween" || item.type === "death").length,
    0,
  );
  const zero = outputs(plan([attack("zero", "target", true, 5, 5)]).batch);
  assert.deepEqual(
    zero.sprites.map((sprite) => sprite.effectId),
    ["combatHit"],
  );
  assert.ok(
    !zero.text.some((effect) => effect.kind === "floatingText" && effect.label === "blocked"),
  );
});

test("healing stages the previous visible HP and increases it once from unitHealed", () => {
  const p = plan(
    [{ type: "unitHealed", eventId: "heal", unitId: "target", amount: 3, hpAfter: 5 }],
    view(2),
    view(5),
  );
  assert.equal(p.batch.combatCues!.filter((cue) => cue.kind === "heal").length, 1);
  const hp = p.queue.find((item) => item.type === "healHpTween")!;
  assert.equal(combatVisualPlaybackFrame(p, hp.startsAtMs - 1).visualHpByUnitId.target, 2);
  const middle = combatVisualPlaybackFrame(p, (hp.startsAtMs + hp.endsAtMs) / 2);
  assert.ok(middle.visualHpByUnitId.target > 2 && middle.visualHpByUnitId.target < 5);
  assert.equal(middle.visualStateByUnitId.target, "healing");
  assert.equal(combatVisualPlaybackFrame(p, hp.endsAtMs).visualHpByUnitId.target, 5);
  assert.deepEqual(plan([], view(5), view(5)).batch.combatCues, []);
});

test("AoE attacks own their outcomes; unmatched direct damage targets still tween exactly once", () => {
  const after = view(3);
  after.units.other = { ...after.units.other, hp: 4 };
  const full = plan([attack("a"), attack("b", "other", true, 5, 4), aoe()], view(), after);
  assert.equal(full.queue.filter((item) => item.type === "damageHpTween").length, 2);
  const out = outputs(full.batch);
  assert.equal(out.sounds.length, 2);
  assert.equal(out.sprites.length, 2);
  assert.equal(
    out.text.filter((effect) => effect.kind === "floatingText" && effect.tone === "damage").length,
    2,
  );
  assert.equal(out.text.filter((effect) => effect.kind === "areaHighlight").length, 1);
  const partial = plan([attack("a"), aoe()], view(), after);
  assert.deepEqual(
    partial.queue
      .filter((item) => item.type === "damageHpTween")
      .map((item) => item.damage.targetUnitId),
    ["target", "other"],
  );
  const direct = plan([aoe()], view(), after);
  assert.equal(direct.queue.filter((item) => item.type === "damageHpTween").length, 2);
  assert.equal(direct.batch.combatCues!.filter((cue) => cue.kind === "damage").length, 2);
  assert.deepEqual(combatVisualPlaybackFrame(direct, direct.queue[0].endsAtMs).visualHpByUnitId, {
    attacker: 6,
    target: 3,
    other: 4,
  });
  assert.deepEqual(combatVisualPlaybackFrame(direct, direct.durationMs).visualHpByUnitId, {
    attacker: 6,
    target: 3,
    other: 4,
  });
});

test("independent AoE uses on the same unit do not suppress legitimate damage", () => {
  const p = plan([
    { ...attack(), abilityUseId: "use-a", chainId: "a" },
    { ...aoe({ target: 1, other: 0 }), abilityUseId: "use-b", chainId: "b" },
  ]);
  assert.equal(p.queue.filter((item) => item.type === "damageHpTween").length, 2);
});

test("early shared attacker and defender dice escape explicit and legacy buffers without replay", () => {
  for (const explicit of [false, true]) {
    const before = view();
    const pending = { ...view(3), pendingCombatQueueCount: 2 };
    let state = createVisualResolutionState({ batch: null, view: before, enabled: true });
    const metadata = explicit
      ? { chainId: "aoe-chain", visualBatchId: "aoe-chain", deferVisuals: true }
      : {};
    const rolls = [roll("shared"), roll("def-1", true), roll("def-2", true), roll("def-3", true)];
    state = advanceVisualResolution(state, {
      batch: {
        streamId: "s",
        revision: 1,
        events: [
          ...rolls.map((event) => ({ ...event, ...metadata })),
          { ...attack(), ...metadata },
        ],
      },
      view: pending,
      enabled: true,
    });
    assert.deepEqual(
      state.visualBatch!.events.map((event) => event.eventId),
      ["shared", "def-1", "def-2", "def-3"],
    );
    const early = buildCombatVisualPlaybackPlan({
      batch: state.visualBatch!,
      startingHpByUnitId: snapshotVisualHp(before),
      startingUnitsByUnitId: snapshotVisualUnits(before),
      finalView: pending,
      reducedMotion: false,
      holdResolvedState: true,
    });
    assert.equal(early.finalHpByUnitId.target, 5, "roll plans cannot commit deferred damage");
    assert.equal(
      outputs(early.batch).sounds.filter((sound) => sound.key === "common.combat.diceRoll").length,
      4,
    );
    state = advanceVisualResolution(state, {
      batch: {
        streamId: "s",
        revision: 2,
        events: explicit
          ? [
              {
                type: "combatVisualBatchReady",
                chainId: "aoe-chain",
                visualBatchId: "aoe-chain",
                isChainComplete: true,
                deferVisuals: false,
              },
            ]
          : [aoe()],
      },
      view: view(3),
      enabled: true,
    });
    assert.ok(state.visualBatch);
    assert.ok(!state.visualBatch.events.some((event) => event.type === "rollResolved"));
    assert.equal(
      outputs(plan(state.visualBatch.events).batch).sounds.filter(
        (sound) => sound.key === "common.combat.diceRoll",
      ).length,
      0,
    );
  }
});

test("missing/redacted combat anchors never consult current or cached positions; public spectator geometry uses Phase 6", () => {
  const p = plan([
    { ...attack(), targetCell: undefined, sourceCell: undefined },
    { type: "unitDied", eventId: "death", unitId: "target", killerId: null },
  ]);
  assert.deepEqual(outputs(p.batch).sprites, []);
  assert.deepEqual(outputs(p.batch).text, []);
  const hp = p.queue.find((item) => item.type === "damageHpTween")!;
  const death = p.queue.find((item) => item.type === "death")!;
  assert.equal(combatVisualPlaybackFrame(p, hp.startsAtMs + 1).visualStateByUnitId.target, "idle");
  assert.equal(
    combatVisualPlaybackFrame(p, death.startsAtMs + 1).visualStateByUnitId.target,
    "idle",
  );
  const publicEffect = outputs(plan([attack()]).batch).sprites[0];
  assert.deepEqual(publicEffect.sourceCell, cell);
  assert.deepEqual(cellToBoardPoint(publicEffect.sourceCell!, 9, 40, false), { x: 100, y: 220 });
  assert.deepEqual(cellToBoardPoint(publicEffect.sourceCell!, 9, 40, true), { x: 260, y: 140 });
});

test("final death fades the render-only token at its authorized event-time cell", () => {
  const deathCell = { col: 7, row: 6 };
  const after = view(0);
  after.units.target = { ...after.units.target, isAlive: false, position: null };
  const p = plan(
    [
      attack("lethal", "target", true, 5, 0),
      {
        type: "unitDied",
        eventId: "death",
        unitId: "target",
        killerId: null,
        deathCell,
      },
    ],
    view(),
    after,
  );
  const death = p.queue.find((item) => item.type === "death")!;
  const frame = combatVisualPlaybackFrame(p, death.startsAtMs + 1);
  assert.deepEqual(frame.visualUnitsByUnitId.target.position, deathCell);
  assert.equal(frame.visualStateByUnitId.target, "dying");
  assert.deepEqual(
    outputs(p.batch, after).sprites.find((sprite) => sprite.effectId === "unitDeath")!.sourceCell,
    deathCell,
  );
});

test("duplicate delivery and reconnect baseline produce no repeated dice/hit/HP/heal/death", () => {
  const session = new PresentationSession();
  const binding = { roomId: "r", recipient: "spectator" };
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "s", revision: 10 });
  const events = [
    roll("a"),
    attack(),
    { type: "unitHealed", eventId: "heal", unitId: "target", amount: 1, hpAfter: 4 },
    { type: "unitDied", eventId: "death", unitId: "target", killerId: null, deathCell: cell },
  ] as PresentationEvent[];
  const delivery = {
    streamId: "s",
    revision: 11,
    events: events as import("rules").DeliveredGameEvent[],
  };
  assert.equal(session.receive(delivery, binding)[0].events.length, 4);
  assert.deepEqual(session.receive(delivery, binding), []);
  assert.equal(session.receive({ ...delivery, revision: 12 }, binding)[0].events.length, 0);
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "s", revision: 12 });
  assert.deepEqual(session.receive(delivery, binding), []);
  assert.equal(
    session.receive(
      {
        streamId: "s",
        revision: 13,
        events: [{ ...attack("new") } as import("rules").DeliveredGameEvent],
      },
      binding,
    )[0].events.length,
    1,
  );
});

test("audio and sprites keep the plan epoch when consumers mount late; reset cancels delayed death", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const p = plan([
    attack(),
    { type: "unitDied", eventId: "death", unitId: "target", killerId: null, deathCell: cell },
  ]);
  const token = { cancelled: false };
  p.batch = { ...p.batch, playbackStartedAt: 1000, presentationToken: token };
  const played: string[] = [];
  const audio = new SfxPlaybackSession({
    play: (cue) => {
      played.push(typeof cue === "object" ? cue.key : "");
      return true;
    },
    stopGameplay: () => {},
    isMuted: () => false,
    getVolume: () => 1,
  });
  t.mock.timers.tick(90);
  audio.schedule(p.batch, view());
  const requests = outputs(p.batch).sprites;
  const queued = enqueueBoardVfx({
    current: [],
    incoming: requests,
    now: p.batch.playbackStartedAt!,
  });
  assert.equal(queued[0].startedAt, 1000 + requests[0].delayMs!);
  t.mock.timers.tick(requests[0].delayMs! - 90);
  assert.deepEqual(played, ["common.combat.hit"]);
  token.cancelled = true;
  t.mock.timers.tick(p.durationMs);
  assert.deepEqual(played, ["common.combat.hit"]);
  audio.reset();
});

test("actual Sans Last Attack remains visible at zero HP until its final projected unitDied", () => {
  const setup = setupSansState();
  const { sans, enemy } = setup;
  let state = setUnit(setup.state, sans.id, {
    hp: 1,
    position: { col: 4, row: 4 },
    sansUnbelieverUnlocked: true,
  });
  state = setUnit(state, enemy.id, { hp: 4, position: { col: 4, row: 5 } });
  state = initKnowledgeForOwners(toBattleState(state, "P2", enemy.id));
  const before = makePlayerView(state, "P1");
  const rng = makeAttackWinRng(1);
  let result = applyAction(
    state,
    { type: "attack", attackerId: enemy.id, defenderId: sans.id },
    rng,
  );
  const events = [...result.events];
  for (let i = 0; i < 10 && result.state.pendingRoll?.kind !== "selectLastAttackTarget"; i++) {
    result = resolvePendingRollOnce(result.state, rng);
    events.push(...result.events);
  }
  assert.equal(result.state.pendingRoll?.kind, "selectLastAttackTarget");
  const pendingView = makePlayerView(result.state, "P1");
  const early = plan(
    projectEventsForRecipient(result.state, events, "P1").map((event, i) => ({
      ...event,
      eventId: `sans-before-${i}`,
    })),
    before,
    pendingView,
  );
  assert.equal(
    early.queue.filter((item) => item.type === "death" || item.type === "removeVisualUnit").length,
    0,
  );
  const frame = combatVisualPlaybackFrame(early, early.durationMs);
  assert.equal(frame.visualHpByUnitId[sans.id], 0);
  assert.ok(frame.visualUnitsByUnitId[sans.id].position);
  assert.ok(
    !outputs(early.batch, pendingView).sounds.some((sound) => sound.key === "common.combat.death"),
  );
  const final = applyAction(
    result.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: result.state.pendingRoll!.id,
      player: "P1",
      choice: { type: "sansLastAttackTarget", targetId: enemy.id },
    },
    rng,
  );
  const after = makePlayerView(final.state, "P1");
  const death = plan(
    projectEventsForRecipient(final.state, final.events, "P1").map((event, i) => ({
      ...event,
      eventId: `sans-final-${i}`,
    })),
    pendingView,
    after,
  );
  assert.equal(death.queue.filter((item) => item.type === "death").length, 1);
  assert.equal(
    outputs(death.batch, after).sounds.filter((sound) => sound.key === "common.combat.death")
      .length,
    1,
  );
  assert.equal(
    outputs(death.batch, after).sprites.filter((sprite) => sprite.effectId === "unitDeath").length,
    1,
  );
  assert.equal(
    combatVisualPlaybackFrame(death, death.durationMs).visualUnitsByUnitId[sans.id].position,
    null,
  );
});
