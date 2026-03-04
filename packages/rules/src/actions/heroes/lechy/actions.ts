import type { ApplyResult, GameAction, GameEvent, GameState, PendingMove, UnitState } from "../../../model";
import {
  ARENA_STORM_ID,
  FOREST_AURA_RADIUS,
  getForestMarkers,
} from "../../../forest";
import {
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { getLegalMovesForUnitModes } from "../../../movement";
import { getMovementModes, unitHasMovementMode } from "../../shared";
import { evAbilityUsed, evMoveOptionsGenerated } from "../../../core";
import { requestRoll } from "../../../core";
import { isLechy } from "./helpers";

export function applyLechyGuideTraveler(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  if (!isLechy(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as { targetId?: string } | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (target.owner !== unit.owner) {
    return { state, events: [] };
  }

  const dx = Math.abs(target.position.col - unit.position.col);
  const dy = Math.abs(target.position.row - unit.position.row);
  if (Math.max(dx, dy) > FOREST_AURA_RADIUS) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_LECHY_GUIDE_TRAVELER);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...afterCharges,
    lechyGuideTravelerTargetId: targetId,
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  if (unitHasMovementMode(updatedUnit, "trickster")) {
    const requested = requestRoll(
      nextState,
      updatedUnit.owner,
      "moveTrickster",
      { unitId: updatedUnit.id, mode: "normal" },
      updatedUnit.id
    );
    return {
      state: requested.state,
      events: [evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }), ...requested.events],
    };
  }

  const legalTo = getLegalMovesForUnitModes(
    nextState,
    updatedUnit.id,
    getMovementModes(updatedUnit)
  );
  const pendingMove: PendingMove = {
    unitId: updatedUnit.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode: "normal",
  };

  nextState = {
    ...nextState,
    pendingMove,
  };

  return {
    state: nextState,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
      evMoveOptionsGenerated({
        unitId: updatedUnit.id,
        roll: undefined,
        legalTo,
        mode: "normal",
      }),
    ],
  };
}

export function applyLechyConfuseTerrain(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isLechy(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_LECHY_CONFUSE_TERRAIN);
  if (!spec) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...afterCharges,
  };
  const existingMarkers = getForestMarkers(state);
  const nextMarkers = [
    ...existingMarkers.filter((marker) => marker.owner !== updatedUnit.owner),
    {
      owner: updatedUnit.owner,
      position: { ...unit.position },
    },
  ];

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    forestMarkers: nextMarkers,
    forestMarker: nextMarkers[0] ?? null,
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  return { state: nextState, events };
}

export function maybeTriggerLechyConfuseTerrain(
  state: GameState,
  unitId: string
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !isLechy(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_LECHY_CONFUSE_TERRAIN);
  if (!spec) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  if (chargeAmount <= 0) {
    return { state, events: [] };
  }

  if (getCharges(unit, spec.id) < chargeAmount) {
    return { state, events: [] };
  }

  return applyLechyConfuseTerrain(state, unit);
}

export function applyLechyStorm(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isLechy(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_LECHY_STORM);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = spendSlots(afterCharges, costs);

  const nextState: GameState = {
    ...state,
    arenaId: ARENA_STORM_ID,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  return { state: nextState, events };
}
