import type { GameEvent, UnitState } from "./model";
import { HERO_SANS_ID } from "./heroes";

/** Keep pre-death reactions alive until their mandatory choice is resolved. */
export function resolveUnitDeath(
  unit: UnitState,
  killerId: string | null,
  events: GameEvent[],
): UnitState {
  if (unit.heroId === HERO_SANS_ID && unit.sansUnbelieverUnlocked) {
    return { ...unit, sansPendingDeath: { killerId } };
  }
  events.push({ type: "unitDied", unitId: unit.id, killerId });
  return { ...unit, isAlive: false, position: null };
}
