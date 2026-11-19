/**
 * Wax seals a player stamps to accept a rated match. Pure presentation: no rule reads these, and
 * they never enter GameState. Shared here so the server and the web client accept the same list.
 * Every player has the default; the others are cosmetics.
 */
export const SEAL_IDS = [
  "crimson-star",
  "crimson-eagle",
  "night-pact",
  "serpent",
  "sovereign-sun",
  "arcane-eye",
] as const;
export type SealId = (typeof SEAL_IDS)[number];
export const DEFAULT_SEAL: SealId = "crimson-star";

export function isSealId(value: unknown): value is SealId {
  return typeof value === "string" && (SEAL_IDS as readonly string[]).includes(value);
}
