// packages/rules/src/abilities.ts
import {
  AbilityKind,
  AbilitySlot,
  AbilityView,
  GameEvent,
  GameState,
  TurnSlot,
  UnitState,
} from "./model";
import { RNG } from "./rng";
import { 
  HERO_GRAND_KAISER_ID, 
  HERO_VLAD_TEPES_ID, 
  HERO_GENGHIS_KHAN_ID, 
  HERO_EL_CID_COMPEADOR_ID, 
  HERO_GROZNY_ID, 
  HERO_LECHY_ID, 
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_ARTEMIDA_ID,
  HERO_ASGORE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_FRISK_ID,
  HERO_FEMTO_ID,
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
  HERO_ZORO_ID
} from "./heroes";

/**
 * Стоимость способности с точки зрения экономики хода.
 */
export interface AbilityCost {
  /** Какие слоты хода расходуются */
  consumes?: Partial<Record<TurnSlot, boolean>>;
}

export interface AbilitySpec {
  id: string;
  displayName: string;
  kind: AbilityKind;
  description: string;

  /** Максимальное число зарядов на счётчике (если ограничено) */
  maxCharges?: number;

  /**
   * Сколько зарядов нужно потратить за одно использование.
   */
  chargesPerUse?: number;

  /**
   * Легаси-поле, которое уже использовалось — трактуем как синоним chargesPerUse.
   */
  chargeCost?: number;

  /** Счётчик "особый" — не заряжается автоматически на начале хода */
  isSpecialCounter?: boolean;

  /** Стартует ли счётчик сразу на maxCharges */
  startsFull?: boolean;
  startsCharged?: boolean;

  /** Обнулять ли счётчик после использования абилки */
  resetsChargesOnUse?: boolean;

  /** Что тратит абилка: слоты хода */
  actionCost?: AbilityCost;
  chargeUnlimited?: boolean;
  triggerCharges?: number;
}

/**
 * Константа с id берсерковской авто-защиты, на которую ссылается combat.ts.
 */
export const ABILITY_BERSERK_AUTO_DEFENSE = "berserkAutoDefense" as const;
export const ABILITY_TRICKSTER_AOE = "tricksterAoE" as const;
export const ABILITY_TEST_MULTI_SLOT = "testMultiSlot" as const;

export const ABILITY_KAISER_DORA = "kaiserDora" as const;
export const ABILITY_KAISER_CARPET_STRIKE = "kaiserCarpetStrike" as const;
export const ABILITY_KAISER_ENGINEERING_MIRACLE =
  "kaiserEngineeringMiracle" as const;
export const ABILITY_KAISER_BUNKER = "kaiserBunker" as const;

export const ABILITY_VLAD_POLKOVODETS = "vladPolkovodets" as const;
export const ABILITY_VLAD_INTIMIDATE = "vladIntimidate" as const;
export const ABILITY_VLAD_STAKES = "vladStakes" as const;
export const ABILITY_VLAD_FOREST = "vladForest" as const;

export const ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES = "genghisKhanLegendOfTheSteppes" as const;
export const ABILITY_GENGHIS_KHAN_KHANS_DECREE = "genghisKhanKhansDecree" as const;
export const ABILITY_GENGHIS_KHAN_MONGOL_CHARGE = "genghisKhanMongolCharge" as const;

export const ABILITY_GROZNY_INVADE_TIME = "groznyInvadeTime" as const;
export const ABILITY_GROZNY_TYRANT = "groznyTyrant" as const;

export const ABILITY_CHIKATILO_TOUGH = "chikatiloTough" as const;
export const ABILITY_CHIKATILO_FALSE_TRAIL = "chikatiloFalseTrail" as const;
export const ABILITY_CHIKATILO_ASSASSIN_MARK = "chikatiloAssassinMark" as const;
export const ABILITY_CHIKATILO_DECOY = "chikatiloDecoy" as const;
export const ABILITY_FALSE_TRAIL_TRAP = "falseTrailTrap" as const;
export const ABILITY_FALSE_TRAIL_EXPLOSION = "falseTrailExplosion" as const;

export const ABILITY_EL_SID_COMPEADOR_TISONA = "elCidCompeadorTisona" as const;
export const ABILITY_EL_SID_COMPEADOR_KOLADA = "elCidCompeadorKolada" as const;
export const ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST = "elCidCompeadorDemonDuelist" as const;

export const ABILITY_LECHY_GIANT = "lechyGiant" as const;
export const ABILITY_LECHY_NATURAL_STEALTH = "lechyNaturalStealth" as const;
export const ABILITY_LECHY_GUIDE_TRAVELER = "lechyGuideTraveler" as const;
export const ABILITY_LECHY_CONFUSE_TERRAIN = "lechyConfuseTerrain" as const;
export const ABILITY_LECHY_STORM = "lechyStorm" as const;

export const ABILITY_GRIFFITH_WRETCHED_MAN = "griffithWretchedMan" as const;
export const ABILITY_GRIFFITH_FEMTO_REBIRTH = "griffithFemtoRebirth" as const;
export const ABILITY_FEMTO_GOD_HP = "femtoGodHp" as const;
export const ABILITY_FEMTO_MULTI_BERSERK_SPEAR =
  "femtoMultiBerserkSpear" as const;
export const ABILITY_FEMTO_DIVINE_MOVE = "femtoDivineMove" as const;

// Backward-compatible aliases.
export const ABILITY_GRIFFITH_PATHETIC_MAN = ABILITY_GRIFFITH_WRETCHED_MAN;
export const ABILITY_GRIFFITH_FEMTO = ABILITY_GRIFFITH_FEMTO_REBIRTH;

export const ABILITY_GUTS_ARBALET = "gutsArbalet" as const;
export const ABILITY_GUTS_CANNON = "gutsCannon" as const;
export const ABILITY_GUTS_BERSERK_MODE = "gutsBerserkMode" as const;
export const ABILITY_GUTS_EXIT_BERSERK = "gutsExitBerserk" as const;

export const ABILITY_ODIN_GUNGNIR = "odinGungnir" as const;
export const ABILITY_ODIN_HUGINN = "odinHuginn" as const;
export const ABILITY_ODIN_MUNINN = "odinMuninn" as const;
export const ABILITY_ODIN_SLEIPNIR = "odinSleipnir" as const;

export const ABILITY_LOKI_ILLUSORY_DOUBLE = "lokiIllusoryDouble" as const;
export const ABILITY_LOKI_LAUGHT = "lokiLaught" as const;

export const ABILITY_JEBE_KHANS_SHOOTER = "jebeKhansShooter" as const;
export const ABILITY_JEBE_HAIL_OF_ARROWS = "jebeHailOfArrows" as const;
export const ABILITY_JEBE_DURABLE = "jebeDurable" as const;

export const ABILITY_HASSAN_ONE_WITH_SAND = "hassanOneWithSand" as const;
export const ABILITY_HASSAN_TRUE_ENEMY = "hassanTrueEnemy" as const;
export const ABILITY_HASSAN_ASSASIN_ORDER = "hassanAssasinOrder" as const;

export const ABILITY_KALADIN_FIRST = "kaladinFirst" as const;
export const ABILITY_KALADIN_SECOND = "kaladinSecond" as const;
export const ABILITY_KALADIN_THIRD = "kaladinThird" as const;
export const ABILITY_KALADIN_FOURTH = "kaladinFourth" as const;
export const ABILITY_KALADIN_FIFTH = "kaladinFifth" as const;

export const ABILITY_FRISK_PURE_SOUL = "friskPureSoul" as const;
export const ABILITY_FRISK_GENOCIDE = "friskGenocide" as const;
export const ABILITY_FRISK_PACIFIST = "friskPacifist" as const;
export const ABILITY_FRISK_ONE_WAY = "friskOneWay" as const;

export const ABILITY_SANS_GASTER_BLASTER = "sansGasterBlaster" as const;
export const ABILITY_SANS_JOKE = "sansJoke" as const;
export const ABILITY_SANS_KARMA = "sansKarma" as const;

export const ABILITY_ASGORE_FIREBALL = "asgoreFireball" as const;
export const ABILITY_ASGORE_FIRE_PARADE = "asgoreFireParade" as const;
export const ABILITY_ASGORE_SOUL_PARADE = "asgoreSoulParade" as const;

export const ABILITY_UNDYNE_SPEAR_THROW = "undyneSpearThrow" as const;
export const ABILITY_UNDYNE_ENERGY_SPEAR = "undyneEnergySpear" as const;
export const ABILITY_UNDYNE_SWITCH_DIRECTION = "undyneSwitchDirection" as const;
export const ABILITY_UNDYNE_UNDYING = "undyneUndying" as const;

export const ABILITY_PAPYRUS_BLUE_BONE = "papyrusBlueBone" as const;
export const ABILITY_PAPYRUS_SPHAGETTI = "papyrusSpaghetti" as const;
export const ABILITY_PAPYRUS_COOL_DUDE = "papyrusCoolDude" as const;
export const ABILITY_PAPYRUS_DISBELIEF = "papyrusDisbelief" as const;

export const ABILITY_METTATON_RAITING = "mettatonRaiting" as const;
export const ABILITY_METTATON_POPPINS = "mettatonPoppins" as const;
export const ABILITY_METTATON_SHOWTIME = "mettatonShowtime" as const;
export const ABILITY_METTATON_LASER = "mettatonLaser" as const;
export const ABILITY_METTATON_FINAL_ACCORD = "mettatonFinalAccord" as const;

export const ABILITY_RIVER_PERSON_BOAT = "riverBoat" as const;
export const ABILITY_RIVER_PERSON_BOATMAN = "riverBoatman" as const;
export const ABILITY_RIVER_PERSON_GUIDE_OF_SOULS = "riverGuideOfSouls" as const;
export const ABILITY_RIVER_PERSON_TRA_LA_LA = "riverTraLaLa" as const;

export const ABILITY_DUOLINGO_STRICK = "duolingoStrick" as const;
export const ABILITY_DUOLINGO_PUSH_NOTIFICATION = "duolingoPushNotification" as const;
export const ABILITY_DUOLINGO_SKIP_CLASSES = "duolingoSkipClasses" as const;
export const ABILITY_DUOLINGO_BERSERKER = "duolingoBerserker" as const;

export const ABILITY_LUCHE_SUN_GLORY = "lucheSunGlory" as const;
export const ABILITY_LUCHE_SHINE = "lucheShine" as const;
export const ABILITY_LUCHE_DIVINE_RAY = "lucheDivineRay" as const;
export const ABILITY_LUCHE_BURNING_SUN = "lucheBurningSun" as const;

export const ABILITY_KANEKI_RINKAKU_KAGUNE = "kanekiRinkakuKagune" as const;
export const ABILITY_KANEKI_RC_CELLS = "kanekiRcCells" as const;
export const ABILITY_KANEKI_SCOLOPENDRA = "kanekiScolopendra" as const;

export const ABILITY_ZORO_DETERMINATION = "zoroDetermination" as const;
export const ABILITY_ZORO_ONI_GIRI = "zoroOniGiri" as const;
export const ABILITY_ZORO_3_SWORD_STYLE = "zoro3SwordStyle" as const;
export const ABILITY_ZORO_ASURA = "zoroAsura" as const;

export const ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE = "donKihoteSorrowfulCountenance" as const;
export const ABILITY_DON_KIHOTE_WINDMILLS = "donKihoteWindmills" as const;
export const ABILITY_DON_KIHOTE_MADNESS = "donKihoteMadness" as const;

export const ABILITY_JACK_RIPPER_SURGERY = "jackRipperSurgery" as const;
export const ABILITY_JACK_RIPPER_SNARES = "jackRipperSnares" as const;
export const ABILITY_JACK_RIPPER_DISMEMBERMENT = "jackRipperDismemberment" as const;
export const ABILITY_JACK_RIPPER_LEGEND_KILLER = "jackRipperLegendKiller" as const;

export const ABILITY_ARTEMIDA_ACCURATE_ARROW = "artemidaAccurateArrow" as const;
export const ABILITY_ARTEMIDA_MOONLIGHT_SHINE = "artemidaMoonlightShot" as const;
export const ABILITY_ARTEMIDA_SILVER_CRESCENT = "artemidaSilverCrescent" as const;
export const ABILITY_ARTEMIDA_NATURE_MOVEMENT = "artemidaNatureMovement" as const;

export const TRICKSTER_AOE_RADIUS = 2;

/**
 * Каталог способностей.
 * Пока у нас только авто-деф берсерка.
 */
const ABILITY_SPECS: Record<string, AbilitySpec> = {
  [ABILITY_BERSERK_AUTO_DEFENSE]: {
    id: ABILITY_BERSERK_AUTO_DEFENSE,
    displayName: "Berserker Auto Defense",
    kind: "passive",
    description: "Auto-dodge when fully charged. Resets after use.",
    maxCharges: 6,
    chargesPerUse: 6,
    chargeCost: 6,
    resetsChargesOnUse: true,
    startsFull: true,
    startsCharged: true,
    isSpecialCounter: false,
  },
  [ABILITY_LECHY_STORM]: {
    id: ABILITY_LECHY_STORM,
    displayName: "Storm",
    kind: "phantasm",
    description: "Set the arena to Storm. Units outside the forest aura take 1 damage on failed start-turn rolls and lose ranged attacks.",
    maxCharges: 5,
    chargesPerUse: 5,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_LECHY_CONFUSE_TERRAIN]: {
    id: ABILITY_LECHY_CONFUSE_TERRAIN,
    displayName: "Confuse Terrain",
    kind: "impulse",
    description: "Place a forest marker on your cell. Units leaving or crossing the aura must roll 5-6 or stop inside the aura.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ABILITY_LECHY_GUIDE_TRAVELER]: {
    id: ABILITY_LECHY_GUIDE_TRAVELER,
    displayName: "Guide Traveler",
    kind: "active",
    description: "Choose an ally within trickster range, move Leshy, then relocate that ally to any empty cell within range of Leshy's final position.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { move: true },
    },
  },
  [ABILITY_LECHY_GIANT]: {
    id: ABILITY_LECHY_GIANT,
    displayName: "Giant",
    kind: "passive",
    description: "+3 HP.",
  },
  [ABILITY_LECHY_NATURAL_STEALTH]: {
    id: ABILITY_LECHY_NATURAL_STEALTH,
    displayName: "Natural Stealth",
    kind: "passive",
    description: "Stealth succeeds on 5-6.",
  },
  [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: {
    id: ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
    displayName: "Demon Duelist",
    kind: "phantasm",
    description: "You select an enemy hero within your attack range and challenge him to a duel, you can attack as long as your attacks are successful, if the attack fails, you can pay 1 hp and continue the duel.",
    maxCharges: 5,
    chargesPerUse: 5,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_EL_SID_COMPEADOR_KOLADA]: {
    id: ABILITY_EL_SID_COMPEADOR_KOLADA,
    displayName: "Kolada",
    kind: "impulse",
    description: "At the start of your turn, your Barbarian Sword charges into battle, making one attack against everyone within 1 square of you.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ABILITY_EL_SID_COMPEADOR_TISONA]: {
    id: ABILITY_EL_SID_COMPEADOR_TISONA,
    displayName: "Tisona",
    kind: "active",
    description: "You can attack everyone in any straight line except diagonals.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_CHIKATILO_TOUGH]: {
    id: ABILITY_CHIKATILO_TOUGH,
    displayName: "Tough",
    kind: "passive",
    description: "+1 HP.",
  },
  [ABILITY_CHIKATILO_FALSE_TRAIL]: {
    id: ABILITY_CHIKATILO_FALSE_TRAIL,
    displayName: "False Trail",
    kind: "passive",
    description: "At the start of combat, place the False Trail Token in his place. Chikatilo can be placed on any square at the start of combat in stealth status. While stealthed, he is not subject to the three-turn stealth rule. If his invisibility is revealed, the False Trail Token must either explode or be removed. If the False Trail Token dies, Andrei Chikatilo is revealed. He cannot remain stealthed unless there are other figures on the board.",
  },
  [ABILITY_CHIKATILO_ASSASSIN_MARK]: {
    id: ABILITY_CHIKATILO_ASSASSIN_MARK,
    displayName: "Assassin's Mark",
    kind: "active",
    description: "Without revealing his invisibility, Andrei Chikatilo can mark a creature within two squares. Marked targets are revealed to him at the start of his turn. If he hits a marked creature, he gains +1 damage to that attack.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_CHIKATILO_DECOY]: {
    id: ABILITY_CHIKATILO_DECOY,
    displayName: "Decoy",
    kind: "active",
    description: "Spend 3 charges to enter stealth without rolling, or before defending to take 1 damage instead.",
    maxCharges: 6,
    chargesPerUse: 3,
    actionCost: {
      consumes: { stealth: true },
    },
  },
  [ABILITY_FALSE_TRAIL_TRAP]: {
    id: ABILITY_FALSE_TRAIL_TRAP,
    displayName: "False Trail Trap",
    kind: "passive",
    description: "When the False Trail Token dies or Chikatilo is revealed, it may strike the revealer for 3 damage on a failed defense.",
  },
  [ABILITY_FALSE_TRAIL_EXPLOSION]: {
    id: ABILITY_FALSE_TRAIL_EXPLOSION,
    displayName: "Explosion",
    kind: "active",
    description: "The False Trail Token detonates, attacking all units within 1 square. Each unit that fails takes 1 damage.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_GROZNY_INVADE_TIME]: {
    id: ABILITY_GROZNY_INVADE_TIME,
    displayName: "Invade Time",
    kind: "active",
    description: "Move to any free cell of the field.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { move: true },
    },
  },
  [ABILITY_GROZNY_TYRANT]: {
    id: ABILITY_GROZNY_TYRANT,
    displayName: "Tyrant",
    kind: "impulse",
    description: "If Ivan the Terrible has a weak ally within two squares of him that he can finish off with his BASE DAMAGE, he moves to them (as if he rolled a 6, but without spending any movement) and attempts to finish them off. If he succeeds in finishing them off, he gains +1 damage and regains HP equal to the damage dealt. Starting with the second ally, he gains the movement of all his finished off allies.",
  },
  [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: {
    id: ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    displayName: "Mongol Charge",
    kind: "phantasm",
    maxCharges: 4,
    chargesPerUse: 4,
    description: "Move in a straight line (orthogonal or diagonal). Allies in the swept corridor may each make one attack. Commander applies to those attacks.",
    actionCost: {
      consumes: { action: true},
    },
  },
  [ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES]: {
    id: ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
    displayName: "Legend of the Steppes",
    kind: "passive",
    description: "+1 damage against targets this unit attacked on the previous turn.",
  },
  [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: {
    id: ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    displayName: "Khan's Decree",
    kind: "active",
    description: "This turn you can move diagonally. Move this unit.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost:{
      consumes: { move: true },
    },
  },
  [ABILITY_GRIFFITH_WRETCHED_MAN]: {
    id: ABILITY_GRIFFITH_WRETCHED_MAN,
    displayName: "Wretched Man",
    kind: "passive",
    description: "Griffith deals -1 damage with all attacks (minimum 0).",
  },
  [ABILITY_GRIFFITH_FEMTO_REBIRTH]: {
    id: ABILITY_GRIFFITH_FEMTO_REBIRTH,
    displayName: "Femto Rebirth",
    kind: "phantasm",
    description:
      "When Griffith dies, he immediately resurrects as Femto in the same cell.",
  },
  [ABILITY_FEMTO_GOD_HP]: {
    id: ABILITY_FEMTO_GOD_HP,
    displayName: "God",
    kind: "passive",
    description: "Femto gains +5 HP over Berserker base HP.",
  },
  [ABILITY_FEMTO_MULTI_BERSERK_SPEAR]: {
    id: ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
    displayName: "Multiclass Berserker + Spearman",
    kind: "passive",
    description:
      "Uses Berserker base stats and auto-defense, Spearman reach and defense trait, and Warrior double auto-hit.",
  },
  [ABILITY_FEMTO_DIVINE_MOVE]: {
    id: ABILITY_FEMTO_DIVINE_MOVE,
    displayName: "Divine Movement",
    kind: "active",
    description:
      "Roll 1d6. On 1-3 teleport within 2 cells, on 4-6 teleport to any empty board cell.",
    actionCost: {
      consumes: { move: true },
    },
  },
  [ABILITY_GUTS_ARBALET]: {
    id: ABILITY_GUTS_ARBALET,
    displayName: "Hand Crossbow",
    kind: "active",
    description:
      "Archer-like ranged attack that always deals exactly 1 damage.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_GUTS_CANNON]: {
    id: ABILITY_GUTS_CANNON,
    displayName: "Hand Cannon",
    kind: "active",
    description: "Archer-like ranged attack using normal damage.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_GUTS_BERSERK_MODE]: {
    id: ABILITY_GUTS_BERSERK_MODE,
    displayName: "Berserk Mode",
    kind: "phantasm",
    description:
      "Spend 3 charges to enter Berserk Mode. While active: end-turn self-damage, melee-focused bonuses, and altered combat behavior.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_GUTS_EXIT_BERSERK]: {
    id: ABILITY_GUTS_EXIT_BERSERK,
    displayName: "Exit Berserk",
    kind: "active",
    description:
      "Exit Berserk Mode. Can only be used once per game and consumes action.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_JEBE_DURABLE]: {
    id: ABILITY_JEBE_DURABLE,
    displayName: "Durable",
    kind: "passive",
    description: "+1 HP.",
  },
  [ABILITY_JEBE_HAIL_OF_ARROWS]: {
    id: ABILITY_JEBE_HAIL_OF_ARROWS,
    displayName: "Hail of Arrows",
    kind: "active",
    description:
      "Select a 3x3 area with center on your archer attack line. Attack all units in that area.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_JEBE_KHANS_SHOOTER]: {
    id: ABILITY_JEBE_KHANS_SHOOTER,
    displayName: "Khan's Shooter",
    kind: "phantasm",
    description:
      "Spend all 6 charges. Roll 1d6 ricochets, then chain normal attacks to selected legal targets.",
    maxCharges: 6,
    chargesPerUse: 6,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_HASSAN_ONE_WITH_SAND]: {
    id: ABILITY_HASSAN_ONE_WITH_SAND,
    displayName: "One With Sand",
    kind: "passive",
    description: "Stealth succeeds on 4-6.",
  },
  [ABILITY_HASSAN_TRUE_ENEMY]: {
    id: ABILITY_HASSAN_TRUE_ENEMY,
    displayName: "True Enemy",
    kind: "active",
    description:
      "Choose an enemy within 2 cells. That enemy makes one normal attack against a legal target.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_HASSAN_ASSASIN_ORDER]: {
    id: ABILITY_HASSAN_ASSASIN_ORDER,
    displayName: "Assassin Order",
    kind: "phantasm",
    description:
      "At battle start, choose 2 allied heroes (excluding Hassan). They gain stealth threshold 5-6 for this game.",
  },
  [ABILITY_KALADIN_FIRST]: {
    id: ABILITY_KALADIN_FIRST,
    displayName: "First Oath - The First Ideal",
    kind: "active",
    description:
      "Heal self for 2 HP (up to max HP).",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_KALADIN_SECOND]: {
    id: ABILITY_KALADIN_SECOND,
    displayName: "Second Oath - Oath of Protection",
    kind: "passive",
    description:
      "Gain Trickster multiclass: Trickster movement and Trickster AoE attack trait in addition to Spearman kit.",
  },
  [ABILITY_KALADIN_THIRD]: {
    id: ABILITY_KALADIN_THIRD,
    displayName: "Third Oath - Oath of Acceptance",
    kind: "passive",
    description:
      "+1 damage on Spearman-mode melee attacks.",
  },
  [ABILITY_KALADIN_FOURTH]: {
    id: ABILITY_KALADIN_FOURTH,
    displayName: "Fourth Oath - Oath of Restriction",
    kind: "passive",
    description: "Gain Berserker trait bundle.",
  },
  [ABILITY_KALADIN_FIFTH]: {
    id: ABILITY_KALADIN_FIFTH,
    displayName: "Fifth Oath - Oath of Liberation",
    kind: "phantasm",
    description:
      "Choose a 5x5 area. Shared-roll AoE hits all units for 2 damage on failed defense and immobilizes them until Kaladin's next turn.",
    maxCharges: 6,
    chargesPerUse: 6,
    actionCost: {
      consumes: { action: true },
    },
  },

  [ABILITY_TRICKSTER_AOE]: {
    id: ABILITY_TRICKSTER_AOE,
    displayName: "Trickster AoE",
    kind: "active",
    description: "5x5 AoE (radius 2). Hits allies (not self).",
    actionCost: {
      consumes: { attack: true, action: true },
    },
  },
  [ABILITY_TEST_MULTI_SLOT]: {
    id: ABILITY_TEST_MULTI_SLOT,
    displayName: "Test Multi Slot",
    kind: "active",
    description: "Consumes move and attack slots.",
    actionCost: {
      consumes: { move: true, attack: true },
    },
  },
  [ABILITY_KAISER_BUNKER]: {
    id: ABILITY_KAISER_BUNKER,
    displayName: "Bunker",
    kind: "passive",
    description: "Instead of stealth, you have the ability to enter a bunker (4-6), your location is visible, but any hit on you will only deal 1 damage.",
  },
  [ABILITY_KAISER_DORA]: {
    id: ABILITY_KAISER_DORA,
    displayName: "Dora",
    kind: "active",
    description: "Without leaving the bunker, you can attack, select a 3x3 area, the center of this area should be on the line of your possible attack, attack everyone in this area.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_KAISER_CARPET_STRIKE]: {
    id: ABILITY_KAISER_CARPET_STRIKE,
    displayName: "Carpet Strike",
    kind: "impulse",
    description: "It's time to kill all enemies of the Reich. Roll 2d9 - the result is the center of a 5x5 area. Attack everyone in that area. Carpet Bombing doesn't hit Kaiser if he's in the Bunker. The ability always deals 1 damage.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ABILITY_KAISER_ENGINEERING_MIRACLE]: {
    id: ABILITY_KAISER_ENGINEERING_MIRACLE,
    displayName: "Engineering Miracle",
    kind: "impulse",
    description: "You're showing by example what Nazi cyborgs are like. You gain the multi-class of rider and berserker, and the Dora bitch doesn't require more charges. However, you lose the ability to enter stealth and bunkers, and carpet bombings won't affect you in this state.",
    chargeUnlimited: true,
    triggerCharges: 5,
  },
  [ABILITY_VLAD_POLKOVODETS]: {
    id: ABILITY_VLAD_POLKOVODETS,
    displayName: "Commander",
    kind: "passive",
    description: "Allies within one cell of this figure receive +1 damage (does not work on the figure itself, does not stack, for riders, to receive the damage buff you must either start moving or end in the commander's aura).",
  },
  [ABILITY_VLAD_INTIMIDATE]: {
    id: ABILITY_VLAD_INTIMIDATE,
    displayName: "Intimidating Stare",
    kind: "passive",
    description: "If you defend successfully, you can force the attacker to move one unoccupied square.",
  },
  [ABILITY_VLAD_STAKES]: {
    id: ABILITY_VLAD_STAKES,
    displayName: "Field of Stakes",
    kind: "impulse",
    description: "Place 3 hidden stakes at battle start and from 2nd turn.",
  },
  [ABILITY_VLAD_FOREST]: {
    id: ABILITY_VLAD_FOREST,
    displayName: "Forest of the Dead",
    kind: "phantasm",
    description: "Consume 9 stakes to unleash 3x3 AoE (2 dmg, root).",
  },
};

export function getAbilitySpec(id: string): AbilitySpec | undefined {
  return ABILITY_SPECS[id];
}

export function getCharges(unit: UnitState, abilityId: string): number {
  return unit.charges[abilityId] ?? 0;
}

export function setCharges(
  unit: UnitState,
  abilityId: string,
  value: number
): UnitState {
  return {
    ...unit,
    charges: {
      ...unit.charges,
      [abilityId]: value,
    },
  };
}

export function addCharges(
  unit: UnitState,
  abilityId: string,
  delta: number
): UnitState {
  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);
  let next = current + delta;

  if (spec?.maxCharges !== undefined) {
    next = Math.min(next, spec.maxCharges);
  }
  if (next < 0) next = 0;

  return setCharges(unit, abilityId, next);
}

/**
 * Проверка — хватает ли зарядов на использование способности.
 * Старый API, которым пользуется combat.ts: canUseAbility(unit, abilityId)
 */
export function canUseAbility(unit: UnitState, abilityId: string): boolean {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return false;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const current = getCharges(unit, abilityId);

  return current >= need;
}

/**
 * Старый API combat.ts: consumeAbilityCharges(unit, abilityId)
 * — тратит нужное количество зарядов (или сбрасывает в 0, если так настроено).
 */
export function consumeAbilityCharges(
  unit: UnitState,
  abilityId: string
): UnitState {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return unit;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: updated } = spendCharges(unit, abilityId, need);
  return updated;
}

/**
 * Новый более общий хелпер — можно вызывать напрямую из других мест.
 */
export function spendCharges(
  unit: UnitState,
  abilityId: string,
  amount: number
): { unit: UnitState; ok: boolean } {
  if (amount <= 0) {
    return { unit, ok: true };
  }

  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);

  if (current < amount) {
    return { unit, ok: false };
  }

  const resets = spec?.resetsChargesOnUse ?? false;
  const newValue = resets ? 0 : current - amount;

  const updated = setCharges(unit, abilityId, newValue);
  return { unit: updated, ok: true };
}

/**
 * Инициализация способностей юнита (при создании армии).
 * Пока только берсерк получает авто-деф на 6 зарядах.
 */
export function initUnitAbilities(unit: UnitState): UnitState {
  let updated = { ...unit };

  if (unit.class === "berserker") {
    const spec = getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE)!;
    const startCharges =
      spec.startsFull || spec.startsCharged
        ? spec.maxCharges ?? 0
        : 0;

    updated = setCharges(updated, spec.id, startCharges);
  }

  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    updated = setCharges(updated, ABILITY_KAISER_DORA, 0);
    updated = setCharges(updated, ABILITY_KAISER_CARPET_STRIKE, 0);
    updated = setCharges(updated, ABILITY_KAISER_ENGINEERING_MIRACLE, 0);
  }

  if (unit.heroId === HERO_EL_CID_COMPEADOR_ID) {
    updated = setCharges(updated, ABILITY_EL_SID_COMPEADOR_TISONA, 0);
    updated = setCharges(updated, ABILITY_EL_SID_COMPEADOR_KOLADA, 0);
    updated = setCharges(updated, ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST, 0);
  }
  if (unit.heroId === HERO_GENGHIS_KHAN_ID) {
    updated = setCharges(updated, ABILITY_GENGHIS_KHAN_KHANS_DECREE, 0);
    updated = setCharges(updated, ABILITY_GENGHIS_KHAN_MONGOL_CHARGE, 0);
  }
  if (unit.heroId === HERO_CHIKATILO_ID) {
    updated = setCharges(updated, ABILITY_CHIKATILO_DECOY, 0);
  }
  if (unit.heroId === HERO_GROZNY_ID) {
    updated = setCharges(updated, ABILITY_GROZNY_INVADE_TIME, 0);
  }
  if (unit.heroId === HERO_LECHY_ID) {
    updated = setCharges(updated, ABILITY_LECHY_GUIDE_TRAVELER, 0);
    updated = setCharges(updated, ABILITY_LECHY_CONFUSE_TERRAIN, 0);
    updated = setCharges(updated, ABILITY_LECHY_STORM, 0);
  }
  if (unit.heroId === HERO_GUTS_ID) {
    updated = setCharges(updated, ABILITY_GUTS_CANNON, 0);
    updated = setCharges(updated, ABILITY_GUTS_BERSERK_MODE, 0);
    updated = {
      ...updated,
      gutsBerserkModeActive: false,
      gutsBerserkExitUsed: false,
    };
  }
  if (unit.heroId === HERO_JEBE_ID) {
    updated = setCharges(updated, ABILITY_JEBE_HAIL_OF_ARROWS, 0);
    updated = setCharges(updated, ABILITY_JEBE_KHANS_SHOOTER, 0);
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    updated = setCharges(updated, ABILITY_HASSAN_TRUE_ENEMY, 0);
    updated = {
      ...updated,
      stealthSuccessMinRoll: 4,
    };
  }
  if (unit.heroId === HERO_KALADIN_ID) {
    updated = setCharges(updated, ABILITY_KALADIN_FIRST, 0);
    updated = setCharges(updated, ABILITY_KALADIN_FIFTH, 0);
  }

  return updated;
}

/**
 * Начало хода КОНКРЕТНОЙ фигуры:
 * +1 заряд ко всем не-special счётчикам.
 */
export function processUnitStartOfTurn(
  state: GameState,
  unitId: string,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  let updated = unit;
  const deltas: Record<string, number> = {};
  const now: Record<string, number> = {};

  for (const abilityId of Object.keys(updated.charges)) {
    const spec = getAbilitySpec(abilityId);
    if (!spec || spec.isSpecialCounter) continue;
    const isChargeable =
      spec.chargeUnlimited === true ||
      spec.maxCharges !== undefined ||
      spec.chargesPerUse !== undefined ||
      spec.chargeCost !== undefined;
    if (!isChargeable) continue;
    const before = getCharges(updated, abilityId);
    updated = addCharges(updated, abilityId, 1);
    const after = getCharges(updated, abilityId);
    if (after !== before) {
      deltas[abilityId] = after - before;
    }
    if (after !== before || abilityId in now) {
      now[abilityId] = after;
    }
  }

  updated = {
    ...updated,
    lastChargedTurn: state.turnNumber,
  };

  if (
    updated.heroId === HERO_GENGHIS_KHAN_ID ||
    updated.heroId === HERO_JEBE_ID
  ) {
    const attackedThisTurn = Array.isArray(updated.genghisKhanAttackedThisTurn)
      ? updated.genghisKhanAttackedThisTurn
      : [];
    updated = {
      ...updated,
      genghisKhanAttackedLastTurn: Array.from(new Set(attackedThisTurn)),
      genghisKhanAttackedThisTurn: [],
    };
  }

  const events: GameEvent[] = [];
  if (Object.keys(deltas).length > 0) {
    events.push({
      type: "chargesUpdated",
      unitId: updated.id,
      deltas,
      now: Object.keys(now).length > 0 ? now : { ...updated.charges },
    });
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events,
  };
}

function getSlotFromCost(spec: AbilitySpec): AbilitySlot {
  const costs = spec.actionCost?.consumes;
  if (costs?.action) return "action";
  if (costs?.move) return "move";
  if (costs?.attack) return "attack";
  if (costs?.stealth) return "stealth";
  return "none";
}

function getChargeRequired(spec: AbilitySpec): number | undefined {
  return spec.chargesPerUse ?? spec.chargeCost ?? spec.maxCharges;
}

function getActiveDisabledReason(
  state: GameState,
  unit: UnitState,
  spec: AbilitySpec
): string | undefined {
  if (state.pendingRoll) return "Pending roll must be resolved";
  if (state.phase !== "battle") return "Not in battle";
  if (unit.owner !== state.currentPlayer) return "Not your turn";
  if (state.activeUnitId !== unit.id) return "Not active unit";

  const costs = spec.actionCost?.consumes;
  if (costs?.action && unit.turn?.actionUsed) {
    return "Action slot already used";
  }
  if (costs?.move && unit.turn?.moveUsed) {
    return "Move slot already used";
  }
  if (costs?.move && (unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return "Movement is blocked";
  }
  if (costs?.attack && unit.turn?.attackUsed) {
    return "Attack slot already used";
  }
  if (costs?.stealth && unit.turn?.stealthUsed) {
    return "Stealth slot already used";
  }

  const required = getChargeRequired(spec);
  if (
    required !== undefined &&
    spec.id !== ABILITY_KAISER_ENGINEERING_MIRACLE &&
    !(spec.id === ABILITY_KAISER_DORA && unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) &&
    getCharges(unit, spec.id) < required
  ) {
    return "Not Enough charges";
  }

  return undefined;
}

export function getAbilityViewsForUnit(
  state: GameState,
  unitId: string
): AbilityView[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return [];

  const abilityIds: string[] = [];

  if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    abilityIds.push(ABILITY_FALSE_TRAIL_EXPLOSION, ABILITY_FALSE_TRAIL_TRAP);
  }

  if (
    unit.class === "berserker" ||
    (unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) ||
    unit.heroId === HERO_FEMTO_ID
  ) {
    abilityIds.push(ABILITY_BERSERK_AUTO_DEFENSE);
  }
  if (unit.class === "trickster" || unit.heroId === HERO_KALADIN_ID) {
    abilityIds.push(ABILITY_TRICKSTER_AOE);
  }
  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    abilityIds.push(
      ABILITY_KAISER_BUNKER,
      ABILITY_KAISER_DORA,
      ABILITY_KAISER_CARPET_STRIKE,
      ABILITY_KAISER_ENGINEERING_MIRACLE
    );
  }
  if (unit.heroId === HERO_VLAD_TEPES_ID) {
    abilityIds.push(
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_VLAD_INTIMIDATE,
      ABILITY_VLAD_STAKES,
      ABILITY_VLAD_FOREST
    );
  }
  if (unit.heroId === HERO_GENGHIS_KHAN_ID) {
    abilityIds.push(
      ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_GENGHIS_KHAN_KHANS_DECREE,
      ABILITY_GENGHIS_KHAN_MONGOL_CHARGE
    );
  }
  if (unit.heroId === HERO_EL_CID_COMPEADOR_ID) {
    abilityIds.push(
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_EL_SID_COMPEADOR_TISONA,
      ABILITY_EL_SID_COMPEADOR_KOLADA,
      ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
    );
  }
  if (unit.heroId === HERO_CHIKATILO_ID) {
    abilityIds.push(
      ABILITY_CHIKATILO_TOUGH,
      ABILITY_CHIKATILO_FALSE_TRAIL,
      ABILITY_CHIKATILO_ASSASSIN_MARK,
      ABILITY_CHIKATILO_DECOY
    );
  }
  if (unit.heroId === HERO_GROZNY_ID) {
    abilityIds.push(
      ABILITY_GROZNY_INVADE_TIME,
      ABILITY_GROZNY_TYRANT,
      ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_LECHY_ID) {
    abilityIds.push(
      ABILITY_LECHY_GIANT,
      ABILITY_LECHY_NATURAL_STEALTH,
      ABILITY_LECHY_GUIDE_TRAVELER,
      ABILITY_LECHY_CONFUSE_TERRAIN,
      ABILITY_LECHY_STORM
    );
  }
  if (unit.heroId === HERO_GRIFFITH_ID) {
    abilityIds.push(
      ABILITY_GRIFFITH_WRETCHED_MAN,
      ABILITY_VLAD_POLKOVODETS,
      ABILITY_GRIFFITH_FEMTO_REBIRTH
    );
  }
  if (unit.heroId === HERO_FEMTO_ID) {
    abilityIds.push(
      ABILITY_FEMTO_GOD_HP,
      ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
      ABILITY_FEMTO_DIVINE_MOVE
    );
  }
  if (unit.heroId === HERO_GUTS_ID) {
    if (!unit.gutsBerserkModeActive && !unit.gutsBerserkExitUsed) {
      abilityIds.push(ABILITY_GUTS_BERSERK_MODE);
    }
    abilityIds.push(ABILITY_GUTS_CANNON, ABILITY_GUTS_ARBALET);
    if (unit.gutsBerserkModeActive && !unit.gutsBerserkExitUsed) {
      abilityIds.push(ABILITY_GUTS_EXIT_BERSERK);
    }
  }
  if (unit.heroId === HERO_ODIN_ID) {
    abilityIds.push(
      ABILITY_ODIN_SLEIPNIR,
      ABILITY_ODIN_MUNINN,
      ABILITY_ODIN_HUGINN,
      ABILITY_ODIN_GUNGNIR
    );
  }
  if (unit.heroId === HERO_LOKI_ID) {
    abilityIds.push(
      ABILITY_LOKI_LAUGHT,
      ABILITY_LOKI_ILLUSORY_DOUBLE,
    );
  }
  if (unit.heroId === HERO_JEBE_ID) {
    abilityIds.push(
      ABILITY_JEBE_DURABLE,
      ABILITY_JEBE_KHANS_SHOOTER,
      ABILITY_JEBE_HAIL_OF_ARROWS,
      ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    abilityIds.push(
      ABILITY_HASSAN_ONE_WITH_SAND,
      ABILITY_HASSAN_TRUE_ENEMY,
      ABILITY_HASSAN_ASSASIN_ORDER,
      ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_KALADIN_ID) {
    abilityIds.push(
      ABILITY_KALADIN_FIRST,
      ABILITY_KALADIN_SECOND,
      ABILITY_KALADIN_THIRD,
      ABILITY_KALADIN_FOURTH,
      ABILITY_KALADIN_FIFTH
    );
  }
  if (unit.heroId === HERO_FRISK_ID) {
    abilityIds.push(
      ABILITY_FRISK_PURE_SOUL,
      ABILITY_FRISK_GENOCIDE,
      ABILITY_FRISK_PACIFIST,
      ABILITY_FRISK_ONE_WAY
    );
  } 
  if (unit.heroId === HERO_SANS_ID) {
    abilityIds.push(
      ABILITY_SANS_GASTER_BLASTER,
      ABILITY_SANS_JOKE,
      ABILITY_SANS_KARMA
    );
  } 
  if (unit.heroId === HERO_ASGORE_ID) {
    abilityIds.push(
      ABILITY_ASGORE_FIREBALL,
      ABILITY_ASGORE_FIRE_PARADE,
      ABILITY_ASGORE_SOUL_PARADE
    );
  } 
  if (unit.heroId === HERO_UNDYNE_ID) {
    abilityIds.push(
      ABILITY_UNDYNE_SPEAR_THROW,
      ABILITY_UNDYNE_ENERGY_SPEAR,
      ABILITY_UNDYNE_SWITCH_DIRECTION,
      ABILITY_UNDYNE_UNDYING
    );
  } 
  if (unit.heroId === HERO_PAPYRUS_ID) {
    abilityIds.push(
      ABILITY_PAPYRUS_BLUE_BONE,
      ABILITY_PAPYRUS_SPHAGETTI,
      ABILITY_PAPYRUS_COOL_DUDE,
      ABILITY_PAPYRUS_DISBELIEF
    );
  } 
  if (unit.heroId === HERO_METTATON_ID) {
    abilityIds.push(
      ABILITY_METTATON_RAITING,
      ABILITY_METTATON_POPPINS,
      ABILITY_METTATON_SHOWTIME,
      ABILITY_METTATON_LASER,
      ABILITY_METTATON_FINAL_ACCORD
    );
  }
  if (unit.heroId === HERO_RIVER_PERSON_ID) {
    abilityIds.push(
      ABILITY_RIVER_PERSON_BOAT,
      ABILITY_RIVER_PERSON_BOATMAN,
      ABILITY_RIVER_PERSON_GUIDE_OF_SOULS,
      ABILITY_RIVER_PERSON_TRA_LA_LA
    );
  } 
  if (unit.heroId === HERO_DUOLINGO_ID) {
    abilityIds.push(
      ABILITY_DUOLINGO_STRICK,
      ABILITY_DUOLINGO_PUSH_NOTIFICATION,
      ABILITY_DUOLINGO_SKIP_CLASSES,
      ABILITY_DUOLINGO_BERSERKER
    );
  } 
  if (unit.heroId === HERO_LUCHE_ID) {
    abilityIds.push(
      ABILITY_LUCHE_SUN_GLORY,
      ABILITY_LUCHE_SHINE,
      ABILITY_LUCHE_DIVINE_RAY,
      ABILITY_LUCHE_BURNING_SUN
    );
  } 
  if (unit.heroId === HERO_KANEKI_ID) {
    abilityIds.push(
      ABILITY_KANEKI_RINKAKU_KAGUNE,
      ABILITY_KANEKI_RC_CELLS,
      ABILITY_KANEKI_SCOLOPENDRA
    );
  } 
  if (unit.heroId === HERO_ZORO_ID) {
    abilityIds.push(
      ABILITY_ZORO_DETERMINATION,
      ABILITY_ZORO_ONI_GIRI,
      ABILITY_ZORO_3_SWORD_STYLE,
      ABILITY_ZORO_ASURA
    );
  } 
  if (unit.heroId === HERO_DON_KIHOTE_ID) {
    abilityIds.push(
      ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE,
      ABILITY_DON_KIHOTE_WINDMILLS,
      ABILITY_DON_KIHOTE_MADNESS,
      ABILITY_VLAD_POLKOVODETS
    );
  } 
  if (unit.heroId === HERO_JACK_RIPPER_ID) {
    abilityIds.push(
      ABILITY_JACK_RIPPER_SURGERY,
      ABILITY_JACK_RIPPER_SNARES,
      ABILITY_JACK_RIPPER_DISMEMBERMENT,
      ABILITY_JACK_RIPPER_LEGEND_KILLER
    );
  } 
  if (unit.heroId === HERO_ARTEMIDA_ID) {
    abilityIds.push(
      ABILITY_ARTEMIDA_ACCURATE_ARROW,
      ABILITY_ARTEMIDA_MOONLIGHT_SHINE,
      ABILITY_ARTEMIDA_SILVER_CRESCENT,
      ABILITY_ARTEMIDA_NATURE_MOVEMENT
    );
  }
  
  return abilityIds
    .map((id) => {
      const spec = getAbilitySpec(id);
      if (!spec) return null;
      const chargeRequired = getChargeRequired(spec);
      const hasCharges =
        spec.chargeUnlimited === true ||
        spec.maxCharges !== undefined ||
        chargeRequired !== undefined;
      const currentCharges = hasCharges ? getCharges(unit, id) : undefined;

      let isAvailable = true;
      let disabledReason: string | undefined = undefined;

      if (spec.kind === "active") {
        disabledReason = getActiveDisabledReason(state, unit, spec);
        isAvailable = !disabledReason;
      } else if (
        spec.kind === "impulse" ||
        spec.id === ABILITY_GENGHIS_KHAN_MONGOL_CHARGE
      ) {
        if (spec.id === ABILITY_KAISER_ENGINEERING_MIRACLE && unit.transformed) {
          isAvailable = false;
          disabledReason = "Already transformed";
        } else if (
          chargeRequired !== undefined &&
          getCharges(unit, id) < chargeRequired
        ) {
          isAvailable = false;
          disabledReason = "Not Enough charges";
        }
      }

      return {
        id,
        name: spec.displayName,
        kind: spec.kind,
        description: spec.description,
        slot: getSlotFromCost(spec),
        chargeRequired,
        maxCharges: spec.maxCharges,
        chargeUnlimited: spec.chargeUnlimited,
        currentCharges,
        isAvailable,
        disabledReason,
      } as AbilityView;
    })
    .filter((item): item is AbilityView => item !== null);
}





