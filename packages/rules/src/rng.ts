// packages/rules/src/rng.ts

import { DiceRoll } from "./model";

export interface RNG {
  /** Возвращает число в [0, 1) */
  next(): number;
}

export class DefaultRNG implements RNG {
  next(): number {
    return Math.random();
  }
}

const defaultRng = new DefaultRNG();

// Бросок одного d6
export function rollD6(rng: RNG = defaultRng): number {
  return 1 + Math.floor(rng.next() * 6);
}

// Бросок nd6
export function rollNd6(n: number, rng: RNG = defaultRng): DiceRoll {
  const dice: number[] = [];
  for (let i = 0; i < n; i++) {
    dice.push(rollD6(rng));
  }
  const sum = dice.reduce((acc, v) => acc + v, 0);
  const isDouble = n === 2 && dice[0] === dice[1];
  return { dice, sum, isDouble };
}

// Бросок 2к6 для атак и защиты
export function roll2D6(rng: RNG = defaultRng): DiceRoll {
  return rollNd6(2, rng);
}
