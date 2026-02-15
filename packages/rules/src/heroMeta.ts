import type { UnitClass } from "./model";
import { getUnitDefinition } from "./units";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
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
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_GIANT,
  ABILITY_LECHY_NATURAL_STEALTH,
  ABILITY_CHIKATILO_TOUGH,
  ABILITY_CHIKATILO_FALSE_TRAIL,
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_ARTEMIDA_ACCURATE_ARROW,
  ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
  ABILITY_ARTEMIDA_SILVER_CRESCENT,
  ABILITY_ARTEMIDA_NATURE_MOVEMENT,
  ABILITY_DON_KIHOTE_MADNESS,
  ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE,
  ABILITY_DON_KIHOTE_WINDMILLS,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  ABILITY_JEBE_DURABLE,
  ABILITY_HASSAN_ASSASIN_ORDER,
  ABILITY_HASSAN_ONE_WITH_SAND,
  ABILITY_HASSAN_TRUE_ENEMY,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  ABILITY_DUOLINGO_BERSERKER,
  ABILITY_DUOLINGO_PUSH_NOTIFICATION,
  ABILITY_DUOLINGO_SKIP_CLASSES,
  ABILITY_DUOLINGO_STRICK,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_ONE_WAY,
  ABILITY_FRISK_PACIFIST,
  ABILITY_FRISK_PURE_SOUL,
  ABILITY_GRIFFITH_WRETCHED_MAN,
  ABILITY_GRIFFITH_FEMTO_REBIRTH,
  ABILITY_FEMTO_GOD_HP,
  ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_JACK_RIPPER_DISMEMBERMENT,
  ABILITY_JACK_RIPPER_LEGEND_KILLER,
  ABILITY_JACK_RIPPER_SNARES,
  ABILITY_JACK_RIPPER_SURGERY,
  ABILITY_KALADIN_FIFTH,
  ABILITY_KALADIN_FIRST,
  ABILITY_KALADIN_SECOND,
  ABILITY_KALADIN_THIRD,
  ABILITY_KALADIN_FOURTH,
  ABILITY_KANEKI_RC_CELLS,
  ABILITY_KANEKI_RINKAKU_KAGUNE,
  ABILITY_KANEKI_SCOLOPENDRA,
  ABILITY_LOKI_ILLUSORY_DOUBLE,
  ABILITY_LOKI_LAUGHT,
  ABILITY_LUCHE_BURNING_SUN,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_LUCHE_SHINE,
  ABILITY_LUCHE_SUN_GLORY,
  ABILITY_METTATON_FINAL_ACCORD,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_POPPINS,
  ABILITY_METTATON_RAITING,
  ABILITY_METTATON_SHOWTIME,
  ABILITY_ODIN_GUNGNIR,
  ABILITY_ODIN_HUGINN,
  ABILITY_ODIN_MUNINN,
  ABILITY_ODIN_SLEIPNIR,
  ABILITY_PAPYRUS_BLUE_BONE,
  ABILITY_PAPYRUS_COOL_DUDE,
  ABILITY_PAPYRUS_DISBELIEF,
  ABILITY_PAPYRUS_SPHAGETTI,
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_GUIDE_OF_SOULS,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_SANS_JOKE,
  ABILITY_SANS_KARMA,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  ABILITY_UNDYNE_SPEAR_THROW,
  ABILITY_UNDYNE_SWITCH_DIRECTION,
  ABILITY_UNDYNE_UNDYING,
  ABILITY_ZORO_3_SWORD_STYLE,
  ABILITY_ZORO_ASURA,
  ABILITY_ZORO_DETERMINATION,
  ABILITY_ZORO_ONI_GIRI,
  getAbilitySpec,
} from "./abilities";
import {
  HERO_GRAND_KAISER_ID, 
  HERO_VLAD_TEPES_ID, 
  HERO_GENGHIS_KHAN_ID, 
  HERO_EL_CID_COMPEADOR_ID, 
  HERO_GROZNY_ID, 
  HERO_LECHY_ID, 
  HERO_CHIKATILO_ID, 
  HERO_ARTEMIDA_ID,
  HERO_ASGORE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_FEMTO_ID,
  HERO_FRISK_ID,
  HERO_GRIFFITH_ID,
  HERO_GUTS_ID,
  HERO_JACK_RIPPER_ID,
  HERO_JEBE_ID,
  HERO_HASSAN_ID,
  HERO_KALADIN_ID,
  HERO_KANEKI_ID,
  HERO_LOKI_ID,
  HERO_LUCHE_ID,
  HERO_METTATON_ID,
  HERO_ODIN_ID,
  HERO_PAPYRUS_ID,
  HERO_RIVER_PERSON_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
  HERO_ZORO_ID,

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
    id: HERO_CHIKATILO_ID,
    name: "Andrei Chikatilo",
    mainClass: "assassin",
    baseStats: buildBaseStats("assassin", HERO_CHIKATILO_ID),
    abilities: [
      ABILITY_CHIKATILO_TOUGH,
      ABILITY_CHIKATILO_FALSE_TRAIL,
      ABILITY_CHIKATILO_ASSASSIN_MARK,
      ABILITY_CHIKATILO_DECOY,
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
      ABILITY_LECHY_GIANT,
      ABILITY_LECHY_NATURAL_STEALTH,
      ABILITY_LECHY_GUIDE_TRAVELER,
      ABILITY_LECHY_CONFUSE_TERRAIN,
      ABILITY_LECHY_STORM,
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
  {    id: HERO_ARTEMIDA_ID,
    name: "Artemida",
    mainClass: "archer",
    baseStats: buildBaseStats("archer", HERO_ARTEMIDA_ID),
    abilities: [
      ABILITY_ARTEMIDA_ACCURATE_ARROW,
      ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
      ABILITY_ARTEMIDA_SILVER_CRESCENT,
      ABILITY_ARTEMIDA_NATURE_MOVEMENT,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_ASGORE_ID,
    name: "Asgore Dreemurr",
    mainClass: "knight",
    baseStats: buildBaseStats("knight", HERO_ASGORE_ID),
    abilities: [
      ABILITY_ASGORE_FIREBALL,
      ABILITY_ASGORE_FIRE_PARADE,
      ABILITY_ASGORE_SOUL_PARADE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_DON_KIHOTE_ID,
    name: "Don Kihote",
    mainClass: "rider",
    baseStats: buildBaseStats("rider", HERO_DON_KIHOTE_ID),
    abilities: [
      ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE,
      ABILITY_DON_KIHOTE_WINDMILLS,
      ABILITY_DON_KIHOTE_MADNESS,
      ABILITY_VLAD_POLKOVODETS
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_DUOLINGO_ID,
    name: "Duolingo",
    mainClass: "trickster",
    baseStats: buildBaseStats("trickster", HERO_DUOLINGO_ID),
    abilities: [
      ABILITY_DUOLINGO_BERSERKER,
      ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      ABILITY_DUOLINGO_SKIP_CLASSES,
      ABILITY_DUOLINGO_STRICK,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_FRISK_ID,
    name: "Frisk",
    mainClass: "assassin",
    baseStats: buildBaseStats("assassin", HERO_FRISK_ID),
    abilities: [
      ABILITY_FRISK_GENOCIDE,
      ABILITY_FRISK_ONE_WAY,
      ABILITY_FRISK_PACIFIST,
      ABILITY_FRISK_PURE_SOUL,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_GRIFFITH_ID,
    name: "Griffith",
    mainClass: "knight",
    baseStats: buildBaseStats("knight", HERO_GRIFFITH_ID),
    abilities: [
      ABILITY_GRIFFITH_WRETCHED_MAN,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_GRIFFITH_FEMTO_REBIRTH,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_FEMTO_ID,
    name: "Femto",
    mainClass: "knight",
    baseStats: {
      hp: getUnitDefinition("berserker").maxHp + 5,
      damage: getUnitDefinition("berserker").baseAttack,
      moveType: getMoveType("knight"),
      attackRange: getAttackRange("spearman"),
    },
    abilities: [
      ABILITY_FEMTO_GOD_HP,
      ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
      ABILITY_FEMTO_DIVINE_MOVE,
      ABILITY_BERSERK_AUTO_DEFENSE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_GUTS_ID,
    name: "Guts",
    mainClass: "berserker",
    baseStats: buildBaseStats("berserker", HERO_GUTS_ID),
    abilities: [
      ABILITY_GUTS_ARBALET,
      ABILITY_GUTS_CANNON,
      ABILITY_GUTS_BERSERK_MODE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_JACK_RIPPER_ID,
    name: "Jack the Ripper",
    mainClass: "assassin",
    baseStats: buildBaseStats("assassin", HERO_JACK_RIPPER_ID),
    abilities: [
      ABILITY_JACK_RIPPER_DISMEMBERMENT,
      ABILITY_JACK_RIPPER_LEGEND_KILLER,
      ABILITY_JACK_RIPPER_SNARES,
      ABILITY_JACK_RIPPER_SURGERY,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  { id: HERO_JEBE_ID,
    name: "Jebe",
    mainClass: "archer",
    baseStats: buildBaseStats("archer", HERO_JEBE_ID),
    abilities: [
      ABILITY_JEBE_DURABLE,
      ABILITY_JEBE_KHANS_SHOOTER,
      ABILITY_JEBE_HAIL_OF_ARROWS,
      ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      ABILITY_VLAD_POLKOVODETS,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_HASSAN_ID,
    name: "Hassan-i Sabbah",
    mainClass: "assassin",
    baseStats: buildBaseStats("assassin", HERO_HASSAN_ID),
    abilities: [
      ABILITY_HASSAN_ONE_WITH_SAND,
      ABILITY_HASSAN_TRUE_ENEMY,
      ABILITY_HASSAN_ASSASIN_ORDER,
      ABILITY_VLAD_POLKOVODETS,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_KALADIN_ID,
    name: "Kaladin Stormblessed",
    mainClass: "spearman",
    baseStats: buildBaseStats("spearman", HERO_KALADIN_ID),
    abilities: [
      ABILITY_KALADIN_FIRST,
      ABILITY_KALADIN_SECOND,
      ABILITY_KALADIN_THIRD,
      ABILITY_KALADIN_FOURTH,
      ABILITY_KALADIN_FIFTH,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_LUCHE_ID,
    name: "Luche",
    mainClass: "spearman",
    baseStats: buildBaseStats("spearman", HERO_LUCHE_ID),
    abilities: [
      ABILITY_LUCHE_SHINE,
      ABILITY_LUCHE_BURNING_SUN,
      ABILITY_LUCHE_DIVINE_RAY,
      ABILITY_LUCHE_SUN_GLORY,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_KANEKI_ID,
    name: "Kaneki",
    mainClass: "berserker",
    baseStats: buildBaseStats("berserker", HERO_KANEKI_ID),
    abilities: [
      ABILITY_KANEKI_RC_CELLS,
      ABILITY_KANEKI_RINKAKU_KAGUNE,
      ABILITY_KANEKI_SCOLOPENDRA,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_LOKI_ID,
    name: "Loki",
    mainClass: "trickster",
    baseStats: buildBaseStats("trickster", HERO_LOKI_ID),
    abilities: [
      ABILITY_LOKI_ILLUSORY_DOUBLE,
      ABILITY_LOKI_LAUGHT,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_METTATON_ID,
    name: "Mettaton",
    mainClass: "archer",
    baseStats: buildBaseStats("archer", HERO_METTATON_ID),
    abilities: [
      ABILITY_METTATON_SHOWTIME,
      ABILITY_METTATON_RAITING,
      ABILITY_METTATON_LASER,
      ABILITY_METTATON_POPPINS,
      ABILITY_METTATON_FINAL_ACCORD,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_ODIN_ID,
    name: "Odin",
    mainClass: "rider",
    baseStats: buildBaseStats("rider", HERO_ODIN_ID),
    abilities: [
      ABILITY_ODIN_GUNGNIR,
      ABILITY_ODIN_HUGINN,
      ABILITY_ODIN_MUNINN,
      ABILITY_ODIN_SLEIPNIR,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_PAPYRUS_ID,
    name: "Papyrus",
    mainClass: "spearman",
    baseStats: buildBaseStats("spearman", HERO_PAPYRUS_ID),
    abilities: [
      ABILITY_PAPYRUS_COOL_DUDE,
      ABILITY_PAPYRUS_SPHAGETTI,
      ABILITY_PAPYRUS_DISBELIEF,
      ABILITY_PAPYRUS_BLUE_BONE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_RIVER_PERSON_ID,
    name: "River Person",
    mainClass: "rider",
    baseStats: buildBaseStats("rider", HERO_RIVER_PERSON_ID),
    abilities: [
      ABILITY_RIVER_PERSON_BOAT,
      ABILITY_RIVER_PERSON_BOATMAN,
      ABILITY_RIVER_PERSON_GUIDE_OF_SOULS,
      ABILITY_RIVER_PERSON_TRA_LA_LA,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_SANS_ID,
    name: "Sans",
    mainClass: "trickster",
    baseStats: buildBaseStats("trickster", HERO_SANS_ID),
    abilities: [
      ABILITY_SANS_KARMA,
      ABILITY_SANS_GASTER_BLASTER,
      ABILITY_SANS_JOKE,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_UNDYNE_ID,
    name: "Undyne",
    mainClass: "berserker",
    baseStats: buildBaseStats("berserker", HERO_UNDYNE_ID),
    abilities: [
      ABILITY_UNDYNE_UNDYING,
      ABILITY_UNDYNE_SPEAR_THROW,
      ABILITY_UNDYNE_ENERGY_SPEAR,
      ABILITY_UNDYNE_SWITCH_DIRECTION,
    ]
      .map(buildAbilityMeta)
      .filter((item): item is AbilityMeta => item !== null),
  },
  {    id: HERO_ZORO_ID,
    name: "Zoro",
    mainClass: "knight",
    baseStats: buildBaseStats("knight", HERO_ZORO_ID),
    abilities: [
      ABILITY_ZORO_3_SWORD_STYLE,
      ABILITY_ZORO_ONI_GIRI,
      ABILITY_ZORO_ASURA,
      ABILITY_ZORO_DETERMINATION,
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



