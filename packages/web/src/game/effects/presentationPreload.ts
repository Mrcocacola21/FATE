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
import coverage from "../../assets/heroVfxCoverage.json";
import { expansionAssets } from "../../features/vfx/expansionCatalog.generated";
import { expansionIds } from "../../features/vfx/expansionRegistry";
import { getUnitTokenAsset } from "../../assets/unitVisuals";

export const CORE_VFX: readonly VfxEffectId[] = [
  "basicProjectile",
  "basicSlash",
  "missShield",
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
  chikatilo: ["falseTrailSetup", "falseTrailBlast"],
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
/** Only portraits already disclosed in this recipient's roster/current view. */
export function rosterPortraitUrls(view: PlayerView): string[] {
  return [...new Set(Object.values({ ...view.rosterUnits, ...view.units }).flatMap(unit => {
    const asset = getUnitTokenAsset(unit);
    return asset.isFallback ? [] : [asset.src];
  }))].sort();
}
export function rosterVfx(heroIds: readonly string[], deployment = false): VfxEffectId[] {
  const ids = Object.keys(vfxRegistry) as VfxEffectId[];
  return [
    ...new Set(
      heroIds.flatMap((hero) => [
        ...expansionIds.filter(id => expansionAssets[id].heroId === hero),
        ...coverage
          .filter(
            (row) => row.hero === hero && row.key && row.status !== "BLOCKED_UNIMPLEMENTED_ABILITY",
          )
          .map((row) => row.key as VfxEffectId),
        ...(HERO_VFX[hero] ??
          ids.filter(
            (id) =>
              id.startsWith(hero) &&
              !/Rebirth|Berserk|Undying|Unbeliever|Engineering|Ex$|Neo$/.test(id),
          )),
      ]),
    ),
  ].filter(id => !deployment || vfxRegistry[id].staging === "deploy" || id.endsWith(".commander_aura") || id === "falseTrailSetup");
}
const urls = (ids: readonly VfxEffectId[]) => [
  ...new Set(ids.flatMap((id) => vfxAssets(vfxRegistry[id]).map((art) => art.asset!))),
];
const coreSoundUrls = (Object.keys(SOUND_REGISTRY) as SoundKey[])
  .filter((key) => SOUND_REGISTRY[key].preload === "core")
  .flatMap((key) => [...SOUND_REGISTRY[key].sources]);
export async function preloadPresentation(heroIds: readonly string[], deployment = false, portraits: readonly string[] = []): Promise<void> {
  const sounds = rosterSoundKeys(heroIds);
  // Warm the placement artwork first while it is needed. Warming every battle
  // strip here could evict the first figure's deploy from the decoded budget.
  const effects = rosterVfx(heroIds, deployment);
  sfxPlayer.retainUrls(
    coreSoundUrls,
    sounds.map((key) => SOUND_REGISTRY[key].sources[0]),
  );
  imagePreloader.retainUrls(urls(CORE_VFX), [...portraits, ...urls(effects)]);
  // Submit core first, heavy roster second; remaining roster cannot jump the high queue.
  const core = preloadCoreSounds("gameplay");
  const tokens = Promise.all(portraits.map(src => imagePreloader.load(src, "roster portrait", "high", true)));
  const coreImages = preloadVfx(CORE_VFX, "high");
  const roster = preloadRosterSounds(heroIds);
  const heavy = preloadVfx(
    effects.filter((id) => deployment || HEAVY_VFX.has(id)),
    "high",
  );
  const other = preloadVfx(
    effects.filter((id) => !deployment && !HEAVY_VFX.has(id)),
    "medium",
  );
  await Promise.all([core, tokens, coreImages, roster, heavy, other]);
}
export function usePresentationPreload(view: PlayerView, enabled: boolean): void {
  const roster = authorizedRoster(view).join(",");
  const deployment = view.phase === "placement";
  const portraits = rosterPortraitUrls(view).join("\n");
  useEffect(() => {
    if (enabled) void preloadPresentation(roster ? roster.split(",") : [], deployment, portraits ? portraits.split("\n") : []);
    return () => {
      sfxPlayer.retainUrls(coreSoundUrls, []);
      imagePreloader.retainUrls(urls(CORE_VFX), []);
    };
  }, [enabled, roster, deployment, portraits]);
}
