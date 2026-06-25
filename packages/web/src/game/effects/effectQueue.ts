import type { BoardEffect, QueuedBoardEffect } from "./types";

const DEFAULT_DURATION_MS = 900;
const MAX_ACTIVE_EFFECTS = 120;

export function enqueueBoardEffects(params: {
  current: QueuedBoardEffect[];
  incoming: BoardEffect[];
  now: number;
  sequenceStart: number;
}): { effects: QueuedBoardEffect[]; nextSequence: number } {
  let sequence = params.sequenceStart;
  const queued = params.incoming.map((effect) => {
    sequence += 1;
    const delayMs = Math.max(0, effect.delayMs ?? 0);
    const durationMs = Math.max(100, effect.durationMs ?? DEFAULT_DURATION_MS);
    const startedAt = params.now + delayMs;
    return {
      ...effect,
      id: `board-effect-${sequence}`,
      startedAt,
      expiresAt: startedAt + durationMs,
    } satisfies QueuedBoardEffect;
  });

  return {
    effects: [...params.current, ...queued].slice(-MAX_ACTIVE_EFFECTS),
    nextSequence: sequence,
  };
}

export function pruneExpiredBoardEffects(
  effects: QueuedBoardEffect[],
  now: number,
): QueuedBoardEffect[] {
  return effects.filter((effect) => effect.expiresAt > now);
}

export function shouldProcessEffectBatch(
  lastProcessedLogIndex: number,
  nextLogIndex: number,
): boolean {
  return Number.isInteger(nextLogIndex) && nextLogIndex > lastProcessedLogIndex;
}
