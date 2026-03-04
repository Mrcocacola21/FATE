import type { AbilitySpec } from "../types";
import * as ids from "../constants";

export const ABILITY_SPECS_PART_3: Record<string, AbilitySpec> = {
  [ids.ABILITY_FRISK_ONE_PATH]: {
    id: ids.ABILITY_FRISK_ONE_PATH,
    displayName: "One Path",
    kind: "phantasm",
    description:
      "After Frisk kills, convert all Pacifism into Genocide and permanently lose Pacifism.",
  },
  [ids.ABILITY_SANS_LONG_LIVER]: {
    id: ids.ABILITY_SANS_LONG_LIVER,
    displayName: "Long-liver",
    kind: "passive",
    description: "Sans gains +2 max HP.",
  },
  [ids.ABILITY_SANS_GASTER_BLASTER]: {
    id: ids.ABILITY_SANS_GASTER_BLASTER,
    displayName: "Gaster Blaster",
    kind: "impulse",
    description:
      "Spend 2 charges. Choose an attack line and attack all units on that shooter line.",
    maxCharges: 2,
    chargesPerUse: 2,
  },
  [ids.ABILITY_SANS_BADASS_JOKE]: {
    id: ids.ABILITY_SANS_BADASS_JOKE,
    displayName: "Badass Joke",
    kind: "active",
    description:
      "Spend 3 charges. Attack enemies in Trickster area; targets that fail defense cannot use movement action on their next turn.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_SANS_SPEARMAN_FEATURE]: {
    id: ids.ABILITY_SANS_SPEARMAN_FEATURE,
    displayName: "Spearman Feature",
    kind: "passive",
    description: "Defense doubles grant auto-dodge (Spearman trait).",
  },
  [ids.ABILITY_SANS_UNBELIEVER]: {
    id: ids.ABILITY_SANS_UNBELIEVER,
    displayName: "Unbeliever Sans",
    kind: "passive",
    description:
      "After an allied hero dies, Sans unlocks Bone Field, Sleep, and Last Attack.",
  },
  [ids.ABILITY_SANS_BONE_FIELD]: {
    id: ids.ABILITY_SANS_BONE_FIELD,
    displayName: "Bone Field",
    kind: "impulse",
    description:
      "After Unbeliever, roll 1d6+1 and replace arena with Bone Field for that duration.",
  },
  [ids.ABILITY_SANS_SLEEP]: {
    id: ids.ABILITY_SANS_SLEEP,
    displayName: "Sleep",
    kind: "active",
    description: "After Unbeliever, spend 3 charges to heal Sans for 2 HP.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_SANS_LAST_ATTACK]: {
    id: ids.ABILITY_SANS_LAST_ATTACK,
    displayName: "Last Attack",
    kind: "passive",
    description:
      "After Unbeliever, when Sans dies he curses one enemy: it takes 1 damage at turn start until it reaches 1 HP.",
  },
  [ids.ABILITY_UNDYNE_TOUGH]: {
    id: ids.ABILITY_UNDYNE_TOUGH,
    displayName: "Tough",
    kind: "passive",
    description: "Undyne gains +1 max HP.",
  },
  [ids.ABILITY_UNDYNE_SPEARMAN_MULTICLASS]: {
    id: ids.ABILITY_UNDYNE_SPEARMAN_MULTICLASS,
    displayName: "Spearman Multiclass",
    kind: "passive",
    description: "Undyne gains Spearman defensive features.",
  },
  [ids.ABILITY_UNDYNE_SPEAR_THROW]: {
    id: ids.ABILITY_UNDYNE_SPEAR_THROW,
    displayName: "Throw Spear",
    kind: "active",
    description:
      "Shooter-like single-target attack that always deals 1 damage on hit.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_UNDYNE_ENERGY_SPEAR]: {
    id: ids.ABILITY_UNDYNE_ENERGY_SPEAR,
    displayName: "Energy Spear",
    kind: "impulse",
    description:
      "Spend 2 charges. Choose a row or column and attack all units on that line for 1 damage.",
    maxCharges: 2,
    chargesPerUse: 2,
  },
  [ids.ABILITY_UNDYNE_SWITCH_DIRECTION]: {
    id: ids.ABILITY_UNDYNE_SWITCH_DIRECTION,
    displayName: "Direction Shift",
    kind: "passive",
    description:
      "On successful defense, Undyne can force the attacker to move 1 cell to an empty adjacent cell.",
  },
  [ids.ABILITY_UNDYNE_UNDYING]: {
    id: ids.ABILITY_UNDYNE_UNDYING,
    displayName: "Immortal Undyne",
    kind: "passive",
    description:
      "Once per game on death, revive with 3 HP, cap incoming damage to 1, gain close-range bonus and free Energy Spear, then lose 1 HP at end of own turns.",
  },
  [ids.ABILITY_ASGORE_FIREBALL]: {
    id: ids.ABILITY_ASGORE_FIREBALL,
    displayName: "Fireball",
    kind: "active",
    description:
      "Archer-like single-target attack with normal attack resolution.",
    maxCharges: 2,
    chargesPerUse: 1,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_ASGORE_FIRE_PARADE]: {
    id: ids.ABILITY_ASGORE_FIRE_PARADE,
    displayName: "Fire Parade",
    kind: "active",
    description:
      "Attack all units in Trickster attack area around Asgore using shared attacker roll.",
    maxCharges: 5,
    chargesPerUse: 1,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_ASGORE_SOUL_PARADE]: {
    id: ids.ABILITY_ASGORE_SOUL_PARADE,
    displayName: "Soul Parade",
    kind: "impulse",
    description:
      "When fully charged, triggers at start of turn: roll 1d6 and apply one soul effect.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ids.ABILITY_PAPYRUS_BLUE_BONE]: {
    id: ids.ABILITY_PAPYRUS_BLUE_BONE,
    displayName: "Blue Bone",
    kind: "passive",
    description:
      "On hit, applies Blue Bone until Papyrus next turn start. If target spends move slot this turn, it immediately takes 1 damage.",
  },
  [ids.ABILITY_PAPYRUS_SPAGHETTI]: {
    id: ids.ABILITY_PAPYRUS_SPAGHETTI,
    displayName: "Tasty Spaghetti",
    kind: "active",
    description: "Spend 3 charges to heal Papyrus for 2 HP.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_PAPYRUS_COOL_GUY]: {
    id: ids.ABILITY_PAPYRUS_COOL_GUY,
    displayName: "Cool Guy",
    kind: "impulse",
    description:
      "Choose a straight line and attack all units on that line. Costs 5 charges (3 in Unbeliever mode).",
    maxCharges: 5,
    chargesPerUse: 5,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_PAPYRUS_UNBELIEVER]: {
    id: ids.ABILITY_PAPYRUS_UNBELIEVER,
    displayName: "Unbeliever Papyrus",
    kind: "passive",
    description:
      "After an allied hero dies, Papyrus permanently transforms and unlocks Orange Bone, Long Bone and Ossified.",
  },
  [ids.ABILITY_PAPYRUS_ORANGE_BONE]: {
    id: ids.ABILITY_PAPYRUS_ORANGE_BONE,
    displayName: "Orange Bone",
    kind: "passive",
    description:
      "Unbeliever toggle: apply Orange Bone on hit instead of Blue Bone. Orange Bone punishes ending turn without spending move slot.",
  },
  [ids.ABILITY_PAPYRUS_LONG_BONE]: {
    id: ids.ABILITY_PAPYRUS_LONG_BONE,
    displayName: "Long Bone",
    kind: "passive",
    description:
      "Unbeliever toggle: basic attack can become a line attack. Also stores selected line axis for line skills.",
  },
  [ids.ABILITY_PAPYRUS_OSSIFIED]: {
    id: ids.ABILITY_PAPYRUS_OSSIFIED,
    displayName: "Ossified",
    kind: "passive",
    description: "Unbeliever passive: Papyrus gains Berserker auto-defense feature.",
  },
  [ids.ABILITY_METTATON_LONG_LIVER]: {
    id: ids.ABILITY_METTATON_LONG_LIVER,
    displayName: "Long-liver",
    kind: "passive",
    description: "Mettaton gains +2 max HP.",
  },
  [ids.ABILITY_METTATON_RATING]: {
    id: ids.ABILITY_METTATON_RATING,
    displayName: "Rating",
    kind: "passive",
    description:
      "Gain +2 Rating per successful hit and +1 Rating per successful defense.",
  },
};
