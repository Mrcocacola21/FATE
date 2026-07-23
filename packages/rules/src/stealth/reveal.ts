import type { Coord, GameEvent, GameState, StealthRevealReason, UnitState } from "../model";
import type { RNG } from "../rng";
import { resolveHiddenOverlapCollision } from "./collision";
import { clearUnitStealth } from "./state";

export function revealUnit(
  state: GameState,
  unitId: string,
  reason: StealthRevealReason,
  rng: RNG,
  revealerId?: string,
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !unit.isStealthed) {
    return { state, events: [] };
  }

  let events: GameEvent[] = [];
  const nextState: GameState = {
    ...state,
    units: { ...state.units },
  };

  let updated: UnitState = clearUnitStealth(unit);
  nextState.units[updated.id] = updated;

  const collision = resolveHiddenOverlapCollision(nextState, updated.id, rng);
  let resolvedState = collision.state;
  events.push(...collision.events);
  updated = resolvedState.units[updated.id] ?? updated;

  if (
    reason === "timerExpired" ||
    reason === "aoeHit" ||
    reason === "forcedDisplacement" ||
    reason === "stakeTriggered"
  ) {
    resolvedState = {
      ...resolvedState,
      knowledge: {
        ...resolvedState.knowledge,
        P1: { ...(resolvedState.knowledge?.P1 ?? {}), [updated.id]: true },
        P2: { ...(resolvedState.knowledge?.P2 ?? {}), [updated.id]: true },
      },
    };
  }

  const clearedLastKnown = {
    ...resolvedState.lastKnownPositions,
    P1: { ...(resolvedState.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(resolvedState.lastKnownPositions?.P2 ?? {}) },
  };
  delete clearedLastKnown.P1[updated.id];
  delete clearedLastKnown.P2[updated.id];
  resolvedState = {
    ...resolvedState,
    lastKnownPositions: clearedLastKnown,
  };

  events.push({
    type: "stealthRevealed",
    unitId: updated.id,
    reason,
    revealerId,
  });

  return { state: resolvedState, events };
}

export function revealStealthedInArea(
  state: GameState,
  center: Coord,
  radius: number,
  rng: RNG,
  targetFilter?: (unit: UnitState) => boolean,
): { state: GameState; events: GameEvent[] } {
  let nextState: GameState = state;
  const events: GameEvent[] = [];

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.isStealthed || !unit.position) continue;
    if (targetFilter && !targetFilter(unit)) continue;

    const dx = Math.abs(unit.position.col - center.col);
    const dy = Math.abs(unit.position.row - center.row);
    const distance = Math.max(dx, dy);

    if (distance <= radius) {
      const result = revealUnit(nextState, unit.id, "aoeHit", rng);
      nextState = result.state;
      events.push(...result.events);
    }
  }

  return { state: nextState, events };
}
