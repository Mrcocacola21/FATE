import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { isStormActive, isStormExempt } from "../../../forest";
import { rollD6 } from "../../../rng";
import { evUnitDied } from "../../../core";
import { applyGriffithFemtoRebirth } from "../../../shared/griffith";

export function applyStormStartOfTurn(
  state: GameState,
  unitId: string,
  rng: { next: () => number }
): ApplyResult {
  if (!isStormActive(state)) {
    return { state, events: [] };
  }
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  if (isStormExempt(state, unit)) {
    return { state, events: [] };
  }

  const roll = rollD6(rng);
  if (roll >= 4) {
    return { state, events: [] };
  }

  const newHp = Math.max(0, unit.hp - 1);
  const deathPosition = unit.position ? { ...unit.position } : null;
  let updatedUnit: UnitState = {
    ...unit,
    hp: newHp,
  };

  const events: GameEvent[] = [];
  if (newHp <= 0) {
    updatedUnit = {
      ...updatedUnit,
      isAlive: false,
      position: null,
    };
    events.push(evUnitDied({ unitId: updatedUnit.id, killerId: null }));
    const rebirth = applyGriffithFemtoRebirth(updatedUnit, deathPosition);
    if (rebirth.transformed) {
      updatedUnit = rebirth.unit;
      events.push(...rebirth.events);
    }
  }

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  return { state: nextState, events };
}
