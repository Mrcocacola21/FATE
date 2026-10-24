/** Presentation only. Server decisions never wait for this timeline. */
/** Reading time for the dice; applies with reduced motion too (it is a pause, not motion). */
export const DICE_RESULT_HOLD_MS = 1100;
/** Two results in one delivery share a reveal instead of adding two holds. */
export const DICE_RESULT_PAIR_STAGGER_MS = 240;

export function diceResultTiming(reducedMotion = false) {
  const entranceMs = reducedMotion ? 0 : 240;
  const revealMs = reducedMotion ? 0 : 280;
  const exitMs = reducedMotion ? 0 : 200;
  const readableAtMs = entranceMs + revealMs;
  const exitAtMs = readableAtMs + DICE_RESULT_HOLD_MS;
  return {
    entranceMs,
    revealMs,
    holdMs: DICE_RESULT_HOLD_MS,
    exitMs,
    readableAtMs,
    exitAtMs,
    durationMs: exitAtMs + exitMs,
  };
}
