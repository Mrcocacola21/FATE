import { UnitClass } from "./model";

export const HERO_GRAND_KAISER_ID = "grand-kaiser" as const;
export const HERO_VLAD_TEPES_ID = "vladTepes" as const;

export interface HeroDefinition {
  id: string;
  name: string;
  mainClass: UnitClass;
  baseHpOverride?: number;
  baseAttackOverride?: number;
}

export type HeroSelection = Partial<Record<UnitClass, string>>;

export const HERO_CATALOG: HeroDefinition[] = [
  {
    id: HERO_GRAND_KAISER_ID,
    name: "Grand Kaiser",
    mainClass: "archer",
  },
  {
    id: HERO_VLAD_TEPES_ID,
    name: "Vlad III Tepes",
    mainClass: "spearman",
    baseHpOverride: 7,
  },
];

const HERO_BY_ID = new Map(HERO_CATALOG.map((hero) => [hero.id, hero]));

export function getHeroDefinition(id: string | undefined): HeroDefinition | undefined {
  if (!id) return undefined;
  return HERO_BY_ID.get(id);
}

export function heroMatchesClass(
  heroId: string | undefined,
  unitClass: UnitClass
): boolean {
  const hero = getHeroDefinition(heroId);
  if (!hero) return false;
  return hero.mainClass === unitClass;
}
