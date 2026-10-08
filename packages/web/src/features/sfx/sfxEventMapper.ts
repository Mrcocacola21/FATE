import type { ProjectedGameEvent, PlayerView } from "rules";
import { ABILITY_KAISER_CARPET_STRIKE, ABILITY_VLAD_INTIMIDATE } from "../../rulesHints";
import { heroAoeEffect, heroCueId } from "../../game/effects/heroPresentation";
import { GASTER_TIMING, isGasterResolution } from "../../game/effects/sansPresentation";
import { FIREBALL_TIMING, isFireballResolution } from "../../game/effects/asgorePresentation";
import {
  isHeroId,
  type CommonSfxCategory,
  type HeroId,
  type HeroSfxCategory,
  type SfxKey,
} from "../../assets/sfx/registry";
import { getCommonSfx, getHeroSfx, resolveSound } from "../../assets/sfx/resolver";
import type { SoundKey } from "../../assets/sfx/registry";
import type { PresentationEvent } from "../../game/effects/types";
import { isPresentedRoll, type CombatPresentationCue } from "../../game/effects/combatPlayback";
import type { SfxEvent, SfxLookup, SfxPlaybackRequest } from "./sfxTypes";

function heroLookup(
  heroId: HeroId,
  category: HeroSfxCategory,
  key: string,
  commonCategory: CommonSfxCategory,
  genericCommonKey?: string,
): SfxLookup {
  return {
    sfxKey: `hero.${heroId}.${category}.${key}` as SfxKey,
    heroId,
    category,
    key,
    commonCategory,
    genericCommonKey,
  };
}

export function mapSfxEventToLookup(event: SfxEvent): SfxLookup {
  switch (event.type) {
    case "unitAttack":
      return heroLookup(event.heroId, "basic", "attack", "combat");
    case "unitHit":
      return heroLookup(event.heroId, "basic", "hit", "combat");
    case "unitDeath":
      return heroLookup(event.heroId, "basic", "death", "combat");
    case "unitMove":
      return heroLookup(event.heroId, "basic", "move", "movement");
    case "abilityUsed":
      return heroLookup(event.heroId, "abilities", event.abilityId, "combat", "ability");
    case "phantasmUsed":
      return heroLookup(event.heroId, "phantasms", event.phantasmId, "combat", "phantasm");
    case "transformation":
      return heroLookup(
        event.heroId,
        "transformations",
        event.transformationId ?? "transform",
        "combat",
        "transform",
      );
    case "statusApplied":
      if (event.heroId) {
        return heroLookup(event.heroId, "statuses", event.statusId, "status", "applied");
      }
      return {
        sfxKey: `common.status.${event.statusId}`,
        key: event.statusId,
        commonCategory: "status",
        genericCommonKey: "applied",
      };
  }
}

export function resolveSfxEvent(event: SfxEvent): string | undefined {
  const lookup = mapSfxEventToLookup(event);
  const exact =
    lookup.heroId && lookup.category
      ? getHeroSfx(lookup.heroId, lookup.category, lookup.key)
      : getCommonSfx(lookup.commonCategory, lookup.key);
  if (exact || !lookup.genericCommonKey) return exact;
  return getCommonSfx(lookup.commonCategory, lookup.genericCommonKey);
}

function heroIdForUnit(view: PlayerView, unitId: string | undefined): HeroId | undefined {
  if (!unitId) return undefined;
  const heroId = view.units[unitId]?.heroId;
  return isHeroId(heroId) ? heroId : undefined;
}

export function mapGameEventToSfxEvents(event: ProjectedGameEvent, view: PlayerView): SfxEvent[] {
  switch (event.type) {
    case "attackResolved": {
      const events: SfxEvent[] = [];
      const attackerHeroId = heroIdForUnit(view, event.attackerId);
      if (attackerHeroId && event.attackerRollIsNew !== false) {
        events.push({ type: "unitAttack", heroId: attackerHeroId });
      }
      const defenderHeroId = heroIdForUnit(view, event.defenderId);
      if (defenderHeroId && event.hit) {
        events.push({ type: "unitHit", heroId: defenderHeroId });
      }
      return events;
    }
    case "unitDied": {
      const heroId = heroIdForUnit(view, event.unitId);
      return heroId ? [{ type: "unitDeath", heroId }] : [];
    }
    case "unitMoved": {
      const heroId = heroIdForUnit(view, event.unitId);
      return heroId ? [{ type: "unitMove", heroId }] : [];
    }
    case "abilityUsed": {
      const heroId = heroIdForUnit(view, event.unitId);
      if (!heroId) return [];
      const abilityKind = view.abilitiesByUnitId?.[event.unitId]?.find(
        (ability) => ability.id === event.abilityId,
      )?.kind;
      return abilityKind === "phantasm"
        ? [{ type: "phantasmUsed", heroId, phantasmId: event.abilityId }]
        : [{ type: "abilityUsed", heroId, abilityId: event.abilityId }];
    }
    case "unitTransformed":
      return isHeroId(event.fromHeroId)
        ? [{ type: "transformation", heroId: event.fromHeroId }]
        : [];
    case "papyrusBoneApplied":
      return [
        {
          type: "statusApplied",
          heroId: "papyrus",
          statusId: `${event.boneType}Bone`,
        },
      ];
    case "stealthEntered": {
      const heroId = heroIdForUnit(view, event.unitId);
      return heroId ? [{ type: "statusApplied", heroId, statusId: "stealth" }] : [];
    }
    default:
      return [];
  }
}

export function mapEventBatchToSfx(params: {
  events: PresentationEvent[];
  view: PlayerView;
  revision: number;
  presentationId?: string;
  streamId?: string;
  eventDelaysMs?: readonly number[];
  eventSfxDelaysMs?: readonly number[];
  combatCues?: readonly CombatPresentationCue[];
}): SfxPlaybackRequest[] {
  const requests: SfxPlaybackRequest[] = [];
  for (const [eventIndex, event] of params.events.entries()) {
    if (!event.eventId) continue;
    const baseDelay =
      params.eventSfxDelaysMs?.[eventIndex] ?? params.eventDelaysMs?.[eventIndex] ?? 0;
    if (isFireballResolution(event)) {
      const outcome = params.combatCues?.find(
        (cue) => cue.eventIndex === eventIndex && (cue.kind === "hit" || cue.kind === "miss"),
      );
      const impactMs = outcome?.atMs ?? baseDelay + FIREBALL_TIMING.travelMs;
      const namespace = params.streamId ?? params.presentationId ?? "live";
      if (event.sourceCell && event.targetCell) {
        const id = heroCueId(namespace, event, "travelAudio");
        const sound = resolveSound("hero.asgore.abilities.asgoreFireball.travel", id);
        if (sound && !requests.some((request) => request.id === id))
          requests.push({
            ...sound,
            id,
            delayMs: Math.max(0, impactMs - FIREBALL_TIMING.travelMs),
            durationMs: FIREBALL_TIMING.travelMs,
          });
      }
      if (event.hit) {
        const id = heroCueId(namespace, event, "impactAudio");
        const sound = resolveSound("hero.asgore.abilities.asgoreFireball.impact", id);
        if (sound && !requests.some((request) => request.id === id))
          requests.push({ ...sound, id, delayMs: impactMs });
      }
      continue;
    }
    if (isGasterResolution(event)) {
      for (const [key, offset] of [
        ["hero.sans.abilities.sansGasterBlaster.charge", GASTER_TIMING.chargeMs],
        ["hero.sans.abilities.sansGasterBlaster.fire", GASTER_TIMING.fireMs],
      ] as const) {
        const id = heroCueId(params.streamId ?? params.presentationId ?? "live", event, key);
        if (requests.some((request) => request.id === id)) continue;
        const sound = resolveSound(key, id);
        if (sound) requests.push({ ...sound, id, delayMs: baseDelay + offset });
      }
      continue;
    }
    let key: SoundKey | undefined;
    if (event.type === "abilityUsed" && event.abilityUseId && event.abilityId === "asgoreFireball")
      key = "hero.asgore.abilities.asgoreFireball.cast";
    else if (
      event.type === "abilityUsed" &&
      event.abilityUseId &&
      event.abilityId === "asgoreFireParade"
    )
      key = "hero.asgore.abilities.asgoreFireParade.cast";
    else if (event.type === "asgoreSoulParadeResolved" && event.asgoreId)
      key = "hero.asgore.abilities.asgoreSoulParade.reveal";
    else if (event.type === "sansLastAttackApplied")
      key = "hero.sans.abilities.sansLastAttack.apply";
    else if (event.type === "sansLastAttackTick") key = "hero.sans.abilities.sansLastAttack.tick";
    else if (event.type === "sansLastAttackRemoved")
      key = "hero.sans.abilities.sansLastAttack.remove";
    else if (event.type === "aoeResolved") {
      const effect = heroAoeEffect(event.abilityId);
      key =
        effect === "doraImpact"
          ? "hero.grand-kaiser.abilities.kaiserDora"
          : effect === "carpetImpact"
            ? "hero.grand-kaiser.abilities.kaiserCarpetStrike.impact"
            : effect === "forestEruption"
              ? "hero.vladTepes.abilities.vladForest.impact"
              : undefined;
    } else if (event.type === "abilityUsed" && event.abilityId === ABILITY_KAISER_CARPET_STRIKE) {
      key = "hero.grand-kaiser.abilities.kaiserCarpetStrike.launch";
    } else if (event.type === "bunkerEntered") key = "hero.grand-kaiser.statuses.bunker.enter";
    else if (event.type === "bunkerExited") key = "hero.grand-kaiser.statuses.bunker.exit";
    else if (event.type === "stakesPlaced") key = "hero.vladTepes.abilities.vladStakes.place";
    else if (event.type === "intimidateResolved" && event.abilityId === ABILITY_VLAD_INTIMIDATE)
      key = "hero.vladTepes.abilities.intimidatingStare";
    if (!key) continue;
    // Periodic status events have their own identities, never a reused ability-use ID.
    const id =
      event.type === "sansLastAttackApplied" ||
      event.type === "sansLastAttackTick" ||
      event.type === "sansLastAttackRemoved" ||
      event.type === "asgoreSoulParadeResolved"
        ? `${params.streamId ?? params.presentationId ?? "live"}:${event.eventId}:${key}`
        : heroCueId(params.streamId ?? params.presentationId ?? "live", event, key);
    if (requests.some((request) => request.id === id)) continue;
    const sound = resolveSound(key, id);
    if (sound)
      requests.push({
        ...sound,
        id,
        delayMs: params.eventSfxDelaysMs?.[eventIndex] ?? params.eventDelaysMs?.[eventIndex] ?? 0,
      });
  }
  if (params.combatCues) {
    for (const cue of params.combatCues) {
      if (!params.events[cue.eventIndex]?.eventId || cue.kind === "heal") continue;
      if (params.events[cue.eventIndex]?.type === "sansLastAttackTick") continue;
      if (cue.kind === "hit" && isFireballResolution(params.events[cue.eventIndex])) continue;
      const key: SoundKey =
        cue.kind === "roll"
          ? "common.combat.diceRoll"
          : cue.kind === "miss"
            ? "common.combat.miss"
            : cue.kind === "death"
              ? "common.combat.death"
              : "common.combat.hit";
      const id = `${cue.id}:audio:${key}`;
      const sound = resolveSound(key, id);
      if (sound) requests.push({ ...sound, id, delayMs: cue.atMs });
    }
    return requests;
  }
  params.events.forEach((gameEvent, eventIndex) => {
    // Live event identity comes from authorized ingress, never state/HP diffs.
    if (!gameEvent.eventId) return;
    let key: SoundKey;
    switch (gameEvent.type) {
      case "rollResolved":
        if (!isPresentedRoll(gameEvent.rollKind)) return;
        key = "common.combat.diceRoll";
        break;
      case "attackResolved":
        if (isFireballResolution(gameEvent) && gameEvent.hit) return;
        key = gameEvent.hit ? "common.combat.hit" : "common.combat.miss";
        break;
      case "unitDied":
        key = "common.combat.death";
        break;
      default:
        return;
    }
    const id = `${params.streamId ?? params.presentationId ?? "live"}:${gameEvent.eventId}:audio:${key}`;
    const sound = resolveSound(key, id);
    if (sound)
      requests.push({
        ...sound,
        id,
        delayMs:
          (params.eventSfxDelaysMs?.[eventIndex] ?? params.eventDelaysMs?.[eventIndex] ?? 0) +
          (isFireballResolution(gameEvent) ? FIREBALL_TIMING.travelMs : 0),
      });
  });
  return requests;
}
