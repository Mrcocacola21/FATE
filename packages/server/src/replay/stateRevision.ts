import type { GameState } from "rules";

/** Server-owned accepted revision; rules deliberately do not know the durable journal. */
export function withAcceptedRevision(
  previous: GameState,
  next: GameState,
  revision: number,
): GameState {
  return previous.phase !== "ended" && next.phase === "ended" && next.gameOver
    ? { ...next, gameOver: { ...next.gameOver, endedAtRevision: revision } }
    : next;
}
