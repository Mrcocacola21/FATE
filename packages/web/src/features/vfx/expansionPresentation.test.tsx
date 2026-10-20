import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction, attachArmy, createDefaultArmy, createEmptyGame, makePlayerView, getHeroDefinition,
  makeSpectatorView, projectEventsForRecipient, type GameEvent, type PlayerView, type ProjectedGameEvent, type UnitState,
} from "../../../../rules/src/index";
import {
  initKnowledgeForOwners, makeRngSequence, resolveAllPendingRollsWithEvents,
  setUnit, toBattleState, resolvePendingRollOnce,
} from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "../../game/effects/combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "../../game/effects/visualResolution";
import { SelectedUnitVfx, selectionRingFrame } from "./SelectedUnitVfx";
import { selectionRingBounds } from "./expansionPresence.generated";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { enqueueBoardVfx, pruneExpiredBoardVfx, simplifyVfxForReducedMotion } from "./vfxQueue";
import { BASIC_EXPANSION_HEROES, expansionMovement } from "./expansionPresentation";
import { expansionEffect } from "./expansionRegistry";
import { VfxLayer } from "./VfxLayer";
import { expansionSignalFixtures, testExpansionSignals } from "../../../../rules/src/tests/core/expansionSignals.test";
import { PresentationSession } from "../../game/effects/presentationSession";
import { applyGutsEndTurnDrain } from "../../../../rules/src/actions/heroes/guts/berserk";
import { applyUndyneImmortalEndTurnDrain } from "../../../../rules/src/actions/heroes/undyneHelpers";
import { resolveAttack } from "../../../../rules/src/combat/resolveAttack";
import { expansionStatusArt } from "./expansionStatuses";
import { unitSignalTarget } from "../../../../rules/src/core/heroSignals";
import { handleGroznyTyrantAfterAttack } from "../../../../rules/src/actions/heroes/grozny/tyrant";
import { resolveForestMoveDestinationChoice } from "../../../../rules/src/actions/movementActions/forestResolvers";
import { mapEventBatchToSfx } from "../sfx/sfxEventMapper";
import { addLokiChicken } from "../../../../rules/src/actions/heroes/loki";
import { applyGriffithFemtoRebirth } from "../../../../rules/src/actions/heroes/griffith";
import { effectsFromEventBatch } from "../../game/effects/eventToEffects";
import { UnitDeploymentContent } from "./UnitDeploymentContent";
import { UnitStatusVfx } from "./UnitStatusVfx";
import { translate } from "../../i18n";

function fixture(hero = "zoro") {
  const slot = getHeroDefinition(hero)?.mainClass ?? "knight";
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: hero })), createDefaultArmy("P2"));
  const actor = Object.values(state.units).find(u => u.heroId === hero)!;
  const target = Object.values(state.units).find(u => u.owner === "P2" && u.class === "knight")!;
  state = setUnit(state, actor.id, { position: { col: 2, row: 2 }, isStealthed: false, attack: 50 });
  state = setUnit(state, target.id, { position: { col: 2, row: 3 }, isStealthed: false, hp: 30 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", actor.id));
  return { state, actor: state.units[actor.id], target: state.units[target.id] };
}

test("Thematic movement owns its wake and only the final landing; base and forced movement keep their common feedback", () => {
  const f = fixture(), before = makePlayerView(f.state, "P1");
  const after = makePlayerView(setUnit(f.state, f.actor.id, { position: { col: 4, row: 2 } }), "P1");
  const events: ProjectedGameEvent[] = [
    { type: "unitMoved", unitId: f.actor.id, from: { col: 2, row: 2 }, to: { col: 3, row: 2 }, provenance: { kind: "normal" } },
    { type: "unitMoved", unitId: f.actor.id, from: { col: 3, row: 2 }, to: { col: 4, row: 2 }, provenance: { kind: "normal" } },
  ];
  const { effects, plan } = playback(before, after, events);
  assert.equal(effects.filter(e => e.effectId === "expansion.zoro.move_trail").length, 2);
  const landings = effects.filter(e => e.effectId === "expansion.zoro.move_arrive");
  assert.equal(landings.length, 1);
  assert.deepEqual(landings[0].sourceCell, { col: 4, row: 2 });
  const common = (view: PlayerView, cues = plan.movementPlan.cues) => effectsFromEventBatch(events,
    { view, previousPositions: {} }, plan.batch.eventDelaysMs, [], cues);
  assert(!common(after).some(e => e.kind === "movementTrail"));
  const base = { ...after, units: { ...after.units, [f.actor.id]: { ...after.units[f.actor.id], heroId: undefined } } };
  assert.equal(common(base).filter(e => e.kind === "movementTrail").length, 2);
  const forced = plan.movementPlan.cues.map(c => c.kind === "movement" ? { ...c, mode: "forced" as const } : c);
  assert.equal(common(after, forced).filter(e => e.kind === "movementTrail").length, 2);
  const deploy: ProjectedGameEvent = { type: "unitPlaced", unitId: f.actor.id, position: f.actor.position! };
  assert.deepEqual(effectsFromEventBatch([deploy], { view: after, previousPositions: {} }), []);
  assert(effectsFromEventBatch([deploy], { view: base, previousPositions: {} }).some(e => e.kind === "cellPulse"));
});
function playback(before: PlayerView, after: PlayerView, events: ProjectedGameEvent[]) {
  const projected = events.map((e, i) => ({ ...e, eventId: `event-${i}` }));
  const plan = buildCombatVisualPlaybackPlan({
    batch: { events: projected, streamId: "test", revision: 2, view: after },
    startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: snapshotVisualUnits(before),
    finalView: after, reducedMotion: false,
  });
  return { plan, effects: mapEventBatchToVfx({ ...plan.batch, view: after, previousPositions: {} }) };
}

test("melee releases end at the shared outcome in normal and reduced motion, for hits and misses", () => {
  const f = fixture("griffith"), view = makePlayerView(f.state, "P1");
  for (const reducedMotion of [false, true]) for (const hit of [false, true]) {
    const event: ProjectedGameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id,
      sourceCell: f.actor.position!, targetCell: f.target.position!, isBasicAttack: true,
      attackerRoll: { dice: [6, 5], sum: 11, isDouble: false }, defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
      hit, damage: hit ? 1 : 0, defenderHpAfter: hit ? 29 : 30 };
    const plan = buildCombatVisualPlaybackPlan({ batch: { events: [event], streamId: "swing", revision: 1, view },
      startingHpByUnitId: snapshotVisualHp(view), startingUnitsByUnitId: snapshotVisualUnits(view), finalView: view, reducedMotion });
    const mapped = mapEventBatchToVfx({ ...plan.batch, view, previousPositions: {} });
    const effects = reducedMotion ? simplifyVfxForReducedMotion(mapped) : mapped;
    const release = effects.find(e => e.effectId === "expansion.griffith.attack_swing")!;
    const outcome = plan.batch.combatCues!.find(c => c.kind === (hit ? "hit" : "miss"))!;
    assert(release); assert.equal(release.delayMs! + release.strikeContactMs!, outcome.atMs);
    assert.equal(release.strikeContactMs, reducedMotion ? 70 : 210);
    assert.equal(release.strikeHit, hit);
    assert.equal(release.durationMs, reducedMotion ? 70 : 290, "recovery does not shift confirmed contact");
    assert.equal(effects.some(e => e.effectId === "expansion.griffith.attack_impact"), hit);
  }
});

test("real accepted Guts Berserk single has its own swing without changing state, RNG or audio; refusal and AoE stay distinct", () => {
  const f = fixture("guts");
  const before = setUnit(setUnit(f.state, f.actor.id, { gutsBerserkModeActive: true, attack: 4 }), f.target.id, { hp: 100 });
  const begun = applyAction(before, { type: "attack", attackerId: f.actor.id, defenderId: f.target.id }, makeRngSequence([]));
  const pending = begun.state.pendingRoll!;
  assert.equal(pending.kind, "gutsBerserkAttackChoice");
  const refused = applyAction(begun.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: "P1",
    choice: { type: "gutsBerserkAttackMode", mode: "single", targetId: "absent" } }, makeRngSequence([]));
  assert.deepEqual(refused.events, []);
  const selected = applyAction(begun.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: "P1",
    choice: { type: "gutsBerserkAttackMode", mode: "single", targetId: f.target.id } }, makeRngSequence([]));
  const context = { ...selected.state.pendingRoll!.context }; delete context.attackSignature;
  const legacy = { ...selected.state, pendingRoll: { ...selected.state.pendingRoll!, context } };
  const resolve = (state: typeof legacy) => {
    let draws = 0; const sequence = makeRngSequence([.99, .8, .01, .2]);
    const result = resolveAllPendingRollsWithEvents(state, { next: () => { draws++; return sequence.next(); } });
    return { ...result, draws };
  };
  const actual = resolve(selected.state as typeof legacy), prior = resolve(legacy);
  assert.equal(actual.draws, prior.draws); assert.deepEqual(actual.state, prior.state);
  const strip = (events: GameEvent[]) => events.map(event => {
    if (event.type !== "attackResolved") return event;
    const copy = { ...event }; delete copy.attackSignature; return copy;
  });
  assert.deepEqual(strip(actual.events), prior.events);
  const area = applyAction(begun.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: "P1",
    choice: { type: "gutsBerserkAttackMode", mode: "aoe", targetId: f.target.id } }, makeRngSequence([]));
  const areaResolved = resolveAllPendingRollsWithEvents(area.state, makeRngSequence([.99, .8, .01, .2]));
  const areaEvents = [...area.events, ...areaResolved.events];
  assert(areaEvents.some(event => event.type === "attackResolved"));
  assert(!areaEvents.some(event => event.type === "attackResolved" && event.attackSignature));
  const areaView = makePlayerView(areaResolved.state, "P1");
  assert(!playback(makePlayerView(before, "P1"), areaView,
    projectEventsForRecipient(areaResolved.state, areaEvents, "P1")).effects.some(e => e.effectId === "expansion.guts.berserk_swing"));
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const view = recipient === "spectator" ? makeSpectatorView(actual.state) : makePlayerView(actual.state, recipient);
    const events = projectEventsForRecipient(actual.state, actual.events, recipient);
    const attack = events.find(e => e.type === "attackResolved");
    assert(attack?.type === "attackResolved" && attack.attackSignature === "gutsBerserkSingle" && !attack.isBasicAttack);
    const { effects, plan } = playback(makePlayerView(before, recipient === "spectator" ? "P1" : recipient), view, events);
    assert.equal(effects.filter(e => e.effectId === "expansion.guts.berserk_swing").length, 1);
    assert(!effects.some(e => e.effectId === "expansion.guts.attack_swing"));
    const oldPlan = playback(makePlayerView(before, recipient === "spectator" ? "P1" : recipient), view,
      projectEventsForRecipient(prior.state, prior.events, recipient)).plan;
    assert.deepEqual(mapEventBatchToSfx({ ...plan.batch, view }), mapEventBatchToSfx({ ...oldPlan.batch, view }));
  }
});

test("placement enters at frame zero with its attached art, without delaying the next placement", () => {
  const f = fixture("genghisKhan"), view = makePlayerView(f.state, "P1");
  const before = makePlayerView(setUnit(f.state, f.actor.id, { position: null }), "P1");
  const events: ProjectedGameEvent[] = [{ type: "unitPlaced", unitId: f.actor.id, position: f.actor.position! }];
  for (const holdResolvedState of [false, true]) for (const newIdentity of [false, true]) {
    const startingUnits = snapshotVisualUnits(before);
    if (newIdentity) delete startingUnits[f.actor.id];
    const plan = buildCombatVisualPlaybackPlan({ batch: { events, streamId: "placements", revision: 2, view },
      startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: startingUnits,
      finalView: view, reducedMotion: false, holdResolvedState });
    assert.deepEqual(combatVisualPlaybackFrame(plan, 0).visualUnitsByUnitId[f.actor.id]?.position, f.actor.position);
    assert.deepEqual(combatVisualPlaybackFrame(plan, plan.durationMs).visualUnitsByUnitId[f.actor.id]?.position, f.actor.position);
    assert(plan.durationMs <= 1, "deploy art must not serialize placements on a 600ms playback queue");
  }
  const incoming = mapEventBatchToVfx({ events, view, previousPositions: {}, revision: 2 });
  const effect = enqueueBoardVfx({ incoming, current: [], now: Date.now() }).find(e => e.effectId.endsWith(".deploy"))!;
  for (const reducedMotion of [false, true]) {
    const html = renderToStaticMarkup(<><VfxLayer effects={[effect]} view={view} boardSize={9} cellSize={64}
      isFlipped={false} reducedMotion={reducedMotion} /><UnitDeploymentContent effect={effect} reducedMotion={reducedMotion}>
      <img src="token.png" alt="фігура" /></UnitDeploymentContent></>);
    assert.equal((html.match(/data-vfx-cue=/g) ?? []).length, 1, "there is no detached duplicate in VfxLayer");
    assert.match(html, /data-unit-deployment=/);
    assert.match(html, /alt="фігура"/);
    assert.match(html, new RegExp(`animation-duration:${effect.expiresAt - effect.startedAt}ms`));
  }
  assert.deepEqual(mapEventBatchToVfx({ events: [], view, previousPositions: {}, revision: 3 }), [], "snapshot is not a deployment");
});

test("commander aura waits for the rendered token and covers all eight radius-one neighbors", () => {
  const f = fixture("genghisKhan"), view = makePlayerView(f.state, "P1");
  const hiddenVisual = { ...view.units, [f.actor.id]: { ...view.units[f.actor.id], position: null } };
  const render = (visualUnits: PlayerView["units"]) => renderToStaticMarkup(<UnitStatusVfx view={view} playerId="P1"
    visualUnits={visualUnits} motion={{}} boardSize={9} cellSize={64} isFlipped={false} reducedMotion={false}
    t={translate} />);
  assert.doesNotMatch(render(hiddenVisual), /data-expansion-status=/, "an ahead snapshot cannot paint an aura before its token");
  const html = render(view.units);
  assert.match(html, /data-expansion-status="expansion.genghisKhan.commander_aura"/);
  assert.match(html, /width:192px;height:192px/);
  assert.equal((html.match(/data-aura-cell=/g) ?? []).length, 8);
  assert.match(html, /commander-aura-orbit/);
  assert.match(html, /genghisKhan\/expansion\/commander_aura.png/);
});

test("selection follows rendered motion, waits for its token, and fits the visible contour to the cell", () => {
  const f = fixture("grand-kaiser"), view = makePlayerView(f.state, "P1");
  const hidden = { ...view.units, [f.actor.id]: { ...view.units[f.actor.id], position: null } };
  const render = (visualUnits: PlayerView["units"]) => renderToStaticMarkup(<SelectedUnitVfx view={view} visualUnits={visualUnits}
    unitId={f.actor.id} playerId="P1" boardSize={9} cellSize={64} isFlipped={false} />);
  assert.equal(render(hidden), "", "an ahead selected snapshot cannot paint an empty ring before the token");
  assert.match(render(view.units), /overflow:hidden/);
  const moving = renderToStaticMarkup(<SelectedUnitVfx view={view} visualUnits={view.units} unitId={f.actor.id} playerId="P1"
    motion={{ [f.actor.id]: { position: { col: 2.5, row: 2 }, mode: "normal", opacity: .5 } }} boardSize={9} cellSize={64} isFlipped={false} />);
  assert.match(moving, /left:160px;top:384px/);
  assert.match(moving, /opacity:0.5/);
  for (const [hero, bounds] of Object.entries(selectionRingBounds)) {
    const fit = selectionRingFrame(hero);
    const x = parseFloat(fit.left), y = parseFloat(fit.top), w = parseFloat(fit.width), h = parseFloat(fit.height);
    assert(Math.abs(x + bounds.left / 128 * w - 1) < .001, `${hero}: left visible rim at 1%`);
    assert(Math.abs(y + bounds.top / 128 * h - 1) < .001, `${hero}: top visible rim at 1%`);
    assert(Math.abs(x + (bounds.left + bounds.width) / 128 * w - 99) < .001, `${hero}: right visible rim at 99%`);
    assert(Math.abs(y + (bounds.top + bounds.height) / 128 * h - 99) < .001, `${hero}: bottom visible rim at 99%`);
  }
});

test("Four semantic signals reach gameplay exactly once for each authorized recipient and remain silent through snapshot/reconnect", () => {
  testExpansionSignals();
  for (const f of expansionSignalFixtures()) for (const recipient of ["P1", "P2", "spectator"] as const) {
    const before = recipient === "spectator" ? makeSpectatorView(f.before) : makePlayerView(f.before, recipient);
    const view = recipient === "spectator" ? makeSpectatorView(f.state) : makePlayerView(f.state, recipient);
    const events = projectEventsForRecipient(f.state, f.events, recipient).map((e, i) => ({ ...e, eventId: `signal-${i}` }));
    const { effects, plan } = playback(before, view, events);
    assert.equal(effects.filter(e => e.effectId === f.effectId).length, 1, `${recipient}/${f.effectId}`);
    if (f.effectId.endsWith("clean_soul_break")) {
      const ward = effects.find(e => e.effectId === f.effectId)!;
      assert.equal(ward.delayMs, plan.batch.combatCues?.find(c => c.kind === "miss")?.atMs);
      assert(!effects.some(e => e.effectId === "combatHit"));
    }
    const session = new PresentationSession(), binding = { roomId: "signal-room", recipient };
    session.begin(binding);
    assert.deepEqual(session.snapshot({ ...binding, streamId: "S", revision: 10, view }), []);
    assert.deepEqual(session.receive({ streamId: "S", revision: 10, events }, binding, view), []);
    assert.equal(session.receive({ streamId: "S", revision: 11, events }, binding, view)[0].events.length, events.length);
    assert.deepEqual(session.receive({ streamId: "S", revision: 11, events }, binding, view), []);
    const oldToken = session.token;
    session.begin(binding);
    assert(oldToken.cancelled);
    session.snapshot({ ...binding, streamId: "S", revision: 11, view });
    assert.deepEqual(session.receive({ streamId: "S", revision: 11, events }, binding, view), []);
    assert.deepEqual(mapEventBatchToVfx({ view, events: [], previousPositions: {}, revision: 12 }), []);
  }
});

test("Stealth art follows real successful owner-only attempts, refuses failed attempts, and Kaiser uses the permitted eclipse result", () => {
  for (const hero of ["artemida", "frisk", "hassan", "jackRipper", "jebe", "chikatilo", "loki", "lechy"]) {
    const f = fixture(hero);
    const begun = applyAction(f.state, { type: "enterStealth", unitId: f.actor.id }, makeRngSequence([]));
    const result = resolveAllPendingRollsWithEvents(begun.state, makeRngSequence([0.99]));
    const events = [...begun.events, ...result.events];
    assert(events.some(e => e.type === "stealthEntered" && e.success !== false), hero);
    for (const recipient of ["P1", "P2", "spectator"] as const) {
      const view = recipient === "spectator" ? makeSpectatorView(result.state) : makePlayerView(result.state, recipient);
      const mapped = mapEventBatchToVfx({ events: projectEventsForRecipient(result.state, events, recipient), view, previousPositions: {}, revision: 1 });
      assert.equal(mapped.filter(e => e.effectId === `expansion.${hero}.stealth_enter`).length, recipient === "P1" ? 1 : 0, hero);
    }
    const view = makePlayerView(f.state, "P1");
    assert(!mapEventBatchToVfx({ events: [{ type: "stealthEntered", unitId: f.actor.id, success: false }], view, previousPositions: {}, revision: 1 }).length);
    const revealed = mapEventBatchToVfx({ events: [{ type: "stealthRevealed", unitId: f.actor.id, reason: "search" }], view, previousPositions: {}, revision: 1 });
    assert.equal(revealed.filter(e => e.effectId === `expansion.${hero}.stealth_reveal`).length, 1);
  }
  const f = fixture("grand-kaiser"), state = setUnit(f.state, f.actor.id, { isStealthed: true });
  for (const recipient of ["P1", "P2", null] as const) {
    const view = recipient ? makePlayerView(state, recipient) : makeSpectatorView(state);
    const effects = mapEventBatchToVfx({ events: [{ type: "moonEffectApplied", effectId: "lunarEclipse", affectedUnitIds: [f.actor.id] }],
      view, viewerPlayerId: recipient, previousPositions: {}, revision: 1 });
    assert.equal(effects.filter(e => e.effectId === "expansion.grand-kaiser.stealth_enter").length, recipient === "P1" ? 1 : 0);
  }
});

test("Real Trickster area resolutions produce one thematic sweep, using confirmed radius and excluding an unrelated cast", () => {
  for (const hero of ["loki", "duolingo", "kaladin", "lechy", "sans"]) {
    const f = fixture(hero);
    const state = setUnit(f.state, f.actor.id, { charges: { ...f.actor.charges, tricksterAoE: 99 } });
    const started = applyAction(state, { type: "useAbility", unitId: f.actor.id, abilityId: "tricksterAoE" }, makeRngSequence([]));
    const resolved = resolveAllPendingRollsWithEvents(started.state, makeRngSequence([0.99, 0.8, 0.01, 0.2]));
    const events = [...started.events, ...resolved.events], view = makePlayerView(resolved.state, "P1");
    const aggregate = events.find(e => e.type === "aoeResolved");
    assert(aggregate?.type === "aoeResolved", hero);
    const { effects } = playback(makePlayerView(state, "P1"), view, projectEventsForRecipient(resolved.state, events, "P1"));
    const sweep = effects.filter(e => e.effectId === `expansion.${hero}.trickster_sweep`);
    assert.equal(sweep.length, 1, hero); assert.equal(sweep[0].widthCells, 2 * aggregate.radius + 1);
    assert.deepEqual(sweep[0].sourceCell, aggregate.center);
    const wrong = mapEventBatchToVfx({ view, events: [{ ...aggregate, abilityId: "different" }], previousPositions: {}, revision: 1 });
    assert(!wrong.some(e => e.effectId.endsWith("trickster_sweep")));
  }
});

test("Asgore soul results, precise arrow and Cannon hit preserve KEEP, use the result phase and reject miss/unknown soul", () => {
  const f = fixture("asgore"), view = makePlayerView(f.state, "P1");
  for (const soul of ["patience", "bravery", "integrity", "perseverance", "kindness", "justice", "unknown"]) {
    const effects = mapEventBatchToVfx({ view, events: [{ type: "asgoreSoulParadeResolved", asgoreId: f.actor.id, sourceCell: f.actor.position!,
      soulId: soul, soulName: soul, effectDescription: "", roll: 1 }], previousPositions: {}, revision: 1 });
    assert.equal(effects.filter(e => e.effectId === "soulParade").length, 1);
    assert.equal(effects.filter(e => e.effectId === `expansion.asgore.soul_${soul}`).length, soul === "unknown" ? 0 : 1);
  }
  for (const hero of ["artemida", "guts"]) for (const hit of [false, true]) {
    const f = fixture(hero), view = makePlayerView(f.state, "P1");
    const event: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id, sourceCell: f.actor.position!, targetCell: f.target.position!,
      attackerRoll: { dice: [6, 6], sum: 12, isDouble: true }, defenderRoll: { dice: [1, 2], sum: 3, isDouble: false }, hit, damage: hit ? 2 : 0, defenderHpAfter: 28,
      ...(hero === "artemida" ? { isBasicAttack: true } : { abilityId: "gutsCannon", abilityUseId: "cannon" }) };
    const { effects, plan } = playback(view, view, [event]);
    const expected = hero === "artemida" ? "expansion.artemida.precise_arrow_confirm" : "expansion.guts.cannon_hit";
    assert.equal(effects.filter(e => e.effectId === expected).length, hit ? 1 : 0);
    if (hit) assert.equal(effects.find(e => e.effectId === expected)?.delayMs, plan.batch.combatCues?.find(c => c.kind === "hit")?.atMs);
    if (hero === "guts" && hit) assert(effects.some(e => e.effectId === "gutsCannon"));
  }
});

test("Teleport endpoints for each ability stay on the movement clock and private ability redaction retains generic portals", () => {
  const f = fixture(), view = makePlayerView(f.state, "P1");
  for (const [abilityId, hero, exit, arrive] of [
    ["femtoDivineMove", "femto", "divine_exit", "divine_arrive"], ["groznyInvadeTime", "grozny", "invade_exit", "invade_arrive"],
    ["lechyGuideTraveler", "lechy", "guide_depart", "guide_arrive"], ["odinSleipnir", "odin", "sleipnir_exit", "sleipnir_arrive"],
  ]) {
    const event: ProjectedGameEvent = { type: "unitMoved", unitId: f.actor.id, from: { col: 2, row: 2 }, to: { col: 7, row: 7 },
      provenance: { kind: "ability", abilityId, movementKind: "teleport" } };
    const { effects } = playback(view, view, [event]);
    assert.deepEqual(effects.map(e => e.effectId), [`expansion.${hero}.${exit}`, `expansion.${hero}.${arrive}`]);
    assert.equal(effects[0].delayMs! + effects[0].durationMs!, effects[1].delayMs);
    const hidden = playback(view, view, [{ ...event, provenance: { kind: "ability", movementKind: "teleport" } }]);
    assert.deepEqual(hidden.effects.map(e => e.effectId), ["portal", "portal"]);
    assert(!effects.some(e => e.placement === "line" || e.effectId.endsWith("move_trail")));
  }
});

test("Private Surgeon feedback attaches to the HP control only for the owner; snapshot and miss produce no insight", () => {
  const f = fixture("jackRipper");
  const state = setUnit(f.state, f.actor.id, { jackKnownHpByTarget: { [f.target.id]: 29 } });
  const event: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id, sourceCell: f.actor.position!, targetCell: f.target.position!,
    attackerRoll: { dice: [6, 5], sum: 11, isDouble: false }, defenderRoll: { dice: [1, 2], sum: 3, isDouble: false }, hit: true, damage: 1, defenderHpAfter: 29, isBasicAttack: true };
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const view = recipient === "spectator" ? makeSpectatorView(state) : makePlayerView(state, recipient);
    const { effects, plan } = playback(view, view, [event]);
    const ui = effects.filter(e => e.uiAnchor === "healthBar");
    assert.equal(ui.length, recipient === "P1" ? 1 : 0);
    if (ui.length) {
      assert.equal(ui[0].unitId, f.target.id);
      assert.equal(ui[0].delayMs, plan.batch.combatCues?.find(c => c.kind === "hit")?.atMs);
      assert(!renderToStaticMarkup(<VfxLayer view={view} effects={enqueueBoardVfx({ current: [], incoming: ui, now: 1000 })} boardSize={9} cellSize={40} isFlipped={false} reducedMotion={false} />).includes("data-vfx-cue"));
    }
  }
});

test("Tyrant gain and forest stop follow accepted results, without an extra draw; Kaiser buildup ends with its existing impact/audio", () => {
  const f = fixture("grozny"), noDice = { next(): number { throw new Error("Unexpected RNG"); } };
  const state = setUnit(f.state, f.target.id, { owner: "P1", isAlive: false, hp: 0, position: null });
  const event: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id, sourceCell: f.actor.position!, targetCell: f.target.position!,
    attackerRoll: { dice: [], sum: 0, isDouble: false }, defenderRoll: { dice: [], sum: 0, isDouble: false }, hit: true, damage: 1, defenderHpAfter: 0 };
  for (const hit of [false, true]) {
    const result = handleGroznyTyrantAfterAttack(state, [{ ...event, hit }], { attackerId: f.actor.id, defenderId: f.target.id,
      tyrant: { groznyId: f.actor.id, targetId: f.target.id } }, noDice);
    assert.equal(result.events.filter(e => e.type === "groznyTyrantRewarded").length, hit ? 1 : 0);
    assert.equal(result.state.units[f.actor.id].attack, f.actor.attack + (hit ? 1 : 0));
  }
  const walker = fixture();
  const pending = { context: { unitId: walker.actor.id, options: [{ col: 3, row: 2 }], originalTo: { col: 8, row: 2 } } };
  const stopped = resolveForestMoveDestinationChoice(walker.state, pending, { type: "forestMoveDestination", position: { col: 3, row: 2 } }, noDice);
  assert.equal(stopped.events.filter(e => e.type === "forestMovementStopped").length, 1);
  assert(!resolveForestMoveDestinationChoice(walker.state, pending, { type: "forestMoveDestination", position: { col: 8, row: 8 } }, noDice).events.length);
  for (const abilityId of ["kaiserDora", "kaiserCarpetStrike"]) {
    const k = fixture("grand-kaiser"), view = makePlayerView(k.state, "P1");
    const aggregate: ProjectedGameEvent = { type: "aoeResolved", sourceUnitId: k.actor.id, sourceCell: k.actor.position!, abilityId, abilityUseId: "kaiser-use",
      center: { col: 5, row: 5 }, radius: abilityId === "kaiserDora" ? 1 : 2, affectedUnitIds: [], damagedUnitIds: [], revealedUnitIds: [] };
    const { effects, plan } = playback(view, view, [aggregate]);
    const buildup = effects.find(e => e.effectId.startsWith("expansion.grand-kaiser."))!;
    const impact = effects.find(e => e.effectId === (abilityId === "kaiserDora" ? "doraImpact" : "carpetImpact"))!;
    assert(buildup && impact); assert.equal(buildup.delayMs! + buildup.durationMs!, impact.delayMs);
    const sounds = mapEventBatchToSfx({ ...plan.batch, view });
    assert(sounds.some(s => s.delayMs === impact.delayMs));
  }
});

test("Guts/Kaneki/Undyne form actions replace the ordinary release/trail only while the projected form exists", () => {
  const f = fixture();
  for (const [heroId, flag, movement, attack] of [
    ["guts", "gutsBerserkModeActive", "berserk_move", "berserk_swing"],
    ["kaneki", "kanekiCentipedeUnlocked", "centipede_move", "centipede_attack"],
    ["undyne", "undyneImmortalActive", "undying_move", "undying_swing"],
    ["grand-kaiser", "transformed", "engineering_move", "engineering_attack"],
    ["mettaton", "mettatonExUnlocked", "ex_move", "ex_attack"],
    ["mettaton", "mettatonNeoUnlocked", "neo_move", "neo_attack"],
  ] as const) for (const active of [false, true]) {
    const state = setUnit(f.state, f.actor.id, { heroId, [flag]: active });
    const view = makePlayerView(state, "P1");
    const move: GameEvent = { type: "unitMoved", unitId: f.actor.id, provenance: { kind: "normal" }, from: f.actor.position!, to: { col: 3, row: 2 } };
    const hit: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id, sourceCell: f.actor.position!, targetCell: f.target.position!,
      attackerRoll: { dice: [], sum: 0, isDouble: false }, defenderRoll: { dice: [], sum: 0, isDouble: false }, hit: true, damage: 1, defenderHpAfter: 29, isBasicAttack: true };
    const { effects } = playback(view, view, [move, hit]);
    assert.equal(effects.filter(e => e.effectId === `expansion.${heroId}.${movement}`).length, active ? 1 : 0);
    assert.equal(effects.filter(e => e.effectId === `expansion.${heroId}.${attack}`).length, active ? 1 : 0);
    if (active) assert(!effects.some(e => e.effectId === `expansion.${heroId}.move_trail` || e.effectId === `expansion.${heroId}.attack_swing`));
  }
});

test("Guts/Undyne self-cost uses the authoritative end-turn debit before final death, without incoming-hit art", () => {
  const f = fixture();
  for (const heroId of ["guts", "undyne"] as const) for (const hp of [1, 5]) {
    const state = setUnit(f.state, f.actor.id, { heroId, hp, gutsBerserkModeActive: heroId === "guts", undyneImmortalActive: heroId === "undyne" });
    const result = heroId === "guts" ? applyGutsEndTurnDrain(state, f.actor.id)
      : applyUndyneImmortalEndTurnDrain(state, state, { type: "endTurn" });
    assert.equal(result.state.units[f.actor.id].hp, hp - 1);
    const { effects, plan } = playback(makePlayerView(state, "P1"), makePlayerView(result.state, "P1"), projectEventsForRecipient(result.state, result.events, "P1"));
    const cost = effects.find(e => e.effectId === `expansion.${heroId}.${heroId === "guts" ? "berserk" : "undying"}_self_cost`);
    assert(cost);
    assert(!effects.some(e => e.effectId === "combatHit"));
    const death = effects.find(e => e.effectId.endsWith("death_final"));
    assert.equal(Boolean(death), hp === 1);
    if (death) assert(death.delayMs! > cost.delayMs!);
    assert(plan.queue.some(item => item.type === "damageHpTween"));
  }
});

test("Shared hero routes: committed geometry, outcome phases, hidden source, deployment, final death and local selection cleanup", () => {
  const f = fixture();
  for (const heroId of BASIC_EXPANSION_HEROES) {
    const state = setUnit(f.state, f.actor.id, { heroId });
    const view = makePlayerView(state, "P1");
    const move: GameEvent = { type: "unitMoved", unitId: f.actor.id, provenance: { kind: "normal" }, from: { col: 1, row: 1 }, to: { col: 2, row: 1 } };
    const hit: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id, sourceCell: { col: 2, row: 1 }, targetCell: { col: 2, row: 2 },
      attackerRoll: { dice: [6, 5], sum: 11, isDouble: false }, defenderRoll: { dice: [1, 2], sum: 3, isDouble: false }, hit: true, damage: 1, defenderHpAfter: 29, isBasicAttack: true };
    const { effects } = playback(view, view, [move, hit,
      { type: "unitPlaced", unitId: f.actor.id, position: { col: 0, row: 0 } },
      { type: "unitDied", unitId: f.actor.id, deathCell: { col: 8, row: 8 }, killerId: null }]);
    const themed = effects.filter(e => e.effectId.startsWith(`expansion.${heroId}.`));
    for (const role of ["move_trail", "move_arrive", "attack_swing", "attack_projectile", "attack_impact", "deploy", "death_final"])
      if (expansionEffect(heroId, role)) assert.equal(themed.filter(e => e.effectId.endsWith(`.${role}`)).length, 1, `${heroId}/${role}`);
    const release = themed.find(e => /attack_swing|attack_projectile/.test(e.effectId));
    const impact = themed.find(e => e.effectId.endsWith("attack_impact"));
    if (release && impact) {
      assert.deepEqual(release.sourceCell, hit.sourceCell);
      assert.deepEqual(release.targetCell, hit.targetCell);
      assert(release.delayMs! < impact.delayMs!);
    }
    const invalid = playback(view, view, [{ ...hit, hit: false }, { ...hit, isBasicAttack: false },
      { ...hit, attackerId: undefined, sourceCell: undefined }]).effects;
    assert(!invalid.some(e => e.effectId.startsWith(`expansion.${heroId}.attack_impact`)), heroId);
    assert(!invalid.some(e => /attack_swing|attack_projectile/.test(e.effectId) && e.sourceCell === undefined));
    const selected = renderToStaticMarkup(<SelectedUnitVfx view={view} unitId={f.actor.id} playerId="P1" boardSize={9} cellSize={32} isFlipped />);
    assert(selected.includes("select_ring.png"), heroId);
    assert.equal(renderToStaticMarkup(<SelectedUnitVfx view={{ ...view, units: {} }} unitId={f.actor.id} boardSize={9} cellSize={32} isFlipped />), "");
    assert.deepEqual(mapEventBatchToVfx({ events: [], view, previousPositions: {}, revision: 1 }), []);
  }
});

test("Every profile has a real rules movement route; default Trickster teleports never acquire an invented trail", () => {
  for (const hero of BASIC_EXPANSION_HEROES) {
    const f = fixture(hero === "femto" ? "griffith" : hero);
    const state = hero === "femto" ? setUnit(f.state, f.actor.id, applyGriffithFemtoRebirth(f.actor, f.actor.position).unit) : f.state;
    const trickster = state.units[f.actor.id].class === "trickster";
    for (const chicken of trickster ? [false, true] : [false]) {
      let before = state;
      if (chicken) {
        before = setUnit(before, f.target.id, { heroId: "loki", class: "trickster" });
        before = setUnit(before, f.actor.id, addLokiChicken(before.units[f.actor.id], f.target.id));
      }
      const requested = applyAction(before, { type: "requestMoveOptions", unitId: f.actor.id, mode: "normal" }, makeRngSequence([]));
      const prepared = resolveAllPendingRollsWithEvents(requested.state, makeRngSequence([0.99]));
      const destination = prepared.state.pendingMove?.legalTo[0];
      assert(destination, `${hero}/${chicken}: a legal rules move exists`);
      const moved = applyAction(prepared.state, { type: "move", unitId: f.actor.id, to: destination }, makeRngSequence([]));
      const events = projectEventsForRecipient(moved.state, moved.events, "P1");
      assert(events.some(e => e.type === "unitMoved"), hero);
      const { effects } = playback(makePlayerView(prepared.state, "P1"), makePlayerView(moved.state, "P1"), events);
      const trail = effects.filter(e => e.effectId === `expansion.${hero}.move_trail`);
      if (trickster && !chicken) {
        assert.equal(trail.length, 0, "no path may be reconstructed for teleport");
        assert.equal(effects.filter(e => e.effectId === "portal").length, 2);
      } else assert(trail.length > 0, `${hero}: committed normal/rider segment`);
    }
  }
});

test("Actual spearman defense respects knight-double precedence; Bunker art requires damage really absorbed", () => {
  const f = fixture();
  for (const heroId of ["luche", "kaladin", "vladTepes", "sans", "undyne", "femto"]) for (const double of [false, true]) {
    const state = setUnit(f.state, f.target.id, { heroId, class: getHeroDefinition(heroId)?.mainClass ?? "knight" });
    const result = resolveAttack(state, { attackerId: f.actor.id, defenderId: f.target.id,
      rolls: { attackerDice: double ? [6, 6] : [6, 5], defenderDice: [1, 1] } });
    const event = result.events.find(e => e.type === "attackResolved");
    assert(event?.type === "attackResolved");
    assert.equal(event.hit, double); assert.equal(event.spearmanEvaded, double ? undefined : true);
    const { effects } = playback(makePlayerView(state, "P1"), makePlayerView(result.nextState, "P1"),
      projectEventsForRecipient(result.nextState, result.events, "P1"));
    assert.equal(effects.filter(e => e.effectId === `expansion.${heroId}.auto_defense`).length, double ? 0 : 1);
  }
  for (const damage of [0, 1, 4]) {
    const state = setUnit(f.state, f.target.id, { heroId: "grand-kaiser", class: "archer", bunker: { active: true, ownTurnsInBunker: 0 } });
    const result = resolveAttack(state, { attackerId: f.actor.id, defenderId: f.target.id, autoHit: true, damageOverride: damage,
      rolls: { attackerDice: [6, 5], defenderDice: [1, 2] } });
    const event = result.events.find(e => e.type === "attackResolved");
    assert(event?.type === "attackResolved");
    assert.equal(event.damage, Math.min(damage, 1));
    assert.equal(event.bunkerAbsorbedDamage, damage > 1 ? damage - 1 : undefined);
    const { effects } = playback(makePlayerView(state, "P1"), makePlayerView(result.nextState, "P1"),
      projectEventsForRecipient(result.nextState, result.events, "P1"));
    assert.equal(effects.filter(e => e.effectId === "expansion.grand-kaiser.bunker_absorb").length, damage > 1 ? 1 : 0);
  }
});

test("Every charge-based hero defense binds the accepted branch; transformed Kaiser currently has no charge-defense decision", () => {
  const f = fixture(), noDice = { next(): number { throw new Error("Defense choice must not roll"); } };
  for (const heroId of ["femto", "guts", "grozny", "kaneki", "mettaton", "papyrus", "duolingo", "grand-kaiser"]) {
    let state = setUnit(f.state, f.target.id, { heroId, class: getHeroDefinition(heroId)?.mainClass ?? "knight",
      charges: { berserkAutoDefense: 6 }, duolingoBerserkerUnlocked: true, mettatonExUnlocked: true, mettatonNeoUnlocked: true,
      papyrusUnbelieverActive: true, transformed: heroId === "grand-kaiser" });
    state = initKnowledgeForOwners(state);
    const declared = applyAction(state, { type: "attack", attackerId: f.actor.id, defenderId: f.target.id }, noDice);
    const attacked = resolvePendingRollOnce(declared.state, makeRngSequence([0.5, 0.7]));
    if (heroId === "grand-kaiser") {
      assert.notEqual(attacked.state.pendingRoll?.kind, "berserkerDefenseChoice");
      assert.equal(attacked.state.units[f.target.id].charges.berserkAutoDefense, 6);
      continue;
    }
    assert.equal(attacked.state.pendingRoll?.kind, "berserkerDefenseChoice", heroId);
    const pending = attacked.state.pendingRoll!;
    const defended = applyAction(attacked.state, { type: "resolvePendingRoll", pendingRollId: pending.id, player: pending.player, choice: "auto" }, noDice);
    assert.equal(defended.state.units[f.target.id].charges.berserkAutoDefense, 0);
    assert.equal(defended.state.units[f.target.id].hp, state.units[f.target.id].hp);
    const { effects } = playback(makePlayerView(attacked.state, "P2"), makePlayerView(defended.state, "P2"),
      projectEventsForRecipient(defended.state, defended.events, "P2"));
    assert.equal(effects.filter(e => e.effectId === `expansion.${heroId}.auto_defense`).length, 1, heroId);
    assert(!effects.some(e => e.effectId === "combatHit"));
  }
});

test("Source-backed static statuses hydrate silently and clear with state, death, hidden source or recipient permission", () => {
  const f = fixture();
  for (const [heroId, status, role] of [
    ["loki", { lokiMoveLockSources: [f.actor.id] }, "entangled_status"],
    ["kaladin", { kaladinMoveLockSources: [f.actor.id] }, "liberation_bind"],
    ["papyrus", { papyrusBoneStatus: { sourceUnitId: f.actor.id, kind: "blue" as const, expiresOnSourceOwnTurn: 3 } }, "blue_bone_status"],
    ["papyrus", { papyrusBoneStatus: { sourceUnitId: f.actor.id, kind: "orange" as const, expiresOnSourceOwnTurn: 3 } }, "orange_bone_status"],
    ["luche", { blindUntilOwnTurnStart: true, blindSourceId: f.actor.id }, "blind_status"],
    ["jackRipper", { immobilizedUntilOwnTurnStart: true, immobilizedSourceId: f.actor.id }, "snare_bound"],
    ["vladTepes", { movementDisabledNextTurn: true, movementDisabledSourceId: f.actor.id }, "forest_root"],
  ] satisfies [string, Partial<UnitState>, string][]) {
    let state = setUnit(f.state, f.actor.id, { heroId });
    state = setUnit(state, f.target.id, status);
    for (const recipient of ["P1", "P2", "spectator"] as const) {
      const view = recipient === "spectator" ? makeSpectatorView(state) : makePlayerView(state, recipient);
      const arts = expansionStatusArt(view, view.units[f.target.id], recipient === "spectator" ? null : recipient);
      assert(arts.some(a => a.effectId === `expansion.${heroId}.${role}`), `${heroId}/${recipient}`);
      assert.deepEqual(mapEventBatchToVfx({ events: [], view, previousPositions: {}, revision: 1 }), []);
      assert.deepEqual(expansionStatusArt(view, { ...view.units[f.target.id], isAlive: false }, "P1"), []);
      assert(!expansionStatusArt({ ...view, units: { ...view.units, [f.actor.id]: { ...view.units[f.actor.id], heroId: "zoro" } } }, view.units[f.target.id], "P1")
        .some(a => a.effectId === `expansion.${heroId}.${role}`));
    }
    const hidden = setUnit(state, f.actor.id, { isStealthed: true });
    const opponent = makePlayerView(hidden, "P2"), spectator = makeSpectatorView(hidden);
    for (const view of [opponent, spectator]) {
      assert(!JSON.stringify(view.units[f.target.id]).includes(`SourceId":"${f.actor.id}`));
      assert(!expansionStatusArt(view, view.units[f.target.id], null).some(a => a.effectId === `expansion.${heroId}.${role}`));
    }
    const cleared = makePlayerView(setUnit(state, f.target.id, {
      lokiMoveLockSources: undefined, kaladinMoveLockSources: undefined, papyrusBoneStatus: undefined,
      blindUntilOwnTurnStart: false, immobilizedUntilOwnTurnStart: false, movementDisabledNextTurn: false,
    }), "P1");
    assert(!expansionStatusArt(cleared, cleared.units[f.target.id], "P1").some(a => a.effectId.endsWith(`.${role}`)));
  }
  for (const heroId of ["jebe", "hassan", "donKihote", "elCidCompeador", "genghisKhan", "vladTepes", "griffith", "grozny"]) {
    const state = setUnit(f.state, f.actor.id, { heroId });
    const view = makePlayerView(state, "P1");
    assert.equal(expansionStatusArt(view, view.units[f.actor.id], "P1").some(a => a.effectId.endsWith("commander_aura")), !["griffith", "grozny"].includes(heroId));
  }
});

test("Punishment art uses authorized event-time cells once, with no tick for zero damage or a later reveal", () => {
  const f = fixture(), view = makePlayerView(f.state, "P1");
  const events: Array<Extract<GameEvent, { type: "papyrusBonePunished" | "sansBoneFieldPunished" | "lechyStormRollResult" }>> = [
    { type: "papyrusBonePunished", papyrusId: f.actor.id, targetId: f.target.id, boneType: "blue", damage: 1, reason: "moveSpent", hpAfter: 29, ...unitSignalTarget(f.state, f.target.id) },
    { type: "papyrusBonePunished", papyrusId: f.actor.id, targetId: f.target.id, boneType: "orange", damage: 1, reason: "nonMoveFirst", hpAfter: 28, ...unitSignalTarget(f.state, f.target.id) },
    { type: "sansBoneFieldPunished", targetId: f.target.id, boneType: "blue", damage: 1, reason: "moveSpent", hpAfter: 27, ...unitSignalTarget(f.state, f.target.id) },
    { type: "lechyStormRollResult", unitId: f.target.id, roll: 1, success: false, damage: 1, hpAfter: 26, ...unitSignalTarget(f.state, f.target.id) },
  ];
  const projected = projectEventsForRecipient(f.state, events, "P1");
  const { effects } = playback(view, view, projected);
  assert.deepEqual(effects.map(e => e.effectId), ["expansion.papyrus.blue_bone_punish", "expansion.papyrus.orange_bone_punish", "expansion.sans.bone_field_tick", "expansion.lechy.storm_tick"]);
  assert(effects.every(e => e.sourceCell?.row === f.target.position!.row));
  const zero = events.map(e => ({ ...e, damage: 0 }));
  assert.deepEqual(playback(view, view, zero).effects, []);
});

test("Form entry and temporary death never backdate new art or start final death before Rebirth/Undying/Madness completes", () => {
  const f = fixture();
  const state = setUnit(f.state, f.actor.id, { heroId: "kaneki", kanekiCentipedeUnlocked: true });
  const view = makePlayerView(state, "P1");
  const move: GameEvent = { type: "unitMoved", unitId: f.actor.id, from: { col: 1, row: 1 }, to: { col: 2, row: 1 }, provenance: { kind: "normal" } };
  const { effects } = playback(view, view, [move, { type: "kanekiFormEntered", unitId: f.actor.id, form: "scolopendra", sourceCell: f.actor.position! }, move]);
  assert.equal(effects.filter(e => e.effectId === "expansion.kaneki.move_trail").length, 1);
  assert.equal(effects.filter(e => e.effectId === "expansion.kaneki.centipede_move").length, 1);
  for (const continuation of [
    { type: "unitTransformed" as const, unitId: f.actor.id, fromHeroId: "griffith", toHeroId: "femto", reason: "griffithFemtoRebirth" as const },
    { type: "abilityUsed" as const, unitId: f.actor.id, abilityId: "undyneUndying" },
    { type: "abilityUsed" as const, unitId: f.actor.id, abilityId: "donKihoteMadness" },
  ]) {
    const { effects, plan } = playback(view, view, [{ type: "unitDied", unitId: f.actor.id, killerId: null, deathCell: f.actor.position! }, continuation]);
    assert(!effects.some(e => e.effectId === "unitDeath" || e.effectId.endsWith("death_final")));
    assert(!plan.queue.some(q => q.type === "removeVisualUnit" || q.type === "death"));
  }
  const don = setUnit(f.state, f.actor.id, { heroId: "donKihote", isAlive: false, position: null, hp: 0 });
  const completed = playback(view, makePlayerView(don, "P1"), [{ type: "unitDeathFinalized", unitId: f.actor.id, sourceCell: { col: 1, row: 4 } }]);
  assert.equal(completed.effects.filter(e => e.effectId === "expansion.donKihote.death_final").length, 1);
});

test("Zoro: real attack keeps Santoryu and replaces only the confirmed basic impact at the playback outcome", () => {
  const f = fixture();
  const rng = makeRngSequence(Array(40).fill(0).map((_, i) => [0.99, 0.8, 0.01, 0.2][i % 4]));
  const started = applyAction(f.state, { type: "attack", attackerId: f.actor.id, defenderId: f.target.id }, rng);
  const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
  const events = [...started.events, ...resolved.events];
  assert(events.some(e => e.type === "attackResolved" && e.hit && e.isBasicAttack));
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const after = recipient === "spectator" ? makeSpectatorView(resolved.state) : makePlayerView(resolved.state, recipient);
    const before = recipient === "spectator" ? makeSpectatorView(f.state) : makePlayerView(f.state, recipient);
    const projected = projectEventsForRecipient(resolved.state, events, recipient);
    const { effects, plan } = playback(before, after, projected as GameEvent[]);
    const impact = effects.filter(e => e.effectId === "expansion.zoro.attack_impact");
    assert.equal(impact.length, 1);
    assert.equal(effects.filter(e => e.effectId === "zoroSantoryu").length, 1);
    assert(!effects.some(e => e.effectId === "combatHit"));
    assert.equal(impact[0].delayMs, plan.batch.combatCues?.find(c => c.kind === "hit")?.atMs);
  }
});

test("Femto: accepted Divine Move produces two timed endpoints, preserves its cast and never adds an ordinary trail", () => {
  const f = fixture();
  const state = setUnit(f.state, f.actor.id, { heroId: "femto", transformed: true });
  const start = applyAction(state, { type: "useAbility", unitId: f.actor.id, abilityId: "femtoDivineMove" }, makeRngSequence([]));
  assert.equal(start.state.pendingRoll?.kind, "femtoDivineMoveRoll");
  const rolled = resolvePendingRollOnce(start.state, makeRngSequence([0.2]));
  assert.equal(rolled.state.pendingRoll?.kind, "femtoDivineMoveDestination");
  const pending = rolled.state.pendingRoll!;
  const destination = (pending.context.options as { col: number; row: number }[])[0];
  const chosen = applyAction(rolled.state, { type: "resolvePendingRoll", pendingRollId: pending.id,
    player: pending.player, choice: { type: "femtoDivineMoveDestination", position: destination } }, makeRngSequence([]));
  const before = makePlayerView(rolled.state, "P1"), after = makePlayerView(chosen.state, "P1");
  const { effects } = playback(before, after, projectEventsForRecipient(chosen.state, chosen.events, "P1"));
  assert.deepEqual(effects.map(e => e.effectId), ["expansion.femto.divine_exit", "expansion.femto.divine_arrive"]);
  assert.deepEqual(effects[0].sourceCell, f.actor.position);
  assert.deepEqual(effects[1].sourceCell, destination);
  assert.equal(effects[0].delayMs! + effects[0].durationMs!, effects[1].delayMs);
  const rejected = applyAction(rolled.state, { type: "resolvePendingRoll", pendingRollId: pending.id,
    player: pending.player, choice: { type: "femtoDivineMoveDestination", position: { col: 99, row: 99 } } }, makeRngSequence([]));
  assert.deepEqual(rejected.events, []);
  const cast = mapEventBatchToVfx({ events: projectEventsForRecipient(start.state, start.events, "P1"),
    view: makePlayerView(start.state, "P1"), previousPositions: {}, revision: 1 });
  assert(cast.some(e => e.effectId === "femtoMove"));
});

test("Griffith/Femto common routes preserve release, impact, selection and final-death distinctions", () => {
  const f = fixture();
  for (const heroId of ["griffith", "femto"]) {
    const state = setUnit(f.state, f.actor.id, { heroId });
    const view = makePlayerView(state, "P1");
    const event: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id,
      sourceCell: f.actor.position!, targetCell: f.target.position!, attackerRoll: { dice: [], sum: 0, isDouble: false },
      defenderRoll: { dice: [], sum: 0, isDouble: false }, hit: true, damage: 1, defenderHpAfter: 29, isBasicAttack: true };
    const { effects, plan } = playback(view, view, [event]);
    const swing = effects.find(e => e.effectId === `expansion.${heroId}.attack_swing`)!;
    const impact = effects.find(e => e.effectId === `expansion.${heroId}.attack_impact`)!;
    assert(swing && impact);
    assert.equal(swing.delayMs! + swing.strikeContactMs!, impact.delayMs);
    assert(plan.batch.combatCues?.some(c => c.kind === "hit"));
    assert(renderToStaticMarkup(<SelectedUnitVfx view={view} unitId={f.actor.id} boardSize={9} cellSize={40} isFlipped />).includes(`${heroId}/expansion/select_ring.png`));
    const rebirth: GameEvent = { type: "unitTransformed", unitId: f.actor.id, fromHeroId: "griffith", toHeroId: "femto", reason: "griffithFemtoRebirth" };
    assert(!mapEventBatchToVfx({ events: [rebirth], view, previousPositions: {}, revision: 1 }).some(e => e.effectId.endsWith("death_final")));
  }
});

test("Zoro: miss, ability attack and redacted source cannot create a thematic damage impact", () => {
  const f = fixture(), view = makePlayerView(f.state, "P1");
  const attack: GameEvent = { type: "attackResolved", attackerId: f.actor.id, defenderId: f.target.id,
    sourceCell: f.actor.position!, targetCell: f.target.position!, attackerRoll: { dice: [1, 2], sum: 3, isDouble: false },
    defenderRoll: { dice: [5, 6], sum: 11, isDouble: false }, hit: false, damage: 0, defenderHpAfter: 30, isBasicAttack: true };
  for (const event of [attack, { ...attack, hit: true, isBasicAttack: false }, { ...attack, hit: true, attackerId: undefined }]) {
    const effects = mapEventBatchToVfx({ events: [event], view, previousPositions: {}, revision: 1 });
    assert(!effects.some(e => e.effectId === "expansion.zoro.attack_impact"));
  }
});

test("Zoro: confirmed movement uses the reached cell, excludes incompatible transport and releases expired/duplicate cues", () => {
  const f = fixture();
  const result = applyAction(f.state, { type: "move", unitId: f.actor.id, to: { col: 3, row: 2 } }, makeRngSequence([]));
  assert(result.events.some(e => e.type === "unitMoved"));
  const after = makePlayerView(result.state, "P1");
  const { effects, plan } = playback(makePlayerView(f.state, "P1"), after,
    projectEventsForRecipient(result.state, result.events, "P1") as GameEvent[]);
  const trail = effects.find(e => e.effectId === "expansion.zoro.move_trail")!;
  const arrive = effects.find(e => e.effectId === "expansion.zoro.move_arrive")!;
  assert(trail && arrive);
  assert.deepEqual(trail.targetCell, arrive.sourceCell);
  assert.equal(arrive.delayMs, plan.movementPlan.cues[0].atMs + plan.movementPlan.cues[0].durationMs);
  const cue = plan.movementPlan.cues[0];
  assert(cue.kind === "movement");
  for (const mode of ["boat", "tralala", "forced", "teleport"] as const)
    assert.deepEqual(expansionMovement({ ...cue, mode }, after), []);
  const queued = enqueueBoardVfx({ current: [], incoming: [...effects, ...effects], now: 1000 });
  assert.equal(queued.length, effects.length);
  assert.deepEqual(pruneExpiredBoardVfx(queued, 100000), []);
  const hidden = { ...after, units: {} };
  for (const cellSize of [32, 72]) for (const isFlipped of [false, true]) for (const reducedMotion of [false, true]) {
    const html = renderToStaticMarkup(<VfxLayer effects={queued} view={after} boardSize={9}
      cellSize={cellSize} isFlipped={isFlipped} reducedMotion={reducedMotion} />);
    assert(html.includes("expansion.zoro.move_arrive"));
    assert(!renderToStaticMarkup(<VfxLayer effects={queued} view={hidden} boardSize={9}
      cellSize={cellSize} isFlipped={isFlipped} reducedMotion={reducedMotion} />).includes("data-vfx-cue"));
  }
});

test("Zoro: selection follows explicit local choice and clears on deselect, death or lost permission; deploy and final death use events", () => {
  const f = fixture(), view = makePlayerView(f.state, "P1");
  const selection = (current: PlayerView, unitId: string | null = f.actor.id) => renderToStaticMarkup(
    <SelectedUnitVfx view={current} unitId={unitId} boardSize={9} cellSize={40} isFlipped={false} />);
  assert(selection(view).includes("select_ring.png"));
  assert.equal(selection(view, null), "");
  assert.equal(selection({ ...view, units: {} }), "");
  assert.equal(selection({ ...view, units: { ...view.units, [f.actor.id]: { ...f.actor, isAlive: false } } }), "");
  const events: GameEvent[] = [
    { type: "unitPlaced", unitId: f.actor.id, position: { col: 1, row: 1 } },
    { type: "unitDied", unitId: f.actor.id, deathCell: { col: 7, row: 7 }, killerId: null },
  ];
  const mapped = mapEventBatchToVfx({ events, view, previousPositions: {}, revision: 1 });
  assert.equal(mapped.find(e => e.effectId === "expansion.zoro.deploy")?.sourceCell?.col, 1);
  assert.equal(mapped.find(e => e.effectId === "expansion.zoro.death_final")?.sourceCell?.col, 7);
  assert.deepEqual(mapEventBatchToVfx({ events: [], view: { ...view, units: { ...view.units,
    [f.actor.id]: { ...f.actor, hp: 0 } } }, previousPositions: {}, revision: 1 }), []);
});
