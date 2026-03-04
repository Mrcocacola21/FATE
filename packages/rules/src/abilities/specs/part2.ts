import type { AbilitySpec } from "../types";
import * as ids from "../constants";

export const ABILITY_SPECS_PART_2: Record<string, AbilitySpec> = {
  [ids.ABILITY_GUTS_ARBALET]: {
    id: ids.ABILITY_GUTS_ARBALET,
    displayName: "Hand Crossbow",
    kind: "active",
    description:
      "Archer-like ranged attack that always deals exactly 1 damage.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_GUTS_CANNON]: {
    id: ids.ABILITY_GUTS_CANNON,
    displayName: "Hand Cannon",
    kind: "active",
    description: "Archer-like ranged attack using normal damage.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_GUTS_BERSERK_MODE]: {
    id: ids.ABILITY_GUTS_BERSERK_MODE,
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
  [ids.ABILITY_GUTS_EXIT_BERSERK]: {
    id: ids.ABILITY_GUTS_EXIT_BERSERK,
    displayName: "Exit Berserk",
    kind: "active",
    description:
      "Exit Berserk Mode. Can only be used once per game and consumes action.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_ODIN_GUNGNIR]: {
    id: ids.ABILITY_ODIN_GUNGNIR,
    displayName: "Gungnir",
    kind: "passive",
    description:
      "Attack doubles become automatic hits across standard attack-roll combat flows.",
  },
  [ids.ABILITY_ODIN_HUGINN]: {
    id: ids.ABILITY_ODIN_HUGINN,
    displayName: "Raven Huginn",
    kind: "passive",
    description:
      "Can detect and target stealthed enemies within 1 cell (Chebyshev distance).",
  },
  [ids.ABILITY_ODIN_MUNINN]: {
    id: ids.ABILITY_ODIN_MUNINN,
    displayName: "Raven Muninn",
    kind: "passive",
    description:
      "At full 6 charges, after seeing a defense roll, can spend all charges to convert defense into auto-success.",
    maxCharges: 6,
    chargesPerUse: 6,
  },
  [ids.ABILITY_ODIN_SLEIPNIR]: {
    id: ids.ABILITY_ODIN_SLEIPNIR,
    displayName: "Sleipnir",
    kind: "phantasm",
    description:
      "Spend 3 charges to teleport to any empty board cell. Impulse: does not consume move/action slots.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ids.ABILITY_LOKI_ILLUSORY_DOUBLE]: {
    id: ids.ABILITY_LOKI_ILLUSORY_DOUBLE,
    displayName: "Illusory Double",
    kind: "passive",
    description:
      "Whenever any game roll is a double, Loki gains +1 Laughter (max 15).",
  },
  [ids.ABILITY_LOKI_LAUGHT]: {
    id: ids.ABILITY_LOKI_LAUGHT,
    displayName: "Loki's Laughter",
    kind: "phantasm",
    description:
      "Spend Laughter on one of Loki's tricks. Using this ability does not reveal Loki.",
    maxCharges: 15,
    chargesPerUse: 0,
    isSpecialCounter: true,
  },
  [ids.ABILITY_JEBE_DURABLE]: {
    id: ids.ABILITY_JEBE_DURABLE,
    displayName: "Durable",
    kind: "passive",
    description: "+1 HP.",
  },
  [ids.ABILITY_JEBE_HAIL_OF_ARROWS]: {
    id: ids.ABILITY_JEBE_HAIL_OF_ARROWS,
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
  [ids.ABILITY_JEBE_KHANS_SHOOTER]: {
    id: ids.ABILITY_JEBE_KHANS_SHOOTER,
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
  [ids.ABILITY_HASSAN_ONE_WITH_SAND]: {
    id: ids.ABILITY_HASSAN_ONE_WITH_SAND,
    displayName: "One With Sand",
    kind: "passive",
    description: "Stealth succeeds on 4-6.",
  },
  [ids.ABILITY_HASSAN_TRUE_ENEMY]: {
    id: ids.ABILITY_HASSAN_TRUE_ENEMY,
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
  [ids.ABILITY_HASSAN_ASSASIN_ORDER]: {
    id: ids.ABILITY_HASSAN_ASSASIN_ORDER,
    displayName: "Assassin Order",
    kind: "phantasm",
    description:
      "At battle start, choose 2 allied heroes (excluding Hassan). They gain stealth threshold 5-6 for this game.",
  },
  [ids.ABILITY_KALADIN_FIRST]: {
    id: ids.ABILITY_KALADIN_FIRST,
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
  [ids.ABILITY_KALADIN_SECOND]: {
    id: ids.ABILITY_KALADIN_SECOND,
    displayName: "Second Oath - Oath of Protection",
    kind: "passive",
    description:
      "Gain Trickster multiclass: Trickster movement and Trickster AoE attack trait in addition to Spearman kit.",
  },
  [ids.ABILITY_KALADIN_THIRD]: {
    id: ids.ABILITY_KALADIN_THIRD,
    displayName: "Third Oath - Oath of Acceptance",
    kind: "passive",
    description:
      "+1 damage on Spearman-mode melee attacks.",
  },
  [ids.ABILITY_KALADIN_FOURTH]: {
    id: ids.ABILITY_KALADIN_FOURTH,
    displayName: "Fourth Oath - Oath of Restriction",
    kind: "passive",
    description: "Gain Berserker trait bundle.",
  },
  [ids.ABILITY_KALADIN_FIFTH]: {
    id: ids.ABILITY_KALADIN_FIFTH,
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
  [ids.ABILITY_FRISK_PACIFISM]: {
    id: ids.ABILITY_FRISK_PACIFISM,
    displayName: "Pacifism",
    kind: "phantasm",
    description:
      "Spend Pacifism points on Frisk's pacifist options. These effects do not reveal Frisk stealth.",
    maxCharges: 30,
    chargesPerUse: 0,
    isSpecialCounter: true,
  },
  [ids.ABILITY_FRISK_GENOCIDE]: {
    id: ids.ABILITY_FRISK_GENOCIDE,
    displayName: "Genocide",
    kind: "phantasm",
    description:
      "Spend Genocide points on Frisk's aggressive options and reactions.",
    maxCharges: 30,
    chargesPerUse: 0,
    isSpecialCounter: true,
  },
  [ids.ABILITY_FRISK_CLEAN_SOUL]: {
    id: ids.ABILITY_FRISK_CLEAN_SOUL,
    displayName: "Clean Soul",
    kind: "passive",
    description:
      "If Frisk exits stealth without attacking, the next incoming attack against Frisk automatically misses.",
  },
};
