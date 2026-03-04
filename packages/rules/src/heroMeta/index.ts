import { buildBaseHeroEntries } from "./baseEntries";
import { HERO_REGISTRY_PART_1 } from "./entries/part1";
import { HERO_REGISTRY_PART_2 } from "./entries/part2";
import { HERO_REGISTRY_PART_3 } from "./entries/part3";
import type { HeroMeta } from "./types";

export type { AbilityMeta, AbilityType, HeroMeta } from "./types";

export const HERO_REGISTRY_LIST: HeroMeta[] = [
  ...HERO_REGISTRY_PART_1,
  ...HERO_REGISTRY_PART_2,
  ...HERO_REGISTRY_PART_3,
  ...buildBaseHeroEntries(),
];

export const HERO_REGISTRY: Record<string, HeroMeta> = Object.fromEntries(
  HERO_REGISTRY_LIST.map((hero) => [hero.id, hero])
);

export function getHeroMeta(heroId: string): HeroMeta | undefined {
  return HERO_REGISTRY[heroId];
}
