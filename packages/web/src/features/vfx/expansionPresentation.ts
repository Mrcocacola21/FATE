import type { PlayerView, ProjectedGameEvent } from "rules";
import type { CombatPresentationCue } from "../../game/effects/combatPlayback";
import type { MovementPresentationCue } from "../../game/effects/movementPresentation";
import { expansionEffect } from "./expansionRegistry";
import { getUnitVisualVariant } from "../../assets/unitVisuals";
import type { BoardVfxRequest } from "./vfxTypes";
import { expansionStagingProfile } from "./expansionStaging";
import { MOVEMENT_WAKE_FADE_MS } from "./movementWake";
import { expansionAssets } from "./expansionCatalog.generated";
import { MELEE_RECOVERY_MS } from "./meleeStrike";

/** Rewind identity/form facts only. Positions always remain recipient-projected. */
export function expansionViewAtEvent(view: PlayerView, events: readonly ProjectedGameEvent[], index: number): PlayerView {
  const units = { ...view.units };
  for (const event of events.slice(index + 1).reverse()) {
    if (!("unitId" in event) || typeof event.unitId !== "string" || !units[event.unitId]) continue;
    const unit = units[event.unitId];
    if (event.type === "unitTransformed") units[event.unitId] = { ...unit, heroId: event.fromHeroId,
      ...(event.toFormId ? { mettatonExUnlocked: event.fromFormId === "mettatonEx", mettatonNeoUnlocked: event.fromFormId === "mettatonNeo" } : {}) };
    if (event.type === "kanekiFormEntered") units[event.unitId] = { ...unit, kanekiCentipedeUnlocked: false };
    if (event.type === "abilityUsed") {
      if (event.abilityId === "gutsBerserkMode") units[event.unitId] = { ...unit, gutsBerserkModeActive: false };
      if (event.abilityId === "gutsExitBerserk") units[event.unitId] = { ...unit, gutsBerserkModeActive: true };
      if (event.abilityId === "undyneUndying") units[event.unitId] = { ...unit, undyneImmortalActive: false };
      if (event.abilityId === "kaiserEngineeringMiracle") units[event.unitId] = { ...unit, transformed: false };
    }
  }
  return { ...view, units };
}

// Enable profiles in reviewed batches; registration alone is not runtime coverage.
export const BASIC_EXPANSION_HEROES = new Set(["zoro", "griffith", "femto", "guts", "kaneki", "undyne",
  "artemida", "asgore", "jebe", "grand-kaiser", "mettaton", "grozny",
  "donKihote", "elCidCompeador", "genghisKhan", "hassan", "jackRipper", "chikatilo",
  "loki", "kaladin", "duolingo", "odin", "luche", "papyrus", "lechy", "sans", "riverPerson", "vladTepes", "frisk"]);
const FORM_ROLES: Record<string, { move: string; attack: string }> = {
  "guts-berserk": { move: "berserk_move", attack: "berserk_swing" },
  "kaneki-centipede": { move: "centipede_move", attack: "centipede_attack" },
  "undyne-undying": { move: "undying_move", attack: "undying_swing" },
  "engineering-miracle": { move: "engineering_move", attack: "engineering_attack" },
  "mettaton-ex": { move: "ex_move", attack: "ex_attack" },
  "mettaton-neo": { move: "neo_move", attack: "neo_attack" },
};
function actionExpansion(view: PlayerView, unitId: string | undefined, action: "move" | "attack") {
  const unit = unitId ? view.units[unitId] : undefined;
  const variant = getUnitVisualVariant(unit);
  const role = variant ? FORM_ROLES[variant]?.[action] : undefined;
  return role ? basicExpansion(view, unitId, role) : undefined;
}
export function basicExpansion(view: PlayerView, unitId: string | undefined, role: string) {
  const unit = unitId ? view.units[unitId] : undefined;
  return unit?.heroId && BASIC_EXPANSION_HEROES.has(unit.heroId)
    ? expansionEffect(unit.heroId, role) : undefined;
}

function isBerserkSingle(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>, view: PlayerView) {
  return event.attackSignature === "gutsBerserkSingle" && Boolean(event.attackerId && view.units[event.attackerId]?.heroId === "guts");
}

export function expansionOutcome(event: ProjectedGameEvent | undefined, view: PlayerView) {
  if (event?.type === "aoeResolved" && event.abilityId === "asgoreFireParade") return expansionEffect("asgore", "parade_hit");
  if (event?.type === "papyrusBonePunished" && event.damage > 0) return expansionEffect("papyrus", `${event.boneType}_bone_punish`);
  if (event?.type === "sansBoneFieldPunished" && event.damage > 0) return expansionEffect("sans", "bone_field_tick");
  if (event?.type === "lechyStormRollResult" && event.damage > 0 && !event.success) return expansionEffect("lechy", "storm_tick");
  if (event?.type === "attackResolved" && !event.hit && event.spearmanEvaded)
    return basicExpansion(view, event.defenderId, "auto_defense");
  if (event?.type === "attackResolved" && event.hit && (event.bunkerAbsorbedDamage ?? 0) > 0)
    return basicExpansion(view, event.defenderId, "bunker_absorb");
  if (event?.type === "attackResolved" && event.hit && event.abilityId === "asgoreFireParade")
    return expansionEffect("asgore", "parade_hit");
  if (event?.type === "attackResolved" && event.hit && event.isBasicAttack && event.sourceCell &&
    event.attackerRoll.isDouble && event.attackerId && view.units[event.attackerId]?.heroId === "artemida")
    return basicExpansion(view, event.attackerId, "precise_arrow_confirm");
  if (event?.type === "heroSelfCost") return expansionEffect(
    event.sourceAbilityId === "gutsBerserkMode" ? "guts" : "undyne",
    event.sourceAbilityId === "gutsBerserkMode" ? "berserk_self_cost" : "undying_self_cost");
  if (event?.type === "attackResolved" && event.hit && event.abilityId === "gutsCannon" && event.abilityUseId)
    return basicExpansion(view, event.attackerId, "cannon_hit");
  if (event?.type === "attackResolved" && (event.isBasicAttack || isBerserkSingle(event, view)) && event.hit && event.sourceCell && event.targetCell)
    return basicExpansion(view, event.attackerId, "attack_impact");
  if (event?.type === "unitDied") return basicExpansion(view, event.unitId, "death_final");
  return undefined;
}

export function expansionAttack(event: ProjectedGameEvent, cue: CombatPresentationCue | undefined,
  view: PlayerView, id: string): BoardVfxRequest[] {
  if (event.type !== "attackResolved" || (!event.isBasicAttack && !isBerserkSingle(event, view)) || !event.sourceCell || !event.targetCell) return [];
  if ((event.attackSignature && !isBerserkSingle(event, view)) || (event.attackerId && view.units[event.attackerId]?.heroId === "odin" && event.hit && event.attackerRoll.isDouble)) return [];
  const form = isBerserkSingle(event, view) ? expansionEffect("guts", "berserk_swing") : actionExpansion(view, event.attackerId, "attack");
  const projectile = basicExpansion(view, event.attackerId, "attack_projectile");
  const swing = basicExpansion(view, event.attackerId, "attack_swing");
  const effectId = form ?? projectile ?? swing;
  if (!effectId) return [];
  const start = cue && "attackAtMs" in cue ? cue.attackAtMs ?? 0 : 0;
  const contactMs = Math.max(1, (cue?.atMs ?? 210) - start);
  const melee = expansionAssets[effectId].geometry === "swing";
  return [{ id: `${id}:release`, effectId, placement: form ?
    (/engineering_attack|ex_attack|neo_attack/.test(form) ? "projectile" : "cell") : projectile ? "projectile" : "cell",
    sourceCell: event.sourceCell, targetCell: event.targetCell, anchorMode: "event",
    ...(melee ? { unitId: event.attackerId, strikeContactMs: contactMs, strikeHit: event.hit } : {}),
    delayMs: start, durationMs: contactMs + (melee ? MELEE_RECOVERY_MS : 0),
  }];
}

export function expansionMovement(cue: MovementPresentationCue, view: PlayerView, arrival = true): BoardVfxRequest[] {
  if (cue.kind !== "movement" || (cue.mode !== "normal" && cue.mode !== "rider")) return [];
  const trail = actionExpansion(view, cue.unitId, "move") ?? basicExpansion(view, cue.unitId, "move_trail");
  const arrive = basicExpansion(view, cue.unitId, "move_arrive");
  const profile = expansionStagingProfile(view.units[cue.unitId]?.heroId ?? "");
  return [
    ...(trail ? [{ id: `${cue.id}:trail`, effectId: trail, placement: "projectile" as const,
      sourceCell: cue.from, targetCell: cue.to, unitId: cue.unitId, anchorMode: "event" as const,
      delayMs: cue.atMs, travelDurationMs: cue.durationMs,
      durationMs: cue.durationMs + MOVEMENT_WAKE_FADE_MS }] : []),
    ...(arrive && arrival ? [{ id: `${cue.id}:arrive`, effectId: arrive, placement: "cell" as const,
      sourceCell: cue.to, unitId: cue.unitId, anchorMode: "event" as const,
      delayMs: cue.atMs + cue.durationMs, durationMs: profile.arrivalDuration }] : []),
  ];
}

export function expansionTeleport(cue: MovementPresentationCue, event: ProjectedGameEvent | undefined,
  view: PlayerView): BoardVfxRequest[] | undefined {
  if (cue.kind !== "movement" || cue.mode !== "teleport" || event?.type !== "unitMoved" ||
    event.provenance.kind !== "ability") return undefined;
  if (!view.units[cue.unitId]?.position) return undefined;
  const portals: Record<string, { hero: string; exit: string; arrive: string }> = {
    femtoDivineMove: { hero: "femto", exit: "divine_exit", arrive: "divine_arrive" },
    groznyInvadeTime: { hero: "grozny", exit: "invade_exit", arrive: "invade_arrive" },
    lechyGuideTraveler: { hero: "lechy", exit: "guide_depart", arrive: "guide_arrive" },
    odinSleipnir: { hero: "odin", exit: "sleipnir_exit", arrive: "sleipnir_arrive" },
  };
  const family = event.provenance.abilityId ? portals[event.provenance.abilityId] : undefined;
  if (!family || !BASIC_EXPANSION_HEROES.has(family.hero)) return undefined;
  const exit = expansionEffect(family.hero, family.exit);
  const arrive = expansionEffect(family.hero, family.arrive);
  if (!exit || !arrive) return undefined;
  return [exit, arrive].map((effectId, index) => ({ id: `${cue.id}:portal:${index}`, effectId,
    placement: "cell", sourceCell: index ? cue.to : cue.from, unitId: cue.unitId, anchorMode: "event",
    durationMs: cue.durationMs / 2, delayMs: cue.atMs + index * cue.durationMs / 2,
  }));
}
