/** Presentation recovery only; authoritative contact and SFX keep their clock. */
export const MELEE_RECOVERY_MS = 80;
export function meleeTraceMs(contactMs: number) {
  return Math.min(90, contactMs);
}
