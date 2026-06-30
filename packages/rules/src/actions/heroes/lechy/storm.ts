import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { isStormActive, isStormExempt } from "../../../forest";
import { rollD6 } from "../../../rng";
import { clearPendingRoll, evUnitDied, requestRoll } from "../../../core";
import { applyGriffithFemtoRebirth } from "../../../shared/griffith";
import type { LechyStormStartTurnRollContext } from "../../../pendingRoll/types";

export function applyStormStartOfTurn(
  state: GameState,
  unitId: string
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

  return requestRoll(
    state,
    unit.owner,
    "lechyStormStartTurnRoll",
    { unitId } satisfies LechyStormStartTurnRollContext,
    unit.id
  );
}

function evLechyStormRollResult(params: {
  unitId: string;
  roll: number;
  success: boolean;
  damage: number;
  hpAfter: number;
}): GameEvent {
  return {
    type: "lechyStormRollResult",
    unitId: params.unitId,
    roll: params.roll,
    success: params.success,
    damage: params.damage,
    hpAfter: params.hpAfter,
  };
}

export function resolveLechyStormStartTurnRoll(
  state: GameState,
  unitId: string,
  rng: { next: () => number }
): ApplyResult {
  const baseState = clearPendingRoll(state);
  if (!isStormActive(baseState)) {
    return { state: baseState, events: [] };
  }
  const unit = baseState.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: baseState, events: [] };
  }
  if (isStormExempt(baseState, unit)) {
    return { state: baseState, events: [] };
  }

  const roll = rollD6(rng);
  if (roll >= 4) {
    return {
      state: baseState,
      events: [
        evLechyStormRollResult({
          unitId: unit.id,
          roll,
          success: true,
          damage: 0,
          hpAfter: unit.hp,
        }),
      ],
    };
  }

  const newHp = Math.max(0, unit.hp - 1);
  const deathPosition = unit.position ? { ...unit.position } : null;
  let updatedUnit: UnitState = {
    ...unit,
    hp: newHp,
  };

  const events: GameEvent[] = [];
  events.push(
    evLechyStormRollResult({
      unitId: unit.id,
      roll,
      success: false,
      damage: 1,
      hpAfter: newHp,
    })
  );
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
    ...baseState,
    activeUnitId:
      baseState.activeUnitId === updatedUnit.id &&
      (!updatedUnit.isAlive || !updatedUnit.position)
        ? null
        : baseState.activeUnitId,
    pendingMove:
      baseState.pendingMove?.unitId === updatedUnit.id &&
      (!updatedUnit.isAlive || !updatedUnit.position)
        ? null
        : baseState.pendingMove,
    units: {
      ...baseState.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  return { state: nextState, events };
}
