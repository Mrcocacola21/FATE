/** Presentation only. Server decisions never wait for this timeline. */
export const DICE_RESULT_HOLD_MS = 2700;

export function diceResultTiming(reducedMotion = false) {
  const entranceMs = reducedMotion ? 0 : 160;
  const revealMs = reducedMotion ? 0 : 180;
  const exitMs = reducedMotion ? 0 : 140;
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
