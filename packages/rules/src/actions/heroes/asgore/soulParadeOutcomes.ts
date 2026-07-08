import type { AsgoreSoulParadeSoulId } from "../../../pendingRoll/types";

export interface AsgoreSoulParadeOutcome extends Record<string, unknown> {
  roll: number;
  soulId: AsgoreSoulParadeSoulId;
  soulName: string;
  effectDescription: string;
}

const OUTCOMES: Record<number, AsgoreSoulParadeOutcome> = {
  1: {
    roll: 1,
    soulId: "patience",
    soulName: "Patience",
    effectDescription:
      "Make one Assassin-range attack. If there is no target, Asgore gains stealth for the rest of this turn.",
  },
  2: {
    roll: 2,
    soulId: "bravery",
    soulName: "Bravery",
    effectDescription:
      "Prepare one automatic defense against the next incoming attack.",
  },
  3: {
    roll: 3,
    soulId: "integrity",
    soulName: "Integrity",
    effectDescription: "Move Asgore to any empty cell on the board.",
  },
  4: {
    roll: 4,
    soulId: "perseverance",
    soulName: "Perseverance",
    effectDescription:
      "Choose an enemy in Trickster range; on a failed roll, it cannot spend movement on its next turn.",
  },
  5: {
    roll: 5,
    soulId: "kindness",
    soulName: "Kindness",
    effectDescription: "Heal Asgore for 2 HP, up to maximum HP.",
  },
  6: {
    roll: 6,
    soulId: "justice",
    soulName: "Justice",
    effectDescription: "Make an attack against a target in the Archer attack line.",
  },
};

export function getAsgoreSoulParadeOutcome(
  roll: number
): AsgoreSoulParadeOutcome {
  return OUTCOMES[roll] ?? OUTCOMES[1];
}
