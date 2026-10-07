import type { GameEvent, UnitState } from "./model";
import { HERO_SANS_ID } from "./heroes";
import { EVENT_VISIBILITY } from "./model/events/visibility";

/** Keep pre-death reactions alive until their mandatory choice is resolved. */
export function resolveUnitDeath(
  unit: UnitState,
  killerId: string | null,
  events: GameEvent[],
): UnitState {
  if (unit.heroId === HERO_SANS_ID && unit.sansUnbelieverUnlocked) {
    return { ...unit, sansPendingDeath: { killerId } };
  }
  events.push({
    type: "unitDied", unitId: unit.id, killerId,
    deathCell: unit.position ? { ...unit.position } : null,
    // This helper has no knowledge map: hidden deaths conservatively owner-only.
    [EVENT_VISIBILITY]: {
      recipients: [],
      deathCellRecipients: unit.isStealthed ? [unit.owner] : ["P1", "P2", "spectator"],
    },
  });
  return { ...unit, isAlive: false, position: null };
}
