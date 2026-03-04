import type { AbilitySpec } from "../types";
import * as ids from "../constants";

export const ABILITY_SPECS_PART_4: Record<string, AbilitySpec> = {
  [ids.ABILITY_METTATON_POPPINS]: {
    id: ids.ABILITY_METTATON_POPPINS,
    displayName: "Mettaton Poppins",
    kind: "active",
    description:
      "Spend 3 Rating. Choose a 3x3 center on your attack line and attack all units in that area.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_METTATON_WORK_ON_CAMERA]: {
    id: ids.ABILITY_METTATON_WORK_ON_CAMERA,
    displayName: "Work on Camera",
    kind: "passive",
    description: "Cannot enter stealth. Gains Rider movement pattern.",
  },
  [ids.ABILITY_METTATON_EX]: {
    id: ids.ABILITY_METTATON_EX,
    displayName: "Mettaton EX",
    kind: "impulse",
    description:
      "Spend 5 Rating to unlock Stage Phenomenon and Laser for this battle.",
  },
  [ids.ABILITY_METTATON_STAGE_PHENOMENON]: {
    id: ids.ABILITY_METTATON_STAGE_PHENOMENON,
    displayName: "Stage Phenomenon",
    kind: "passive",
    description: "After EX: each attack action grants +1 Rating.",
  },
  [ids.ABILITY_METTATON_LASER]: {
    id: ids.ABILITY_METTATON_LASER,
    displayName: "Laser",
    kind: "active",
    description:
      "After EX, spend 3 Rating. Choose an attack line and attack all units on it.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_METTATON_NEO]: {
    id: ids.ABILITY_METTATON_NEO,
    displayName: "Mettaton NEO",
    kind: "impulse",
    description:
      "Spend 10 Rating to unlock Rider Feature, Berserker Multiclass, and Grace.",
  },
  [ids.ABILITY_METTATON_RIDER_FEATURE]: {
    id: ids.ABILITY_METTATON_RIDER_FEATURE,
    displayName: "Rider Feature",
    kind: "passive",
    description: "After NEO: path attacks trigger while moving in Rider mode.",
  },
  [ids.ABILITY_METTATON_BERSERKER_MULTICLASS]: {
    id: ids.ABILITY_METTATON_BERSERKER_MULTICLASS,
    displayName: "Berserker Multiclass",
    kind: "passive",
    description: "After NEO: gain Berserker feature bundle.",
  },
  [ids.ABILITY_METTATON_GRACE]: {
    id: ids.ABILITY_METTATON_GRACE,
    displayName: "Grace",
    kind: "passive",
    description: "After NEO: each defense roll attempt grants +1 Rating.",
  },
  [ids.ABILITY_METTATON_FINAL_CHORD]: {
    id: ids.ABILITY_METTATON_FINAL_CHORD,
    displayName: "Final Chord",
    kind: "phantasm",
    description:
      "Spend 12 Rating. Attack all enemies on all available attack lines for 3 damage on hit.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_RIVER_PERSON_BOAT]: {
    id: ids.ABILITY_RIVER_PERSON_BOAT,
    displayName: "Boat",
    kind: "passive",
    description:
      "River Person can carry one adjacent ally during movement and drop it adjacent to the final cell.",
  },
  [ids.ABILITY_RIVER_PERSON_BOATMAN]: {
    id: ids.ABILITY_RIVER_PERSON_BOATMAN,
    displayName: "Boatman",
    kind: "active",
    description:
      "Spend action to perform a movement without spending the move slot.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_RIVER_PERSON_GUIDE_OF_SOULS]: {
    id: ids.ABILITY_RIVER_PERSON_GUIDE_OF_SOULS,
    displayName: "Guide of Souls",
    kind: "passive",
    description:
      "Immune to arena storm effects and storm attack restrictions.",
  },
  [ids.ABILITY_RIVER_PERSON_TRA_LA_LA]: {
    id: ids.ABILITY_RIVER_PERSON_TRA_LA_LA,
    displayName: "Tra-la-la",
    kind: "phantasm",
    description:
      "At full 4 charges: choose adjacent enemy, move in a straight cardinal line, and touched allies that can legally attack strike that enemy once.",
    maxCharges: 4,
    chargesPerUse: 4,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_TRICKSTER_AOE]: {
    id: ids.ABILITY_TRICKSTER_AOE,
    displayName: "Trickster AoE",
    kind: "active",
    description: "5x5 AoE (radius 2). Hits allies (not self).",
    actionCost: {
      consumes: { attack: true, action: true },
    },
  },
  [ids.ABILITY_TEST_MULTI_SLOT]: {
    id: ids.ABILITY_TEST_MULTI_SLOT,
    displayName: "Test Multi Slot",
    kind: "active",
    description: "Consumes move and attack slots.",
    actionCost: {
      consumes: { move: true, attack: true },
    },
  },
  [ids.ABILITY_KAISER_BUNKER]: {
    id: ids.ABILITY_KAISER_BUNKER,
    displayName: "Bunker",
    kind: "passive",
    description: "Instead of stealth, you have the ability to enter a bunker (4-6), your location is visible, but any hit on you will only deal 1 damage.",
  },
  [ids.ABILITY_KAISER_DORA]: {
    id: ids.ABILITY_KAISER_DORA,
    displayName: "Dora",
    kind: "active",
    description: "Without leaving the bunker, you can attack, select a 3x3 area, the center of this area should be on the line of your possible attack, attack everyone in this area.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_KAISER_CARPET_STRIKE]: {
    id: ids.ABILITY_KAISER_CARPET_STRIKE,
    displayName: "Carpet Strike",
    kind: "impulse",
    description: "It's time to kill all enemies of the Reich. Roll 2d9 - the result is the center of a 5x5 area. Attack everyone in that area. Carpet Bombing doesn't hit Kaiser if he's in the Bunker. The ability always deals 1 damage.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ids.ABILITY_KAISER_ENGINEERING_MIRACLE]: {
    id: ids.ABILITY_KAISER_ENGINEERING_MIRACLE,
    displayName: "Engineering Miracle",
    kind: "impulse",
    description: "You're showing by example what Nazi cyborgs are like. You gain the multi-class of rider and berserker, and the Dora bitch doesn't require more charges. However, you lose the ability to enter stealth and bunkers, and carpet bombings won't affect you in this state.",
    chargeUnlimited: true,
    triggerCharges: 5,
  },
  [ids.ABILITY_VLAD_POLKOVODETS]: {
    id: ids.ABILITY_VLAD_POLKOVODETS,
    displayName: "Commander",
    kind: "passive",
    description: "Allies within one cell of this figure receive +1 damage (does not work on the figure itself, does not stack, for riders, to receive the damage buff you must either start moving or end in the commander's aura).",
  },
  [ids.ABILITY_VLAD_INTIMIDATE]: {
    id: ids.ABILITY_VLAD_INTIMIDATE,
    displayName: "Intimidating Stare",
    kind: "passive",
    description: "If you defend successfully, you can force the attacker to move one unoccupied square.",
  },
  [ids.ABILITY_VLAD_STAKES]: {
    id: ids.ABILITY_VLAD_STAKES,
    displayName: "Field of Stakes",
    kind: "impulse",
    description: "Place 3 hidden stakes at battle start and from 2nd turn.",
  },
  [ids.ABILITY_VLAD_FOREST]: {
    id: ids.ABILITY_VLAD_FOREST,
    displayName: "Forest of the Dead",
    kind: "phantasm",
    description: "Consume 9 stakes to unleash 3x3 AoE (2 dmg, root).",
  },
};
