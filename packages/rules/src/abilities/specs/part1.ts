import type { AbilitySpec } from "../types";
import * as ids from "../constants";

export const ABILITY_SPECS_PART_1: Record<string, AbilitySpec> = {
  [ids.ABILITY_BERSERK_AUTO_DEFENSE]: {
    id: ids.ABILITY_BERSERK_AUTO_DEFENSE,
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
  [ids.ABILITY_LECHY_STORM]: {
    id: ids.ABILITY_LECHY_STORM,
    displayName: "Storm",
    kind: "phantasm",
    description: "Set the arena to Storm. Units outside the forest aura take 1 damage on failed start-turn rolls and lose ranged attacks.",
    maxCharges: 5,
    chargesPerUse: 5,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_LECHY_CONFUSE_TERRAIN]: {
    id: ids.ABILITY_LECHY_CONFUSE_TERRAIN,
    displayName: "Confuse Terrain",
    kind: "impulse",
    description: "Place a forest marker on your cell. Units leaving or crossing the aura must roll 5-6 or stop inside the aura.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ids.ABILITY_LECHY_GUIDE_TRAVELER]: {
    id: ids.ABILITY_LECHY_GUIDE_TRAVELER,
    displayName: "Guide Traveler",
    kind: "active",
    description: "Choose an ally within trickster range, move Leshy, then relocate that ally to any empty cell within range of Leshy's final position.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { move: true },
    },
  },
  [ids.ABILITY_LECHY_GIANT]: {
    id: ids.ABILITY_LECHY_GIANT,
    displayName: "Giant",
    kind: "passive",
    description: "+3 HP.",
  },
  [ids.ABILITY_LECHY_NATURAL_STEALTH]: {
    id: ids.ABILITY_LECHY_NATURAL_STEALTH,
    displayName: "Natural Stealth",
    kind: "passive",
    description: "Stealth succeeds on 5-6.",
  },
  [ids.ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: {
    id: ids.ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
    displayName: "Demon Duelist",
    kind: "phantasm",
    description: "You select an enemy hero within your attack range and challenge him to a duel, you can attack as long as your attacks are successful, if the attack fails, you can pay 1 hp and continue the duel.",
    maxCharges: 5,
    chargesPerUse: 5,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_EL_SID_COMPEADOR_KOLADA]: {
    id: ids.ABILITY_EL_SID_COMPEADOR_KOLADA,
    displayName: "Kolada",
    kind: "impulse",
    description: "At the start of your turn, your Barbarian Sword charges into battle, making one attack against everyone within 1 square of you.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ids.ABILITY_EL_SID_COMPEADOR_TISONA]: {
    id: ids.ABILITY_EL_SID_COMPEADOR_TISONA,
    displayName: "Tisona",
    kind: "active",
    description: "You can attack everyone in any straight line except diagonals.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_CHIKATILO_TOUGH]: {
    id: ids.ABILITY_CHIKATILO_TOUGH,
    displayName: "Tough",
    kind: "passive",
    description: "+1 HP.",
  },
  [ids.ABILITY_CHIKATILO_FALSE_TRAIL]: {
    id: ids.ABILITY_CHIKATILO_FALSE_TRAIL,
    displayName: "False Trail",
    kind: "passive",
    description: "At the start of combat, place the False Trail Token in his place. Chikatilo can be placed on any square at the start of combat in stealth status. While stealthed, he is not subject to the three-turn stealth rule. If his invisibility is revealed, the False Trail Token must either explode or be removed. If the False Trail Token dies, Andrei Chikatilo is revealed. He cannot remain stealthed unless there are other figures on the board.",
  },
  [ids.ABILITY_CHIKATILO_ASSASSIN_MARK]: {
    id: ids.ABILITY_CHIKATILO_ASSASSIN_MARK,
    displayName: "Assassin's Mark",
    kind: "active",
    description: "Without revealing his invisibility, Andrei Chikatilo can mark a creature within two squares. Marked targets are revealed to him at the start of his turn. If he hits a marked creature, he gains +1 damage to that attack.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_CHIKATILO_DECOY]: {
    id: ids.ABILITY_CHIKATILO_DECOY,
    displayName: "Decoy",
    kind: "active",
    description: "Spend 3 charges to enter stealth without rolling, or before defending to take 1 damage instead.",
    maxCharges: 6,
    chargesPerUse: 3,
    actionCost: {
      consumes: { stealth: true },
    },
  },
  [ids.ABILITY_FALSE_TRAIL_TRAP]: {
    id: ids.ABILITY_FALSE_TRAIL_TRAP,
    displayName: "False Trail Trap",
    kind: "passive",
    description: "When the False Trail Token dies or Chikatilo is revealed, it may strike the revealer for 3 damage on a failed defense.",
  },
  [ids.ABILITY_FALSE_TRAIL_EXPLOSION]: {
    id: ids.ABILITY_FALSE_TRAIL_EXPLOSION,
    displayName: "Explosion",
    kind: "active",
    description: "The False Trail Token detonates, attacking all units within 1 square. Each unit that fails takes 1 damage.",
    actionCost: {
      consumes: { action: true },
    },
  },
  [ids.ABILITY_GROZNY_INVADE_TIME]: {
    id: ids.ABILITY_GROZNY_INVADE_TIME,
    displayName: "Invade Time",
    kind: "active",
    description: "Move to any free cell of the field.",
    maxCharges: 3,
    chargesPerUse: 3,
    actionCost: {
      consumes: { move: true },
    },
  },
  [ids.ABILITY_GROZNY_TYRANT]: {
    id: ids.ABILITY_GROZNY_TYRANT,
    displayName: "Tyrant",
    kind: "impulse",
    description: "If Ivan the Terrible has a weak ally within two squares of him that he can finish off with his BASE DAMAGE, he moves to them (as if he rolled a 6, but without spending any movement) and attempts to finish them off. If he succeeds in finishing them off, he gains +1 damage and regains HP equal to the damage dealt. Starting with the second ally, he gains the movement of all his finished off allies.",
  },
  [ids.ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: {
    id: ids.ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
    displayName: "Mongol Charge",
    kind: "phantasm",
    maxCharges: 4,
    chargesPerUse: 4,
    description: "Move in a straight line (orthogonal or diagonal). Allies in the swept corridor may each make one attack. Commander applies to those attacks.",
    actionCost: {
      consumes: { action: true},
    },
  },
  [ids.ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES]: {
    id: ids.ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
    displayName: "Legend of the Steppes",
    kind: "passive",
    description: "+1 damage against targets this unit attacked on the previous turn.",
  },
  [ids.ABILITY_GENGHIS_KHAN_KHANS_DECREE]: {
    id: ids.ABILITY_GENGHIS_KHAN_KHANS_DECREE,
    displayName: "Khan's Decree",
    kind: "active",
    description: "This turn you can move diagonally. Move this unit.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost:{
      consumes: { move: true },
    },
  },
  [ids.ABILITY_GRIFFITH_WRETCHED_MAN]: {
    id: ids.ABILITY_GRIFFITH_WRETCHED_MAN,
    displayName: "Wretched Man",
    kind: "passive",
    description: "Griffith deals -1 damage with all attacks (minimum 0).",
  },
  [ids.ABILITY_GRIFFITH_FEMTO_REBIRTH]: {
    id: ids.ABILITY_GRIFFITH_FEMTO_REBIRTH,
    displayName: "Femto Rebirth",
    kind: "phantasm",
    description:
      "When Griffith dies, he immediately resurrects as Femto in the same cell.",
  },
  [ids.ABILITY_FEMTO_GOD_HP]: {
    id: ids.ABILITY_FEMTO_GOD_HP,
    displayName: "God",
    kind: "passive",
    description: "Femto gains +5 HP over Berserker base HP.",
  },
  [ids.ABILITY_FEMTO_MULTI_BERSERK_SPEAR]: {
    id: ids.ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
    displayName: "Multiclass Berserker + Spearman",
    kind: "passive",
    description:
      "Uses Berserker base stats and auto-defense, Spearman reach and defense trait, and Warrior double auto-hit.",
  },
  [ids.ABILITY_FEMTO_DIVINE_MOVE]: {
    id: ids.ABILITY_FEMTO_DIVINE_MOVE,
    displayName: "Divine Movement",
    kind: "active",
    description:
      "Roll 1d6. On 1-3 teleport within 2 cells, on 4-6 teleport to any empty board cell.",
    actionCost: {
      consumes: { move: true },
    },
  },
};
