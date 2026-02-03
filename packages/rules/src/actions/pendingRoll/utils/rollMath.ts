import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";

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
