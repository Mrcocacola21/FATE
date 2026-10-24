import type { RNG } from "../../rng";
import { rollD6 } from "../../rng";

export function rollDice(rng: RNG, count: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(rollD6(rng));
  }
  return rolls;
}

export function sumDice(dice: number[]): number {
  return dice.reduce((acc, v) => acc + v, 0);
}

export function isDoubleRoll(dice: number[]): boolean {
  return dice.length >= 2 && dice[0] === dice[1];
}

const MAX_TIE_BREAK_ROUNDS = 12;

/**
 * Shared-roll AoE tie-break for ONE target: while totals are equal the attacker and this
 * target each add 1d6. Callers start from the shared base dice for every target, so a
 * tie-break won against an earlier target never carries over to the next one.
 */
export function breakSharedRollTie(
  attackerDice: number[],
  defenderDice: number[],
  rollAttackerDie: () => number,
  rollDefenderDie: () => number,
): { tieBreakAttacker: number[]; tieBreakDefender: number[] } {
  const tieBreakAttacker: number[] = [];
  const tieBreakDefender: number[] = [];
  if (attackerDice.length < 2 || defenderDice.length < 2) {
    return { tieBreakAttacker, tieBreakDefender };
  }
  let attackerTotal = sumDice(attackerDice);
  let defenderTotal = sumDice(defenderDice);
  while (attackerTotal === defenderTotal && tieBreakAttacker.length < MAX_TIE_BREAK_ROUNDS) {
    const attackerDie = rollAttackerDie();
    const defenderDie = rollDefenderDie();
    tieBreakAttacker.push(attackerDie);
    tieBreakDefender.push(defenderDie);
    attackerTotal += attackerDie;
    defenderTotal += defenderDie;
  }
  return { tieBreakAttacker, tieBreakDefender };
}
