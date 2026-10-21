import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getHeroDefinition, makePlayerView, makeSpectatorView, projectEventsForRecipient, type UnitState } from "../../../../rules/src/index";
import { attackOutcomeFixtures } from "../../../../rules/src/tests/helpers/attackOutcomeFixtures";
import { buildCombatVisualPlaybackPlan } from "../../game/effects/combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "../../game/effects/visualResolution";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { attackOutcomeRequests, HERO_GUARD_HUES } from "./attackOutcome";
import { VfxLayer } from "./VfxLayer";
const fixtures = attackOutcomeFixtures();
function present(f: typeof fixtures[number], recipient: "P1" | "P2" | "spectator", reducedMotion = false) {
  const project = recipient === "spectator" ? makeSpectatorView : (state: typeof f.before) => makePlayerView(state, recipient);
  const before = project(f.before), after = project(f.after);
  const events = projectEventsForRecipient(f.after, f.events, recipient).map((event, index) => ({ ...event, eventId: `${f.id}:${index}` }));
  const plan = buildCombatVisualPlaybackPlan({ batch: { revision: 1, streamId: "outcome", events, view: after },
    startingHpByUnitId: snapshotVisualHp(before), startingUnitsByUnitId: snapshotVisualUnits(before), finalView: after, reducedMotion });
  return { plan, after, events, effects: mapEventBatchToVfx({ ...plan.batch, view: after, previousPositions: {} }) };
}

test("every hero and attack form keeps one permitted release for either result", () => {
  const f = fixtures.find(f => f.id === "outcome.miss.grand-kaiser")!;
  const base = makePlayerView(f.before, "P1");
  const accepted = projectEventsForRecipient(f.after, f.events, "P1").find(event => event.type === "attackResolved")!;
  assert(accepted.type === "attackResolved");
  const profiles: [string, Partial<UnitState>][] = Object.keys(HERO_GUARD_HUES).map(hero => [hero, {}]);
  profiles.push(["guts", { gutsBerserkModeActive: true }], ["kaneki", { kanekiCentipedeUnlocked: true }],
    ["undyne", { undyneImmortalActive: true }], ["grand-kaiser", { transformed: true }],
    ["mettaton", { mettatonExUnlocked: true }], ["mettaton", { mettatonExUnlocked: true, mettatonNeoUnlocked: true }]);
  for (const [hero, flags] of profiles) for (const hit of [true, false]) {
    const view = { ...base, units: { ...base.units, [f.sourceId]: { ...base.units[f.sourceId], heroId: hero,
      class: getHeroDefinition(hero)!.mainClass, ...flags } } };
    const event = { ...accepted, hit, ...(flags.gutsBerserkModeActive ? { isBasicAttack: undefined, attackSignature: "gutsBerserkSingle" as const } : {}) };
    const effects = mapEventBatchToVfx({ events: [event], view, previousPositions: {}, revision: 1 });
    const release = effects.filter(effect => effect.placement === "projectile" || effect.strikeContactMs !== undefined || effect.effectId === "zoroSantoryu");
    assert.equal(release.length, 1, `${hero}/${JSON.stringify(flags)}/${hit}`);
    if (hero === "zoro") assert.deepEqual(release[0].sourceCell, event.targetCell, "native Santoryu remains the sole release at the target");
    else { assert.deepEqual(release[0].sourceCell, event.sourceCell); assert.deepEqual(release[0].targetCell, event.targetCell); }
    assert.equal(effects.some(effect => effect.effectId === "missShield"), !hit);
    const hidden = { ...view, units: { ...view.units, [f.sourceId]: { ...view.units[f.sourceId], position: null } } };
    const html = renderToStaticMarkup(<VfxLayer effects={release.map(effect => ({ ...effect, startedAt: Date.now(), expiresAt: Date.now() + 600 }))}
      view={hidden} boardSize={9} cellSize={64} isFlipped={false} reducedMotion={false} />);
    assert(!html.includes("data-vfx-cue"), "no gesture may remain at a hidden source");
  }
});

test("ordinary misses preserve the release and show exactly one guard in each of the 29 defenders' palettes", () => {
  for (const f of fixtures.filter(f => f.id.startsWith("outcome.miss."))) for (const recipient of ["P1", "P2", "spectator"] as const)
    for (const reduced of [false, true]) {
      const p = present(f, recipient, reduced), saved = JSON.stringify(f.after);
      const guard = p.effects.filter(effect => effect.effectId === "missShield");
      const release = p.effects.filter(effect => effect.strikeContactMs !== undefined);
      assert.equal(guard.length, 1, `${f.id}/${recipient}`); assert.equal(release.length, 1);
      assert.equal(guard[0].tintHue, HERO_GUARD_HUES[f.after.units[f.targetIds[0]].heroId!]);
      assert.equal(guard[0].unitId, f.targetIds[0]);
      assert.equal(release[0].delayMs! + release[0].strikeContactMs!, guard[0].delayMs);
      assert(!p.effects.some(effect => effect.effectId === "combatHit" || effect.effectId === "combatMiss" || effect.effectId.endsWith(".auto_defense")));
      assert.equal(JSON.stringify(f.after), saved);
    }
});

test("accepted prevention uses its existing defense instead of a generic miss; reduction retains both hit and defense", () => {
  const expected: Record<string, string> = { "berserker.guts": "expansion.guts.auto_defense", "spearman.luche": "expansion.luche.auto_defense",
    "muninn.odin": "odinMuninn", "bravery.asgore": "shield", "cleanSoul.frisk": "expansion.frisk.clean_soul_break",
    "reduction.guts": "expansion.guts.auto_defense", "reduction.undyne": "expansion.undyne.auto_defense", "bunker.grand-kaiser": "expansion.grand-kaiser.bunker_absorb" };
  for (const [id, effectId] of Object.entries(expected)) for (const recipient of ["P1", "P2", "spectator"] as const) {
    const f = fixtures.find(f => f.id === `outcome.${id}`)!, p = present(f, recipient);
    const protection = p.effects.filter(effect => effect.effectId === effectId);
    assert.equal(protection.length, 1, id);
    const outcome = p.plan.batch.combatCues!.find(cue => cue.kind === "hit" || cue.kind === "miss")!;
    assert.equal(protection[0].delayMs, outcome.atMs);
    assert.equal(p.effects.filter(effect => effect.effectId === "combatHit").length, outcome.kind === "hit" ? 1 : 0);
    assert(!p.effects.some(effect => effect.effectId === "missShield" || effect.effectId === "combatMiss"));
    assert.equal(p.effects.filter(effect => effect.strikeContactMs !== undefined).length, 1);
  }
});

test("each actual Rider path target gets one slash and its own hit or miss, including non-Rider hero forms", () => {
  for (const f of fixtures.filter(f => f.id.includes(".rider."))) for (const recipient of ["P1", "P2", "spectator"] as const) {
    const p = present(f, recipient), releases = p.effects.filter(effect => effect.strikeContactMs !== undefined);
    if (f.id.endsWith("riverPerson")) { assert.equal(releases.length, 0); continue; }
    assert.equal(releases.length, 2, `${f.id}/${recipient}`);
    assert(!p.effects.some(effect => effect.placement === "projectile" && effect.strikeContactMs !== undefined));
    const attacks = p.events.filter(event => event.type === "attackResolved");
    assert.deepEqual(releases.map(effect => effect.targetCell), attacks.map(event => event.targetCell));
    assert.equal(new Set(releases.map(effect => effect.id)).size, 2);
    assert(releases.every(effect => effect.placement === "cell" && effect.strikeContactMs === 420));
    assert.equal(p.effects.filter(effect => effect.effectId === "missShield").length, 1);
    const outcomes = p.plan.batch.combatCues!.filter(cue => cue.kind === "hit" || cue.kind === "miss");
    releases.forEach((effect, index) => assert.equal(effect.delayMs! + effect.strikeContactMs!, outcomes[index].atMs));
    assert(releases[1].delayMs! >= outcomes[0].atMs);
  }
});

test("themed guard uses the existing sprite, has no input surface, and disappears when target permission is lost", () => {
  const f = fixtures.find(f => f.id === "outcome.miss.grand-kaiser")!, p = present(f, "P1");
  const effect = p.effects.find(effect => effect.effectId === "missShield")!;
  const queued = { ...effect, startedAt: Date.now(), expiresAt: Date.now() + 300 };
  for (const isFlipped of [false, true]) for (const reducedMotion of [false, true]) {
    const html = renderToStaticMarkup(<VfxLayer effects={[queued]} view={p.after} boardSize={9} cellSize={64} isFlipped={isFlipped} reducedMotion={reducedMotion} />);
    assert.match(html, /hex-shield-strip/); assert.match(html, /hue-rotate\(-190deg\)/); assert.match(html, /pointer-events-none/);
    const hidden = { ...p.after, units: { ...p.after.units, [f.targetIds[0]]: { ...p.after.units[f.targetIds[0]], position: null } } };
    const cleaned = renderToStaticMarkup(<VfxLayer effects={[queued]} view={hidden} boardSize={9} cellSize={64} isFlipped={isFlipped} reducedMotion={reducedMotion} />);
    assert(!cleaned.includes("data-vfx-cue"));
    const dead = { ...hidden, units: { ...hidden.units, [f.sourceId]: { ...hidden.units[f.sourceId], position: null, isAlive: false },
      [f.targetIds[0]]: { ...hidden.units[f.targetIds[0]], isAlive: false } } };
    const event = p.events.find(event => event.type === "attackResolved")!;
    assert(event.type === "attackResolved");
    const hit = attackOutcomeRequests({ ...event, hit: true }, dead, "final-hit", 0)[0];
    const release = p.effects.find(effect => effect.strikeContactMs !== undefined)!;
    const finalHtml = renderToStaticMarkup(<VfxLayer effects={[hit, release].map(effect => ({ ...effect, startedAt: Date.now(), expiresAt: Date.now() + 600 }))}
      view={dead} boardSize={9} cellSize={64} isFlipped={isFlipped} reducedMotion={reducedMotion} />);
    assert.equal((finalHtml.match(/data-vfx-cue=/g) ?? []).length, 2, "a known final-death snapshot must not erase its preceding committed attack/hit");
  }
});
