import { UnitClass } from "./model";

//AloneEmpty
export const HERO_GRAND_KAISER_ID = "grand-kaiser" as const;
export const HERO_VLAD_TEPES_ID = "vladTepes" as const;
export const HERO_GENGHIS_KHAN_ID = "genghisKhan" as const;
export const HERO_CHIKATILO_ID = "chikatilo" as const;
export const HERO_FALSE_TRAIL_TOKEN_ID = "falseTrailToken" as const;
export const HERO_GROZNY_ID = "grozny" as const;
export const HERO_EL_CID_COMPEADOR_ID = "elCidCompeador" as const;
export const HERO_LECHY_ID = "lechy" as const;

//Nik
export const HERO_GRIFFITH_ID = "griffith" as const;
export const HERO_FEMTO_ID = "femto" as const;
export const HERO_GUTS_ID = "guts" as const;
export const HERO_ODIN_ID = "odin" as const;
export const HERO_LOKI_ID = "loki" as const;
export const HERO_JEBE_ID = "jebe" as const;
export const HERO_HASSAN_ID = "hassan" as const;
export const HERO_KALADIN_ID = "kaladin" as const;

//Altein
export const HERO_FRISK_ID = "frisk" as const;
export const HERO_SANS_ID = "sans" as const;
export const HERO_ASGORE_ID = "asgore" as const;
export const HERO_UNDYNE_ID = "undyne" as const;
export const HERO_PAPYRUS_ID = "papyrus" as const;
export const HERO_METTATON_ID = "mettaton" as const;
export const HERO_RIVER_PERSON_ID = "riverPerson" as const;

//Shynkx
export const HERO_DUOLINGO_ID = "duolingo" as const;
export const HERO_LUCHE_ID = "luche" as const;
export const HERO_KANEKI_ID = "kaneki" as const;
export const HERO_ZORO_ID = "zoro" as const;
export const HERO_DON_KIHOTE_ID = "donKihote" as const;
export const HERO_JACK_RIPPER_ID = "jackRipper" as const;
export const HERO_ARTEMIDA_ID = "artemida" as const;


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
    id: HERO_GRIFFITH_ID,
    name: "Griffith",
    mainClass: "knight",
  },
  {
    id: HERO_FEMTO_ID,
    name: "Femto",
    mainClass: "knight",
    baseHpOverride: 13,
    baseAttackOverride: 2,
  },
  {
    id: HERO_GUTS_ID,
    name: "Guts",
    mainClass: "berserker",
    baseHpOverride: 10,
  },
  {
    id: HERO_ODIN_ID,
    name: "Odin",
    mainClass: "rider",
    baseAttackOverride: 11,
  },
  {
    id: HERO_LOKI_ID,
    name: "Loki",
    mainClass: "trickster",
    baseAttackOverride: 9,
  },
  {
    id: HERO_JEBE_ID,
    name: "Jebe",
    mainClass: "archer",
    baseHpOverride: 6,
  },
  {
    id: HERO_HASSAN_ID,
    name: "Hassan-i Sabbah",
    mainClass: "assassin",
    baseHpOverride: 5,
  },
  {
    id: HERO_KALADIN_ID,
    name: "Kaladin Stormblessed",
    mainClass: "spearman",
    baseHpOverride: 6,
  },
  {
    id: HERO_LUCHE_ID,
    name: "Luche",
    mainClass: "spearman",
    baseHpOverride: 7,
  },
  {
    id: HERO_KANEKI_ID,
    name: "Kaneki",
    mainClass: "berserker",
    baseHpOverride: 10,
  },
  {
    id: HERO_ZORO_ID,
    name: "Zoro",
    mainClass: "knight",
    baseHpOverride: 8,
  },
  {
    id: HERO_DON_KIHOTE_ID,
    name: "Don Quixote",
    mainClass: "rider",
    baseHpOverride: 7,
  },
  {
    id: HERO_JACK_RIPPER_ID,
    name: "Jack the Ripper",
    mainClass: "assassin",
    baseAttackOverride: 5,
  },
  {
    id: HERO_ARTEMIDA_ID,
    name: "Artemida",
    mainClass: "archer",
    baseHpOverride: 10,
  },
  {
    id: HERO_FRISK_ID,
    name: "Frisk",
    mainClass: "assassin",
    baseAttackOverride: 5,
  },
  {
    id: HERO_SANS_ID,
    name: "Sans",
    mainClass: "trickster",
    baseAttackOverride: 6,
  },
  {
    id: HERO_ASGORE_ID,
    name: "Asgore Dreemurr",
    mainClass: "knight",
    baseHpOverride: 9,
  },
  {
    id: HERO_UNDYNE_ID,
    name: "Undyne",
    mainClass: "berserker",
    baseHpOverride: 9,
  },
  {
    id: HERO_PAPYRUS_ID,
    name: "Papyrus",
    mainClass: "spearman",
    baseHpOverride: 7,
  },
  {
    id: HERO_METTATON_ID,
    name: "Mettaton",
    mainClass: "archer",
    baseHpOverride: 7,
  },
  {
    id: HERO_RIVER_PERSON_ID,
    name: "River Person",
    mainClass: "rider",
    baseHpOverride: 7,
  },
  {
    id: HERO_DUOLINGO_ID,
    name: "Duolingo",
    mainClass: "trickster",
    baseAttackOverride: 6,
  },
  
  {
    id: HERO_CHIKATILO_ID,
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
  if (heroId === HERO_FEMTO_ID) {
    return false;
  }
  const hero = getHeroDefinition(heroId);
  if (!hero) return false;
  return hero.mainClass === unitClass;
}




