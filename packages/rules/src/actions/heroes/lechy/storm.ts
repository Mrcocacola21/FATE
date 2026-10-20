import { resolveUnitDeath } from "../../../death";
import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { isStormActive, isStormExempt, isUnitInsideForestAura } from "../../../forest";
import { HERO_RIVER_PERSON_ID } from "../../../heroes";
import { unitSignalAnchor, unitSignalTarget } from "../../../core/heroSignals";
import { rollManualD6 as rollD6 } from "../../../pendingRoll/manualRoll";
import { clearPendingRoll, requestRoll } from "../../../core";
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
  if (unit.stormStartTurnResolvedTurnNumber === state.turnNumber) {
    return { state, events: [] };
  }
  if (isStormExempt(state, unit)) {
    // A forest already prevents this storm check. Only Guide of Souls itself
    // preventing the otherwise applicable start-turn check produces a ward.
    if (unit.heroId !== HERO_RIVER_PERSON_ID || isUnitInsideForestAura(state, unit))
      return { state, events: [] };
    const marked = markStormResolvedForTurn(state, unit);
    return { state: marked.state, events: [{ type: "riverStormWard",
      ...unitSignalAnchor(state, unit.id), turnNumber: state.turnNumber }] };
  }

  return requestRoll(
    state,
    unit.owner,
    "lechyStormStartTurnRoll",
    { unitId } satisfies LechyStormStartTurnRollContext,
    unit.id
  );
}

function evLechyStormRollResult(state: GameState, params: {
  unitId: string;
  roll: number;
  success: boolean;
  damage: number;
  hpAfter: number;
}): GameEvent {
  return {
    type: "lechyStormRollResult",
    ...unitSignalTarget(state, params.unitId),
    unitId: params.unitId,
    roll: params.roll,
    success: params.success,
    damage: params.damage,
    hpAfter: params.hpAfter,
  };
}

function markStormResolvedForTurn(
  state: GameState,
  unit: UnitState
): { state: GameState; unit: UnitState } {
  const updatedUnit: UnitState = {
    ...unit,
    stormStartTurnResolvedTurnNumber: state.turnNumber,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    unit: updatedUnit,
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

  const marked = markStormResolvedForTurn(baseState, unit);
  const markedState = marked.state;
  const markedUnit = marked.unit;
  const roll = rollD6(rng);
  if (roll >= 4) {
    return {
      state: markedState,
      events: [
        evLechyStormRollResult(baseState, {
          unitId: markedUnit.id,
          roll,
          success: true,
          damage: 0,
          hpAfter: markedUnit.hp,
        }),
      ],
    };
  }

  const newHp = Math.max(0, markedUnit.hp - 1);
  const deathPosition = markedUnit.position ? { ...markedUnit.position } : null;
  let updatedUnit: UnitState = {
    ...markedUnit,
    hp: newHp,
  };

  const events: GameEvent[] = [];
  events.push(
    evLechyStormRollResult(baseState, {
      unitId: unit.id,
      roll,
      success: false,
      damage: 1,
      hpAfter: newHp,
    })
  );
  if (newHp <= 0) {
    updatedUnit = resolveUnitDeath(updatedUnit, null, events);
    const rebirth = applyGriffithFemtoRebirth(updatedUnit, deathPosition);
    if (rebirth.transformed) {
      updatedUnit = rebirth.unit;
      events.push(...rebirth.events);
    }
  }

  const nextState: GameState = {
    ...markedState,
    activeUnitId:
      markedState.activeUnitId === updatedUnit.id &&
      (!updatedUnit.isAlive || !updatedUnit.position)
        ? null
        : markedState.activeUnitId,
    pendingMove:
      markedState.pendingMove?.unitId === updatedUnit.id &&
      (!updatedUnit.isAlive || !updatedUnit.position)
        ? null
        : markedState.pendingMove,
    units: {
      ...markedState.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  return { state: nextState, events };
}
