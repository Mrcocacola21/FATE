/** Deposits on a confirmed segment, using the token's existing playback clock.
 * Positions never move after emission; only the artwork and opacity evolve. */
export const MOVEMENT_WAKE_FADE_MS = 240;

export function movementWakeSamples(distanceCells: number, travelDurationMs: number) {
  // Spatial density stays stable for short steps and long/diagonal rides. One
  // semantic queued cue owns these bounded fragments, with no extra timers.
  const count = Math.min(32, Math.max(3, Math.ceil(distanceCells / 0.3)));
  return Array.from({ length: count }, (_, index) => ({
    fraction: index / count,
    atMs: (travelDurationMs * index) / count,
  }));
}
