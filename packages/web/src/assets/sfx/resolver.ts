import {
  commonSfx,
  heroSfx,
  type CommonSfxCategory,
  type CommonSfxRegistry,
  type HeroId,
  type HeroSfxCategory,
  type HeroSfxRegistry,
} from "./registry";

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
