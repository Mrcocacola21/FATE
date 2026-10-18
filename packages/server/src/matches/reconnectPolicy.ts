/** Existing transport grace; a restart starts a fresh window, never an invented old deadline. */
export function reconnectGraceMs(): number {
  const value = Number(process.env.RECONNECT_GRACE_MS ?? 45_000);
  return Number.isFinite(value) && value > 0 ? value : 45_000;
}
