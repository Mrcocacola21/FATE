import { useEffect } from "react";
import type { PlayerView } from "rules";
import { SOUND_REGISTRY, type SoundKey } from "../../assets/sfx/registry";
import {
  preloadCoreSounds,
  preloadRosterSounds,
  rosterSoundKeys,
} from "../../features/sfx/audioPreload";
import { sfxPlayer } from "../../features/sfx/sfxPlayer";
import { imagePreloader, preloadVfx, vfxAssets } from "../../features/vfx/imagePreload";
import { vfxRegistry } from "../../features/vfx/vfxRegistry";
import type { VfxEffectId } from "../../features/vfx/vfxTypes";

export const CORE_VFX: readonly VfxEffectId[] = [
  "combatHit",
  "combatMiss",
  "unitDeath",
  "statusSmall",
  "hiddenReveal",
];
const HERO_VFX: Record<string, readonly VfxEffectId[]> = {
  "grand-kaiser": ["doraImpact", "carpetImpact", "bunkerStatus"],
  vladTepes: ["forestEruption", "vladGaze", "stakePlace", "stakeTrigger"],
  sans: [
    "gasterCannon",
    "gasterBeam",
    "sansCurseApply",
    "sansCurseTick",
    "sansCurseRemove",
    "sansCurseStatus",
    "sansJoke",
    "sansSleep",
  ],
  asgore: ["fireballCast", "fireball", "fireballImpact", "fireParade", "soulParade"],
  riverPerson: ["boat", "boatPickup", "boatDrop", "tralala"],
  jackRipper: ["snarePlace", "snareTrigger", "jackCoverTracks", "jackSlaughter"],
  genghisKhan: ["genghisDecree"],
  donKihote: ["donSorrow"],
};
const HEAVY_VFX = new Set<VfxEffectId>([
  "doraImpact",
  "carpetImpact",
  "forestEruption",
  "gasterCannon",
  "gasterBeam",
  "fireball",
  "fireballCast",
  "fireballImpact",
  "boat",
  "tralala",
]);

/** Only assigned identities already present in recipient projection. Never targets, hazards or paths. */
export function authorizedRoster(view: PlayerView): string[] {
  return [
    ...new Set(
      Object.values(view.rosterUnits ?? view.units)
        .map((unit) => unit.heroId)
        .filter((id): id is string => Boolean(id)),
    ),
  ].sort();
}
export function rosterVfx(heroIds: readonly string[]): VfxEffectId[] {
  const ids = Object.keys(vfxRegistry) as VfxEffectId[];
  return [
    ...new Set(
      heroIds.flatMap(
        (hero) =>
          HERO_VFX[hero] ??
          ids.filter(
            (id) =>
              id.startsWith(hero) &&
              !/Rebirth|Berserk|Undying|Unbeliever|Engineering|Ex$|Neo$/.test(id),
          ),
      ),
    ),
  ];
}
const urls = (ids: readonly VfxEffectId[]) => [
  ...new Set(ids.flatMap((id) => vfxAssets(vfxRegistry[id]).map((art) => art.asset!))),
];
const coreSoundUrls = (Object.keys(SOUND_REGISTRY) as SoundKey[])
  .filter((key) => SOUND_REGISTRY[key].preload === "core")
  .flatMap((key) => [...SOUND_REGISTRY[key].sources]);
export async function preloadPresentation(heroIds: readonly string[]): Promise<void> {
  const sounds = rosterSoundKeys(heroIds);
  const effects = rosterVfx(heroIds);
  sfxPlayer.retainUrls(
    coreSoundUrls,
    sounds.map((key) => SOUND_REGISTRY[key].sources[0]),
  );
  imagePreloader.retainUrls(urls(CORE_VFX), urls(effects));
  // Submit core first, heavy roster second; remaining roster cannot jump the high queue.
  const core = preloadCoreSounds("gameplay");
  const coreImages = preloadVfx(CORE_VFX, "high");
  const roster = preloadRosterSounds(heroIds);
  const heavy = preloadVfx(
    effects.filter((id) => HEAVY_VFX.has(id)),
    "high",
  );
  const other = preloadVfx(
    effects.filter((id) => !HEAVY_VFX.has(id)),
    "medium",
  );
  await Promise.all([core, coreImages, roster, heavy, other]);
}
export function usePresentationPreload(view: PlayerView, enabled: boolean): void {
  const roster = authorizedRoster(view).join(",");
  useEffect(() => {
    if (enabled) void preloadPresentation(roster ? roster.split(",") : []);
    return () => {
      sfxPlayer.retainUrls(coreSoundUrls, []);
      imagePreloader.retainUrls(urls(CORE_VFX), []);
    };
  }, [enabled, roster]);
}
