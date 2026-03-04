import type { GameEvent, GameState } from "../model";
import type { RNG } from "../rng";
import { rollD6 } from "../rng";
import { revealUnit } from "./reveal";

export function performSearchStealth(
  state: GameState,
  searcherId: string,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  const searcher = state.units[searcherId];
  if (!searcher || !searcher.isAlive || !searcher.position) {
    return { state, events: [] };
  }

  const events: GameEvent[] = [];
  let currentState = state;

  const sx = searcher.position.col;
  const sy = searcher.position.row;

  const candidates = Object.values(state.units).filter((unit) => {
    if (!unit.isAlive || !unit.isStealthed || !unit.position) return false;
    if (unit.owner === searcher.owner) return false;

    const dx = Math.abs(unit.position.col - sx);
    const dy = Math.abs(unit.position.row - sy);
    const distance = Math.max(dx, dy);
    return distance <= 1;
  });

  if (candidates.length === 0) {
    return { state, events };
  }

  for (const hidden of candidates) {
    const roll = rollD6(rng);
    if (roll >= 5) {
      const result = revealUnit(currentState, hidden.id, "search", rng);
      currentState = result.state;
      events.push(...result.events);
    }
  }

  return { state: currentState, events };
}
