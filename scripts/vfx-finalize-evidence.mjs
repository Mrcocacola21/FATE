import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";

// Run after the behavioral suites pass. Never promotes registration or blockers.
const path = resolve(import.meta.dirname, "../docs/assets/vfx-workflow/integration-state.json");
const state = JSON.parse(readFileSync(path, "utf8"));
const test = name => `packages/web/src/features/vfx/expansionPresentation.test.tsx: ${name}`;
const shared = test("Shared hero routes: committed geometry, outcome phases, hidden source, deployment, final death and local selection cleanup");
const forms = test("Guts/Kaneki/Undyne form actions replace the ordinary release/trail only while the projected form exists");
const statuses = test("Source-backed static statuses hydrate silently and clear with state, death, hidden source or recipient permission");
const teleports = test("Teleport endpoints for each ability stay on the movement clock and private ability redaction retains generic portals");
const punishment = test("Punishment art uses authorized event-time cells once, with no tick for zero damage or a later reveal");
const signals = [test("Four semantic signals reach gameplay exactly once for each authorized recipient and remain silent through snapshot/reconnect"),
  "packages/rules/src/tests/core/expansionSignals.test.ts: testExpansionSignals / expansionSignalFixtures"];
const point = { placement: "cell", anchorMode: "event", coordinates: "authorized event-time cell; no previous-position reconstruction" };
const flight = { placement: "projectile", anchorMode: "event", coordinates: "confirmed sourceCell -> targetCell; rendered toward actual destination" };
const movement = { placement: "projectile", anchorMode: "event", coordinates: "movement cue.from -> cue.to, normal/rider only; no forced/boat/teleport trail" };
const definition = (route, phase, geometry, tests, extra = {}) => ({ route, phase, geometry, tests: Array.isArray(tests) ? tests : [tests], ...extra });
const routes = {
  move_trail: definition("Projected unitMoved -> existing movementPlan normal/rider segment travel", "movement cue.atMs..atMs+durationMs", movement,
    [shared, test("Every profile has a real rules movement route; default Trickster teleports never acquire an invented trail")]),
  move_arrive: definition("Confirmed movementPlan reached cue.to -> arrival at existing segment boundary", "movement cue.atMs+durationMs, 140ms", point, shared),
  attack_swing: definition("Projected basic attackResolved -> existing combat release cue; preserve signature release", "combat cue.attackAtMs until outcome", point, shared),
  attack_projectile: definition("Projected basic attackResolved -> existing combat release cue; preserve signature release", "combat cue.attackAtMs until outcome", flight, shared),
  attack_impact: definition("Projected basic attackResolved.hit + authorized source/target -> confirmed combat hit cue", "combat hit cue.atMs", point, shared),
  deploy: definition("Projected unitPlaced.position -> mapper; no snapshot, hover or cancelled placement trigger", "confirmed placement", point, shared),
  death_final: definition("Final projected unitDied.deathCell (Don unitDeathFinalized normalized by existing playback); exclude pending Rebirth/Undying/Madness", "existing final combat death/removal cue", point,
    [shared, test("Form entry and temporary death never backdate new art or start final death before Rebirth/Undying/Madness completes"), "packages/rules/src/tests/core/expansionSignals.test.ts: Don empty-ray completion, refusal, duplicate and recipient projection"]),
  select_ring: definition("Board.selectedUnitId -> SelectedUnitVfx; explicit local Board selection, never a server event", "persistent local selection", { placement: "unit", anchorMode: "followUnit", scaleCells: 1.15 }, shared,
    { projectedStateFields: ["Board.selectedUnitId", "view.units[id].isAlive", "view.units[id].position", "view.units[id].isStealthed", "viewer playerId"], cleanup: "Removed on deselect, selection change, death, lost visibility, recipient/match/Board session replacement; static, no re-trigger timer" }),
  stealth_enter: definition("Successful owner-projected stealthEntered -> unitRequest; rejected/failed attempts stay silent", "confirmed stealth entry", { placement: "unit", anchorMode: "followUnit" },
    test("Stealth art follows real successful owner-only attempts, refuses failed attempts, and Kaiser uses the permitted eclipse result")),
  stealth_reveal: definition("Projected stealthRevealed or existing movement reveal cue; replaces only generic hiddenReveal, preserves signature reveal", "confirmed reveal cue", point,
    test("Stealth art follows real successful owner-only attempts, refuses failed attempts, and Kaiser uses the permitted eclipse result")),
  auto_defense: definition("Spearman: attackResolved.spearmanEvaded after attacker-double precedence; charge defense: accepted berserkerDefenseChosen(auto) correlated to outcome", "existing defense/miss outcome cue", point,
    [test("Actual spearman defense respects knight-double precedence; Bunker art requires damage really absorbed"), test("Every charge-based hero defense binds the accepted branch; transformed Kaiser currently has no charge-defense decision")]),
  trickster_sweep: definition("Projected aoeResolved(tricksterAoE) -> one sweep per aggregate, never once per victim", "existing area-resolution cue", { placement: "area", anchorMode: "event", coordinates: "event.center", widthCells: "2*event.radius+1", heightCells: "2*event.radius+1" },
    test("Real Trickster area resolutions produce one thematic sweep, using confirmed radius and excluding an unrelated cast")),
  precise_arrow_confirm: definition("Artemida basic attackResolved hit + attackerRoll.isDouble -> hit cue; keeps arrow release", "combat hit cue.atMs", point,
    test("Asgore soul results, precise arrow and Cannon hit preserve KEEP, use the result phase and reject miss/unknown soul")),
  cannon_hit: definition("Guts attackResolved(gutsCannon) hit + abilityUseId -> hit cue; preserves existing Cannon", "combat hit cue.atMs", point,
    test("Asgore soul results, precise arrow and Cannon hit preserve KEEP, use the result phase and reject miss/unknown soul")),
  parade_hit: definition("Confirmed Asgore Fire Parade hit cue (attackResolved or aggregate damaged target cue); not full cast per victim", "combat hit cue.atMs", point,
    [test("Asgore soul results, precise arrow and Cannon hit preserve KEEP, use the result phase and reject miss/unknown soul"), "packages/web/src/game/effects/aoePresentation.test.ts: Fire Parade outcome phase"]),
  great_joke: definition("Projected lokiGreatJokeCommitted from accepted cost-15 greatLokiJoke branch -> one common cast", "accepted branch, existing deferred action playback", { placement: "area", anchorMode: "event", coordinates: "event.sourceCell", widthCells: "2*event.radius+1", heightCells: "2*event.radius+1" }, signals),
  berserker_unlock: definition("Projected duolingoBerserkerUnlocked from first authoritative false->true transition (both real rules paths)", "accepted threshold transition; no snapshot/reconnect entry", point, signals),
  clean_soul_break: definition("Projected attackResolved.defenseSignature=friskCleanSoulBreak from actual shield consumption", "combat prevented-attack outcome cue", point, signals),
  storm_ward: definition("Projected riverStormWard from otherwise applicable storm start-turn effect, outside forest; once per turn guard", "actual prevented storm start-turn phase", point, signals),
  tyrant_gain: definition("Projected groznyTyrantRewarded after successful allied finishing attack and actual reward application", "reward result", point,
    test("Tyrant gain and forest stop follow accepted results, without an extra draw; Kaiser buildup ends with its existing impact/audio")),
  forest_stop: definition("Projected forestMovementStopped after accepted fallback move or failed forest check with no fallback", "confirmed forest movement result", point,
    test("Tyrant gain and forest stop follow accepted results, without an extra draw; Kaiser buildup ends with its existing impact/audio")),
  dora_launch: definition("Confirmed kaiserDora aggregate -> existing combat eventBuildupMs launch before retained doraImpact; no second explosion", "shared buildup 180ms (reduced 80ms), then existing impact/audio", flight,
    test("Tyrant gain and forest stop follow accepted results, without an extra draw; Kaiser buildup ends with its existing impact/audio")),
  carpet_approach: definition("Confirmed kaiserCarpetStrike aggregate -> existing combat eventBuildupMs approach before retained carpetImpact", "shared buildup 320ms (reduced 100ms), then existing impact/audio", { placement: "area", anchorMode: "event", coordinates: "event.center", widthCells: "2*event.radius+1", heightCells: "2*event.radius+1" },
    test("Tyrant gain and forest stop follow accepted results, without an extra draw; Kaiser buildup ends with its existing impact/audio")),
  bunker_absorb: definition("Projected attackResolved.hit and bunkerAbsorbedDamage>0 (actual absorbed amount from rules)", "combat defense/hit outcome cue", point,
    test("Actual spearman defense respects knight-double precedence; Bunker art requires damage really absorbed")),
  surgeon_insight: definition("Jack confirmed positive attack damage + owner-only projected jackKnownHpByTarget[target] -> existing Board HP control UnitUiVfx", "existing combat hit cue, 500ms", { placement: "unit", uiAnchor: "healthBar", anchorMode: "followUnit", coordinates: "permitted current target position" },
    test("Private Surgeon feedback attaches to the HP control only for the owner; snapshot and miss produce no insight")),
  bone_field_tick: definition("Projected sansBoneFieldPunished damage>0 with frozen permitted targetCell -> existing damage cue", "existing punishment damage cue", point, punishment),
  storm_tick: definition("Projected lechyStormRollResult failure + damage>0 with frozen permitted targetCell -> existing damage cue", "existing punishment damage cue", point, punishment),
};
for (const soul of ["patience", "bravery", "integrity", "perseverance", "kindness", "justice"])
  routes[`soul_${soul}`] = definition(`Projected asgoreSoulParadeResolved.soulId=${soul} at frozen sourceCell; preserves soulParade KEEP`, "soul result reveal", point,
    test("Asgore soul results, precise arrow and Cannon hit preserve KEEP, use the result phase and reject miss/unknown soul"));
for (const [prefix, flag] of [["berserk", "gutsBerserkModeActive"], ["centipede", "kanekiCentipedeUnlocked"], ["undying", "undyneImmortalActive"], ["engineering", "transformed"], ["ex", "mettatonExUnlocked"], ["neo", "mettatonNeoUnlocked"]]) {
  routes[`${prefix}_move`] = definition(`Projected ${flag} -> existing movementPlan normal/rider; replaces ordinary move_trail for active form`, "movement cue.atMs..atMs+durationMs", movement, forms, { projectedStateFields: [flag] });
  routes[`${prefix}_${prefix === "berserk" || prefix === "undying" ? "swing" : "attack"}`] = definition(`Projected ${flag} -> basic attack combat release; replaces ordinary release for active form`, "combat cue.attackAtMs until outcome",
    ["engineering", "ex", "neo"].includes(prefix) ? flight : point, forms, { projectedStateFields: [flag] });
}
for (const [role, ability] of [["berserk_self_cost", "gutsBerserkMode"], ["undying_self_cost", "undyneUndying"]])
  routes[role] = definition(`Projected heroSelfCost(sourceAbilityId=${ability}) from existing end-turn debit; never incoming-hit art`, "existing end-turn HP cue before final death", point,
    test("Guts/Undyne self-cost uses the authoritative end-turn debit before final death, without incoming-hit art"));
for (const [ability, exit, arrive] of [["femtoDivineMove", "divine_exit", "divine_arrive"], ["groznyInvadeTime", "invade_exit", "invade_arrive"], ["lechyGuideTraveler", "guide_depart", "guide_arrive"], ["odinSleipnir", "sleipnir_exit", "sleipnir_arrive"]]) {
  routes[exit] = definition(`Projected unitMoved.provenance.abilityId=${ability} + teleport cue; keep unique cast, replace generic endpoint pair`, "first half of existing movement cue", { ...point, coordinates: "cue.from" }, teleports);
  routes[arrive] = definition(`Projected unitMoved.provenance.abilityId=${ability} + teleport cue; keep unique cast, replace generic endpoint pair`, "second half of existing movement cue", { ...point, coordinates: "cue.to" }, teleports);
}
const persistent = {
  commander_aura: ["unit.heroId in actual getPolkovodetsSource list", "unit.isAlive", "unit.position"],
  snare_bound: ["target.immobilizedUntilOwnTurnStart", "target.immobilizedSourceId", "permitted living Jack source"],
  liberation_bind: ["target.kaladinMoveLockSources", "permitted living Kaladin source"],
  entangled_status: ["target.lokiMoveLockSources", "permitted living Loki source"],
  blind_status: ["target.blindUntilOwnTurnStart", "target.blindSourceId", "permitted living Luche source (any allowed Luche Blind branch)"],
  blue_bone_status: ["target.papyrusBoneStatus.kind=blue", "target.papyrusBoneStatus.sourceUnitId", "permitted living Papyrus source"],
  orange_bone_status: ["target.papyrusBoneStatus.kind=orange", "target.papyrusBoneStatus.sourceUnitId", "permitted living Papyrus source"],
  forest_root: ["target.movementDisabledNextTurn", "target.movementDisabledSourceId", "permitted living Vlad source"],
};
for (const [role, fields] of Object.entries(persistent))
  routes[role] = definition("Permitted PlayerView -> expansionStatusArt -> existing UnitStatusVfx; snapshot reconstruction without one-shot entry", "persistent projected state", { placement: "unit", anchorMode: "followUnit", scaleCells: role === "commander_aura" ? 3 : 1 }, statuses,
    { projectedStateFields: [...fields, "target.isAlive", "target.position", "viewer playerId / stealth permission"], cleanup: "Derived each render from permitted state; removed with status expiry, source loss/death/permission loss, target death/form/recipient/session change; no queue/timer" });
for (const color of ["blue", "orange"])
  routes[`${color}_bone_punish`] = definition(`Projected papyrusBonePunished boneType=${color}, damage>0, frozen permitted targetCell`, "existing punishment damage cue", point, punishment);

for (const row of state.assets) {
  const role = basename(row.filename, ".png");
  if (row.integrationStatus === "blocked") {
    row.cleanup = "No reachable runtime instance; registry/preview only";
    row.verification.tests = row.heroId === "grand-kaiser"
      ? [test("Every charge-based hero defense binds the accepted branch; transformed Kaiser currently has no charge-defense decision")]
      : [statuses, "packages/rules/src/actions/heroes/vlad.ts: getPolkovodetsSource excludes this hero"];
    continue;
  }
  if (!["bound", "verified"].includes(row.integrationStatus)) throw new Error(`Unbound asset cannot be promoted: ${row.id}`);
  const route = routes[role];
  if (!route) throw new Error(`Missing evidence family ${role}`);
  row.sourceMetadata ??= { phase: row.phase, geometry: row.geometry, visibility: row.visibility.declared };
  if (!row.presentationRevision) {
    row.triggerRoute = route.route;
    row.phase = route.phase;
    row.geometry = route.geometry;
  }
  if (["berserker_unlock", "clean_soul_break", "storm_ward"].includes(role)) row.geometry = { ...row.geometry, scaleCells: 1.7 };
  if (!row.presentationRevision) {
    row.projectedStateFields = route.projectedStateFields ?? [];
    row.cleanup = route.cleanup ?? "Existing queue expiry on shared presentation clock; stable event/cue IDs; session token cancels delayed requests; component unmount/lost attachment permission removes DOM";
  }
  row.verification.tests = [...new Set([...route.tests, ...(row.presentationRevision ? row.verification.tests : [])])];
  row.integrationStatus = "verified";
  row.relationToExisting = persistent[role] || role === "select_ring" ? "State-derived thematic static layer"
    : ["attack_impact", "auto_defense", "stealth_reveal"].includes(role) ? "Replaces corresponding generic accent only; unique KEEP remains"
    : /_move$|berserk_swing|undying_swing|centipede_attack|engineering_attack|ex_attack|neo_attack/.test(role) ? "Active form replaces ordinary expansion action layer"
    : "New thematic phase/layer; existing unique KEEP preserved";
  if (row.heroId === "grand-kaiser" && role === "stealth_enter")
    row.triggerRoute = "Projected moonEffectApplied(lunarEclipse).affectedUnitIds + explicit viewerPlayerId + own currently stealthed projected Kaiser -> owner-only unit effect. Ordinary enterStealth is Bunker and stays silent.";
  if (["great_joke", "berserker_unlock", "clean_soul_break", "storm_ward"].includes(role)) {
    row.verification.visual.gameplaySamples = [{
      evidence: `packages/web/test-results/vfx-expansion-game/desktop-${row.effectIds[0]}.png`,
      scope: "Human inspection of actual Board active-phase midpoint using rules-produced action results; partial animation QA, not a manual network match",
    }];
  }
}
state.semanticSignals = [
  "Локи: lokiGreatJokeCommitted только после принятой ветки greatLokiJoke и списания 15; разрешённые sourceCell/radius зафиксированы в rules. Сигнал общего каста не обещает превращение всех целей.",
  "Дуолинго: duolingoBerserkerUnlocked на первом false→true при 12 Missed Lessons — оба действующих пути (промах и начало хода). Snapshot/reconnect не запускают unlock; прежний постоянный berserker сохранён.",
  "Фриск: attackResolved.defenseSignature=friskCleanSoulBreak только при реальном расходе щита и предотвращённой атаке; Cry/Substitution и обычный miss различаются. Исход, HP и RNG проверены.",
  "Речной человек: riverStormWard в фазе фактически предотвращённого стартового воздействия активного шторма вне леса; guard на номер хода исключает повтор. Без броска, урона или лечения.",
];
state.checks = [
  "node scripts/vfx-integration-inventory.mjs — PASS: 296 PNG / 29 профилей; SHA-256, размеры кадров, все манифесты и оба исторических отчёта согласованы; PNG не изменены.",
  "npm run test:effects --workspace packages/web — PASS, 317/317 (final-effects.log). Включает source-backed statuses, четыре сигнала, фазы, формы, исходы защиты, приватность, selection, duplicate/reconnect и очередь/preload.",
  "npm run test:presentation:assets --workspace packages/web — PASS: ссылки с учётом регистра, sprite dimensions, emitted assets (final-presentation-assets.log).",
  "npm run test:rules — PASS, 3 набора (final-rules.log); отдельный --expansion-signals проверяет принятие/отказ/повтор/RNG/owner/opponent/spectator и завершение Don Madness.",
  "npm run test:contract — PASS, 20 наборов; актуальные generated OpenAPI response schemas проверены (final-contract.log).",
  "npm run test:snapshots --workspace packages/server — PASS; serialization round-trip включает новые blindSourceId/immobilizedSourceId/movementDisabledSourceId (final-snapshots.log).",
  "npm run lint; npm run typecheck; npm run build — PASS (final-lint.log, final-typecheck.log, final-build.log). После добавления snapshot assertions дополнительно прошли ESLint файла и server typecheck.",
  "npm run test:vfx:coverage:production --workspace packages/web — PASS на свежей production-сборке: 327 проверенных определений, включая все 296 expansion; обе ориентации, слои/кадры, разрешённые статусы, phone/reduced motion (final-browser-production.log).",
  "npm run test:vfx:expansion:game --workspace packages/web — PASS: 222 сценария на настоящем Board из 37 rules-produced fixtures × 3 получателя × 2 viewport/motion. Локальный click/deselect, active-phase opacity, duplicate, expiry, reconnect, бюджет памяти (final-browser-game.log).",
  "node packages/web/scripts/vfx-expansion-game-smoke.mjs --review-samples — PASS, ещё 30 целевых наблюдений; просмотрены скриншоты четырёх новых сигналов и обычного движения, включая обратную ориентацию и phone/reduced motion. Проверяется декодированная отрисовка в активной фазе, не только DOM очереди (final-browser-review-samples.log).",
  "Реально просмотрены 29 контактных листов / 296 PNG со средними кадрами свежего production preview. Это визуальная оценка арта, не автоматическая отметка полного игрового QA. Артефакты: packages/web/test-results/vfx-coverage/browser-production/contact-sheets/.",
];
state.nextBatch = "Остаются три точных противоречия заказа rules: ауры Griffith/Grozny и auto_defense Кайзера. Для них требуется отдельное решение о смысле заказа/механике; баланс ради арта не изменялся. Следующая независимая партия полной анимационной QA — 11 уникальных PNG Loki/Duolingo/Frisk (nextBatchEffectIds): целиком от старта до исчезновения, статус snapshot/expiry и оба получателя. Средние кадры уже просмотрены; полный ручной сетевой матч двух игроков не выполнен.";
state.nextBatchEffectIds = [
  "expansion.loki.great_joke", "expansion.loki.trickster_sweep", "expansion.loki.entangled_status", "expansion.loki.stealth_enter", "expansion.loki.stealth_reveal",
  "expansion.duolingo.berserker_unlock", "expansion.duolingo.trickster_sweep", "expansion.duolingo.auto_defense",
  "expansion.frisk.clean_soul_break", "expansion.frisk.stealth_enter", "expansion.frisk.stealth_reveal",
];
writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
console.log(`${state.assets.filter(a => a.integrationStatus === "verified").length} behavior-verified; blockers retained; visual evidence unchanged`);
