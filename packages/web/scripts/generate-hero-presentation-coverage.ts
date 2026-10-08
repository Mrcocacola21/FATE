import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAbilityChargeCost } from "rules";
import { heroPresentationInventory } from "./hero-presentation-inventory";
import { heroAbilityCoverage } from "../src/game/effects/heroAbilityCoverage";
import {
  REMAINING_AREAS,
  REMAINING_CASTS,
  REMAINING_HIT_ACCENTS,
} from "../src/game/effects/remainingHeroPresentation";
import { SOUND_REGISTRY, type SoundKey } from "../src/assets/sfx/registry";
import { vfxRegistry } from "../src/features/vfx/vfxRegistry";
import type { VfxEffectId } from "../src/features/vfx/vfxTypes";

const previous = new Set([
  "kaiserBunker",
  "kaiserDora",
  "kaiserCarpetStrike",
  "vladIntimidate",
  "vladStakes",
  "vladForest",
  "sansGasterBlaster",
  "sansLastAttack",
  "asgoreFireball",
  "asgoreFireParade",
  "asgoreSoulParade",
  "riverBoat",
  "riverBoatman",
  "riverTraLaLa",
]);
const statusEffects: Record<string, VfxEffectId[]> = {
  jackRipperSnares: ["snarePlace", "snareTrigger"],
  chikatiloAssassinMark: ["chikatiloMark"],
  chikatiloFalseTrail: ["falseTrailSetup", "falseTrailBlast"],
  papyrusBlueBone: ["papyrusBones"],
  papyrusOrangeBone: ["papyrusBones"],
  papyrusUnbeliever: ["papyrusUnbeliever"],
  lechyStorm: ["lechyStorm", "storm"],
  friskPacifism: ["friskHugs", "friskHeal"],
  lokiLaught: ["lokiChicken", "lokiControl"],
  griffithFemtoRebirth: ["griffithRebirth"],
  mettatonEx: ["mettatonEx"],
  mettatonNeo: ["mettatonNeo"],
  sansUnbeliever: ["sansUnbeliever"],
  sansBoneField: ["sansField"],
  kaiserBunker: ["bunkerStatus"],
  kaiserDora: ["doraImpact"],
  kaiserCarpetStrike: ["carpetImpact"],
  vladIntimidate: ["vladGaze"],
  vladStakes: ["stakePlace", "stakeTrigger"],
  vladForest: ["forestEruption"],
  sansGasterBlaster: ["gasterCannon", "gasterBeam"],
  sansLastAttack: ["sansCurseApply", "sansCurseTick", "sansCurseRemove"],
  asgoreFireball: ["fireballCast", "fireball", "fireballImpact"],
  asgoreFireParade: ["fireParade"],
  asgoreSoulParade: ["soulParade"],
  riverBoat: ["boatPickup", "boat", "boatDrop"],
  riverBoatman: ["statusSmall"],
  riverTraLaLa: ["tralala"],
};
const statusSounds: Record<string, SoundKey[]> = {
  jackRipperSnares: [
    "hero.jackRipper.abilities.jackRipperSnares.place",
    "hero.jackRipper.abilities.jackRipperSnares.trigger",
  ],
  chikatiloAssassinMark: ["hero.chikatilo.abilities.chikatiloAssassinMark"],
  chikatiloFalseTrail: ["hero.chikatilo.phantasms.falseTrailExplosion"],
  papyrusBlueBone: ["hero.papyrus.abilities.papyrusBlueBone", "common.status.bonePunish"],
  papyrusOrangeBone: ["hero.papyrus.abilities.papyrusOrangeBone", "common.status.bonePunish"],
  lechyStorm: ["hero.lechy.phantasms.lechyStorm"],
  friskPacifism: ["hero.frisk.phantasms.friskHugs", "common.status.heal"],
  lokiLaught: ["hero.loki.abilities.lokiControl", "hero.loki.phantasms.lokiChicken"],
  griffithFemtoRebirth: ["hero.griffith.transformations.griffithFemtoRebirth"],
  mettatonEx: ["hero.mettaton.transformations.mettatonEx"],
  mettatonNeo: ["hero.mettaton.transformations.mettatonNeo"],
  sansBoneField: ["hero.sans.abilities.sansBoneField"],
};
function path(url: string) {
  const absolute = fileURLToPath(url).replaceAll("\\", "/");
  return absolute.slice(absolute.indexOf("packages/web/src/assets/"));
}
function esc(value: unknown) {
  return String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}
function code(value: string) {
  return `\`${value}\``;
}
const lines: string[] = [
  "# Phase 13 — Remaining Heroes & Ability Coverage",
  "",
  "Regenerate canonical inventory and asset tables: `npx tsx packages/web/scripts/generate-hero-presentation-coverage.ts` from the repository root. The roster-derived regression test requires an explicit classification for new abilities.",
  "",
  "## Source audit and scope",
  "",
  "Roster authority: `packages/rules/src/heroes.ts` (`HERO_CATALOG` / availability), `heroMeta/entries`, `abilities/specs`, `abilities/viewIds.ts` and `viewIdsExtras.ts`, including unlock variants. Figure sets: `packages/web/src/catalog/figures.ts`. Base-class figures are generic units. There are 29 implemented catalog entries, of which Femto is a non-selectable transformation, plus the non-catalog False Trail token. No entire catalog hero is a planned stub. Direction Shift is a metadata-only ability and is identified below.",
  "",
  "Rules audit: hero action handlers and post-action hooks, `pendingRoll/resolvers`, `combat`, `movement`, `model/events`, `view/player.ts`, `view/spectator.ts`, `view/pending.ts`, `view/events.ts`, `view/eventPayload.ts`. Presentation audit: both registries/mappers, `combatPlayback`, `movementPresentation`, `PresentationSession`, `useBoardSfx`, `VfxLayer`, `GlobalPendingTaskLayer` and Board integration. Existing targeting and pending-decision UI remain authoritative consumers of projected legal choices.",
  "",
  "Already integrated packs: `grand-kaiser`, `vladTepes`, `sans`, `asgore`, `riverPerson`. Their existing combat, area, curse, soul and transport sequences are preserved. Genuine omissions added here: Engineering Miracle, Badass Joke, Sleep, Unbeliever and Bone Field activation identity.",
  "",
  "All other catalog entries receive new one-shots or an explicit generic/silent classification. Coverage is partial for sparse geometry, undiscriminated Frisk options and missing unlock events; the ability table does not claim bespoke cinematics for those cases.",
  "",
  "## Classification",
  "",
  "Final statuses: COMPLETE = intended one-shots and shared outcomes wired; GENERIC_ONLY = reliable generic outcomes or compact signature, with the stated prerequisite for fuller artwork; INTENTIONALLY_SILENT = trait/counter/current-state UI without a cast; BLOCKED_BY_EVENT_DATA = no reliable distinct trigger; NOT_IMPLEMENTED = metadata without runtime behavior. MISSING_ASSET is reserved for an essential missing asset (none is essential to the safe fallback). A complete row does not imply persistent status loops or every asset in its folder is used.",
  "",
  "Initial audit classes: COMPLETE for previous mapped abilities; PARTIAL for Jack/Chikatilo/Lechy generic effects; GENERIC_ONLY for outcomes already represented by combat/movement; NOT_APPLICABLE for silent traits; MISSING for currently unwired distinct semantic one-shots. Asset directories were inspected only after confirming runtime functionality.",
  "",
  "## Roster and ability matrix",
  "",
  "Charges below are the canonical spending cost, not capacity. `triggerCharges`, capacity, reset/unlimited behavior are separately recorded. Special counters such as Rating, Frisk resources and unlock gates remain in the rules; the canonical description/flow column includes those conditions. Metadata slots describe costs; actual legal intents and pending choice validation decide when/how commitment happens. No readiness cue enables a button or decides legality.",
  "",
];
const inventory = heroPresentationInventory();
for (const hero of inventory) {
  lines.push(
    `### ${hero.name} — ${code(hero.id)} (${hero.mainClass})`,
    "",
    "| Hero/ability ID | Name / taxonomy | Charges / slots | Legal targeting and decision flow | Events / template | SFX keys | VFX IDs | Initial → final | Privacy / implementation notes |",
    "|---|---|---|---|---|---|---|---|---|",
  );
  for (const { id, spec } of hero.abilities) {
    const coverage = heroAbilityCoverage(id);
    if (!coverage || !spec) throw new Error(`Unclassified canonical entry: ${hero.id}/${id}`);
    const signature = REMAINING_CASTS[id] ?? REMAINING_AREAS[id];
    const sounds = [
      ...new Set([
        ...(signature?.sfx ? [signature.sfx] : []),
        ...(statusSounds[id] ?? []),
        ...(previous.has(id) ? Object.keys(SOUND_REGISTRY).filter((key) => key.includes(id)) : []),
      ]),
    ];
    const effects = [
      ...new Set([
        ...(signature ? [signature.vfx] : []),
        ...(REMAINING_HIT_ACCENTS[id] ? [REMAINING_HIT_ACCENTS[id]] : []),
        ...(statusEffects[id] ?? []),
      ]),
    ];
    const initial = previous.has(id)
      ? "COMPLETE"
      : coverage.status === "INTENTIONALLY_SILENT"
        ? "NOT_APPLICABLE"
        : ["jackRipperSnares", "chikatiloAssassinMark", "lechyStorm"].includes(id)
          ? "PARTIAL"
          : coverage.status === "GENERIC_ONLY" || coverage.status === "NOT_IMPLEMENTED"
            ? "GENERIC_ONLY"
            : "MISSING";
    const cost = `spend ${getAbilityChargeCost(spec)}; cap ${spec.chargeUnlimited ? "unlimited" : (spec.maxCharges ?? "none")}; trigger ${spec.triggerCharges ?? "none"}; reset ${Boolean(spec.resetsChargesOnUse)}; slots ${JSON.stringify(spec.actionCost?.consumes ?? {})}`;
    lines.push(
      `| ${code(`${hero.id}/${id}`)} | ${esc(spec.displayName)} / ${spec.kind} | ${esc(cost)} | ${esc(spec.description)} | ${esc(coverage.events)}; **${coverage.template}** | ${sounds.length ? sounds.map(code).join("<br>") : "generic outcomes / intentional silence"} | ${effects.length ? effects.map(code).join(", ") : "shared outcomes / current UI"} | ${initial} → **${coverage.status}** | ${esc(coverage.visibility)}. ${esc(coverage.notes)} |`,
    );
  }
  lines.push("");
}
lines.push(
  "## Ability stages and safety",
  "",
  "**Jack:** Resilient and Surgery remain silent traits. Snares use the existing snare placement/trigger VFX and new exact placement/trigger WAVs. Placement and all trap IDs/cells stay owner-only, including remaining traps after a trigger. Trigger follows reached movement and applies immobilization only. Dismemberment uses a committed source accent and one brief confirmed slaughter hit accent; shared attacks/HP own each result. Covering Tracks is a 3×3 confirmed explosion with independent 1d6 direct-damage outcomes in `aoeResolved.damageByUnitId`, not fake attack rolls. One aggregate signature; each damaged unit gets one HP change; only `unitDied` finalizes death. Direct damage is ordered before its early-emitted death using authorized use correlation.",
  "",
  "**Hassan:** Assassin Order selects exactly two distinct allied units at battle start, without charge/action cost. Invalid/candidate/hover state has no final cue. Only valid commitment emits the owner cue. True Enemy's candidate/target decisions remain private; its cost is spent at commitment and its controlled attack enters ordinary manual combat. The visible caster does not authorize private selections. Private commitments are suppressed for P2/spectator, including use correlation; no public repetitions, variant, duration or target positional cue. Other recipients retain the existing safe waiting notice without private candidates/counts. One With Sand uses shared authoritative stealth entry/reveal and current owner state; failed entry has no success cue and last-known cells are never used as current anchors.",
  "",
  "**Genghis:** Decree and Mongol Charge get confirmed cast cues (Charge reuses the compact decree artwork with its distinct Charge WAV). Movement uses actual reached Rider segments, not a final-position trail; no second movement sound. Existing deterministic reaction queue presents each eligible ally independently. Attack requests manual attacker/defender dice and normal defenses, damage/death; Pass consumes no RNG and generates no combat. Reaction attacks preserve each reactor's normal slots. The extra Charge movement artwork is not inferred from a pending-move flag lacking use lineage.",
  "",
  "**Chikatilo:** Tough is silent. Assassin Mark has a private target one-shot and owner WAV, without a redundant source cast. The target owner's view receives no mark status/tracking metadata. False Trail setup uses a separate public token anchor, never a source-to-token line; exact real placement stays private. Actual explosion uses its confirmed area and shared direct damage. Decoy gets a committed source cue, with existing authoritative defense/stealth/forced movement outcomes. No client-created mark counters or hidden coordinates.",
  "",
  "**Papyrus and Lechy:** Bone apply uses the actual blue/orange discriminator; punishment uses actual positive damage and shared HP/death. Spaghetti heals through shared `unitHealed`; Unbeliever only uses the actual activation event. Long Bone/Cool Guy retain per-target outcomes without fabricated line/mask geometry. Lechy Guide/Confuse Terrain get source one-shots, Storm gets one start cue and actual authorized tick effects. Arena/current state reconciles silently and no persistent overlay manager is added.",
  "",
  "**Other heroes:** The per-hero matrix above enumerates every runtime/unlocked ability. Guts cannon/crossbow, Undyne throw and Zoro Oni add only brief confirmed hit accents, once per correlated use; misses get the generic miss. Griffith and Mettaton transforms use actual `unitTransformed` form/reason, so simultaneous NEO does not synthesize EX. Frisk Hugs and Warm Words use explicit apply/heal results; other resource options are deliberately not guessed. Heals use shared HP and the common heal sound. Generic class/passive combat remains unchanged.",
  "",
  "**Template reuse:** CAST consumes `abilityUsed` with `abilityUseId` and frozen authorized source cell; AREA consumes confirmed center/radius only for known square abilities; COMBAT owns target outcomes, HP and final death. Existing PROJECTILE handles supported travel, while abilities without reliable projectile semantics use cast/confirmed-impact accents. MOVEMENT uses confirmed provenance/steps; TRAP uses existing snare/hazard cues; REACTION uses existing pending UI/manual combat; STEALTH uses successful/reveal semantics; STATUS uses actual apply/tick/transform one-shots and existing simple indicators. There is no new engine, event-ingress authority or persistent-status framework.",
  "",
  "**Dedupe, sessions and visibility:** PresentationSession remains stream/revision/eventId ingress authority, snapshots establish silent baselines, and reset invalidates its token. Cast/aggregate/hit signature cue IDs use stream + abilityUseId + stage. Per-target generic damage stays independent; existing aggregate-vs-attack normalization excludes duplicate HP. Periodic status cue IDs use actual eventId. VFX attached to units and delayed new status audio are cancelled if current projection loses the unit. Frozen event-cell cues preserve already-authorized historical geometry. P1/P2 share existing board transforms and clipping; reduced motion uses static/short variants. No raw state, hidden future path or lastKnownPositions is passed to new mappers.",
  "",
  "## Exact registered assets",
  "",
  "Paths below are registry source paths (including composite layers). Existing generic and previous-pack assets remain available. The new Phase 13 IDs are listed separately in the implementation report; no binary assets were invented or edited.",
  "",
  "### SFX registry",
  "",
  "| Key | Exact source path(s) | Preload |",
  "|---|---|---|",
);
const soundKeys = new Set<SoundKey>(
  [...Object.values(REMAINING_CASTS), ...Object.values(REMAINING_AREAS)].flatMap((s) =>
    s.sfx ? [s.sfx] : [],
  ),
);
Object.values(statusSounds)
  .flat()
  .forEach((key) => soundKeys.add(key));
for (const key of [
  "common.status.ready",
  "common.status.heal",
  "common.status.bonePunish",
  "common.status.stealthEnter",
] as const)
  soundKeys.add(key);
for (const key of [...soundKeys].sort())
  lines.push(
    `| ${code(key)} | ${SOUND_REGISTRY[key].sources.map((url) => code(path(url))).join("<br>")} | ${SOUND_REGISTRY[key].preload} |`,
  );
lines.push(
  "",
  "### VFX registry",
  "",
  "| ID | Exact layer path(s) | Frames / slice |",
  "|---|---|---|",
);
const effectIds = new Set<VfxEffectId>(
  [...Object.values(REMAINING_CASTS), ...Object.values(REMAINING_AREAS)]
    .map((s) => s.vfx)
    .concat(Object.values(REMAINING_HIT_ACCENTS)),
);
Object.values(statusEffects)
  .flat()
  .forEach((id) => effectIds.add(id));
for (const id of [...effectIds].sort()) {
  const definition = vfxRegistry[id],
    layers = definition.layers ?? [definition];
  lines.push(
    `| ${code(id)} | ${layers.map((layer) => (layer.asset ? code(path(layer.asset)) : "procedural")).join("<br>")} | ${layers.map((layer) => `${layer.frames ?? 1}; ${layer.startFrame ?? 0}..${layer.endFrame ?? (layer.frames ?? 1) - 1}`).join("<br>")} |`,
  );
}
lines.push(
  "",
  "## Unresolved prerequisites and next steps",
  "",
  "| Hero / ability | Missing prerequisite | Safe behavior now / recommended next step |",
  "|---|---|---|",
);
for (const hero of inventory)
  for (const { id } of hero.abilities) {
    const coverage = heroAbilityCoverage(id)!;
    if (
      coverage.status === "BLOCKED_BY_EVENT_DATA" ||
      coverage.status === "NOT_IMPLEMENTED" ||
      (coverage.status === "GENERIC_ONLY" &&
        (REMAINING_AREAS[id] || ["papyrusLongBone", "friskPacifism", "friskGenocide"].includes(id)))
    )
      lines.push(`| ${code(`${hero.id}/${id}`)} | ${coverage.status} | ${esc(coverage.notes)} |`);
  }
lines.push(
  "",
  "Assets may exist but remain deliberately unused until they have an authorized trigger/geometry. Full ray/mask effects need recipient-safe shape metadata, not reconstructed target lists or hover choices. Source heal/readiness cues use common audio where no distinct mapped hero sound is needed. Mute/volume and cache failures use the established player fail-safe behavior. Match-only warmup loads mapped sounds for the current projected roster; no whole-library lobby preload or late-cue replay.",
  "",
  "## Deferred roadmap work",
  "",
  "- Phase 14 — Persistent Status VFX: full apply/tick/remove lifecycle, long-lived overlays/loops and ownership reconciliation.",
  "- Phase 15 — Polish, Preloading & Final Stress Test: broader visual tuning, cache/loading polish and stress testing.",
  "",
  "Neither phase is started by this change. Test and browser results are recorded in `PHASE13_REPORT.md` alongside this generated matrix.",
  "",
);
writeFileSync(
  new URL("../src/assets/HERO_PRESENTATION_COVERAGE.md", import.meta.url),
  lines.join("\n"),
);
console.log(
  `Wrote ${inventory.length} hero/form/token sections and ${inventory.reduce((n, hero) => n + hero.abilities.length, 0)} ability rows.`,
);
