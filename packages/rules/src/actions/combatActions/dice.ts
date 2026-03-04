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
  return dice.reduce((acc, value) => acc + value, 0);
}
