import type { ProjectedGameEvent, PlayerView } from "rules";
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
}): SfxPlaybackRequest[] {
  const requests: SfxPlaybackRequest[] = [];
  params.events.forEach((gameEvent, eventIndex) => {
    // Live event identity comes from authorized ingress, never state/HP diffs.
    if (!gameEvent.eventId) return;
    let key: SoundKey;
    switch (gameEvent.type) {
      case "rollResolved":
        key = "common.combat.diceRoll";
        break;
      case "attackResolved":
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
        delayMs: params.eventSfxDelaysMs?.[eventIndex] ?? params.eventDelaysMs?.[eventIndex] ?? 0,
      });
  });
  return requests;
}
