import type { GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { rollD6 } from "../rng";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { getStealthSuccessMinRoll } from "./checks";
import { concealUnitExactPositionFromOpponents } from "../visibility";
import { enterUnitStealth } from "./state";

export function attemptEnterStealth(
  state: GameState,
  unitId: string,
  rng: RNG,
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state, events: [] };
  }

  const baseUnit: UnitState = spendSlots(unit, { stealth: true });

  if (unit.isStealthed) {
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      },
      events: [],
    };
  }

  const threshold = getStealthSuccessMinRoll(unit);
  if (threshold === null) {
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      },
      events: [
        {
          type: "stealthEntered",
          unitId: baseUnit.id,
          success: false,
        },
      ],
    };
  }

  const position = unit.position;
  const hasStealthedOverlap = Object.values(state.units).some((otherUnit) => {
    if (!otherUnit.isAlive || !otherUnit.isStealthed || !otherUnit.position) return false;
    if (otherUnit.id === unit.id) return false;
    return otherUnit.position.col === position.col && otherUnit.position.row === position.row;
  });
  if (hasStealthedOverlap) {
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      },
      events: [{ type: "stealthEntered", unitId: baseUnit.id, success: false }],
    };
  }

  const roll = rollD6(rng);
  const success = roll >= threshold;

  const nextState: GameState = {
    ...state,
    units: { ...state.units },
  };

  const updated: UnitState = success ? enterUnitStealth(baseUnit) : { ...baseUnit };
  nextState.units[updated.id] = updated;
  const finalState = success
    ? concealUnitExactPositionFromOpponents(nextState, updated)
    : nextState;

  const events: GameEvent[] = [
    {
      type: "stealthEntered",
      unitId: updated.id,
      success,
      roll,
    },
  ];

  return { state: finalState, events };
}
