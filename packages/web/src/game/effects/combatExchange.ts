import type { CombatPresentationCue } from "./combatPlayback";

export type CombatRollCue = Extract<CombatPresentationCue, { kind: "roll" }>;
export type CombatRollDisplay = CombatRollCue & {
  persistent?: boolean;
};

/** Pair actual evidence only. In particular, a 1d6 tiebreak replaces the 2d6 pair. */
export function pairCombatRoll(
  previous: CombatRollDisplay | null,
  next: CombatRollCue,
): CombatRollDisplay {
  const attack =
    previous?.roll.rollKind.endsWith("_attackerRoll") ||
    previous?.roll.rollKind === "kaiserCarpetStrikeAttack"
      ? previous.roll
      : previous?.pairedRoll;
  const defense = next.roll;
  const family = (kind: string) =>
    kind === "kaiserCarpetStrikeAttack"
      ? "carpetStrike"
      : kind.replace(/_(attacker|defender)Roll$/, "");
  if (
    !attack ||
    !defense.rollKind.endsWith("_defenderRoll") ||
    family(attack.rollKind) !== family(defense.rollKind) ||
    attack.dice.length !== defense.dice.length ||
    attack.sides !== defense.sides ||
    attack.rollerPlayerId === defense.rollerPlayerId ||
    ((attack.chainId || defense.chainId) && attack.chainId !== defense.chainId) ||
    ((attack.abilityUseId || defense.abilityUseId) && attack.abilityUseId !== defense.abilityUseId)
  )
    return next;
  return { ...next, pairedRoll: attack };
}
