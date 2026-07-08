import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { ARENA_STORM_ID, isStormActive, isStormExempt } from "../../../forest";
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
  if (unit.stormStartTurnResolvedTurnNumber === state.turnNumber) {
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
        evLechyStormRollResult({
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

export function advanceStormDurationAfterTurn(
  state: GameState,
  completedTurnNumber: number
): GameState {
  const effects = Array.isArray(state.arenaEffects) ? state.arenaEffects : [];
  if (effects.length === 0) return state;

  const nextEffects = effects.flatMap((effect) => {
    if (effect.effectId !== ARENA_STORM_ID) return [{ ...effect }];
    if (effect.startedTurnNumber === completedTurnNumber) return [{ ...effect }];
    const remaining = effect.remaining - 1;
    return remaining > 0 ? [{ ...effect, remaining }] : [];
  });

  const hasStorm = nextEffects.some(
    (effect) => effect.effectId === ARENA_STORM_ID && effect.remaining > 0
  );
  return {
    ...state,
    arenaId: state.arenaId === ARENA_STORM_ID && !hasStorm ? null : state.arenaId,
    arenaEffects: nextEffects,
  };
}
