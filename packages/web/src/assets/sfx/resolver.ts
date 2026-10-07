import {
  commonSfx,
  heroSfx,
  type CommonSfxCategory,
  type CommonSfxRegistry,
  type HeroId,
  type HeroSfxCategory,
  type HeroSfxRegistry,
  SOUND_REGISTRY,
  type SoundKey,
  type SoundDefinition,
} from "./registry";

export function getSoundDefinition(key: string): SoundDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, key)
    ? SOUND_REGISTRY[key as SoundKey]
    : undefined;
}

/** Pure presentation hash. Never imports or consumes rules/server RNG. */
export function soundVariantIndex(cueId: string, key: SoundKey, count: number): number {
  let hash = 2166136261;
  for (const char of `${cueId}:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return count > 0 ? (hash >>> 0) % count : 0;
}

/** A fallback must be explicitly approved by the caller; unknown semantics stay silent. */
export function resolveSound(
  key: string,
  cueId: string,
  fallbackKey?: SoundKey,
): (SoundDefinition & { key: SoundKey; src: string }) | undefined {
  const resolvedKey = getSoundDefinition(key) ? (key as SoundKey) : fallbackKey;
  const definition = resolvedKey && getSoundDefinition(resolvedKey);
  if (!definition?.sources.length || !resolvedKey) return undefined;
  return {
    ...definition,
    key: resolvedKey,
    src: definition.sources[soundVariantIndex(cueId, resolvedKey, definition.sources.length)],
  };
}

export interface SfxRegistries {
  heroes: HeroSfxRegistry;
  common: CommonSfxRegistry;
}

function commonCategoryFor(category: HeroSfxCategory, key: string): CommonSfxCategory {
  if (category === "statuses") return "status";
  if (category === "basic" && key === "move") return "movement";
  return "combat";
}

/**
 * Creates a resolver over supplied registries. Supplying registries is useful
 * for isolated tests and asset previews; production uses getHeroSfx below.
 */
export function createSfxResolver(registries: SfxRegistries) {
  return (heroId: HeroId, category: HeroSfxCategory, key: string): string | undefined => {
    const heroCategory = registries.heroes[heroId]?.[category] as
      | Record<string, string>
      | undefined;
    const exact = heroCategory?.[key];
    if (exact) return exact;

    return registries.common[commonCategoryFor(category, key)]?.[key];
  };
}

const resolveRegisteredHeroSfx = createSfxResolver({
  heroes: heroSfx,
  common: commonSfx,
});

export function getHeroSfx(
  heroId: HeroId,
  category: HeroSfxCategory,
  key: string,
): string | undefined {
  return resolveRegisteredHeroSfx(heroId, category, key);
}

export function getCommonSfx(category: CommonSfxCategory, key: string): string | undefined {
  return commonSfx[category]?.[key];
}
