import type { UnitClass } from "./model";
import { getUnitDefinition } from "./units";
import {
  ABILITY_KAISER_BUNKER,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_VLAD_FOREST,
  ABILITY_VLAD_INTIMIDATE,
  ABILITY_VLAD_POLKOVODETS,
  ABILITY_VLAD_STAKES,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_GROZNY_INVADE_TIME,
  ABILITY_GROZNY_TYRANT,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
  ABILITY_LECHY_STORM,
  ABILITY_LECHY_CONFUSE_THE_TERRAIN,
  ABILITY_LECHY_GUIDE_THE_TRAVELER,
  ABILITY_СHIKATILO_MARK,
  getAbilitySpec,
  ABILITY_CHIKATILO_FALSE_TRACE,
} from "./abilities";
import {
  HERO_GRAND_KAISER_ID,
  HERO_VLAD_TEPES_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_СHIKATILO_ID,
  HERO_GROZNY_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_LECHY_ID,
  getHeroDefinition,
} from "./heroes";

export type AbilityType = "passive" | "active" | "impulse" | "phantasm";

export interface AbilityMeta {
  id: string;
  name: string;
  type: AbilityType;
  description: string;
  consumesAction?: boolean;
  consumesMove?: boolean;
  chargeRequired?: number | null;
}

export interface HeroMeta {
  id: string;
  name: string;
  mainClass:
    | "assassin"
    | "knight"
    | "archer"
    | "rider"
    | "berserker"
    | "trickster"
    | "spearman";
  baseStats: {
    hp: number;
    damage: number;
    moveType: string;
    attackRange: string;
  };
  abilities: AbilityMeta[];
  description?: string;
}

const BASE_HERO_IDS: Record<UnitClass, string> = {
  assassin: "base-assassin",
  archer: "base-archer",
  berserker: "base-berserker",
  rider: "base-rider",
  spearman: "base-spearman",
  trickster: "base-trickster",
  knight: "base-knight",
};

function getMoveType(unitClass: UnitClass): string {
  if (unitClass === "rider") return "rider";
  if (unitClass === "berserker") return "berserker";
  return "normal";
}

function getAttackRange(unitClass: UnitClass): string {
  if (unitClass === "archer") return "line";
  if (unitClass === "spearman") return "reach-2";
  return "melee";
}

function buildBaseStats(mainClass: UnitClass, heroId?: string) {
  const def = getUnitDefinition(mainClass);
  const hero = getHeroDefinition(heroId);
  return {
    hp: hero?.baseHpOverride ?? def.maxHp,
    damage: hero?.baseAttackOverride ?? def.baseAttack,
    moveType: getMoveType(mainClass),
    attackRange: getAttackRange(mainClass),
  };
}

function buildAbilityMeta(abilityId: string): AbilityMeta | null {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return null;
  const consumes = spec.actionCost?.consumes;
  const chargeRequired = spec.chargeUnlimited
    ? null
    : spec.chargesPerUse ?? spec.chargeCost ?? spec.maxCharges;
  return {
    id: spec.id,
    name: spec.displayName,
    type: spec.kind,
    description: spec.description,
    consumesAction: consumes?.action === true,
    consumesMove: consumes?.move === true,
    chargeRequired,
  };
}

const HERO_REGISTRY_LIST: HeroMeta[] = [
  {
    id: HERO_GRAND_KAISER_ID,
    name: "Grand Kaiser",
    mainClass: "archer",
    baseStats: buildBaseStats("archer", HERO_GRAND_KAISER_ID),
    abilities: [
      ABILITY_KAISER_BUNKER,
      ABILITY_KAISER_DORA,
      ABILITY_KAISER_CARPET_STRIKE,
      ABILITY_KAISER_ENGINEERING_MIRACLE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  { 
    id: HERO_GENGHIS_KHAN_ID,
    name: "Genghis Khan",
    mainClass: "rider",
    baseStats: buildBaseStats("rider", HERO_GENGHIS_KHAN_ID),
    abilities: [
      ABILITY_GENGHIS_KHAN_KHANS_DECREE,
      ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {
    id: HERO_СHIKATILO_ID,
    name: "Andrei Chikatilo",
    mainClass: "assassin",
    baseStats: buildBaseStats("assassin", HERO_СHIKATILO_ID),
    abilities: [
      ABILITY_СHIKATILO_MARK,
      ABILITY_CHIKATILO_FALSE_TRACE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {
    id: HERO_GROZNY_ID,
    name: "Ivan Grozny",
    mainClass: "berserker",
    baseStats: buildBaseStats("berserker", HERO_GROZNY_ID),
    abilities: [
      ABILITY_GROZNY_INVADE_TIME,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_GROZNY_TYRANT,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {
    id: HERO_EL_CID_COMPEADOR_ID,
    name: "El Cid Compeador",
    mainClass: "knight",
    baseStats: buildBaseStats("knight", HERO_EL_CID_COMPEADOR_ID),
    abilities: [
      ABILITY_EL_SID_COMPEADOR_TISONA,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_EL_SID_COMPEADOR_KOLADA,
      ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {
    id: HERO_LECHY_ID,
    name: "Lechy",
    mainClass: "trickster",
    baseStats: buildBaseStats("trickster", HERO_LECHY_ID),
    abilities: [
      ABILITY_LECHY_STORM,
      ABILITY_LECHY_CONFUSE_THE_TERRAIN,
      ABILITY_LECHY_GUIDE_THE_TRAVELER,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {
    id: HERO_VLAD_TEPES_ID,
    name: "Vlad III Tepes",
    mainClass: "spearman",
    baseStats: buildBaseStats("spearman", HERO_VLAD_TEPES_ID),
    abilities: [
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_VLAD_INTIMIDATE,
      ABILITY_VLAD_STAKES,
      ABILITY_VLAD_FOREST,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  ...(
    [
      "assassin",
      "archer",
      "berserker",
      "rider",
      "spearman",
      "trickster",
      "knight",
    ] as UnitClass[]
  ).map((unitClass) => ({
    id: BASE_HERO_IDS[unitClass],
    name: `Base ${unitClass.charAt(0).toUpperCase()}${unitClass.slice(1)}`,
    mainClass: unitClass,
    baseStats: buildBaseStats(unitClass),
    abilities: [],
    description: "Base unit.",
  })),
];

export const HERO_REGISTRY: Record<string, HeroMeta> = Object.fromEntries(
  HERO_REGISTRY_LIST.map((hero) => [hero.id, hero])
);

export function getHeroMeta(heroId: string): HeroMeta | undefined {
  return HERO_REGISTRY[heroId];
}
