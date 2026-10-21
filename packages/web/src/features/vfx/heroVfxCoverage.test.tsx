import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  type GameEvent,
  type GameState,
  type PlayerView,
  type UnitClass,
} from "../../../../rules/src/index";
import {
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  setUnit,
  toBattleState,
  resolvePendingRollOnce,
} from "../../../../rules/src/tests/helpers/testUtils";
import { applyNewBatchPostAction } from "../../../../rules/src/actions/heroes/newBatchPost";
import { applyFriskPostAction } from "../../../../rules/src/actions/heroes/frisk/postAction";
import { tryApplyFriskPowerOfFriendship } from "../../../../rules/src/actions/heroes/frisk/friendship";
import { maybeTriggerElCidKolada } from "../../../../rules/src/actions/heroes/elCid/kolada";
import coverage from "../../assets/heroVfxCoverage.json";
import { vfxRegistry } from "./vfxRegistry";
import { vfxAssets } from "./imagePreload";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { mapEventBatchToSfx } from "../sfx/sfxEventMapper";
import { VfxLayer } from "./VfxLayer";
import { spritePlayback } from "./VfxSprite";
import { resolveUnitStatuses, STATUS_VISUALS } from "./persistentStatuses";
import { rosterVfx } from "../../game/effects/presentationPreload";
import { expansionAssets, type ExpansionEffectId } from "./expansionCatalog.generated";
import { BASIC_EXPANSION_HEROES } from "./expansionPresentation";
import { buildCombatVisualPlaybackPlan } from "../../game/effects/combatPlayback";
import { PresentationSession } from "../../game/effects/presentationSession";
import type { PresentationEvent } from "../../game/effects/types";
import type { VfxEffectId, BoardVfxRequest } from "./vfxTypes";

const origin = { col: 2, row: 2 },
  target = { col: 5, row: 2 };

test("expansion ledger accounts for every PNG, binds only reachable profiles, and invalidates changed bytes without claiming visual review", () => {
  const ledger: { assets: Array<{ id: string; heroId: string; filename: string; sha256: string;
    effectIds: ExpansionEffectId[]; integrationStatus: string; triggerRoute: string | null;
    verification: { tests: string[]; visual: { reviewed: boolean; evidence: string[] } }; blocker: string | null }> } =
    JSON.parse(readFileSync(new URL("../../../../../docs/assets/vfx-workflow/integration-state.json", import.meta.url), "utf8"));
  const files = readdirSync(new URL("../../assets/vfx/heroes/", import.meta.url), { recursive: true })
    .map(f => `vfx/heroes/${f.toString().replace(/\\/g, "/")}`).filter(f => f.includes("/expansion/") && f.endsWith(".png"));
  assert.deepEqual(ledger.assets.map(a => a.filename).sort(), files.sort());
  assert.equal(new Set(ledger.assets.map(a => a.id)).size, ledger.assets.length);
  for (const row of ledger.assets) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(`../../assets/${row.filename}`, import.meta.url))).digest("hex"), row.sha256);
    for (const id of row.effectIds) {
      assert.equal(expansionAssets[id].heroId, row.heroId);
      assert(vfxAssets(vfxRegistry[id]).some(art => art.asset?.endsWith(row.filename)));
      assert(rosterVfx([row.heroId]).includes(id));
      assert(!rosterVfx(["unknown-base-profile"]).includes(id));
    }
    if (row.integrationStatus === "bound" || row.integrationStatus === "verified") {
      assert(BASIC_EXPANSION_HEROES.has(row.heroId));
      assert(row.triggerRoute, row.id);
      assert.equal(row.blocker, null);
    }
    if (row.integrationStatus === "verified") assert(row.verification.tests.length, row.id);
    if (row.verification.visual.reviewed) assert(row.verification.visual.evidence.length, row.id);
    if (row.integrationStatus === "blocked") assert(row.blocker, row.id);
  }
  assert.equal(Object.keys(expansionAssets).length, ledger.assets.length);
});
function fixture(hero: string, slot: UnitClass) {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: hero })),
    createDefaultArmy("P2"),
  );
  const actor = Object.values(state.units).find((u) => u.heroId === hero)!;
  assert(actor, hero);
  const defender = Object.values(state.units).find(
    (u) => u.owner === "P2" && u.class === "knight",
  )!;
  state = setUnit(state, actor.id, { position: origin, isStealthed: false });
  state = setUnit(state, defender.id, { position: target, hp: 30, isStealthed: false });
  state = initKnowledgeForOwners(toBattleState(state, "P1", actor.id));
  return { state, actor: state.units[actor.id], defender: state.units[defender.id] };
}
function delivered(
  state: GameState,
  events: GameEvent[],
  recipient: "P1" | "P2" | "spectator" = "P1",
): PresentationEvent[] {
  return projectEventsForRecipient(state, events, recipient).map((event, index) => ({
    ...event,
    eventId: `e-${index}`,
  }));
}
function map(events: PresentationEvent[], view: PlayerView) {
  return mapEventBatchToVfx({
    events,
    view,
    previousPositions: {},
    revision: 1,
    streamId: "vfx-coverage",
  });
}

test("legacy hero PNGs retain verified coverage and imported expansion PNGs match their explicit manifests", () => {
  const allHeroFiles = readdirSync(new URL("../../assets/vfx/heroes/", import.meta.url), {
    recursive: true,
  })
    .map((file) => file.toString().replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".png"));
  // Newly delivered packs are staged for later event integration. Keep the
  // existing runtime coverage contract strict, and account for every staged
  // PNG through its manifest rather than treating it as live or ignoring it.
  const heroFiles = allHeroFiles.filter((file) => !file.includes("/expansion/"));
  const expansionFiles = allHeroFiles.filter((file) => file.includes("/expansion/"));
  const declaredExpansionFiles = new Set<string>();
  const expansionFolders = new Set(expansionFiles.map((file) => file.slice(0, file.lastIndexOf("/"))));
  for (const folder of expansionFolders) {
    const manifest: {
      heroId: string;
      status: string;
      assets: Array<{
        filename: string;
        sha256: string;
        frameWidth: number;
        frameHeight: number;
        frames: number;
        fps: number;
        loop: boolean;
      }>;
    } = JSON.parse(readFileSync(new URL(`../../assets/vfx/heroes/${folder}/manifest.json`, import.meta.url), "utf8"));
    assert.equal(folder, `${manifest.heroId}/expansion`);
    assert.equal(manifest.status, "imported_assets_not_runtime_bindings");
    for (const asset of manifest.assets) {
      assert(asset.filename.startsWith(`vfx/heroes/${folder}/`));
      assert(/^[\w-]+\.png$/.test(asset.filename.slice(asset.filename.lastIndexOf("/") + 1)));
      const file = asset.filename.slice("vfx/heroes/".length);
      assert(!declaredExpansionFiles.has(file), `duplicate imported PNG: ${file}`);
      declaredExpansionFiles.add(file);
      const bytes = readFileSync(new URL(`../../assets/${asset.filename}`, import.meta.url));
      assert.equal(bytes.subarray(1, 4).toString(), "PNG");
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, file);
      assert.equal(asset.frameWidth, 128);
      assert.equal(asset.frameHeight, 128);
      assert([1, 12, 16, 24].includes(asset.frames), file);
      assert.equal(bytes.readUInt32BE(16), asset.frames * asset.frameWidth);
      assert.equal(bytes.readUInt32BE(20), asset.frameHeight);
      assert.equal(bytes[24], 8, file);
      assert.equal(bytes[25], 6, file);
      assert.equal(asset.fps, asset.frames === 1 ? 0 : 24);
      assert.equal(asset.loop, false);
    }
  }
  assert.deepEqual([...declaredExpansionFiles].sort(), expansionFiles.sort());
  const registered = new Set(
    Object.values(vfxRegistry)
      .flatMap(vfxAssets)
      .flatMap((art) => (art.asset?.includes("/heroes/") ? [art.asset.split("/heroes/")[1]] : [])),
  );
  assert.equal(heroFiles.length, 137);
  assert.deepEqual(
    heroFiles.filter((file) => !registered.has(file)),
    ["undyne/shift.png"],
  );
  assert.equal(coverage.length, 45);
  assert.equal(new Set(coverage.map((row) => row.hero)).size, 18);
  assert.equal(new Set(coverage.map((row) => `${row.hero}/${row.file}`)).size, 45);
  const totals: Record<string, number> = {};
  for (const row of coverage) {
    totals[row.status] = (totals[row.status] ?? 0) + 1;
    const bytes = readFileSync(
      new URL(`../../assets/vfx/heroes/${row.hero}/${row.file}`, import.meta.url),
    );
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), row.frames * row.frameWidth);
    assert.equal(bytes.readUInt32BE(20), row.frameHeight);
    if (row.status === "BLOCKED_UNIMPLEMENTED_ABILITY") {
      assert.equal(`${row.hero}/${row.file}`, "undyne/shift.png");
      assert(!Object.values(vfxRegistry).some((def) => def.asset?.endsWith("/undyne/shift.png")));
      continue;
    }
    const key = row.key as VfxEffectId,
      definition = vfxRegistry[key];
    assert(definition, row.file);
    const art = vfxAssets(definition).find((art) =>
      art.asset?.endsWith(`/${row.hero}/${row.file}`),
    );
    assert(art, `${key}: ${row.file}`);
    assert.equal(readFileSync(fileURLToPath(art.asset!)).length, bytes.length);
    assert.equal(art.frames, row.frames);
    assert.equal(art.frameWidth, row.frameWidth);
    assert.equal(art.frameHeight, row.frameHeight);
    assert(rosterVfx([row.hero]).includes(key), `${key} missing from authorized roster preload`);
  }
  assert.deepEqual(totals, {
    LIVE_CONNECTED: 40,
    PERSISTENT_CONNECTED: 4,
    BLOCKED_UNIMPLEMENTED_ABILITY: 1,
  });
});

test("every new composite shares geometry, clock, frame stepping and cleanup in P1/P2, phone/desktop and reduced motion", () => {
  const view = makePlayerView(fixture("artemida", "archer").state, "P1");
  for (const key of new Set(
    coverage.filter((row) => row.composite).map((row) => row.key as VfxEffectId),
  )) {
    const def = vfxRegistry[key];
    assert.equal(def.layers?.length, 2, key);
    const [primary, accent] = def.layers!;
    assert.equal(primary.role, "primary");
    assert.equal(accent.role, "accent");
    for (const reducedMotion of [true, false]) {
      const p = spritePlayback(primary, def.durationMs, reducedMotion),
        a = spritePlayback(accent, def.durationMs, reducedMotion);
      assert.equal(p.count, a.count);
      assert.equal(p.fps, a.fps);
      assert.equal(p.steppingDurationMs, a.steppingDurationMs);
      assert.equal(p.style.backgroundPositionX, a.style.backgroundPositionX);
      for (const isFlipped of [false, true])
        for (const cellSize of [32, 72]) {
          const effect: BoardVfxRequest = {
            id: key,
            effectId: key,
            placement: def.defaultPlacement,
            sourceCell: { col: 0, row: 0 },
            targetCell: { col: 8, row: 8 },
            widthCells: 3,
            heightCells: 3,
          };
          const html = renderToStaticMarkup(
            <VfxLayer
              effects={[{ ...effect, startedAt: 100, expiresAt: 100 + def.durationMs }]}
              view={view}
              boardSize={9}
              cellSize={cellSize}
              isFlipped={isFlipped}
              reducedMotion={reducedMotion}
            />,
          );
          assert.equal((html.match(/data-vfx-cue=/g) ?? []).length, 1, key);
          assert.equal((html.match(/class="vfx-sprite/g) ?? []).length, 2, key);
          assert(html.includes("pointer-events:none"));
          assert(html.includes("overflow-hidden"));
          assert(!html.includes("NaN"));
        }
    }
  }
});

const lines = [
  [
    "artemida",
    "archer",
    "artemidaSilverCrescent",
    "artemidaCrescent",
    { target },
    { from: origin, to: target },
  ],
  [
    "elCidCompeador",
    "knight",
    "elCidCompeadorTisona",
    "elCidTisona",
    { target },
    { from: origin, to: { col: 8, row: 2 } },
  ],
  [
    "luche",
    "spearman",
    "lucheDivineRay",
    "lucheRay",
    { mode: "line", target },
    { from: origin, to: { col: 8, row: 2 } },
  ],
  [
    "mettaton",
    "archer",
    "mettatonLaser",
    "mettatonLaser",
    { target },
    { from: origin, to: { col: 8, row: 2 } },
  ],
  [
    "papyrus",
    "spearman",
    "papyrusCoolGuy",
    "papyrusLine",
    { target, axis: "row" },
    { from: { col: 0, row: 2 }, to: { col: 8, row: 2 } },
  ],
  [
    "undyne",
    "berserker",
    "undyneEnergySpear",
    "undyneEnergy",
    { target, axis: "row" },
    { from: { col: 0, row: 2 }, to: { col: 8, row: 2 } },
  ],
] as const;
for (const [hero, slot, abilityId, key, payload, expected] of lines) {
  test(`${hero}: real ${abilityId} resolution produces one dedicated bounded composite and preserves generic outcomes`, () => {
    const f = fixture(hero, slot);
    const state = setUnit(f.state, f.actor.id, {
      charges: { ...f.actor.charges, [abilityId]: 99, lucheSunGlory: 99 },
      mettatonExUnlocked: true,
      mettatonRating: 99,
    });
    const rng = makeRngSequence(
      Array(100)
        .fill(0)
        .map((_, i) => [0.99, 0.8, 0.01, 0.2][i % 4]),
    );
    const started = applyAction(
      state,
      { type: "useAbility", unitId: f.actor.id, abilityId, payload },
      rng,
    );
    assert(
      started.events.some((e) => e.type === "abilityUsed"),
      JSON.stringify(started),
    );
    const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
    const events = delivered(resolved.state, [...started.events, ...resolved.events]);
    const view = makePlayerView(resolved.state, "P1");
    const sprites = map(events, view),
      signature = sprites.filter((r) => r.effectId === key);
    assert.equal(signature.length, 1, JSON.stringify(events));
    assert.equal(signature[0].placement, "line");
    assert.deepEqual(signature[0].segments, [expected]);
    assert(!sprites.some((r) => r.effectId === "statusSmall"));
    assert.equal(
      sprites.filter((r) => r.effectId === "combatHit" || r.effectId === "missShield").length,
      events.filter((e) => e.type === "attackResolved").length,
    );
    const moved = {
      ...view,
      units: {
        ...view.units,
        [f.actor.id]: { ...view.units[f.actor.id], position: { col: 8, row: 8 } },
      },
    };
    assert.deepEqual(map(events, moved).filter((r) => r.effectId === key)[0].segments, [expected]);
    for (const recipient of ["P2", "spectator"] as const) {
      const rv =
        recipient === "P2"
          ? makePlayerView(resolved.state, "P2")
          : makeSpectatorView(resolved.state);
      const re = delivered(resolved.state, [...started.events, ...resolved.events], recipient);
      const aggregate = re.find((e) => e.type === "aoeResolved");
      if (aggregate?.type === "aoeResolved" && !aggregate.sourceCell)
        assert(!aggregate.effectSegments);
      assert(
        map(re, rv)
          .filter((r) => r.effectId === key)
          .every((r) => r.sourceCell),
      );
    }
  });
}

test("Frisk accepted Cry/Substitution reactions carry an explicit discriminator; declined reactions stay generic", () => {
  for (const kind of ["friskCry", "friskSubstitution"] as const)
    for (const activate of [true, false]) {
      const f = fixture("frisk", "assassin");
      let state = setUnit(f.state, f.defender.id, { position: { col: 2, row: 3 }, attack: 1 });
      state = setUnit(state, f.actor.id, {
        friskCleanSoulShield: false,
        charges: {
          friskPacifism: kind === "friskCry" ? 5 : 0,
          friskGenocide: kind === "friskSubstitution" ? 3 : 0,
        },
      });
      state = initKnowledgeForOwners(toBattleState(state, "P2", f.defender.id));
      const rng = makeRngSequence([0.99, 0.8, 0.01, 0.2]);
      let result = applyAction(
        state,
        { type: "attack", attackerId: f.defender.id, defenderId: f.actor.id },
        rng,
      );
      const events: GameEvent[] = [...result.events];
      for (let i = 0; i < 10 && result.state.pendingRoll; i++) {
        const pending = result.state.pendingRoll;
        if (pending.kind === "friskChildsCryChoice" || pending.kind === "friskSubstitutionChoice") {
          result = applyAction(
            result.state,
            {
              type: "resolvePendingRoll",
              pendingRollId: pending.id,
              player: pending.player,
              choice: activate ? "activate" : "roll",
            },
            rng,
          );
        } else result = resolvePendingRollOnce(result.state, rng);
        events.push(...result.events);
      }
      const attack = events.find((e) => e.type === "attackResolved");
      assert(attack?.type === "attackResolved");
      assert.equal(attack.defenseSignature, activate ? kind : undefined);
      assert.equal(
        map(delivered(result.state, events), makePlayerView(result.state, "P1")).filter(
          (r) => r.effectId === kind,
        ).length,
        activate ? 1 : 0,
      );
    }
});

test("Frisk Keen Eye art appears on the actual reveal, with a frozen target anchor", () => {
  const f = fixture("frisk", "assassin");
  let state = setUnit(f.state, f.actor.id, { charges: { friskGenocide: 15, friskPacifism: 0 } });
  state = setUnit(state, f.defender.id, {
    position: { col: 2, row: 3 },
    isStealthed: true,
    stealthTurnsLeft: 2,
  });
  let result = applyAction(
    state,
    { type: "useAbility", unitId: f.actor.id, abilityId: "friskGenocide" },
    makeRngSequence([]),
  );
  const choose = (choice: unknown) => {
    const pending = result.state.pendingRoll!;
    assert(pending);
    result = applyAction(
      result.state,
      {
        type: "resolvePendingRoll",
        pendingRollId: pending.id,
        player: pending.player,
        choice: choice as never,
      },
      makeRngSequence([0.99]),
    );
  };
  choose({ type: "friskGenocideOption", option: "keenEye" });
  assert(
    !map(delivered(result.state, result.events), makePlayerView(result.state, "P1")).some(
      (r) => r.effectId === "friskKeenEye",
    ),
  );
  choose({ type: "friskKeenEyeTarget", targetId: f.defender.id });
  const sprites = map(delivered(result.state, result.events), makePlayerView(result.state, "P1"));
  assert.equal(sprites.filter((r) => r.effectId === "friskKeenEye").length, 1);
  assert.deepEqual(sprites.find((r) => r.effectId === "friskKeenEye")!.sourceCell, {
    col: 2,
    row: 3,
  });
});

test("Kaneki, Friendship and One Path reuse real semantic transitions and share their sound timeline", () => {
  const k = fixture("kaneki", "berserker");
  const before = setUnit(k.state, k.actor.id, {
    kanekiCentipedeUnlocked: false,
    charges: { kanekiRcCells: 5 },
  });
  const hit: GameEvent = {
    type: "attackResolved",
    attackerId: k.actor.id,
    defenderId: k.defender.id,
    sourceCell: origin,
    targetCell: target,
    attackerRoll: { dice: [6], sum: 6, isDouble: false },
    defenderRoll: { dice: [1], sum: 1, isDouble: false },
    hit: true,
    damage: 1,
    defenderHpAfter: 29,
  };
  const entry = applyNewBatchPostAction(before, before, [hit], makeRngSequence([]));
  const f = fixture("frisk", "assassin");
  const path = applyFriskPostAction(f.state, [
    { type: "unitDied", unitId: f.defender.id, killerId: f.actor.id },
  ]);
  const friendly = {
    ...f.state,
    units: Object.fromEntries(
      Object.values(f.state.units).map((u) => [
        u.id,
        u.owner === "P2" && u.id !== f.defender.id ? { ...u, isAlive: false, position: null } : u,
      ]),
    ),
  };
  const friendship = tryApplyFriskPowerOfFriendship(friendly)!;
  assert(friendship);
  for (const [result, key, sound] of [
    [entry, "kanekiCentipede", "hero.kaneki.transformations.kanekiScolopendra"],
    [path, "friskOnePath", "hero.frisk.phantasms.friskOnePath.unlock"],
    [friendship, "friskFriendship", "hero.frisk.abilities.powerOfFriendship"],
  ] as const) {
    const view = makePlayerView(result.state, "P1"),
      events = delivered(result.state, result.events);
    const sprite = map(events, view).filter((r) => r.effectId === key);
    assert.equal(sprite.length, 1);
    const audio = mapEventBatchToSfx({ events, view, revision: 1, streamId: "vfx-coverage" }).find(
      (r) => r.key === sound,
    );
    assert(audio);
    assert.equal(sprite[0].delayMs ?? 0, audio.delayMs ?? 0);
    assert.deepEqual(map([], view), []);
  }
});

test("persistent Clean Soul, Berserker and Huginn restore from authorized state and disappear on permission loss/death", () => {
  for (const [hero, slot, patch, kind] of [
    ["frisk", "assassin", { friskCleanSoulShield: true }, "cleanSoul"],
    ["duolingo", "trickster", { duolingoBerserkerUnlocked: true }, "duolingoBerserker"],
    ["odin", "rider", {}, "odinHuginn"],
  ] as const) {
    const f = fixture(hero, slot),
      state = setUnit(f.state, f.actor.id, patch),
      view = makePlayerView(state, "P1");
    const unit = view.units[f.actor.id];
    assert(resolveUnitStatuses(unit, "P1").some((s) => s.kind === kind));
    assert("effectId" in STATUS_VISUALS[kind]);
    assert.deepEqual(map([], view), []);
    assert(!resolveUnitStatuses({ ...unit, isAlive: false }, "P1").some((s) => s.kind === kind));
    assert(!resolveUnitStatuses({ ...unit, isStealthed: true }, "P2").some((s) => s.kind === kind));
    if (hero === "odin") assert(!resolveUnitStatuses(unit, "P2").some((s) => s.kind === kind));
  }
});

test("Precision/Jebe use attack start time, defense uses outcome time, and no source geometry is reconstructed", () => {
  const f = fixture("frisk", "assassin"),
    view = makePlayerView(f.state, "P1");
  for (const [signature, key] of [
    [{ attackSignature: "friskPrecisionStrike" }, "friskPrecision"],
    [{ abilityId: "jebeKhansShooter", abilityUseId: "shot" }, "jebeRicochet"],
  ] as const) {
    const event: PresentationEvent = {
      type: "attackResolved",
      eventId: "shot",
      attackerId: f.actor.id,
      defenderId: f.defender.id,
      sourceCell: origin,
      targetCell: target,
      attackerRoll: { dice: [6], sum: 6, isDouble: false },
      defenderRoll: { dice: [1], sum: 1, isDouble: false },
      hit: true,
      damage: 1,
      defenderHpAfter: 29,
      ...signature,
    };
    const plan = buildCombatVisualPlaybackPlan({
      batch: { streamId: "vfx-coverage", revision: 1, events: [event], view },
      startingHpByUnitId: { [f.defender.id]: 30 },
      startingUnitsByUnitId: view.units,
      finalView: view,
      reducedMotion: false,
    });
    const sprites = mapEventBatchToVfx({ ...plan.batch, view, previousPositions: {} });
    const art = sprites.find((r) => r.effectId === key);
    assert(art);
    const audio = mapEventBatchToSfx({ ...plan.batch, view }).find((r) =>
      r.key.includes(key === "friskPrecision" ? "precisionStrike" : "jebeKhansShooter"),
    );
    if (key === "friskPrecision") {
      assert(audio);
      assert.equal(art.delayMs, audio.delayMs);
    }
    const cue = plan.batch.combatCues?.find((c) => c.kind === "hit");
    assert(cue && "attackAtMs" in cue);
    assert.equal(art.delayMs, cue.attackAtMs);
    assert.equal(art.delayMs! + art.durationMs!, cue.atMs, "projectile reaches the target at its confirmed outcome");
    assert(!map([{ ...event, sourceCell: undefined }], view).some((r) => r.effectId === key));
    assert.equal(map([event, { ...event }], view).filter((r) => r.effectId === key).length, 1);
    assert.equal(
      map([event, { ...event, eventId: "second", abilityUseId: "second-use" }], view).filter(
        (r) => r.effectId === key,
      ).length,
      2,
    );
  }
});

test("all new one-shots obey shared session dedupe, baseline and reset cancellation", () => {
  const f = fixture("loki", "trickster"),
    view = makePlayerView(f.state, "P1");
  const event: PresentationEvent & { eventId: string } = {
    type: "lokiSpinCommitted",
    unitId: f.actor.id,
    sourceCell: origin,
    eventId: "spin",
  };
  const session = new PresentationSession(),
    binding = { roomId: "coverage", recipient: "P1" };
  session.begin(binding);
  assert.deepEqual(session.snapshot({ ...binding, streamId: "stream", revision: 1, view }), []);
  const batch = { streamId: "stream", revision: 2, events: [event] };
  const first = session.receive(batch, binding, view);
  assert.equal(first.length, 1);
  assert.equal(map(first[0].events, view).filter((r) => r.effectId === "lokiSpin").length, 1);
  assert.deepEqual(session.receive(batch, binding, view), []);
  assert.equal(
    session.receive(
      { ...batch, revision: 3, events: [{ ...event, eventId: "spin-2" }] },
      binding,
      view,
    ).length,
    1,
  );
  const token = session.token;
  session.begin({ ...binding, roomId: "other" });
  assert(token.cancelled);
  assert.deepEqual(session.receive(batch, binding, view), []);
  assert.deepEqual(map([], view), []);
});

for (const [hero, slot, abilityId, key] of [
  ["genghisKhan", "rider", "genghisKhanMongolCharge", "genghisCharge"],
  ["donKihote", "rider", "donKihoteWindmills", "donWindmills"],
  ["elCidCompeador", "knight", "elCidCompeadorDemonDuelist", "elCidDuel"],
  ["luche", "spearman", "lucheBurningSun", "lucheSun"],
  ["mettaton", "archer", "mettatonFinalChord", "mettatonFinalChord"],
] as const)
  test(`${hero}: actual accepted ${abilityId} has one signature; invalid activation stays silent`, () => {
    const f = fixture(hero, slot);
    let state = setUnit(f.state, f.actor.id, {
      charges: { [abilityId]: 99, lucheSunGlory: 99 },
      mettatonRating: 99,
      mettatonExUnlocked: true,
      mettatonNeoUnlocked: true,
    });
    if (hero === "elCidCompeador")
      state = setUnit(state, f.defender.id, { position: { col: 2, row: 3 } });
    if (hero === "donKihote")
      state = setUnit(state, f.defender.id, { heroId: "zoro", hp: 30, attack: 99 });
    const rng = makeRngSequence(
      Array(200)
        .fill(0)
        .map((_, i) => [0.99, 0.8, 0.01, 0.2][i % 4]),
    );
    const started = applyAction(
      state,
      { type: "useAbility", unitId: f.actor.id, abilityId, payload: { targetId: f.defender.id } },
      rng,
    );
    assert(
      started.events.some((e) => e.type === "abilityUsed"),
      JSON.stringify(started),
    );
    const resolved = resolveAllPendingRollsWithEvents(started.state, rng);
    const events = delivered(resolved.state, [...started.events, ...resolved.events]);
    const sprites = map(events, makePlayerView(resolved.state, "P1"));
    const signature = sprites.filter((r) => r.effectId === key);
    assert.equal(signature.length, 1, JSON.stringify(events));
    if (key === "mettatonFinalChord") {
      assert.equal(signature[0].placement, "line");
      const attacks = events.filter((e) => e.type === "attackResolved");
      assert.equal(signature[0].segments?.length, attacks.length);
      assert(
        signature[0].segments?.every((segment) =>
          attacks.some(
            (e) =>
              e.type === "attackResolved" &&
              JSON.stringify(e.targetCell) === JSON.stringify(segment.to),
          ),
        ),
      );
    }
    if (key === "donWindmills" || key === "genghisCharge")
      assert.equal(signature[0].path, undefined, "no future movement preview");
    assert.deepEqual(map([], makePlayerView(resolved.state, "P1")), []);
    const rejected = applyAction(
      setUnit(state, f.actor.id, { charges: {}, mettatonRating: 0 }),
      { type: "useAbility", unitId: f.actor.id, abilityId, payload: { targetId: "missing" } },
      rng,
    );
    assert(
      !map(delivered(rejected.state, rejected.events), makePlayerView(rejected.state, "P1")).some(
        (r) => r.effectId === key,
      ),
    );
  });

test("Kolada automatic impulse uses one 3x3 signature and Madness survives its source's final removal", () => {
  const e = fixture("elCidCompeador", "knight");
  const state = setUnit(e.state, e.actor.id, { charges: { elCidCompeadorKolada: 3 } });
  const started = maybeTriggerElCidKolada(state, e.actor.id, makeRngSequence([]));
  const resolved = resolveAllPendingRollsWithEvents(
    started.state,
    makeRngSequence([0.99, 0.8, 0.01, 0.2]),
  );
  // The direct impulse helper is normally correlated by applyAction. Its public
  // center/radius is sufficient for this independently authorized area cue.
  const art = map(
    delivered(resolved.state, [...started.events, ...resolved.events]),
    makePlayerView(resolved.state, "P1"),
  ).filter((r) => r.effectId === "elCidKolada");
  assert.equal(art.length, 1);
  assert.equal(art[0].widthCells, 3);
  assert.equal(art[0].heightCells, 3);
  const d = fixture("donKihote", "rider");
  const pendingState = {
    ...setUnit(d.state, d.actor.id, {
      hp: 0,
      isAlive: true,
      donMadDelusionPending: true,
      donMadDelusionOrigin: origin,
    }),
    pendingRoll: {
      id: "madness",
      kind: "donMadDelusionDirection" as const,
      player: "P1" as const,
      context: { unitId: d.actor.id },
    },
  };
  const chosen = applyAction(
    pendingState,
    {
      type: "resolvePendingRoll",
      pendingRollId: "madness",
      player: "P1",
      choice: { type: "donMadDelusionDirection", direction: { col: 1, row: 0 } },
    },
    makeRngSequence([]),
  );
  const end = resolveAllPendingRollsWithEvents(
    chosen.state,
    makeRngSequence([0.99, 0.8, 0.01, 0.2]),
  );
  const events = delivered(end.state, [...chosen.events, ...end.events]);
  const signature = map(events, makePlayerView(end.state, "P1")).filter(
    (r) => r.effectId === "donMadness",
  );
  assert.equal(signature.length, 1, JSON.stringify(events));
  assert.deepEqual(signature[0].segments, [{ from: origin, to: { col: 8, row: 2 } }]);
  assert.equal(signature[0].unitId, undefined);
  assert.equal(end.state.units[d.actor.id].isAlive, false);
});

test("Odin Gungnir and Zoro Santoryu follow actual basic attack results, not hero selection", () => {
  for (const [hero, slot, key] of [
    ["odin", "rider", "odinGungnir"],
    ["zoro", "knight", "zoroSantoryu"],
  ] as const) {
    const f = fixture(hero, slot),
      state = setUnit(f.state, f.defender.id, { position: { col: 2, row: 3 } });
    const rng = makeRngSequence([0.99, 0.99, 0.01, 0.2]);
    const started = applyAction(
      state,
      { type: "attack", attackerId: f.actor.id, defenderId: f.defender.id },
      rng,
    );
    const end = resolveAllPendingRollsWithEvents(started.state, rng);
    const events = delivered(end.state, [...started.events, ...end.events]);
    assert.equal(
      map(events, makePlayerView(end.state, "P1")).filter((r) => r.effectId === key).length,
      1,
      JSON.stringify(events),
    );
    assert(!map([], makePlayerView(end.state, "P1")).some((r) => r.effectId === key));
  }
});

test("Loki real Spin uses one private event and the existing audio clock", () => {
  const f = fixture("loki", "trickster");
  const ally = Object.values(f.state.units).find((u) => u.owner === "P1" && u.id !== f.actor.id)!;
  let state = setUnit(f.state, f.actor.id, { charges: { lokiLaught: 99 } });
  state = setUnit(state, ally.id, { position: { col: 3, row: 2 } });
  const result = applyAction(
    state,
    {
      type: "useAbility",
      unitId: f.actor.id,
      abilityId: "lokiLaught",
      payload: { optionId: "spinTheDrum" },
    },
    makeRngSequence([0.01]),
  );
  const events = delivered(result.state, result.events),
    view = makePlayerView(result.state, "P1");
  assert.equal(
    events.filter((e) => e.type === "lokiSpinCommitted").length,
    1,
    JSON.stringify(result),
  );
  const art = map(events, view).filter((r) => r.effectId === "lokiSpin");
  assert.equal(art.length, 1);
  const sound = mapEventBatchToSfx({ events, view, revision: 1, streamId: "vfx-coverage" }).find(
    (c) => c.key === "hero.loki.phantasms.lokiLaught.spin",
  );
  assert(sound);
  assert.equal(art[0].delayMs ?? 0, sound.delayMs ?? 0);
  for (const recipient of ["P2", "spectator"] as const)
    assert(
      !delivered(result.state, result.events, recipient).some(
        (e) => e.type === "lokiSpinCommitted",
      ),
    );
});

test("new directed geometry cannot reveal a hidden committed source to opponents or spectators", () => {
  const f = fixture("luche", "spearman");
  const state = setUnit(f.state, f.actor.id, {
    isStealthed: true,
    stealthTurnsLeft: 2,
    charges: { lucheSunGlory: 2 },
  });
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.2]);
  const started = applyAction(
    state,
    {
      type: "useAbility",
      unitId: f.actor.id,
      abilityId: "lucheDivineRay",
      payload: { mode: "line", target },
    },
    rng,
  );
  const end = resolveAllPendingRollsWithEvents(started.state, rng);
  const events = [...started.events, ...end.events];
  assert(events.some((e) => e.type === "aoeResolved" && e.effectSegments?.length));
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = delivered(end.state, events, recipient);
    for (const event of projected)
      if (event.type === "aoeResolved") {
        assert.equal(event.sourceCell, undefined);
        assert.equal(event.effectSegments, undefined);
      }
    const view =
      recipient === "P2" ? makePlayerView(end.state, "P2") : makeSpectatorView(end.state);
    assert(!map(projected, view).some((r) => r.effectId === "lucheRay"));
  }
});

for (const interrupted of [false, true])
  test(`real Jebe ricochet chain renders each shot, including Intimidate interruption=${interrupted}`, () => {
    const f = fixture("jebe", "archer");
    const targets = Object.values(f.state.units)
      .filter((u) => u.owner === "P2" && ["rider", "spearman", "knight"].includes(u.class))
      .sort((a, b) => Number(b.class === "spearman") - Number(a.class === "spearman"));
    let state = setUnit(f.state, f.actor.id, {
      position: { col: 0, row: 0 },
      charges: { jebeKhansShooter: 6 },
    });
    for (const [i, unit] of targets.entries())
      state = setUnit(state, unit.id, {
        position: [
          { col: 2, row: 0 },
          { col: 0, row: 2 },
          { col: 2, row: 2 },
        ][i],
        hp: 30,
      });
    if (interrupted) state = setUnit(state, targets[0].id, { heroId: "vladTepes" });
    state = initKnowledgeForOwners(state);
    const rng = makeRngSequence([
      0.2,
      ...(interrupted ? [0.01, 0.2, 0.99, 0.8] : [0.99, 0.99, 0.01, 0.01]),
      ...Array(2).fill([0.99, 0.99, 0.01, 0.01]).flat(),
    ]);
    let result = applyAction(
      state,
      {
        type: "useAbility",
        unitId: f.actor.id,
        abilityId: "jebeKhansShooter",
        payload: { targetId: targets[0].id },
      },
      rng,
    );
    const events = [...result.events];
    let targetIndex = 1,
      sawIntimidate = false;
    assert(
      !map(delivered(result.state, events), makePlayerView(result.state, "P1")).some(
        (r) => r.effectId === "jebeRicochet",
      ),
    );
    for (let i = 0; i < 20 && result.state.pendingRoll; i++) {
      const pending = result.state.pendingRoll;
      if (pending.kind === "vladIntimidateChoice") sawIntimidate = true;
      result =
        pending.kind === "jebeKhansShooterTargetChoice"
          ? applyAction(
              result.state,
              {
                type: "resolvePendingRoll",
                pendingRollId: pending.id,
                player: pending.player,
                choice: { type: "jebeKhansShooterTarget", targetId: targets[targetIndex++].id },
              },
              rng,
            )
          : resolvePendingRollOnce(result.state, rng);
      events.push(...result.events);
    }
    assert(!result.state.pendingRoll);
    assert.equal(sawIntimidate, interrupted);
    const projected = delivered(result.state, events),
      attacks = projected.filter((e) => e.type === "attackResolved");
    assert.equal(attacks.length, 3);
    assert.equal(new Set(attacks.map((e) => e.abilityUseId)).size, 1);
    assert(attacks.every((e) => e.abilityUseId));
    const sprites = map(projected, makePlayerView(result.state, "P1")),
      arrows = sprites.filter((r) => r.effectId === "jebeRicochet");
    assert.equal(
      arrows.length,
      3,
      JSON.stringify(
        attacks.map((e) => ({
          type: e.type,
          abilityId: e.abilityId,
          abilityUseId: e.abilityUseId,
          ...(e.type === "attackResolved"
            ? { sourceCell: e.sourceCell, targetCell: e.targetCell }
            : {}),
        })),
      ),
    );
    assert.deepEqual(
      arrows.map((r) => r.targetCell),
      attacks.map((e) => (e.type === "attackResolved" ? e.targetCell : null)),
    );
    assert(arrows.every((r) => r.placement === "projectile"));
    assert.equal(new Set(arrows.map((r) => r.id)).size, 3);
    assert.equal(
      sprites.filter((r) => r.effectId === "combatHit" || r.effectId === "missShield" || r.effectId === "shield").length,
      3,
    );
    assert.equal(sprites.filter(r => r.effectId === "shield").length, attacks.filter(e => e.spearmanEvaded).length);
  });

test("real Frisk Precision target commitment produces its signature, while the menu and cancellation remain silent", () => {
  const f = fixture("frisk", "assassin");
  let state = setUnit(f.state, f.actor.id, { charges: { friskGenocide: 10, friskPacifism: 0 } });
  state = setUnit(state, f.defender.id, { position: { col: 2, row: 3 } });
  const rng = makeRngSequence([0.99, 0.8, 0.01, 0.2]);
  const opened = applyAction(
    state,
    { type: "useAbility", unitId: f.actor.id, abilityId: "friskGenocide" },
    rng,
  );
  const pending = opened.state.pendingRoll!;
  assert(pending);
  const chosen = applyAction(
    opened.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice: { type: "friskGenocideOption", option: "precisionStrike" },
    },
    rng,
  );
  const targetChoice = chosen.state.pendingRoll!;
  assert(targetChoice);
  assert(
    !map(delivered(chosen.state, chosen.events), makePlayerView(chosen.state, "P1")).some(
      (r) => r.effectId === "friskPrecision",
    ),
  );
  const canceled = applyAction(
    chosen.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetChoice.id,
      player: targetChoice.player,
      choice: "skip",
    },
    rng,
  );
  assert.deepEqual(
    map(delivered(canceled.state, canceled.events), makePlayerView(canceled.state, "P1")),
    [],
  );
  const accepted = applyAction(
    chosen.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: targetChoice.id,
      player: targetChoice.player,
      choice: { type: "friskPrecisionStrikeTarget", targetId: f.defender.id },
    },
    rng,
  );
  const end = resolveAllPendingRollsWithEvents(accepted.state, rng);
  const events = delivered(end.state, [...accepted.events, ...end.events]);
  assert.equal(
    map(events, makePlayerView(end.state, "P1")).filter((r) => r.effectId === "friskPrecision")
      .length,
    1,
  );
});
