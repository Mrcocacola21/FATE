import { UnitClass } from "./model";

export const HERO_GRAND_KAISER_ID = "grand-kaiser" as const;
export const HERO_VLAD_TEPES_ID = "vladTepes" as const;
export const HERO_GENGHIS_KHAN_ID = "genghisKhan" as const;
export const HERO_СHIKATILO_ID = "chikatilo" as const;
export const HERO_GROZNY_ID = "grozny" as const;
export const HERO_EL_CID_COMPEADOR_ID = "elCidCompeador" as const;
export const HERO_LECHY_ID = "lechy" as const;

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
    id: HERO_СHIKATILO_ID,
    name: "Andrei Chikatilo",
    mainClass: "assassin",
    baseHpOverride: 5,
  },
  {
    id: HERO_GROZNY_ID,
    name: "Ivan Grozny",
    mainClass: "berserker",
    baseHpOverride: 11,
  },
  {
    id: HERO_EL_CID_COMPEADOR_ID,
    name: "El Cid Compeador",
    mainClass: "knight",
    baseHpOverride: 8,
  },
  {
    id: HERO_LECHY_ID,
    name: "Lechy",
    mainClass: "trickster",
    baseHpOverride: 7,
  },
  {
    id: HERO_VLAD_TEPES_ID,
    name: "Vlad III Tepes",
    mainClass: "spearman",
    baseHpOverride: 7,
  },
  {
    id: HERO_GENGHIS_KHAN_ID,
    name: "Genghis Khan",
    mainClass: "rider",
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
