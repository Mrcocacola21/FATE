import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  projectEventsForRecipient,
  type GameState,
  type PlayerView,
} from "rules";
import {
  initKnowledgeForOwners,
  makeRngSequence,
  setUnit,
  toBattleState,
} from "../../../../rules/src/tests/helpers/testUtils";
import { GameShellPendingRoll } from "../gameshell-content/components/GameShellPendingRoll";
import { gameShellFixture } from "../testHelpers/gameShellFixture";
import { setLanguage } from "../../i18n";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { sfxPlayer } from "../../features/sfx/sfxPlayer";
import { useBoardSfx } from "../../features/sfx/useBoardSfx";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { enqueueBoardVfx, rememberProcessedVfxRequests } from "../../features/vfx/vfxQueue";
import { useBoardVfx } from "../../features/vfx/useBoardVfx";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { effectsFromEventBatch } from "./eventToEffects";
import { PresentationSession } from "./presentationSession";
import { useBoardEffects } from "./useBoardEffects";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";

const chargeId = "berserkAutoDefense";
const noDice = {
  next(): number {
    throw new Error("Only the manual Roll may consume RNG");
  },
};
const binding = { roomId: "berserker-defense", recipient: "P2" };
const streamId = "defense-stream";

function resolve(state: GameState, choice?: "auto" | "roll", dice?: number[]) {
  assert.ok(state.pendingRoll);
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: state.pendingRoll.id,
      player: state.pendingRoll.player,
      ...(choice ? { choice } : {}),
    },
    dice ? makeRngSequence(dice) : noDice,
  );
}

function fixture(heroId = "grozny", hp = 8) {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1")),
    createDefaultArmy("P2"),
  );
  const attacker = Object.values(state.units).find(
    (u) => u.owner === "P1" && u.class === "knight",
  )!;
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "berserker",
  )!;
  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, {
    heroId,
    hp,
    position: { col: 5, row: 4 },
    charges: { [chargeId]: 6 },
  });
  state = initKnowledgeForOwners(toBattleState(state, "P1", attacker.id));
  const declared = applyAction(
    state,
    { type: "attack", attackerId: attacker.id, defenderId: defender.id },
    noDice,
  );
  assert.equal(declared.state.pendingRoll?.kind, "attack_attackerRoll");
  const attacked = resolve(declared.state, undefined, [0.5, 0.7]); // 4 + 5, no doubles.
  assert.equal(attacked.state.pendingRoll?.kind, "berserkerDefenseChoice");
  return { state: attacked.state, defenderId: defender.id };
}

function presentation(before: GameState, result: ReturnType<typeof applyAction>, revision = 1) {
  const view = makePlayerView(result.state, "P2");
  const events = projectEventsForRecipient(result.state, result.events, "P2").map(
    (event, index) => ({ ...event, eventId: `${revision}:${index}` }),
  );
  const beforeView = makePlayerView(before, "P2");
  const plan = buildCombatVisualPlaybackPlan({
    batch: { streamId, revision, events, view },
    startingHpByUnitId: snapshotVisualHp(beforeView),
    startingUnitsByUnitId: snapshotVisualUnits(beforeView),
    finalView: view,
    reducedMotion: false,
  });
  return { view, events, plan, batch: plan.batch };
}

function outputs(p: ReturnType<typeof presentation>) {
  return {
    sprites: mapEventBatchToVfx({ ...p.batch, view: p.view, previousPositions: {} }),
    sounds: mapEventBatchToSfx({ ...p.batch, view: p.view }),
    effects: effectsFromEventBatch(
      p.batch.events,
      { view: p.view, previousPositions: {} },
      p.batch.eventDelaysMs,
      p.batch.combatCues,
    ),
  };
}

function assertPending(
  before: GameState,
  result: ReturnType<typeof applyAction>,
  defenderId: string,
) {
  assert.equal(result.state.pendingRoll?.kind, "attack_defenderRoll");
  assert.notEqual(result.state.pendingRoll.id, before.pendingRoll!.id);
  assert.equal(result.state.units[defenderId].charges[chargeId], 6);
  assert.equal(result.state.units[defenderId].hp, before.units[defenderId].hp);
  assert.ok(!result.events.some((e) => e.type === "rollResolved" || e.type === "attackResolved"));
  const p = presentation(before, result);
  assert.deepEqual(p.batch.combatCues, []);
  const mapped = outputs(p);
  assert.deepEqual(mapped.sprites, []);
  assert.deepEqual(mapped.sounds, []);
  assert.ok(
    !mapped.effects.some(
      (e) =>
        (e.kind === "unitFlash" && e.tone === "defend") ||
        (e.kind === "floatingText" && e.tone === "miss"),
    ),
  );
  // Also cover the mappers without a precomputed combat timeline.
  assert.deepEqual(
    mapEventBatchToVfx({ events: p.events, view: p.view, previousPositions: {}, revision: 1 }),
    [],
  );
  assert.ok(
    !effectsFromEventBatch(p.events, { view: p.view, previousPositions: {} }).some(
      (e) =>
        (e.kind === "unitFlash" && e.tone === "defend") ||
        (e.kind === "floatingText" && e.tone === "miss"),
    ),
  );
  return p;
}

for (const heroId of ["grozny", "guts", "undyne"]) {
  test(`${heroId}: normal choice creates a silent manual defender roll without spending charges`, () => {
    const f = fixture(heroId);
    assertPending(f.state, resolve(f.state, "roll"), f.defenderId);
  });

  for (const hit of [false, true]) {
    test(`${heroId}: normal ${hit ? "failed" : "successful"} defense presents only after authoritative Roll`, () => {
      const f = fixture(heroId);
      const chosen = resolve(f.state, "roll");
      assertPending(f.state, chosen, f.defenderId);
      const rolled = resolve(chosen.state, undefined, hit ? [0.1, 0.2] : [0.8, 0.95]);
      const outcome = rolled.events.find((e) => e.type === "attackResolved");
      assert.ok(outcome?.type === "attackResolved");
      assert.equal(outcome.hit, hit);
      assert.equal(rolled.state.units[f.defenderId].charges[chargeId], 6);
      assert.equal(
        rolled.state.units[f.defenderId].hp,
        chosen.state.units[f.defenderId].hp - outcome.damage,
      );
      const p = presentation(chosen.state, rolled, 2);
      const mapped = outputs(p);
      assert.equal(mapped.sprites.filter((e) => e.effectId === "shield").length, 0);
      assert.equal(
        mapped.sprites.filter((e) => e.effectId === (hit ? "combatHit" : "combatMiss")).length,
        1,
      );
      assert.equal(
        mapped.effects.filter((e) => e.kind === "unitFlash" && e.tone === "defend").length,
        hit ? 0 : 1,
      );
      const soundKey = hit ? "common.combat.hit" : "common.combat.miss";
      assert.equal(mapped.sounds.filter((e) => e.key === soundKey).length, 1);
      const rollCue = p.batch.combatCues!.find((e) => e.kind === "roll")!;
      const cue = p.batch.combatCues!.find((e) => e.kind === (hit ? "hit" : "miss"))!;
      assert.ok(cue.atMs >= rollCue.atMs + rollCue.durationMs);
      assert.equal(
        mapped.sprites.find((e) => e.effectId === (hit ? "combatHit" : "combatMiss"))!.delayMs,
        cue.atMs,
      );
      assert.equal(mapped.sounds.find((e) => e.key === soundKey)!.delayMs, cue.atMs);
    });
  }

  test(`${heroId}: accepted automatic defense spends six charges and produces one shield and outcome sound`, () => {
    const f = fixture(heroId);
    const auto = resolve(f.state, "auto");
    assert.equal(auto.state.units[f.defenderId].charges[chargeId], 0);
    assert.equal(auto.state.units[f.defenderId].hp, f.state.units[f.defenderId].hp);
    assert.ok(!auto.state.pendingRoll?.kind.endsWith("defenderRoll"));
    assert.ok(!auto.events.some((e) => e.type === "rollResolved"));
    const p = presentation(f.state, auto);
    const mapped = outputs(p);
    assert.equal(mapped.sprites.filter((e) => e.effectId === "shield").length, 1);
    assert.deepEqual(
      mapped.sounds.map((e) => e.key),
      ["common.combat.miss"],
    );
    assert.equal(
      mapped.effects.filter((e) => e.kind === "unitFlash" && e.tone === "defend").length,
      1,
    );
    assert.equal(
      mapped.effects.filter((e) => e.kind === "floatingText" && e.tone === "miss").length,
      1,
    );
  });
}

test("insufficient charges prevent special defense and preserve a silent manual roll", () => {
  const f = fixture();
  const state = setUnit(f.state, f.defenderId, { charges: { [chargeId]: 5 } });
  // Existing rules downgrade a now-unavailable auto choice to normal dice.
  const result = resolve(state, "auto");
  assert.equal(result.state.pendingRoll?.kind, "attack_defenderRoll");
  assert.equal(result.state.units[f.defenderId].charges[chargeId], 5);
  assert.ok(!result.events.some((e) => e.type === "abilityUsed" || e.type === "attackResolved"));
  const mapped = outputs(presentation(state, result));
  assert.deepEqual(mapped.sprites, []);
  assert.deepEqual(mapped.sounds, []);
  assert.ok(!mapped.effects.some((e) => e.kind === "unitFlash" && e.tone === "defend"));
});

test("rejected wrong-player special defense emits no shield or sound", () => {
  const f = fixture();
  const result = applyAction(
    f.state,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: f.state.pendingRoll!.id,
      choice: "auto",
    },
    noDice,
  );
  assert.equal(result.state, f.state);
  assert.deepEqual(result.events, []);
  assert.deepEqual(outputs(presentation(f.state, result)), {
    sprites: [],
    sounds: [],
    effects: [],
  });
});

test("duplicate delivery is silent; separate confirmed defenses each retain their own cue", () => {
  const f = fixture();
  const p = presentation(f.state, resolve(f.state, "auto"));
  const session = new PresentationSession();
  session.begin(binding);
  session.snapshot({ ...binding, streamId, revision: 0, view: makePlayerView(f.state, "P2") });
  const receive = (revision: number, events = p.events) => {
    const mapped = session
      .receive({ streamId, revision, events }, binding, p.view)
      .map((batch) => outputs({ ...p, batch }));
    return {
      sprites: mapped.flatMap((output) => output.sprites),
      sounds: mapped.flatMap((output) => output.sounds),
    };
  };
  const first = receive(1);
  assert.equal(first.sprites.filter((e) => e.effectId === "shield").length, 1);
  assert.deepEqual(
    first.sounds.map((e) => e.key),
    ["common.combat.miss"],
  );
  assert.deepEqual(receive(1), { sprites: [], sounds: [] });
  assert.deepEqual(receive(2), { sprites: [], sounds: [] });
  const secondFixture = fixture();
  const second = presentation(secondFixture.state, resolve(secondFixture.state, "auto"), 3);
  const next = receive(3, second.events);
  assert.equal(next.sprites.filter((e) => e.effectId === "shield").length, 1);
  assert.deepEqual(
    next.sounds.map((e) => e.key),
    ["common.combat.miss"],
  );
  assert.notEqual(first.sounds[0].id, next.sounds[0].id);
  const processedIds = new Set<string>();
  const queued = enqueueBoardVfx({ current: [], incoming: first.sprites, now: 1000, processedIds });
  rememberProcessedVfxRequests(processedIds, first.sprites);
  assert.deepEqual(
    enqueueBoardVfx({ current: [], incoming: first.sprites, now: 5000, processedIds }),
    [],
  );
  assert.equal(
    enqueueBoardVfx({ current: queued, incoming: next.sprites, now: 1000, processedIds }).filter(
      (e) => e.effectId === "shield",
    ).length,
    2,
  );
});

test("waiting, rerendering, selection changes and reconnect keep Roll available without historical effects", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const played: unknown[] = [];
  t.mock.method(sfxPlayer, "play", (cue: unknown) => {
    played.push(cue);
    return true;
  });
  t.mock.method(sfxPlayer, "stopGameplay", () => undefined);
  t.mock.method(sfxPlayer, "isMuted", () => false);
  t.mock.method(sfxPlayer, "getVolume", () => 1);
  const f = fixture();
  const chosen = resolve(f.state, "roll");
  const p = presentation(f.state, chosen);
  const session = new PresentationSession();
  session.begin(binding);
  session.snapshot({ ...binding, streamId, revision: 0 });
  const batches = session.receive({ streamId, revision: 1, events: p.events }, binding, p.view);
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    },
  });
  setLanguage("en", null);
  let sprites: ReturnType<typeof useBoardVfx>["effects"] = [];
  let effects: ReturnType<typeof useBoardEffects>["effects"] = [];
  const sent: unknown[] = [];
  function Harness({
    view,
    batch = null,
    selectedId = f.defenderId,
  }: {
    view: PlayerView;
    batch?: typeof p.batch | null;
    selectedId?: string;
  }) {
    sprites = useBoardVfx({ batch, view, sessionKey: session.key, enabled: true }).effects;
    effects = useBoardEffects({ batch, view, sessionKey: session.key, enabled: true }).effects;
    useBoardSfx({ batch, view, sessionKey: session.key, enabled: true });
    return createElement(GameShellPendingRoll, {
      vm: gameShellFixture({
        view,
        pendingRoll: view.pendingRoll,
        playerId: "P2",
        selectedUnitId: selectedId,
        boardSelectionPending: false,
        lastActionResult: null,
        showAttackerRoll: true,
        attackerDice: [4, 5],
        tieBreakAttacker: [],
        sendAction: (action) => sent.push(action),
      }),
    });
  }
  let renderer: ReturnType<typeof create> | undefined;
  try {
    act(() => {
      renderer = create(createElement(Harness, { view: makePlayerView(f.state, "P2") }));
    });
    act(() => renderer!.update(createElement(Harness, { view: p.view, batch: batches[0] })));
    for (const selectedId of [f.defenderId, "another-unit", f.defenderId]) {
      assert.deepEqual(session.snapshot({ ...binding, streamId, revision: 1, view: p.view }), []);
      act(() =>
        renderer!.update(
          createElement(Harness, { view: { ...p.view }, batch: batches[0], selectedId }),
        ),
      );
      assert.deepEqual(sprites, []);
      assert.ok(
        !effects.some(
          (e) =>
            (e.kind === "unitFlash" && e.tone === "defend") ||
            (e.kind === "floatingText" && e.tone === "miss"),
        ),
      );
      assert.deepEqual(sent, []);
      assert.deepEqual(played, []);
    }
    act(() => t.mock.timers.tick(10000));
    assert.deepEqual(sprites, []);
    assert.ok(!effects.some((e) => e.kind === "unitFlash" && e.tone === "defend"));
    assert.deepEqual(mapEventBatchToSfx({ ...p.batch, view: p.view }), []);
    assert.deepEqual(played, []);
    session.begin(binding);
    assert.deepEqual(session.snapshot({ ...binding, streamId, revision: 1, view: p.view }), []);
    assert.deepEqual(
      session.receive({ streamId, revision: 1, events: p.events }, binding, p.view),
      [],
    );
    act(() => renderer!.update(createElement(Harness, { view: p.view })));
    assert.deepEqual(sprites, []);
    assert.deepEqual(effects, []);
    assert.deepEqual(played, []);
    const roll = renderer!.root
      .findAllByType("button")
      .find((button) => /Roll/.test(button.children.join("")));
    assert.ok(roll, "Manual Roll button restores after reconnect");
    act(() => roll.props.onClick());
    assert.deepEqual(sent, [
      { type: "resolvePendingRoll", pendingRollId: chosen.state.pendingRoll!.id },
    ]);
    const rolled = resolve(chosen.state, undefined, [0.8, 0.95]);
    const final = presentation(chosen.state, rolled, 2);
    const accepted = session.receive(
      { streamId, revision: 2, events: final.events },
      binding,
      final.view,
    );
    assert.equal(accepted.length, 1);
    assert.equal(
      outputs({ ...final, batch: { ...final.batch, events: accepted[0].events } }).sounds.filter(
        (e) => e.key === "common.combat.miss",
      ).length,
      1,
    );
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("lethal failed defense keeps one HP transition and death from the final unitDied", () => {
  const f = fixture("grozny", 1);
  const chosen = resolve(f.state, "roll");
  const rolled = resolve(chosen.state, undefined, [0.1, 0.2]);
  assert.equal(rolled.state.units[f.defenderId].hp, 0);
  assert.equal(
    rolled.events.filter((e) => e.type === "unitDied" && e.unitId === f.defenderId).length,
    1,
  );
  const p = presentation(chosen.state, rolled, 2);
  const mapped = outputs(p);
  assert.equal(
    mapped.sprites.filter((e) => e.effectId === "shield" || e.effectId === "combatMiss").length,
    0,
  );
  assert.equal(mapped.sprites.filter((e) => e.effectId === "combatHit").length, 1);
  assert.equal(mapped.sprites.filter((e) => e.effectId === "unitDeath").length, 1);
  assert.equal(mapped.sounds.filter((e) => e.key === "common.combat.hit").length, 1);
  assert.equal(p.plan.queue.filter((e) => e.type === "damageHpTween").length, 1);
  const death = p.batch.combatCues!.find((e) => e.kind === "death")!;
  assert.equal(p.events[death.eventIndex].type, "unitDied");
  assert.equal(combatVisualPlaybackFrame(p.plan, death.atMs).visualHpByUnitId[f.defenderId], 0);
});
