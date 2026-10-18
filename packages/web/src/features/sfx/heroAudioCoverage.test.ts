import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  projectEventsForRecipient,
  type GameEvent,
  type PlayerView,
  type UnitClass,
} from "../../../../rules/src/index";
import {
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  setUnit,
  toBattleState,
  toPlacementState,
} from "../../../../rules/src/tests/helpers/testUtils";
import { applyNewBatchPostAction } from "../../../../rules/src/actions/heroes/newBatchPost";
import { tryApplyFriskPowerOfFriendship } from "../../../../rules/src/actions/heroes/frisk/friendship";
import { applyFriskPostAction } from "../../../../rules/src/actions/heroes/frisk/postAction";
import { semanticFireballFixture } from "../../../../rules/src/tests/core/presentationSemantics.test";
import { SOUND_REGISTRY, type SoundKey } from "../../assets/sfx/registry";
import { resolveSound } from "../../assets/sfx/resolver";
import { buildCombatVisualPlaybackPlan } from "../../game/effects/combatPlayback";
import { PresentationSession } from "../../game/effects/presentationSession";
import type { PresentationEvent } from "../../game/effects/types";
import { mapEventBatchToSfx } from "./sfxEventMapper";
import { SfxPlaybackSession } from "./sfxPlaybackSession";
import { SfxPlayer } from "./sfxPlayer";
import { audioFixture } from "./audioTestUtils";
import { rosterSoundKeys } from "./audioPreload";
import type { SoundCue } from "./sfxTypes";

const noDice = {
  next(): number {
    throw new Error("Presentation must not roll gameplay dice");
  },
};
const basicHeroes = [
  ["asgore", "knight"],
  ["elCidCompeador", "knight"],
  ["grand-kaiser", "archer"],
  ["luche", "spearman"],
  ["undyne", "berserker"],
  ["vladTepes", "spearman"],
] as const;
const deathHeroes = ["asgore", "frisk", "mettaton", "sans", "undyne"] as const;

test("all 23 requested physical files are present in the production semantic registry", () => {
  const files = [
    "asgore/basic/attack.wav",
    "asgore/basic/died.wav",
    "elCidCompeador/basic/attack.wav",
    "frisk/basic/died.wav",
    "frisk/abilities/PowerOfFriendship.mp3",
    "frisk/phantasms/friskGenocidePrecisionStrike.wav",
    "frisk/phantasms/friskOnePathUnlock.wav",
    "grand-kaiser/basic/attack.mp3",
    "guts/phantasms/gutsBerserkModeSweep.wav",
    "jebe/phantasms/jebeKhansShooterFire02.wav",
    "kaneki/basic/deployed.mp3",
    "kaneki/transformations/Scolopendra.mp3",
    "lechy/phantasms/StormSound2.mp3",
    "loki/phantasms/lokiLaughtSpin.wav",
    "luche/basic/attack.mp3",
    "mettaton/basic/died.wav",
    "sans/basic/died.wav",
    "undyne/basic/attack.wav",
    "undyne/basic/died.wav",
    "vladTepes/basic/attack.mp3",
    "vladTepes/abilities/vladStakesTrigger01.wav",
    "vladTepes/abilities/vladStakesTrigger02.wav",
    "vladTepes/abilities/vladStakesTrigger03.wav",
  ];
  const sources = Object.values(SOUND_REGISTRY).flatMap((sound) => [...sound.sources]);
  assert.equal(files.length, 23);
  for (const file of files) {
    const source = sources.find((url) => url.endsWith(`/heroes/${file}`));
    assert(source, `Unregistered asset: ${file}`);
    assert(existsSync(fileURLToPath(source)), `Missing physical asset: ${file}`);
  }
});

function fixture(hero: string, slot: UnitClass = "knight") {
  slot =
    (
      { frisk: "assassin", mettaton: "archer", sans: "trickster", undyne: "berserker" } as Partial<
        Record<string, UnitClass>
      >
    )[hero] ?? slot;
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: hero })),
    createDefaultArmy("P2"),
  );
  const actor = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === hero,
  )!;
  const target = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer",
  )!;
  assert(actor);
  state = setUnit(state, actor.id, { position: { col: 4, row: 4 }, isStealthed: false });
  state = setUnit(state, target.id, { position: { col: 4, row: 5 }, hp: 30 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", actor.id));
  return { state, actor: state.units[actor.id], target: state.units[target.id] };
}
function delivered(
  events: GameEvent[],
  state: ReturnType<typeof fixture>["state"],
  recipient: "P1" | "P2" | "spectator" = "P1",
) {
  return projectEventsForRecipient(state, events, recipient).map((event, index) => ({
    ...event,
    eventId: `event-${index}`,
  }));
}
function sounds(events: PresentationEvent[], view: PlayerView) {
  return mapEventBatchToSfx({ events, view, revision: 2, streamId: "coverage" });
}

for (const [hero, slot] of basicHeroes) {
  test(`${hero}: actual manual basic attack has one source voice before its hit/miss`, () => {
    const f = fixture(hero, slot);
    for (const hit of [true, false]) {
      const declared = applyAction(
        f.state,
        { type: "attack", attackerId: f.actor.id, defenderId: f.target.id },
        noDice,
      );
      assert(declared.state.pendingRoll, "accepted attack waits for manual dice");
      assert(
        !sounds(
          delivered(declared.events, declared.state),
          makePlayerView(declared.state, "P1"),
        ).some((cue) => cue.key.endsWith(".basic.attack")),
      );
      const resolved = resolveAllPendingRollsWithEvents(
        declared.state,
        makeRngSequence(hit ? [0.99, 0.99, 0.01, 0.01] : [0.01, 0.01, 0.99, 0.99]),
      );
      const attack = resolved.events.find((event) => event.type === "attackResolved");
      assert(attack?.type === "attackResolved" && attack.isBasicAttack);
      const view = makePlayerView(resolved.state, "P1");
      const plan = buildCombatVisualPlaybackPlan({
        batch: {
          events: delivered(resolved.events, resolved.state),
          streamId: "coverage",
          revision: 2,
        },
        startingHpByUnitId: Object.fromEntries(
          Object.values(f.state.units).map((unit) => [unit.id, unit.hp]),
        ),
        startingUnitsByUnitId: makePlayerView(f.state, "P1").units,
        finalView: view,
        reducedMotion: false,
      });
      const cues = mapEventBatchToSfx({ ...plan.batch, view });
      const voice = cues.filter((cue) => cue.key.endsWith(".basic.attack"));
      assert.equal(
        voice.length,
        1,
        JSON.stringify({
          events: plan.batch.events,
          actor: view.units[f.actor.id],
          cues: cues.map((cue) => cue.key),
        }),
      );
      assert.equal(voice[0].key, `hero.${hero}.basic.attack`);
      const outcome = cues.find(
        (cue) => cue.key === (attack.hit ? "common.combat.hit" : "common.combat.miss"),
      );
      assert(outcome);
      assert(voice[0].delayMs! < outcome.delayMs!);
      assert(!cues.some((cue) => cue.key === ("common.combat.attack" as string)));
    }
    const rejected = applyAction(
      f.state,
      { type: "attack", attackerId: f.actor.id, defenderId: "missing" },
      noDice,
    );
    assert.deepEqual(
      sounds(delivered(rejected.events, rejected.state), makePlayerView(f.state, "P1")),
      [],
    );
  });
}

test("abilities, absent provenance, redacted source and repeated AoE rolls never use a basic attack voice", () => {
  const f = fixture("asgore");
  const base: Extract<PresentationEvent, { type: "attackResolved" }> = {
    type: "attackResolved",
    eventId: "attack",
    attackerId: f.actor.id,
    defenderId: f.target.id,
    sourceCell: f.actor.position,
    targetCell: f.target.position,
    attackerRoll: { dice: [6, 6], sum: 12, isDouble: true },
    defenderRoll: { dice: [1, 1], sum: 2, isDouble: true },
    hit: true,
    damage: 1,
    defenderHpAfter: 29,
    isBasicAttack: true,
  };
  for (const patch of [
    { isBasicAttack: undefined },
    { sourceCell: undefined },
    { attackerId: undefined },
    { abilityId: "asgoreFireball" },
    { abilityUseId: "use" },
    { attackerRollIsNew: false },
  ]) {
    assert(
      !sounds([{ ...base, ...patch }], makePlayerView(f.state, "P1")).some((cue) =>
        cue.key.endsWith(".basic.attack"),
      ),
    );
  }
  const fireball = semanticFireballFixture();
  const resolved = resolveAllPendingRollsWithEvents(
    fireball.activated.state,
    makeRngSequence([0.99, 0.99, 0.01, 0.01]),
  );
  assert(
    resolved.events
      .filter((event) => event.type === "attackResolved")
      .every((event) => !event.isBasicAttack),
  );
  assert(
    !sounds(delivered(resolved.events, resolved.state), makePlayerView(resolved.state, "P1")).some(
      (cue) => cue.key === "hero.asgore.basic.attack",
    ),
  );
});

for (const hero of deathHeroes) {
  test(`${hero}: one final death replaces generic voice, duplicates stay consumed`, () => {
    const f = fixture(hero);
    const view = makePlayerView(
      setUnit(f.state, f.actor.id, { hp: 0, isAlive: false, position: null }),
      "P1",
    );
    const event: PresentationEvent = {
      type: "unitDied",
      unitId: f.actor.id,
      killerId: null,
      eventId: "final",
    };
    const played: SoundCue[] = [];
    const session = new SfxPlaybackSession({
      play: (cue) => {
        played.push(cue as SoundCue);
        return true;
      },
      stopGameplay() {},
      isMuted: () => false,
      getVolume: () => 1,
    });
    const batch = { events: [event], streamId: "coverage", revision: 2 };
    session.schedule(batch, view);
    session.schedule({ ...batch, revision: 3 }, view);
    assert.deepEqual(
      played.map((cue) => cue.key),
      [`hero.${hero}.basic.death`],
    );
    assert.deepEqual(sounds([], view), [], "zero HP snapshot is silent");
  });
}

test("Kaneki deployment uses accepted unitPlaced; form entry is a fresh RC transition from hit, kill or turn charge", () => {
  const f = fixture("kaneki", "berserker");
  const placement = setUnit(toPlacementState(f.state, "P1"), f.actor.id, { position: null });
  const rejected = applyAction(
    placement,
    { type: "placeUnit", unitId: f.actor.id, position: { col: -1, row: -1 } },
    noDice,
  );
  assert(
    !sounds(delivered(rejected.events, rejected.state), makePlayerView(rejected.state, "P1")).some(
      (cue) => cue.key === "hero.kaneki.basic.deployed",
    ),
  );
  const placed = applyAction(
    placement,
    { type: "placeUnit", unitId: f.actor.id, position: { col: 1, row: 0 } },
    noDice,
  );
  assert.equal(
    sounds(delivered(placed.events, placed.state), makePlayerView(placed.state, "P1")).filter(
      (cue) => cue.key === "hero.kaneki.basic.deployed",
    ).length,
    1,
  );
  const charged = setUnit(
    { ...f.state, activeUnitId: null, turnQueue: [f.actor.id], turnQueueIndex: 0 },
    f.actor.id,
    { kanekiCentipedeUnlocked: false, charges: { ...f.actor.charges, kanekiRcCells: 6 } },
  );
  const started = applyAction(charged, { type: "unitStartTurn", unitId: f.actor.id }, noDice);
  assert.equal(
    started.events.filter((event) => event.type === "kanekiFormEntered").length,
    1,
    JSON.stringify({ events: started.events, actor: started.state.units[f.actor.id] }),
  );
  const view = makePlayerView(started.state, "P1");
  assert.equal(
    sounds(delivered(started.events, started.state), view).filter(
      (cue) => cue.key === "hero.kaneki.transformations.kanekiScolopendra",
    ).length,
    1,
  );
  assert(rosterSoundKeys(["kaneki"]).includes("hero.kaneki.transformations.kanekiScolopendra"));
  const again = applyAction(
    { ...started.state, activeUnitId: null },
    { type: "unitStartTurn", unitId: f.actor.id },
    noDice,
  );
  assert(!again.events.some((event) => event.type === "kanekiFormEntered"));
  for (const kind of ["hit", "kill"] as const) {
    const before = setUnit(f.state, f.actor.id, {
      kanekiCentipedeUnlocked: false,
      charges: { ...f.actor.charges, kanekiRcCells: kind === "hit" ? 5 : 3 },
    });
    const event: GameEvent =
      kind === "hit"
        ? {
            type: "attackResolved",
            attackerId: f.actor.id,
            defenderId: f.target.id,
            sourceCell: f.actor.position,
            targetCell: f.target.position,
            attackerRoll: { dice: [6], sum: 6, isDouble: false },
            defenderRoll: { dice: [1], sum: 1, isDouble: false },
            hit: true,
            damage: 1,
            defenderHpAfter: 29,
          }
        : { type: "unitDied", unitId: f.target.id, killerId: f.actor.id };
    const result = applyNewBatchPostAction(before, before, [event], noDice);
    assert.equal(result.events.filter((entry) => entry.type === "kanekiFormEntered").length, 1);
    const repeat = applyNewBatchPostAction(result.state, result.state, [event], noDice);
    assert(!repeat.events.some((entry) => entry.type === "kanekiFormEntered"));
  }
});

test("Frisk friendship means actual victory; One Path means first kill conversion, including zero counters", () => {
  const f = fixture("frisk", "assassin");
  const state = {
    ...f.state,
    units: Object.fromEntries(
      Object.values(f.state.units).map((unit) => [
        unit.id,
        unit.owner === "P2" && unit.id !== f.target.id
          ? { ...unit, isAlive: false, position: null }
          : unit,
      ]),
    ),
  };
  const won = tryApplyFriskPowerOfFriendship(state);
  assert(won);
  assert.equal(won.state.phase, "ended");
  assert.equal(
    sounds(delivered(won.events, won.state), makePlayerView(won.state, "P1")).filter(
      (cue) => cue.key === "hero.frisk.abilities.powerOfFriendship",
    ).length,
    1,
  );
  assert.equal(tryApplyFriskPowerOfFriendship(won.state), null);
  const death: GameEvent = { type: "unitDied", unitId: f.target.id, killerId: f.actor.id };
  const killed = applyFriskPostAction(f.state, [death]);
  assert.equal(killed.events.filter((event) => event.type === "friskOnePathUnlocked").length, 1);
  assert(
    !applyFriskPostAction(killed.state, [death]).events.some(
      (event) => event.type === "friskOnePathUnlocked",
    ),
  );
  assert.equal(
    sounds(delivered(killed.events, killed.state), makePlayerView(killed.state, "P1")).filter(
      (cue) => cue.key === "hero.frisk.phantasms.friskOnePath.unlock",
    ).length,
    1,
  );
  assert(
    !projectEventsForRecipient(killed.state, killed.events, "P2").some(
      (event) => event.type === "friskOnePathUnlocked",
    ),
  );
});

test("precision resolution, sweep resolution and private Loki spin each have one exact semantic voice", () => {
  const f = fixture("frisk", "assassin");
  const events: PresentationEvent[] = [
    {
      type: "attackResolved",
      attackerId: f.actor.id,
      defenderId: f.target.id,
      sourceCell: f.actor.position,
      targetCell: f.target.position,
      attackerRoll: { dice: [6], sum: 6, isDouble: false },
      defenderRoll: { dice: [1], sum: 1, isDouble: false },
      hit: true,
      damage: 1,
      defenderHpAfter: 29,
      attackSignature: "friskPrecisionStrike",
      eventId: "precision",
    },
    { type: "lokiSpinCommitted", unitId: f.actor.id, eventId: "spin" },
    {
      type: "aoeResolved",
      sourceUnitId: f.actor.id,
      abilityId: "gutsBerserkMode",
      abilityUseId: "sweep",
      center: f.actor.position!,
      radius: 1,
      affectedUnitIds: [f.target.id],
      revealedUnitIds: [],
      damagedUnitIds: [f.target.id],
      damageByUnitId: { [f.target.id]: 1 },
      eventId: "sweep",
    },
  ];
  assert.deepEqual(
    sounds([...events, ...events], makePlayerView(f.state, "P1"))
      .filter((cue) => cue.key.startsWith("hero."))
      .map((cue) => cue.key),
    [
      "hero.frisk.phantasms.friskGenocide.precisionStrike",
      "hero.loki.phantasms.lokiLaught.spin",
      "hero.guts.phantasms.gutsBerserkMode.sweep",
    ],
  );
  assert(
    !projectEventsForRecipient(
      f.state,
      [{ type: "lokiSpinCommitted", unitId: f.actor.id }],
      "P2",
    ).some((event) => event.type === "lokiSpinCommitted"),
  );
});

test("new semantic events cannot reveal a hidden source or private unlock/Spin to other recipients", () => {
  const f = fixture("kaneki", "berserker");
  const hidden = setUnit(f.state, f.actor.id, { isStealthed: true });
  const events: GameEvent[] = [
    { type: "kanekiFormEntered", unitId: f.actor.id, form: "scolopendra" },
    { type: "friskFriendshipWon", unitId: f.actor.id },
    { type: "friskOnePathUnlocked", unitId: f.actor.id },
    { type: "lokiSpinCommitted", unitId: f.actor.id },
  ];
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = delivered(events, hidden, recipient);
    assert(projected.every((event) => event.type === "eventRedacted"));
    assert.deepEqual(
      sounds(projected, makePlayerView(hidden, "P1")),
      [],
      "Current/cache knowledge cannot restore a redacted signature",
    );
  }
  assert.equal(sounds(delivered(events, hidden), makePlayerView(hidden, "P1")).length, 4);
});

test("precision and a multi-target Berserk sweep reuse the shared first-strike timing", () => {
  for (const hero of ["frisk", "guts"]) {
    const f = fixture(hero, hero === "frisk" ? "assassin" : "berserker");
    const attack: Extract<PresentationEvent, { type: "attackResolved" }> = {
      type: "attackResolved",
      eventId: "strike",
      attackerId: f.actor.id,
      defenderId: f.target.id,
      sourceCell: f.actor.position,
      targetCell: f.target.position,
      attackerRoll: { dice: [6], sum: 6, isDouble: false },
      defenderRoll: { dice: [1], sum: 1, isDouble: false },
      hit: true,
      damage: 1,
      defenderHpAfter: 29,
      abilityUseId: "use",
      abilityId: hero === "frisk" ? "friskGenocide" : "gutsBerserkMode",
      ...(hero === "frisk" ? { attackSignature: "friskPrecisionStrike" as const } : {}),
    };
    const events: PresentationEvent[] =
      hero === "frisk"
        ? [attack]
        : [
            attack,
            { ...attack, eventId: "second-strike", attackerRollIsNew: false },
            {
              type: "aoeResolved",
              eventId: "summary",
              abilityUseId: "use",
              abilityId: "gutsBerserkMode",
              sourceUnitId: f.actor.id,
              center: f.actor.position!,
              radius: 1,
              affectedUnitIds: [f.target.id],
              revealedUnitIds: [],
              damagedUnitIds: [f.target.id],
            },
          ];
    const view = makePlayerView(f.state, "P1");
    const plan = buildCombatVisualPlaybackPlan({
      batch: { events, streamId: "coverage", revision: 2 },
      startingUnitsByUnitId: view.units,
      startingHpByUnitId: Object.fromEntries(
        Object.values(view.units).map((unit) => [unit.id, unit.hp]),
      ),
      finalView: view,
      reducedMotion: false,
    });
    const cues = mapEventBatchToSfx({ ...plan.batch, view });
    const signatures = cues.filter(
      (cue) => cue.key.endsWith(".precisionStrike") || cue.key.endsWith(".sweep"),
    );
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0].delayMs, 0);
    assert(cues.find((cue) => cue.key === "common.combat.hit")!.delayMs! > signatures[0].delayMs!);
  }
});

for (const [key, count] of [
  ["hero.vladTepes.abilities.vladStakes.trigger", 3],
  ["hero.jebe.phantasms.jebeKhansShooter", 2],
  ["hero.lechy.phantasms.lechyStorm", 2],
] as const) {
  test(`${key}: variants vary across cues, remain stable per cue and use no gameplay RNG`, () => {
    const sources = SOUND_REGISTRY[key].sources;
    assert.equal(sources.length, count);
    const selected = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `incident-${i}`;
      const cue = resolveSound(key, id)!;
      assert.equal(cue.src, resolveSound(key, id)!.src);
      selected.add(cue.src);
    }
    assert.equal(selected.size, count);
    assert(sources.every((source) => existsSync(fileURLToPath(source))));
  });
}

test("stacked Vlad stakes produce one voice per incident, separate incidents survive duplicate delivery", () => {
  const f = fixture("vladTepes", "spearman");
  const played: SoundCue[] = [];
  const session = new SfxPlaybackSession({
    play: (cue) => {
      played.push(cue as SoundCue);
      return true;
    },
    stopGameplay() {},
    isMuted: () => false,
    getVolume: () => 1,
  });
  const event: GameEvent = {
    type: "stakeTriggered",
    unitId: f.target.id,
    markerPos: f.target.position!,
    damage: 1,
    stopped: true,
    stakeIdsRevealed: ["stake-1", "stake-2"],
  };
  const projected = projectEventsForRecipient(f.state, [event], "P1");
  for (let i = 0; i < 20; i++) {
    const batch = {
      streamId: "coverage",
      revision: i + 2,
      events: projected.map((event) => ({ ...event, eventId: `stake-${i}` })),
    };
    session.schedule(batch, makePlayerView(f.state, "P1"));
    session.schedule(batch, makePlayerView(f.state, "P1"));
  }
  assert.equal(played.length, 20);
  assert.equal(new Set(played.map((cue) => cue.src)).size, 3);
  assert(played.every((cue) => cue.sources.length === 3));
  const hidden = setUnit(f.state, f.target.id, { isStealthed: true });
  assert.equal(projectEventsForRecipient(hidden, [event], "P1").length, 0);
});

test("all new semantic voices inherit mute, cache-only late loading, baseline and reset policies", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const f = fixture("kaneki", "berserker");
  const view = makePlayerView(f.state, "P1");
  const audio = audioFixture();
  const player = new SfxPlayer(audio.manager);
  await player.ensureAudioReady();
  const newKeys = Object.keys(SOUND_REGISTRY).filter((key) =>
    /\.basic\.(attack|death|deployed)$|kanekiScolopendra|powerOfFriendship|precisionStrike|friskOnePath|\.sweep$|\.spin$|vladStakes.trigger/.test(
      key,
    ),
  ) as SoundKey[];
  for (const key of newKeys) {
    await player.preload(key);
    player.setMuted(true);
    assert.equal(player.play({ ...resolveSound(key, key)!, id: key }), false);
    player.setMuted(false);
  }
  assert.equal(audio.sources.length, 0);
  const session = new SfxPlaybackSession(player);
  const event: PresentationEvent = {
    type: "kanekiFormEntered",
    unitId: f.actor.id,
    form: "scolopendra",
    eventId: "form",
  };
  const batch = { streamId: "coverage", revision: 2, events: [event], eventSfxDelaysMs: [100] };
  player.setMuted(true);
  session.schedule(batch, view);
  player.setMuted(false);
  session.schedule(batch, view);
  t.mock.timers.tick(101);
  assert.equal(audio.sources.length, 0);
  session.schedule({ ...batch, events: [{ ...event, eventId: "delayed" }] }, view);
  session.reset();
  t.mock.timers.tick(101);
  assert.equal(audio.sources.length, 0);
  const ingress = new PresentationSession();
  const binding = { roomId: "room", recipient: "P1" };
  ingress.begin(binding);
  const liveBatch = { ...batch, events: [{ ...event, eventId: "form" }] };
  ingress.receive(liveBatch, binding, view);
  assert.deepEqual(ingress.snapshot({ ...binding, streamId: "coverage", revision: 2, view }), []);
  assert.deepEqual(ingress.receive(liveBatch, binding, view), []);
  session.schedule(
    { ...batch, events: [{ ...event, eventId: "future" }], eventSfxDelaysMs: [0] },
    view,
  );
  assert.equal(audio.sources.length, 1);
  session.reset();
});
