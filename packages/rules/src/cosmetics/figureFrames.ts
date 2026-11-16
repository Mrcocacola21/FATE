/**
 * Frames a player may dress their figures in. Pure presentation: no rule reads these, and they
 * never enter GameState. Shared here so the server and the web client accept the same list.
 */
export const FIGURE_FRAME_IDS = ["moon-gold", "bone-thorns", "blood-iron", "arcane"] as const;
export type FigureFrameId = (typeof FIGURE_FRAME_IDS)[number];

export function isFigureFrameId(value: unknown): value is FigureFrameId {
  return typeof value === "string" && (FIGURE_FRAME_IDS as readonly string[]).includes(value);
}
