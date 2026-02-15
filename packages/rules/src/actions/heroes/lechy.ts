import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PendingMove,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { getUnitAt } from "../../board";
import {
  FOREST_AURA_RADIUS,
  ARENA_STORM_ID,
  getForestMarkers,
  isStormActive,
  isStormExempt,
} from "../../forest";
import { HERO_LECHY_ID } from "../../heroes";
import {
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_STORM,
  getCharges,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { rollD6 } from "../../rng";
import { getLegalMovesForUnitModes } from "../../movement";
import { getMovementModes, unitHasMovementMode } from "../shared";
import { requestRoll, clearPendingRoll } from "../../shared/rollUtils";
import { evAbilityUsed, evMoveOptionsGenerated, evUnitDied, evUnitMoved } from "../../shared/events";
import { applyGriffithFemtoRebirth } from "../../shared/griffith";

function getEmptyCellsInAura(state: GameState, origin: Coord): Coord[] {
  const positions: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (Math.max(Math.abs(coord.col - origin.col), Math.abs(coord.row - origin.row)) > FOREST_AURA_RADIUS) {
        continue;
      }
      if (getUnitAt(state, coord)) continue;
      positions.push(coord);
    }
  }
  return positions;
}

export function applyLechyGuideTraveler(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  if (unit.heroId !== HERO_LECHY_ID || !unit.position) {
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
  if (unit.heroId !== HERO_LECHY_ID || !unit.position) {
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
  if (!unit || !unit.isAlive || !unit.position || unit.heroId !== HERO_LECHY_ID) {
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
  if (unit.heroId !== HERO_LECHY_ID || !unit.position) {
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

export function requestLechyGuideTravelerPlacement(
  state: GameState,
  lechyId: string,
  allyId: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const lechy = state.units[lechyId];
  const ally = state.units[allyId];
  if (!lechy || !lechy.isAlive || !lechy.position) {
    return { state, events: [] };
  }
  if (!ally || !ally.isAlive || !ally.position) {
    return { state, events: [] };
  }

  const legalPositions = getEmptyCellsInAura(state, lechy.position);
  const requested = requestRoll(
    clearPendingRoll(state),
    lechy.owner,
    "lechyGuideTravelerPlacement",
    { lechyId, allyId, legalPositions },
    lechy.id
  );

  return requested;
}

export function resolveLechyGuideTravelerPlacement(
  state: GameState,
  pending: { context: Record<string, unknown> },
  choice: { type?: string; position?: Coord } | undefined
): ApplyResult {
  const ctx = pending.context as {
    lechyId?: string;
    allyId?: string;
    legalPositions?: Coord[];
  };
  const lechyId = ctx.lechyId;
  const allyId = ctx.allyId;
  if (!lechyId || !allyId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload = choice && choice.type === "lechyGuideTravelerPlace" ? choice : undefined;
  if (!payload?.position) {
    return { state, events: [] };
  }

  const pos = payload.position;
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, pos)) {
    return { state, events: [] };
  }

  const rawLegal = Array.isArray(ctx.legalPositions) ? ctx.legalPositions : null;
  const legalPositions = rawLegal && rawLegal.length > 0 ? rawLegal : getEmptyCellsInAura(state, state.units[lechyId]?.position ?? pos);
  const legalSet = new Set(legalPositions.map((c) => `${c.col},${c.row}`));
  if (!legalSet.has(`${pos.col},${pos.row}`)) {
    return { state, events: [] };
  }

  const ally = state.units[allyId];
  if (!ally || !ally.isAlive || !ally.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const lechy = state.units[lechyId];
  const updatedLechy =
    lechy && lechy.lechyGuideTravelerTargetId
      ? { ...lechy, lechyGuideTravelerTargetId: undefined }
      : lechy;

  const updatedAlly: UnitState = {
    ...ally,
    position: { ...pos },
  };

  const nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      ...(updatedLechy ? { [updatedLechy.id]: updatedLechy } : {}),
      [updatedAlly.id]: updatedAlly,
    },
  });

  const events: GameEvent[] = [
    evUnitMoved({ unitId: updatedAlly.id, from: ally.position, to: updatedAlly.position! }),
  ];

  return { state: nextState, events };
}

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
