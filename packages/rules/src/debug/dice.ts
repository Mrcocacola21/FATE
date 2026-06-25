import type { RNG } from "../rng";

export class DebugDiceRNG implements RNG {
  private queue: number[] = [];

  constructor(private readonly fallback: RNG, initialQueue: number[] = []) {
    this.setQueue(initialQueue);
  }

  next(): number {
    const value = this.queue.shift();
    if (value === undefined) {
      return this.fallback.next();
    }
    return (value - 0.5) / 6;
  }

  setQueue(values: number[]) {
    this.queue = values.map((value) => Math.trunc(value));
  }

  clearQueue() {
    this.queue = [];
  }

  getQueue(): number[] {
    return [...this.queue];
  }
}
