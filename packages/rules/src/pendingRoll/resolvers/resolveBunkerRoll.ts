import type { ApplyResult, GameEvent, GameState, UnitState } from "../../model";
import type { RNG } from "../../rng";
import { rollD6 } from "../../rng";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { clearPendingRoll } from "../../shared/rollUtils";
import { evBunkerEntered, evBunkerEnterFailed } from "../../shared/events";

export function resolveEnterBunkerRoll(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const success = roll >= 4;
  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const updated: UnitState = success
    ? {
        ...baseUnit,
        isStealthed: false,
        stealthTurnsLeft: 0,
        bunker: { active: true, ownTurnsInBunker: 0 },
      }
    : {
        ...baseUnit,
        bunker: { active: false, ownTurnsInBunker: 0 },
      };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
  };

  const events: GameEvent[] = [
    success
      ? evBunkerEntered({ unitId: updated.id, roll })
      : evBunkerEnterFailed({ unitId: updated.id, roll }),
  ];

  return { state: clearPendingRoll(nextState), events };
}
